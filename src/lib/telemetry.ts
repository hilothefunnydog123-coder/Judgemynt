/* ════════════════════════════════════════════════════════════════════════
   Judgemynt — process telemetry.

   Employers keep asking assessment vendors the same unanswerable question:
   "did they actually do this?" The industry's answer is proctoring — lockdown
   browsers, webcams, an arms race it loses.

   We get a better answer for free. Because the AI lives inside our workspace,
   the whole session is observable: whether they read the context pack before
   they started typing, how long they sat with a reply before responding, how
   much of their input was typed versus pasted in one shot. None of it is a
   cheating detector and it is never scored on its own — it is a working-style
   portrait, and it is the thing a hiring manager actually reads twice.

   Everything here is derived from events the workspace already generates. We
   do not touch the webcam, the clipboard contents, or anything outside the tab.
   ════════════════════════════════════════════════════════════════════════ */

export interface TelemetryEvent {
  t: number // ms since session start
  kind: 'doc_open' | 'doc_close' | 'send' | 'paste' | 'command' | 'reply' | 'idle_end'
  /** doc id, command name, or char count depending on kind. */
  ref?: string
  n?: number
}

export interface Telemetry {
  startedAt: number
  events: TelemetryEvent[]
  typedChars: number
  pastedChars: number
  turns: number
}

export const emptyTelemetry = (): Telemetry => ({
  startedAt: 0,
  events: [],
  typedChars: 0,
  pastedChars: 0,
  turns: 0,
})

export interface ProcessSignals {
  /** Did they open any context doc before sending their first instruction? */
  readFirst: boolean
  /** How many of the available docs they opened at all. */
  docsOpened: number
  docsAvailable: number
  /** Seconds from session start to first instruction. */
  timeToFirstMove: number
  /** Share of their typed input that arrived as a paste rather than keystrokes. */
  pasteShare: number
  /** Median seconds between an AI reply and their next instruction. */
  medianThinkTime: number
  /** Instructions sent. */
  turns: number
  /** Workspace commands used, deduped. */
  commands: string[]
  /** One-line human summaries, ready to render. Never a verdict on their own. */
  notes: string[]
}

function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

export function deriveSignals(tel: Telemetry, docsAvailable: number): ProcessSignals {
  const ev = Array.isArray(tel?.events) ? tel.events : []
  const sends = ev.filter((e) => e.kind === 'send')
  const opens = ev.filter((e) => e.kind === 'doc_open')
  const firstSend = sends[0]?.t ?? 0

  // Think time = gap between an AI reply landing and the next instruction going out.
  const thinks: number[] = []
  for (const send of sends) {
    const priorReply = [...ev].reverse().find((e) => e.kind === 'reply' && e.t < send.t)
    if (priorReply) thinks.push(Math.round((send.t - priorReply.t) / 1000))
  }

  const typed = Math.max(0, tel?.typedChars || 0)
  const pasted = Math.max(0, tel?.pastedChars || 0)
  const totalIn = typed + pasted

  const signals: ProcessSignals = {
    readFirst: opens.some((o) => !firstSend || o.t < firstSend),
    docsOpened: new Set(opens.map((o) => o.ref)).size,
    docsAvailable,
    timeToFirstMove: Math.round(firstSend / 1000),
    pasteShare: totalIn ? pasted / totalIn : 0,
    medianThinkTime: median(thinks),
    turns: sends.length,
    commands: [...new Set(ev.filter((e) => e.kind === 'command').map((e) => String(e.ref)))],
    notes: [],
  }

  // Notes are descriptive, never accusatory. A hiring manager draws the conclusion.
  const n = signals.notes
  if (signals.docsAvailable > 0) {
    if (signals.docsOpened === 0) {
      n.push('Never opened the context pack.')
    } else if (signals.readFirst) {
      n.push(`Read ${signals.docsOpened} of ${signals.docsAvailable} context documents before the first instruction.`)
    } else {
      n.push(`Opened ${signals.docsOpened} of ${signals.docsAvailable} documents, but only after starting.`)
    }
  }
  if (signals.timeToFirstMove > 0 && signals.timeToFirstMove < 20 && !signals.readFirst) {
    n.push(`Started directing the AI ${signals.timeToFirstMove}s in, without reading anything first.`)
  }
  if (signals.pasteShare > 0.6 && totalIn > 200) {
    n.push(`${Math.round(signals.pasteShare * 100)}% of their input was pasted rather than typed.`)
  }
  if (signals.medianThinkTime >= 25) {
    n.push(`Sat with each reply for ${signals.medianThinkTime}s before responding — read before reacting.`)
  } else if (signals.medianThinkTime > 0 && signals.medianThinkTime < 6 && signals.turns > 3) {
    n.push(`Median ${signals.medianThinkTime}s between the AI replying and the next instruction — moved fast.`)
  }
  if (signals.turns <= 2) n.push(`Only ${signals.turns} instruction(s) sent in total.`)
  if (signals.commands.length) n.push(`Used ${signals.commands.map((c) => '/' + c).join(', ')}.`)

  return signals
}

/** Compact, prompt-safe rendering for the examiner. */
export function signalsForPrompt(s: ProcessSignals): string {
  return [
    `instructions sent: ${s.turns}`,
    `context docs opened: ${s.docsOpened}/${s.docsAvailable}${s.readFirst ? ' (before starting)' : s.docsOpened ? ' (only after starting)' : ''}`,
    `time to first instruction: ${s.timeToFirstMove}s`,
    `median think time between reply and next instruction: ${s.medianThinkTime}s`,
    `share of input pasted rather than typed: ${Math.round(s.pasteShare * 100)}%`,
    s.commands.length ? `commands used: ${s.commands.join(', ')}` : 'commands used: none',
  ].join('\n')
}

/** Accept client-reported telemetry without trusting its shape or size. */
export function sanitizeTelemetry(input: unknown): Telemetry {
  const raw = (input || {}) as Partial<Telemetry>
  const events = Array.isArray(raw.events) ? raw.events : []
  return {
    startedAt: Number(raw.startedAt) || 0,
    typedChars: Math.max(0, Math.min(1e6, Number(raw.typedChars) || 0)),
    pastedChars: Math.max(0, Math.min(1e6, Number(raw.pastedChars) || 0)),
    turns: Math.max(0, Math.min(500, Number(raw.turns) || 0)),
    events: events.slice(0, 600).map((e) => ({
      t: Math.max(0, Number(e?.t) || 0),
      kind: String(e?.kind || 'send') as TelemetryEvent['kind'],
      ref: e?.ref ? String(e.ref).slice(0, 40) : undefined,
      n: e?.n === undefined ? undefined : Number(e.n) || 0,
    })),
  }
}
