export type Snap = {
  tokens: number
  window: number
  percent: number
  usd?: number
  model: string
  threshold?: number
  limits: { kind: string; percentUsed: number; resetsAt?: string }[]
  rows: { name: string; tokens: number }[]
  at: number
}

export type Mark = {
  n: number
  tokens: number
  percent: number
  usd: number
  spent: number
}

declare module 'claude-code' {
  interface PluginState {
    'token-usage': { snap: Snap | null; marks: Mark[]; isHidden: boolean }
  }
}
