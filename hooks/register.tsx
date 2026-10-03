import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { PlanDoc } from '../types'
import { PLAN_FILE, quote, toSections } from './sections'
import type { Section } from './sections'

const PANE = 'plan'
const plan = atom({ plugin: 'plan-pane', key: 'plan' } as const, null as PlanDoc | null)

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
      await update($, plan, () => ({ path, text, updatedAt: Date.now() }))
      const opened = await $.ui.open({ id: PANE, title: 'Plan' })
      if (!opened.isPlaced) $.ui.toast('Plan ready: run /plan-pane to view it beside the session')
      return ran
    })
  }

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    const doc = await read($, plan)
    if (!doc) return <Text dimColor>No plan yet. It appears here once Claude writes one in plan mode.</Text>

    const all = toSections(doc.text)
    const intro = all[0] && all[0].level <= 1 ? all[0] : undefined
    const sections = intro ? all.slice(1) : all
    const width = Math.max(20, e.props.bodyColumns - 2)
    const body = (s: Section) => s.lines.join('\n').trim()

    return (
      <Box flexDirection="column" width={width}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold wrap="truncate">{intro?.heading || doc.path.split('/').pop()}</Text>
          <Button key="close" plain dimColor onPress={() => $.ui.close({ id: PANE })}>close</Button>
        </Box>
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
