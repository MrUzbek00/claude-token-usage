import { expect, test } from 'claude-code/testing'

import type { Mark, Snap } from '../types'

const BAND = {
  plugin: 'token-usage',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

const SNAP: Snap = {
  tokens: 124_000,
  window: 200_000,
  percent: 62,
  usd: 1.234,
  model: 'claude-opus-5',
  threshold: 180_000,
  limits: [
    { kind: 'five_hour', percentUsed: 41.5, resetsAt: '2026-10-25T12:00:00Z' },
    { kind: 'seven_day', percentUsed: 12, resetsAt: '2026-10-31T00:00:00Z' },
  ],
  rows: [
    { name: 'Messages', tokens: 90_000 },
    { name: 'System prompt', tokens: 24_000 },
  ],
  at: 0,
}

const MARKS: Mark[] = [
  { n: 1, tokens: 20_000, percent: 10, usd: 0.1, spent: 0.1 },
  { n: 2, tokens: 124_000, percent: 62, usd: 1.234, spent: 1.134 },
]

test('with no reading the band yields to the engine', async ($, on) => {
  on('state.get', () => ({ value: { value: undefined, version: 0 } }))
  on('ui.render', ($drawn, e) => {
    const { Text } = $drawn.ui.resolve(e)

    return <Text>engine</Text>
  })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })

    expect(await ui.find({ type: 'Text', text: /engine/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /ctx/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('the band reports context, cost and the tightest window', async ($, on) => {
  const held = new Map<string, unknown>()
  on('state.get', (_, e) => ({ value: { value: held.get(e.key), version: 1 } }))
  on('state.set', (_, e) => {
    held.set(e.key, e.value)

    return { value: { isSet: true, version: 2 } }
  })
  on('ui.render', ($drawn, e) => {
    const { Text } = $drawn.ui.resolve(e)

    return <Text>engine</Text>
  })

  for (const surface of SURFACES) {
    held.set('snap', SNAP)
    held.set('marks', MARKS)
    held.set('isHidden', false)

    const ui = await $.ui.mount({ ...BAND, surface })

    expect(await ui.find({ type: 'Text', text: /62%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /124k\/200k/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\$1\.23/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /5h 42%/ })).toBeDefined()

    // Hide is the person's only control here: it must stick.
    await ui.press({ key: 'hide' })
    expect(held.get('isHidden')).toBe(true)
    await ui.unmount()
  }
})

test('a hidden band draws nothing of its own', async ($, on) => {
  const held = new Map<string, unknown>([
    ['snap', SNAP],
    ['marks', MARKS],
    ['isHidden', true],
  ])
  on('state.get', (_, e) => ({ value: { value: held.get(e.key), version: 1 } }))
  on('ui.render', ($drawn, e) => {
    const { Text } = $drawn.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect(await ui.find({ type: 'Text', text: /engine/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /62%/ })).toBeUndefined()
  await ui.unmount()
})

test('a survey takes the band back', async ($, on) => {
  on('state.get', (_, e) => ({
    value: { value: e.key === 'snap' ? SNAP : false, version: 1 },
  }))
  on('ui.render', ($drawn, e) => {
    const { Text } = $drawn.ui.resolve(e)

    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({
    ...BAND,
    props: { ...BAND.props, hasSurvey: true },
    surface: 'desktop',
  })

  expect(await ui.find({ type: 'Text', text: /engine/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /62%/ })).toBeUndefined()
  await ui.unmount()
})
