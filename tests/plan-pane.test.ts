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
  on('tool.call', () => ({ result: { text: 'ok', isError: false } }))

  await $.tool.call({ tool: 'Write', file_path: '/repo/notes.md', content: PLAN } as any)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /No plan yet/ })).toBeDefined()
  await ui.unmount()
})
