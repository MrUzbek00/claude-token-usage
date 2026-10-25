import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Mark, Snap } from '../types'

const TIGHT_CONTEXT = 80
const TIGHT_LIMIT = 90

const snap = atom({ plugin: 'token-usage', key: 'snap' } as const, null)
const marks = atom({ plugin: 'token-usage', key: 'marks' } as const, [])
const isHidden = atom({ plugin: 'token-usage', key: 'isHidden' } as const, false)

const short = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1_000)}k`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`

  return `${Math.round(n)}`
}

const hue = (percent: number) =>
  percent >= 85 ? 'error' : percent >= 60 ? 'warning' : 'success'

const bar = (percent: number, width: number) => {
  const full = Math.max(0, Math.min(width, Math.round((percent / 100) * width)))

  return '█'.repeat(full) + '·'.repeat(width - full)
}

const resets = (iso: string | undefined, now: number) => {
  if (iso === undefined) return ''
  const left = Date.parse(iso) - now
  if (!Number.isFinite(left)) return ''
  if (left <= 0) return 'resets now'
  const mins = Math.round(left / 60_000)
  if (mins < 60) return `resets in ${mins}m`

  return `resets in ${Math.floor(mins / 60)}h ${mins % 60}m`
}

const label = (kind: string) => kind.replaceAll('_', ' ')

const tag = (kind: string) =>
  kind === 'five_hour' ? '5h' : kind === 'seven_day' ? '7d' : label(kind)

const worstOf = (now: Snap) =>
  [...now.limits].sort((a, b) => b.percentUsed - a.percentUsed)[0]

const take = async ($: EngineInterface): Promise<Snap> => {
  const usage = await $.session.usage({ breakdown: 'summary' })
  const broken = usage.context.breakdown

  return {
    tokens: usage.context.tokens ?? broken?.totalTokens ?? 0,
    window: usage.context.window,
    percent: usage.context.percent ?? broken?.percentage ?? 0,
    usd: usage.cost?.usd,
    model: broken?.model ?? (await $.session.model()),
    threshold: broken?.autoCompactThreshold,
    limits: usage.rateLimits.map(one => ({
      kind: one.kind,
      percentUsed: one.percentUsed,
      resetsAt: one.resetsAt,
    })),
    rows: (broken?.categories ?? [])
      .filter(row => row.kind === 'used' && row.tokens > 0)
      .map(row => ({ name: row.name, tokens: row.tokens }))
      .sort((a, b) => b.tokens - a.tokens),
    at: await $.clock.now(),
  }
}

const line = (now: Snap) => {
  const parts = [`ctx ${Math.round(now.percent)}% (${short(now.tokens)})`]
  if (now.usd !== undefined) parts.push(`$${now.usd.toFixed(2)}`)
  const worst = worstOf(now)
  if (worst !== undefined) {
    parts.push(`${label(worst.kind)} ${Math.round(worst.percentUsed)}%`)
  }

  return parts.join(' · ')
}

const detail = (now: Snap, history: Mark[], clock: number) => {
  const spent = history.filter(one => one.spent > 0)
  const lines = [
    `Context       ${Math.round(now.percent)}%  ${short(now.tokens)} of ${short(now.window)}  (${now.model})`,
  ]

  if (now.threshold !== undefined) {
    lines.push(`Compacts at   ${short(now.threshold)}`)
  }
  if (now.usd !== undefined) {
    const last = spent[spent.length - 1]
    const tail = last === undefined ? '' : `  (${last.spent.toFixed(3)} last turn)`
    lines.push(`Cost          $${now.usd.toFixed(2)} this session${tail}`)
  }
  for (const one of now.limits) {
    const when = resets(one.resetsAt, clock)
    lines.push(
      `${label(one.kind).padEnd(13)} ${Math.round(one.percentUsed)}%${when === '' ? '' : `  ${when}`}`,
    )
  }
  if (now.rows.length > 0) {
    lines.push('', 'In the window:')
    for (const row of now.rows.slice(0, 6)) {
      lines.push(`  ${short(row.tokens).padStart(6)}  ${row.name}`)
    }
  }

  return lines.join('\n')
}

const refresh = async ($: EngineInterface) => {
  const now = await take($)
  await update($, snap, () => now)
  $.ui.status(line(now))

  return now
}

export const register: Register = on => {
  let saidContext = false
  let saidLimit = false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'tokens',
      description: 'Show token usage, cost and rate limits for this session',
    })
    await refresh($)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const now = await refresh($)

    if (e.changed.includes('context') || e.changed.includes('cost')) {
      await update($, marks, list => {
        const last = list[list.length - 1]
        const mark: Mark = {
          n: list.length + 1,
          tokens: now.tokens,
          percent: now.percent,
          usd: now.usd ?? 0,
          spent: Math.max(0, (now.usd ?? 0) - (last?.usd ?? 0)),
        }

        return [...list, mark].slice(-80)
      })
    }

    if (now.percent >= TIGHT_CONTEXT && !saidContext) {
      saidContext = true
      $.ui.toast(`Context is ${Math.round(now.percent)}% full`)
    }
    if (now.percent < TIGHT_CONTEXT) saidContext = false

    const tight = now.limits.find(one => one.percentUsed >= TIGHT_LIMIT)
    if (tight !== undefined && !saidLimit) {
      saidLimit = true
      $.ui.toast(`${label(tight.kind)} limit at ${Math.round(tight.percentUsed)}%`)
    }

    return next(e)
  })

  on('command.run', { command: 'tokens' }, async $ => {
    const now = await refresh($)
    const history = await read($, marks)
    await update($, isHidden, () => false)

    return { text: detail(now, history, await $.clock.now()) }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const now = await read($, snap)
    const quiet =
      e.props.hasSurvey || now === null || (await read($, isHidden))

    if (quiet) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const room = e.props.bodyColumns ?? 60
    const width = Math.max(6, Math.min(14, room - 46))
    const roomy = room >= 54
    const worst = worstOf(now)

    return (
      <Box>
        <Text dimColor>ctx </Text>
        <Text color={hue(now.percent)}>{bar(now.percent, width)}</Text>
        <Text> {Math.round(now.percent)}%</Text>
        <Text dimColor>
          {'  '}
          {short(now.tokens)}/{short(now.window)}
        </Text>
        {roomy && now.usd !== undefined && (
          <Text dimColor> · ${now.usd.toFixed(2)}</Text>
        )}
        {roomy && worst !== undefined && (
          <Text dimColor>
            {' '}
            · {tag(worst.kind)} {Math.round(worst.percentUsed)}%
          </Text>
        )}
        <Text> </Text>
        <Button
          key="hide"
          label="Hide"
          plain
          dimColor
          onPress={() => update($, isHidden, () => true)}
        />
      </Box>
    )
  })
}
