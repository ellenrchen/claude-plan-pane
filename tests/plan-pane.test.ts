import { expect, test } from 'claude-code/testing'

import { PLAN_FILE, quote, toSections } from '../hooks/sections'

const PLAN = '# Document upload demo\nShip a demo.\n\n## Context\nWhy we need it.\n\n### Steps\n1. Build\n2. Test\n'
const PLAN_PATH = '/Users/coach-k/.claude/plans/document-upload-demo.md'

const PANE = {
  plugin: 'plan-pane',
  component: 'Pane',
  requestId: 'plan',
  viewport: { columns: 160, rows: 40 },
  props: {
    title: 'Plan',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('plan text splits into sections at headings', () => {
  expect(toSections(PLAN).map(s => [s.level, s.heading])).toEqual([
    [1, 'Document upload demo'],
    [2, 'Context'],
    [3, 'Steps'],
  ])
})

test('a comment quotes the section heading, or its first words when it has none', () => {
  const [intro, context] = toSections('Loose intro line\n\n## Context\nWhy.')
  expect(quote(context)).toBe('> Context\n')
  expect(quote(intro)).toBe('> Loose intro line\n')
})

test('only files in ~/.claude/plans count as plans', () => {
  expect(PLAN_FILE.test(PLAN_PATH)).toBe(true)
  expect(PLAN_FILE.test('/repo/docs/plans/readme.md')).toBe(false)
  expect(PLAN_FILE.test('/Users/coach-k/.claude/plans/nested/x.md')).toBe(false)
})

test('the pane stays empty until a plan is written, then shows it', async ($, on) => {
  on('fs.read', () => ({ value: PLAN }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('tool.check', () => ({ decision: 'ask' }))
  on('tool.call', () => ({ result: { text: 'ok', isError: false } }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const empty = await $.ui.mount({ ...PANE, surface })
    expect(await empty.find({ type: 'Text', text: /No plan yet/ })).toBeDefined()
    await empty.unmount()
  }

  await $.tool.call({ tool: 'Write', file_path: PLAN_PATH, content: PLAN } as any)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: 'Document upload demo' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Steps' })).toBeDefined()
    expect(await ui.find({ key: 'c0' })).toBeDefined()
    await ui.unmount()
  }
})

test('writes outside the plans folder leave the pane alone', async ($, on) => {
  on('fs.read', () => ({ value: PLAN }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('tool.check', () => ({ decision: 'ask' }))
  on('tool.call', () => ({ result: { text: 'ok', isError: false } }))

  await $.tool.call({ tool: 'Write', file_path: '/repo/notes.md', content: PLAN } as any)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /No plan yet/ })).toBeDefined()
  await ui.unmount()
})

test('a finished plan is approved in the pane, not the dialog', async ($, on) => {
  const prompts: string[] = []
  let exited = 0
  on('fs.read', () => ({ value: PLAN }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('tool.check', () => ({ decision: 'ask' }))
  on('tool.call', ($, e) => {
    if (e.tool === 'ExitPlanMode') exited++
    return { result: { text: 'ok', isError: false } }
  })
  on('prompt.submit', ($, e) => {
    prompts.push(e.text)
    return { text: e.text }
  })

  await $.tool.call({ tool: 'Write', file_path: PLAN_PATH, content: PLAN } as any)

  // Claude asks to exit: held back, the pane offers approval instead.
  const held = await $.tool.call({ tool: 'ExitPlanMode' } as any)
  expect((held as any).deny).toMatch(/plan pane/)
  expect(exited).toBe(0)
  expect((await $.tool.check({ tool: 'ExitPlanMode', input: {} })).decision).not.toBe('allow')

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'ready to execute' })).toBeDefined()
  await ui.press({ key: 'approve' })
  expect(prompts).toEqual(['Approved. Exit plan mode and start executing the plan.'])
  expect(await ui.find({ type: 'Text', text: 'approved' })).toBeDefined()
  expect(await ui.find({ key: 'approve' })).toBeUndefined()
  await ui.unmount()

  // Approved: the next exit goes straight through with no dialog.
  expect((await $.tool.check({ tool: 'ExitPlanMode', input: {} })).decision).toBe('allow')
  await $.tool.call({ tool: 'ExitPlanMode' } as any)
  expect(exited).toBe(1)
})

test('requesting changes keeps Claude in plan mode', async ($, on) => {
  let draft = ''
  on('fs.read', () => ({ value: PLAN }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('tool.check', () => ({ decision: 'ask' }))
  on('tool.call', () => ({ result: { text: 'ok', isError: false } }))
  on('prompt.fill', ($, e) => {
    draft += e.text
    return { isFilled: true, text: draft, cursor: draft.length }
  })

  await $.tool.call({ tool: 'Write', file_path: PLAN_PATH, content: PLAN } as any)
  await $.tool.call({ tool: 'ExitPlanMode' } as any)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'changes' })
  expect(draft).toBe('Change the plan: ')
  expect(await ui.find({ type: 'Text', text: 'drafting' })).toBeDefined()
  await ui.unmount()
  expect((await $.tool.check({ tool: 'ExitPlanMode', input: {} })).decision).not.toBe('allow')
})

// These exercise the registered hooks with the real mod test runner; filesystem,
// UI placement, prompts, and downstream tools are mocked.
for (const scenario of ['consumed exit', 'new cycle', 'external edit', 'watched edit', 'ordinary permissions'] as const) {
  test(`approval is scoped to the current review: ${scenario}`, async ($, on) => {
    let text = PLAN
    let exited = 0
    on('fs.read', () => ({ value: text }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('tool.check', () => ({ decision: 'ask' }))
    on('tool.call', ($, e) => {
      if (e.tool === 'ExitPlanMode') exited++
      return { result: { text: 'ok', isError: false } }
    })
    on('prompt.submit', ($, e) => ({ text: e.text }))
    await $.tool.call({ tool: 'Write', file_path: PLAN_PATH, content: text } as any)
    await $.tool.call({ tool: 'ExitPlanMode' } as any)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'approve' })
    await ui.unmount()
    expect((await $.tool.check({ tool: 'ExitPlanMode', input: {} })).decision).toBe('allow')

    if (scenario === 'ordinary permissions') {
      for (const tool of ['Bash', 'Write', 'Edit', 'Read', 'EnterPlanMode']) {
        expect((await $.tool.check({ tool, input: {} })).decision).toBe('ask')
      }
      return
    }
    if (scenario === 'consumed exit') {
      await $.tool.call({ tool: 'ExitPlanMode' } as any)
      expect(exited).toBe(1)
    } else if (scenario === 'new cycle') {
      await $.tool.call({ tool: 'EnterPlanMode' } as any)
    } else {
      text = `${PLAN}\nChanged requirements.`
      if (scenario === 'watched edit') {
        await $.tool.call({ tool: 'Edit', file_path: PLAN_PATH } as any)
      }
    }
    expect((await $.tool.check({ tool: 'ExitPlanMode', input: {} })).decision).toBe('ask')
    const held = await $.tool.call({ tool: 'ExitPlanMode' } as any)
    expect((held as any).deny).toMatch(/plan pane/)
    expect(exited).toBe(scenario === 'consumed exit' ? 1 : 0)
    const secondReview = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await secondReview.press({ key: 'approve' })
    await secondReview.unmount()
    expect((await $.tool.check({ tool: 'ExitPlanMode', input: {} })).decision).toBe('allow')
    await $.tool.call({ tool: 'ExitPlanMode' } as any)
    expect(exited).toBe(scenario === 'consumed exit' ? 2 : 1)
    expect((await $.tool.check({ tool: 'ExitPlanMode', input: {} })).decision).toBe('ask')
  })
}

for (const scenario of ['edit before approval', 'edit before exit', 'unreadable plan', 'failed exit'] as const) {
  test(`approval fails closed: ${scenario}`, async ($, on) => {
    let text = PLAN
    let unreadable = false
    let exited = 0
    const prompts: string[] = []
    on('fs.read', () => {
      if (unreadable) throw new Error('Plan unavailable')
      return { value: text }
    })
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('tool.check', () => ({ decision: 'ask' }))
    on('tool.call', ($, e) => {
      if (e.tool === 'ExitPlanMode') exited++
      return { result: { text: 'result', isError: scenario === 'failed exit' && e.tool === 'ExitPlanMode' } }
    })
    on('prompt.submit', ($, e) => {
      prompts.push(e.text)
      return { text: e.text }
    })
    await $.tool.call({ tool: 'Write', file_path: PLAN_PATH, content: text } as any)
    await $.tool.call({ tool: 'ExitPlanMode' } as any)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    if (scenario === 'edit before approval') text = `${PLAN}\nUnreviewed change.`
    await ui.press({ key: 'approve' })
    await ui.unmount()
    if (scenario === 'edit before approval') {
      expect(prompts).toEqual([])
    } else if (scenario === 'unreadable plan') {
      unreadable = true
    } else {
      expect((await $.tool.check({ tool: 'ExitPlanMode', input: {} })).decision).toBe('allow')
      if (scenario === 'edit before exit') text = `${PLAN}\nChanged after permission check.`
      const result = await $.tool.call({ tool: 'ExitPlanMode' } as any)
      if (scenario === 'edit before exit') expect((result as any).deny).toMatch(/plan pane/)
      expect(exited).toBe(scenario === 'failed exit' ? 1 : 0)
    }
    expect((await $.tool.check({ tool: 'ExitPlanMode', input: {} })).decision).toBe('ask')
  })
}
