import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { PlanDoc, PlanPhase } from '../types'
import { PLAN_FILE, quote, toSections } from './sections'
import type { Section } from './sections'

const PANE = 'plan'
const plan = atom({ plugin: 'plan-pane', key: 'plan' } as const, null as PlanDoc | null)
const phase = atom({ plugin: 'plan-pane', key: 'phase' } as const, 'drafting' as PlanPhase)

const APPROVED_PROMPT = 'Approved. Exit plan mode and start executing the plan.'
const AWAITING_REVIEW =
  'The user is reviewing this plan in the plan pane. End your turn now and wait for them. ' +
  'Do not call ExitPlanMode again until they approve.'
const BADGE: Record<PlanPhase, { text: string; color: string }> = {
  drafting: { text: 'drafting', color: 'gray' },
  ready: { text: 'ready to execute', color: 'yellow' },
  approved: { text: 'approved', color: 'green' },
}

// Re-read at both permission checking and execution: edits outside the watched
// tools must not inherit approval of the text previously displayed in the pane.
async function isApproved($: Parameters<typeof read>[0], doc: PlanDoc | null) {
  if (!doc || (await read($, phase)) !== 'approved') return false
  try {
    if ((await $.fs.read(doc.path)) === doc.text) return true
  } catch {
    // A missing or unreadable plan cannot retain approval.
  }
  await update($, phase, () => 'drafting')
  return false
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'plan-pane',
      description: 'Show the current plan in a side pane',
    })
    return next(e)
  })

  on('command.run', { command: 'plan-pane' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Plan' })
    return { text: 'Plan pane opened.' }
  })

  for (const tool of ['Write', 'Edit', 'MultiEdit'] as const) {
    on('tool.call', { tool }, async ($, e: any, next) => {
      const ran = await next(e)
      const path: string | undefined = e.file_path
      if (!path || !PLAN_FILE.test(path) || ran.isError) return ran
      const text = await $.fs.read(path)
      await update($, plan, previous => ({ path, text, updatedAt: Date.now(), revision: (previous?.revision ?? 0) + 1 }))
      await update($, phase, () => 'drafting')
      const opened = await $.ui.open({ id: PANE, title: 'Plan' })
      if (!opened.isPlaced) $.ui.toast('Plan ready: run /plan-pane to view it beside the session')
      return ran
    })
  }

  on('tool.call', { tool: 'EnterPlanMode' }, async ($, e, next) => {
    await update($, phase, () => 'drafting')
    return next(e)
  })

  // Approval happens in the pane, so the full-width dialog stays closed.
  on('tool.call', { tool: 'ExitPlanMode' }, async ($, e, next) => {
    const doc = await read($, plan)
    if (!doc) return next(e)
    if (await isApproved($, doc)) {
      // Keep approval available to downstream permission checks, then consume it
      // even when exit fails. Retrying requires a fresh review.
      try {
        return await next(e)
      } finally {
        await update($, phase, () => 'drafting')
      }
    }
    const text = await $.fs.read(doc.path)
    await update($, plan, () => ({ ...doc, text, updatedAt: Date.now(), revision: (doc.revision ?? 0) + 1 }))
    await update($, phase, () => 'ready')
    const opened = await $.ui.open({ id: PANE, title: 'Plan', focus: true })
    if (!opened.isPlaced) return next(e)
    return { deny: AWAITING_REVIEW }
  })

  on('tool.check', { tool: 'ExitPlanMode' }, async ($, e, next) =>
    (await isApproved($, await read($, plan))) ? { decision: 'allow' } : next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    const doc = await read($, plan)
    if (!doc) return <Text dimColor>No plan yet. It appears here once Claude writes one in plan mode.</Text>

    const current = await read($, phase)
    const all = toSections(doc.text)
    const intro = all[0] && all[0].level <= 1 ? all[0] : undefined
    const sections = intro ? all.slice(1) : all
    const width = Math.max(20, e.props.bodyColumns - 2)
    const body = (s: Section) => s.lines.join('\n').trim()

    const approve = async () => {
      const latest = await read($, plan)
      if ((await read($, phase)) !== 'ready' || !latest || latest.revision !== doc.revision) return
      // An old rendered button cannot approve a newer review or an external edit.
      let text: string
      try {
        text = await $.fs.read(doc.path)
      } catch {
        await update($, phase, () => 'drafting')
        return
      }
      if (text !== doc.text) {
        await update($, plan, () => ({ ...doc, text, updatedAt: Date.now(), revision: (doc.revision ?? 0) + 1 }))
        await update($, phase, () => 'drafting')
        return
      }
      await update($, phase, () => 'approved')
      void $.prompt.submit({ text: APPROVED_PROMPT, asUser: true })
    }
    const requestChanges = async () => {
      await update($, phase, () => 'drafting')
      await $.prompt.fill({ text: 'Change the plan: ', mode: 'append' })
    }

    return (
      <Box flexDirection="column" width={width}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold wrap="truncate">{intro?.heading || doc.path.split('/').pop()}</Text>
          <Button key="close" plain dimColor onPress={() => $.ui.close({ id: PANE })}>close</Button>
        </Box>
        <Text key="phase" color={BADGE[current].color}>{BADGE[current].text}</Text>
        {current === 'ready' ? (
          <Box flexDirection="row" marginTop={1}>
            <Button key="approve" hotkey="a" onPress={approve}>Approve and execute</Button>
            <Text> </Text>
            <Button key="changes" hotkey="r" dimColor onPress={requestChanges}>Request changes</Button>
          </Box>
        ) : null}
        {intro && body(intro) ? <Markdown text={body(intro)} dimColor /> : null}
        {sections.map((s, i) => {
          const hotkey = i < 9 ? String(i + 1) : undefined
          return (
            <Box key={`s${i}`} flexDirection="column" marginTop={1} paddingLeft={s.level >= 3 ? 2 : 0}>
              <Box flexDirection="row" justifyContent="space-between">
                <Text bold color="cyan" wrap="truncate">{s.heading}</Text>
                <Button key={`c${i}`} plain dimColor hotkey={hotkey}
                  onPress={() => void $.prompt.fill({ text: quote(s), mode: 'append' })}>
                  comment
                </Button>
              </Box>
              {body(s) ? <Markdown text={body(s).slice(0, 9500)} /> : null}
            </Box>
          )
        })}
      </Box>
    )
  })
}
