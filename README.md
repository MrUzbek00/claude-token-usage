# token-usage

A Claude Code mod that keeps the cost of a session in front of you instead of
leaving you to guess at it. It draws a compact row just above the prompt with a
coloured context bar, the share of the context window in use, the raw token
count against the window size, what the session has cost so far in dollars, and
the tightest of the account's rate-limit windows. The same summary goes into the
status line, so it survives even when the row is hidden. A `Hide` button on the
row dismisses it for the rest of the session; `/tokens` brings it back along
with the full breakdown.

## What it does

- **A row above the prompt** — context bar, percentage, `tokens/window`, session
  cost, and the rate-limit window closest to its ceiling. It narrows itself on a
  small terminal and yields the space entirely when a survey needs it.
- **A status line entry** — the same figures in one line, updated as the session
  measures itself.
- **Two warnings, once each** — a toast when the context passes 80% full, and one
  when any rate-limit window passes 90% used. Neither repeats until the figure
  drops back below its threshold.
- **`/tokens`** — a full text breakdown: context used against the window and the
  model drawing it, the token count where auto-compaction will trigger, the
  session cost with what the last turn added, every rate-limit window with the
  time it resets, and the six largest categories of tokens in the window.

## Install

At the prompt of a terminal session:

```
/plugin install token-usage --marketplace MrUzbek00/claude-token-usage
```

Answer `y` to `Add marketplace?`, then press Enter to accept the user scope. The
hooks run in that session immediately, and in every session started afterwards.

From a shell:

```
claude plugin install token-usage --marketplace MrUzbek00/claude-token-usage
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt
box, then **Plugins**, then **Add marketplace** with
`MrUzbek00/claude-token-usage`, then **Add plugin**.

## How it works

A `session.measure` hook reads `$.session.usage({ breakdown: 'summary' })` and
keeps the result in `$.state`, so the row, the status line and the command all
draw from one reading. The figures are the engine's own; the mod adds no
accounting of its own and sends nothing anywhere. Everything it keeps lives in
the session's state and is gone when the session ends.

## Development

```
claude --plugin-dir .      # run a session with the mod loaded from this folder
claude plugin validate .   # check the manifest, marketplace file and hooks
claude plugin test .       # run the tests in tests/
tsc -p .                   # type-check against the engine's laid types
```

`.claude-plugin/types/` is written by the engine and is not committed.

## License

MIT — see [LICENSE](LICENSE).
