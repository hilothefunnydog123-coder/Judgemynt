'use client'
/* ════════════════════════════════════════════════════════════════════════
   The workspace — where the assessment actually happens.

   Three phases: brief → run → result.

   The design point: the context pack is a first-class panel, not a footnote.
   Whether someone opens it before they start typing is the single most
   predictive thing we observe, so the UI makes reading it easy and makes
   ignoring it a visible choice.
   ════════════════════════════════════════════════════════════════════════ */
import {
  useCallback, useEffect, useMemo, useRef, useState,
  type ClipboardEvent, type KeyboardEvent, type ReactNode,
} from 'react'
import {
  ChevronLeft, Clock, Zap, CornerDownLeft, FileText, X, Check,
  AlertTriangle, Loader2, Eye, Send, Gauge, Award, ExternalLink,
} from 'lucide-react'
import type { JmDoc } from '@/lib/tasks'
import type { TelemetryEvent } from '@/lib/telemetry'
import { useAuth } from '@/hooks/useAuth'

const TEAL = '#00d4aa'
const RED = '#ff5470'
const AMBER = '#f59e0b'

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

interface TaskConfig {
  roleId: string | null
  roleName: string
  taskId: string
  title: string
  role: string
  roleEmoji: string
  color: string
  brief: string
  deliverable: string
  docs: JmDoc[]
  budget: { tokens: number; seconds: number }
  passMark: number
  dimensions: { id: string; label: string }[]
  custom: boolean
}

interface ModelOpt {
  id: string
  tag: string
  mult: number
  accent: string
  glyph: string
  blurb: string
}

interface Msg {
  role: 'user' | 'assistant' | 'system'
  content: string
  cost?: number
}

interface TrapResult {
  id: string
  name: string
  weight: number
  resolved: boolean
  note: string
}

interface ScopeDim {
  id: string
  label: string
  skill: string
  score: number
  percentile: number
  confident: boolean
}
interface ScopeBenchmark {
  scope: 'task' | 'role'
  sample: number
  confident: boolean
  percentileOverall: number
  dimensionPercentiles: Record<string, number>
  dimensions: ScopeDim[]
  top: { id: string; label: string; skill: string; percentile: number }
}
interface Benchmark {
  primary: 'task' | 'role' | null
  task: ScopeBenchmark | null
  role: ScopeBenchmark | null
}

interface Grade {
  overall: number
  passed: boolean
  passMark: number
  verdict: string
  dimensions: Record<string, number>
  dimensionLabels: { id: string; label: string }[]
  traps: TrapResult[]
  steps: { move: string; take: string }[]
  signals: { notes: string[]; docsOpened: number; docsAvailable: number; turns: number; medianThinkTime: number }
  analysis: string
  hire: string
  benchmark?: Benchmark | null
  credential?: { id: string; url: string } | null
}

/** "Top 8%" above the median, an honest ordinal at or below it. */
function topPct(rank: number): number {
  return Math.max(1, Math.min(99, 100 - Math.round(rank)))
}
function ordinalPct(n: number): string {
  const r = Math.round(n)
  const v = r % 100
  const s = ['th', 'st', 'nd', 'rd']
  return `${r}${s[(v - 20) % 10] || s[v] || s[0]}`
}
function percentilePhrase(rank: number, skill?: string): string {
  const at = skill ? ` at ${skill}` : ''
  return rank >= 50 ? `Top ${topPct(rank)}%${at}` : `${ordinalPct(rank)} percentile${at}`
}

export default function Workspace({
  onExit,
  inviteToken,
  taskId,
  candidate,
}: {
  onExit: () => void
  inviteToken?: string
  taskId?: string
  candidate?: { name: string; email: string }
}) {
  const { getToken } = useAuth()
  const [phase, setPhase] = useState<'brief' | 'run' | 'result'>('brief')
  const [cfg, setCfg] = useState<TaskConfig | null>(null)
  const [models, setModels] = useState<ModelOpt[]>([])
  const [model, setModel] = useState('claude')
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [used, setUsed] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(1200)
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState<null | 'tokens' | 'time'>(null)
  const [grade, setGrade] = useState<Grade | null>(null)
  const [gradeError, setGradeError] = useState('')
  const [openDoc, setOpenDoc] = useState<JmDoc | null>(null)
  const [docsSeen, setDocsSeen] = useState<Set<string>>(new Set())
  const [flash, setFlash] = useState<number | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const endedRef = useRef(false)
  // The server-owned session id. The server accumulates the real transcript
  // under this id and grades only that, so the score cannot be forged.
  const sessionId = useRef<string>('')
  const t0 = useRef<number>(0)
  const tel = useRef<{ events: TelemetryEvent[]; typed: number; pasted: number }>({
    events: [], typed: 0, pasted: 0,
  })

  const budget = cfg?.budget.tokens ?? 10000
  const remaining = Math.max(0, budget - used)
  const tokenPct = (remaining / budget) * 100
  const tokenColor = tokenPct > 40 ? TEAL : tokenPct > 15 ? AMBER : RED
  const accent = cfg?.color || TEAL
  const modelInfo = useMemo(() => models.find((m) => m.id === model), [models, model])

  /** Every telemetry write goes through here so timestamps stay relative. */
  const track = useCallback((kind: TelemetryEvent['kind'], ref?: string, n?: number) => {
    if (!t0.current) return
    tel.current.events.push({ t: Date.now() - t0.current, kind, ref, n })
  }, [])

  /* ── load the role/task ──────────────────────────────────────────────── */
  useEffect(() => {
    fetch('/api/assess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'task', token: inviteToken, taskId }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.task) {
          setCfg(d.task as TaskConfig)
          setSecondsLeft(d.task.budget.seconds)
        }
        if (Array.isArray(d?.models)) setModels(d.models)
      })
      .catch(() => {})
  }, [inviteToken, taskId])

  /* ── the clock ───────────────────────────────────────────────────────── */
  useEffect(() => {
    if (phase !== 'run') return
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id)
          end('time')
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  function sys(content: string) {
    setMessages((m) => [...m, { role: 'system', content }])
  }

  function viewDoc(d: JmDoc) {
    setOpenDoc(d)
    setDocsSeen((s) => new Set(s).add(d.id))
    track('doc_open', d.id)
  }

  function begin() {
    t0.current = Date.now()
    // Docs opened while still on the brief screen count — reading before you
    // start is exactly the behaviour worth measuring.
    docsSeen.forEach((id) => tel.current.events.push({ t: 0, kind: 'doc_open', ref: id }))
    setPhase('run')
    setMessages([
      { role: 'system', content: `TASK: ${cfg?.title}\n\n${cfg?.brief}\n\nDELIVER: ${cfg?.deliverable}` },
      {
        role: 'assistant',
        content: `I'm ${modelInfo?.tag || 'your assistant'}. I know nothing about your task until you tell me. Type /help for commands.`,
      },
    ])
  }

  async function end(reason: 'submit' | 'tokens' | 'time') {
    if (endedRef.current) return
    endedRef.current = true
    if (reason !== 'submit') setLocked(reason)
    setBusy(true)
    setGradeError('')
    setPhase('result')
    try {
      const authToken = await getToken()
      const res = await fetch('/api/assess', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          action: 'evaluate',
          token: inviteToken,
          taskId: cfg?.taskId,
          model,
          sessionId: sessionId.current,
          history: messages,
          tokensUsed: used,
          tokensBudget: budget,
          secondsUsed: (cfg?.budget.seconds ?? 1200) - secondsLeft,
          timeLimit: cfg?.budget.seconds ?? 1200,
          reason,
          candidate_name: candidate?.name || '',
          candidate_email: candidate?.email || '',
          telemetry: {
            startedAt: t0.current,
            events: tel.current.events,
            typedChars: tel.current.typed,
            pastedChars: tel.current.pasted,
            turns: messages.filter((m) => m.role === 'user').length,
          },
        }),
      })
      const d = await res.json()
      if (res.ok) setGrade(d as Grade)
      else {
        setGradeError(d.error || 'The examiner could not be reached.')
        endedRef.current = false
      }
    } catch {
      setGradeError('Network error reaching the examiner.')
      endedRef.current = false
    }
    setBusy(false)
  }

  async function ask(text: string) {
    if (busy || phase !== 'run') return
    track('send', undefined, text.length)
    const history = [...messages, { role: 'user' as const, content: text }]
    setMessages(history)
    setBusy(true)
    try {
      const res = await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'respond', token: inviteToken, taskId: cfg?.taskId, model, history, message: text, sessionId: sessionId.current }),
      })
      const d = await res.json()
      if (!res.ok) {
        // The server enforces the token budget too; honor a hard lock.
        if (d.locked) { end('tokens'); return }
        sys(d.error || 'AI error. Try again.')
        setBusy(false)
        return
      }
      if (d.sessionId) sessionId.current = d.sessionId
      const cost = Number(d.tokensUsed) || 0
      const next = used + cost
      setUsed(next)
      setFlash(cost)
      setTimeout(() => setFlash(null), 900)
      track('reply', undefined, cost)
      setMessages((m) => [...m, { role: 'assistant', content: d.reply, cost }])
      setBusy(false)
      if (next >= budget) end('tokens')
    } catch {
      sys('Network error.')
      setBusy(false)
    }
  }

  function command(raw: string) {
    const [c, ...rest] = raw.slice(1).split(' ')
    const arg = rest.join(' ').trim().toLowerCase()
    const name = c.toLowerCase()
    track('command', name)
    switch (name) {
      case 'help':
        sys(
          'COMMANDS\n/task     the brief again\n/docs     list the context pack\n/open <n> open document n\n/model <id> switch model (changes token cost)\n/check    ask the AI to test the current answer against every requirement\n/tokens   tokens left\n/time     time left\n/reset    make the AI forget the approach (tokens are NOT refunded)\n/clear    clear the screen\n/submit   finish and be graded\n\nAnything without a / goes to the AI and costs tokens.'
        )
        break
      case 'task':
        sys(`TASK: ${cfg?.title}\n\n${cfg?.brief}\n\nDELIVER: ${cfg?.deliverable}`)
        break
      case 'docs':
        sys(
          cfg?.docs.length
            ? 'CONTEXT PACK (free to read, costs no tokens)\n' +
              cfg.docs.map((d, i) => `  ${i + 1}. ${d.title}  [${d.kind}]`).join('\n') +
              '\n\n/open <number> to read one.'
            : 'No context documents for this task.'
        )
        break
      case 'open': {
        const i = parseInt(arg, 10) - 1
        const d = cfg?.docs[i]
        if (d) viewDoc(d)
        else sys('Usage: /open <number>. See /docs for the list.')
        break
      }
      case 'tokens':
        sys(`${remaining.toLocaleString()} / ${budget.toLocaleString()} tokens left.`)
        break
      case 'time':
        sys(`${fmt(secondsLeft)} left.`)
        break
      case 'model':
        if (models.some((m) => m.id === arg)) {
          setModel(arg)
          sys(`Switched to ${models.find((m) => m.id === arg)?.tag}. Token cost x${models.find((m) => m.id === arg)?.mult}.`)
        } else sys(`Usage: /model ${models.map((m) => m.id).join(' | ')}`)
        break
      case 'check':
        ask('Check the current answer against every requirement I have given you in this conversation, one by one. For anything that fails, show me the exact input or case that breaks it. Do not fix it yet.')
        break
      case 'reset':
        setMessages((m) => [
          ...m,
          { role: 'system', content: '· Context reset. The AI forgets the prior approach. Spent tokens are not refunded. ·' },
          { role: 'assistant', content: `Fresh start. What should I build?` },
        ])
        break
      case 'clear':
        setMessages([])
        break
      case 'submit':
        end('submit')
        break
      default:
        sys(`Unknown command: /${c}. Try /help.`)
    }
  }

  function onSend() {
    const raw = input.trim()
    if (!raw || busy || phase !== 'run') return
    setInput('')
    if (raw.startsWith('/')) command(raw)
    else ask(raw)
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const n = (e.clipboardData?.getData('text') || '').length
    tel.current.pasted += n
    track('paste', undefined, n)
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  /* ═══════════════════════════ BRIEF ═══════════════════════════ */
  if (phase === 'brief') {
    return (
      <div className="min-h-screen relative">
        <Backdrop />
        <div className="relative max-w-4xl mx-auto px-6 sm:px-10 py-10">
          <button onClick={onExit} className="flex items-center gap-1 text-white font-semibold text-sm hover:text-[#00d4aa] transition">
            <ChevronLeft className="w-4 h-4" /> Judgemynt
          </button>

          {!cfg ? (
            <div className="flex items-center gap-3 text-white/40 mt-20">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading your assessment…
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.3em] mt-8" style={{ color: accent }}>
                <span className="text-base">{cfg.roleEmoji}</span> {cfg.role}
              </div>
              <h1 className="font-podium text-[clamp(2rem,6vw,3.8rem)] uppercase leading-[0.95] mt-3">{cfg.title}</h1>

              <div className="mt-7 rounded-2xl border p-6" style={{ background: 'rgba(255,255,255,.025)', borderColor: `${accent}30` }}>
                <div className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: accent }}>The task</div>
                <p className="text-white font-medium leading-relaxed whitespace-pre-wrap">{cfg.brief}</p>
                <div className="mt-5 pt-4 border-t border-white/10">
                  <div className="text-[11px] font-bold uppercase tracking-widest mb-1.5 text-white">You must hand in</div>
                  <p className="text-white font-medium text-sm">{cfg.deliverable}</p>
                </div>
              </div>

              {cfg.docs.length > 0 && (
                <div className="mt-6">
                  <div className="flex items-baseline justify-between mb-3">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-white">
                      Context: {cfg.docs.length} document{cfg.docs.length > 1 ? 's' : ''}
                    </div>
                    <div className="text-[12px] font-bold text-white">free to read · costs no tokens</div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2.5">
                    {cfg.docs.map((d) => (
                      <DocCard key={d.id} doc={d} seen={docsSeen.has(d.id)} accent={accent} onOpen={() => viewDoc(d)} />
                    ))}
                  </div>
                  <p className="text-white font-semibold text-[14px] mt-3 leading-relaxed">
                    You are allowed to use the AI for everything. It starts completely blank: it does not know
                    the task, the deliverable, or these documents until you tell it.
                  </p>
                </div>
              )}

              <div className="mt-7">
                <div className="text-[11px] font-bold uppercase tracking-widest text-white mb-3">Pick your assistant</div>
                <div className="grid sm:grid-cols-3 gap-2.5">
                  {models.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setModel(m.id)}
                      className="text-left rounded-xl border p-4 transition"
                      style={{
                        background: model === m.id ? `${m.accent}12` : 'rgba(255,255,255,.02)',
                        borderColor: model === m.id ? `${m.accent}70` : 'rgba(255,255,255,.08)',
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span style={{ color: m.accent }}>{m.glyph}</span>
                        <span className="font-semibold">{m.tag}</span>
                        <span className="ml-auto text-[11px] tabular-nums" style={{ fontFamily: mono, color: m.mult > 1 ? RED : m.mult < 1 ? TEAL : 'rgba(255,255,255,.5)' }}>
                          ×{m.mult}
                        </span>
                      </div>
                      <div className="text-white font-medium text-[12.5px] mt-1.5 leading-snug">{m.blurb}</div>
                    </button>
                  ))}
                </div>
                <p className="text-white font-semibold text-[14px] mt-3">
                  The careful model costs more per message. Choosing well is part of the assessment.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-5 mt-8 text-sm">
                <Meter icon={<Zap className="w-3.5 h-3.5" />} label={`${budget.toLocaleString()} tokens`} />
                <Meter icon={<Clock className="w-3.5 h-3.5" />} label={`${Math.round(cfg.budget.seconds / 60)} minutes`} />
                <Meter icon={<Gauge className="w-3.5 h-3.5" />} label={`pass at ${cfg.passMark}`} />
              </div>

              <button
                onClick={begin}
                className="mt-7 rounded-full px-8 py-3.5 font-bold text-[#04121a] transition hover:brightness-110"
                style={{ background: accent }}
              >
                Start. The clock runs from here.
              </button>
            </>
          )}
        </div>
        {openDoc && <DocModal doc={openDoc} accent={accent} onClose={() => { track('doc_close', openDoc.id); setOpenDoc(null) }} />}
      </div>
    )
  }

  /* ═══════════════════════════ RUN ═══════════════════════════ */
  if (phase === 'run') {
    return (
      <div className="h-screen flex flex-col relative overflow-hidden">
        <Backdrop />

        {/* meters */}
        <div className="relative flex items-center gap-4 px-4 sm:px-6 py-3 border-b border-white/[0.07] flex-wrap">
          <span className="font-podium uppercase tracking-wider text-sm">Judgemynt</span>
          <span className="text-white/25">/</span>
          <span className="text-[13px] text-white/60 truncate max-w-[38vw]">{cfg?.title}</span>

          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center gap-2 min-w-[150px]">
              <Zap className="w-3.5 h-3.5" style={{ color: tokenColor }} />
              <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${tokenPct}%`, background: tokenColor }} />
              </div>
              <span className="text-[12px] tabular-nums relative" style={{ fontFamily: mono, color: tokenColor }}>
                {remaining.toLocaleString()}
                {flash !== null && (
                  <span className="absolute -top-4 right-0 text-[11px] animate-[rise_.9s_ease-out_forwards]" style={{ color: RED }}>
                    −{flash}
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[13px] tabular-nums" style={{ fontFamily: mono, color: secondsLeft > 60 ? 'rgba(255,255,255,.7)' : RED }}>
              <Clock className="w-3.5 h-3.5" /> {fmt(secondsLeft)}
            </div>
          </div>
        </div>

        <div className="relative flex-1 flex min-h-0">
          {/* docs rail */}
          {!!cfg?.docs.length && (
            <aside className="hidden md:flex w-60 flex-col border-r border-white/[0.07] p-3 gap-1.5 overflow-y-auto">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white px-1 pb-1">Context</div>
              {cfg.docs.map((d, i) => (
                <button
                  key={d.id}
                  onClick={() => viewDoc(d)}
                  className="text-left rounded-lg px-2.5 py-2 transition hover:bg-white/[0.05] group"
                  style={{ background: docsSeen.has(d.id) ? 'rgba(255,255,255,.03)' : 'transparent' }}
                >
                  <div className="flex items-start gap-2">
                    <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: docsSeen.has(d.id) ? accent : 'rgba(255,255,255,.3)' }} />
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-medium leading-snug text-white">{d.title}</div>
                      <div className="text-[10px] uppercase tracking-wider text-white/70 mt-0.5" style={{ fontFamily: mono }}>
                        {i + 1} · {d.kind}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
              <div className="text-[12px] font-semibold text-white px-1 pt-2 leading-relaxed">Reading these is free. Messaging the AI is not.</div>
            </aside>
          )}

          {/* conversation */}
          <div className="flex-1 flex flex-col min-w-0">
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-7 py-5 space-y-4">
              {messages.map((m, i) => (
                <Bubble key={i} msg={m} accent={accent} modelTag={modelInfo?.tag || 'AI'} modelAccent={modelInfo?.accent || accent} />
              ))}
              {busy && (
                <div className="flex items-center gap-2 text-white/35 text-sm">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> {modelInfo?.tag || 'AI'} is working…
                </div>
              )}
            </div>

            <div className="border-t border-white/[0.07] p-3 sm:p-4">
              <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5 focus-within:border-white/25 transition">
                <textarea
                  value={input}
                  onChange={(e) => {
                    const delta = e.target.value.length - input.length
                    if (delta > 0) tel.current.typed += delta
                    setInput(e.target.value)
                  }}
                  onPaste={onPaste}
                  onKeyDown={onKey}
                  rows={1}
                  placeholder={`Direct ${modelInfo?.tag || 'the AI'}…  (/help for commands)`}
                  className="flex-1 bg-transparent outline-none resize-none text-[15px] max-h-40 py-1"
                  style={{ fontFamily: input.startsWith('/') ? mono : undefined }}
                />
                <button
                  onClick={onSend}
                  disabled={busy || !input.trim()}
                  className="rounded-xl px-3 py-2 disabled:opacity-30 transition"
                  style={{ background: `${accent}1a`, color: accent }}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-3 mt-2 text-[12px] font-medium text-white/80 flex-wrap">
                <span><CornerDownLeft className="w-3 h-3 inline" /> send · shift+enter newline</span>
                <button onClick={() => command('/docs')} className="hover:text-[#00d4aa] transition">/docs</button>
                <button onClick={() => command('/check')} className="hover:text-[#00d4aa] transition">/check</button>
                <button onClick={() => command('/submit')} className="ml-auto font-bold hover:brightness-125 transition" style={{ color: accent }}>
                  /submit →
                </button>
              </div>
            </div>
          </div>
        </div>

        {openDoc && <DocModal doc={openDoc} accent={accent} onClose={() => { track('doc_close', openDoc.id); setOpenDoc(null) }} />}
      </div>
    )
  }

  /* ═══════════════════════════ RESULT ═══════════════════════════ */
  return (
    <div className="min-h-screen relative">
      <Backdrop />
      <div className="relative max-w-3xl mx-auto px-6 sm:px-10 py-12">
        {busy && !grade && (
          <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: accent }} />
            <div className="text-white font-semibold">The examiner is reading your session…</div>
          </div>
        )}

        {gradeError && (
          <div className="rounded-xl border p-5 mt-10" style={{ background: `${RED}0d`, borderColor: `${RED}40` }}>
            <div className="flex items-center gap-2 font-semibold" style={{ color: RED }}>
              <AlertTriangle className="w-4 h-4" /> {gradeError}
            </div>
            <button onClick={() => end('submit')} className="mt-3 rounded-full px-5 py-2 text-sm font-semibold" style={{ background: `${accent}1a`, color: accent }}>
              Try grading again
            </button>
          </div>
        )}

        {grade && (
          <>
            {locked && (
              <div className="rounded-xl border px-4 py-2.5 mb-6 text-sm font-bold" style={{ background: `${RED}0d`, borderColor: `${RED}35`, color: RED }}>
                Session ended early: you ran out of {locked === 'tokens' ? 'tokens' : 'time'}.
              </div>
            )}

            <ScoreDial value={grade.overall} passed={grade.passed} passMark={grade.passMark} />
            <div className="text-center mt-4">
              <div className="font-podium text-2xl uppercase" style={{ color: grade.passed ? TEAL : RED }}>{grade.verdict}</div>
              <div className="text-white font-semibold text-sm mt-1">{cfg?.title}</div>
            </div>

            {/* the benchmark: where they rank, not just what they scored */}
            <BenchmarkHero benchmark={grade.benchmark} />

            {/* dimensions, each with its percentile when the pool is deep enough */}
            <div className="mt-9 space-y-3">
              {grade.dimensionLabels.map((d) => {
                const scope = grade.benchmark?.[grade.benchmark.primary || 'task']
                const dim = scope?.dimensions?.find((x) => x.id === d.id)
                return (
                  <Bar
                    key={d.id}
                    label={d.label}
                    value={grade.dimensions[d.id] ?? 0}
                    accent={accent}
                    rank={dim && dim.confident ? dim.percentile : undefined}
                  />
                )
              })}
            </div>

            {/* traps — the part people screenshot */}
            {grade.traps.length > 0 && (
              <div className="mt-10">
                <div className="text-[11px] font-bold uppercase tracking-widest text-white mb-3">
                  What the documents were hiding
                </div>
                <div className="space-y-2">
                  {grade.traps.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-xl border p-4"
                      style={{
                        background: t.resolved ? `${TEAL}0a` : `${RED}0a`,
                        borderColor: t.resolved ? `${TEAL}33` : `${RED}33`,
                      }}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 shrink-0" style={{ color: t.resolved ? TEAL : RED }}>
                          {t.resolved ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-[14.5px] leading-snug">{t.name}</div>
                          {t.note && <div className="text-white/90 font-medium text-[13px] mt-1 leading-relaxed">{t.note}</div>}
                        </div>
                        {t.weight >= 3 && (
                          <span className="ml-auto shrink-0 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.45)' }}>
                            critical
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* how they worked */}
            {!!grade.signals?.notes?.length && (
              <div className="mt-9 rounded-xl border border-white/10 p-5" style={{ background: 'rgba(255,255,255,.02)' }}>
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white mb-3">
                  <Eye className="w-3.5 h-3.5" /> How you worked
                </div>
                <ul className="space-y-1.5">
                  {grade.signals.notes.map((n, i) => (
                    <li key={i} className="text-white font-medium text-[13.5px] flex gap-2">
                      <span className="text-white/40">·</span> {n}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* moves */}
            {!!grade.steps.length && (
              <div className="mt-9">
                <div className="text-[11px] font-bold uppercase tracking-widest text-white mb-3">Your key moves</div>
                <div className="space-y-2.5">
                  {grade.steps.map((s, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="text-[11px] tabular-nums text-white/70 pt-0.5 w-5 shrink-0" style={{ fontFamily: mono }}>
                        {String(i + 1).padStart(2, '0')}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold">{s.move}</div>
                        <div className="text-white/90 font-medium text-[13px] mt-0.5">{s.take}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {grade.analysis && (
              <div className="mt-9 rounded-xl border border-white/10 p-5" style={{ background: 'rgba(255,255,255,.02)' }}>
                <div className="text-[11px] font-bold uppercase tracking-widest text-white mb-2">The examiner&apos;s read</div>
                <p className="text-white font-medium leading-relaxed text-[14.5px]">{grade.analysis}</p>
              </div>
            )}

            {grade.hire && (
              <div className="mt-4 rounded-xl border p-5" style={{ background: `${accent}0a`, borderColor: `${accent}30` }}>
                <div className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: accent }}>The call</div>
                <p className="text-white font-semibold leading-relaxed">{grade.hire}</p>
              </div>
            )}

            {/* a passed practice run mints a credential worth showing off */}
            {grade.credential && (
              <div className="mt-4 rounded-xl border p-5" style={{ background: `${TEAL}0a`, borderColor: `${TEAL}40` }}>
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: TEAL }}>
                  <Award className="w-4 h-4" /> Credential earned
                </div>
                <p className="text-white font-medium leading-relaxed text-[14px]">
                  You passed, so this session is now a verifiable credential. The link below is public
                  and shows your name, this task, and your score. Put it on your profile.
                </p>
                <div className="mt-3 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-[12px] font-medium text-white break-all" style={{ fontFamily: mono }}>
                  {grade.credential.url}
                </div>
                <div className="flex flex-wrap gap-3 mt-4">
                  <a
                    href={`https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(
                      `Judgemynt AI Judgment Credential: ${cfg?.title || 'Assessment'}`
                    )}&organizationName=Judgemynt&issueYear=${new Date().getFullYear()}&issueMonth=${new Date().getMonth() + 1}&certUrl=${encodeURIComponent(
                      grade.credential.url
                    )}&certId=${grade.credential.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-full px-5 py-2.5 font-bold text-[#04121a] hover:brightness-110 transition"
                    style={{ background: TEAL }}
                  >
                    <ExternalLink className="w-4 h-4" /> Add to LinkedIn
                  </a>
                  <a
                    href={grade.credential.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full px-5 py-2.5 font-semibold border border-white/15 hover:bg-white/5 transition"
                  >
                    View credential
                  </a>
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-9">
              <button onClick={onExit} className="rounded-full px-6 py-3 text-sm font-semibold border border-white/15 hover:bg-white/5 transition">
                Back to Judgemynt
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════ pieces ═══════════════════════════ */

/* Flat background by design. This only carries the keyframes the token-cost
   flash animation needs. */
function Backdrop() {
  return <style>{`@keyframes rise{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-14px)}}`}</style>
}

function Meter({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-white font-semibold">
      {icon} {label}
    </span>
  )
}

function DocCard({ doc, seen, accent, onOpen }: { doc: JmDoc; seen: boolean; accent: string; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="text-left rounded-xl border p-3.5 transition hover:bg-white/[0.04]"
      style={{ background: 'rgba(255,255,255,.02)', borderColor: seen ? `${accent}40` : 'rgba(255,255,255,.09)' }}
    >
      <div className="flex items-start gap-2.5">
        <FileText className="w-4 h-4 mt-0.5 shrink-0" style={{ color: seen ? accent : 'rgba(255,255,255,.35)' }} />
        <div className="min-w-0">
          <div className="text-[14px] font-medium leading-snug">{doc.title}</div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-white/70 mt-1" style={{ fontFamily: mono }}>
            {doc.kind} {seen && '· read'}
          </div>
        </div>
      </div>
    </button>
  )
}

function DocModal({ doc, accent, onClose }: { doc: JmDoc; accent: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl border my-8"
        style={{ background: '#080f18', borderColor: `${accent}30` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/10">
          <FileText className="w-4 h-4" style={{ color: accent }} />
          <div className="min-w-0">
            <div className="font-semibold leading-tight">{doc.title}</div>
            <div className="text-[10px] uppercase tracking-widest text-white/30" style={{ fontFamily: mono }}>{doc.kind}</div>
          </div>
          <button onClick={onClose} className="ml-auto text-white/40 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>
        <pre className="px-5 py-4 whitespace-pre-wrap text-[13.5px] leading-relaxed text-white/80 overflow-x-auto" style={{ fontFamily: mono }}>
          {doc.body}
        </pre>
      </div>
    </div>
  )
}

function Bubble({ msg, accent, modelTag, modelAccent }: { msg: Msg; accent: string; modelTag: string; modelAccent: string }) {
  if (msg.role === 'system')
    return (
      <pre className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-white/45 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3" style={{ fontFamily: mono }}>
        {msg.content}
      </pre>
    )

  if (msg.role === 'user')
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-wrap" style={{ background: `${accent}18`, border: `1px solid ${accent}30` }}>
          {msg.content}
        </div>
      </div>
    )

  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest mb-1.5" style={{ color: modelAccent }}>
        {modelTag}
        {msg.cost !== undefined && <span className="text-white/70 tracking-normal normal-case" style={{ fontFamily: mono }}>· {msg.cost} tokens</span>}
      </div>
      <div className="text-[14.5px] leading-relaxed whitespace-pre-wrap text-white">{msg.content}</div>
    </div>
  )
}

function Bar({ label, value, accent, rank }: { label: string; value: number; accent: string; rank?: number }) {
  const color = value >= 80 ? TEAL : value >= 55 ? accent : value >= 35 ? AMBER : RED
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[13px] font-semibold text-white">{label}</span>
        <span className="flex items-baseline gap-2">
          {rank !== undefined && (
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: rank >= 50 ? TEAL : 'rgba(255,255,255,.6)' }}>
              {percentilePhrase(rank)}
            </span>
          )}
          <span className="text-[13px] tabular-nums" style={{ fontFamily: mono, color }}>{value}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
        <div className="h-full rounded-full transition-[width] duration-1000 ease-out" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  )
}

/** The hero of the result screen: where the candidate ranks, the sentence the
 *  credential is built on. Falls silent when there is no benchmark at all. */
function BenchmarkHero({ benchmark }: { benchmark?: Benchmark | null }) {
  if (!benchmark) return null
  const scope = benchmark[benchmark.primary || 'task']
  if (!scope) return null
  const top = scope.top
  // Withhold the boast until the pool is real; the score still stands.
  const headline = scope.confident
    ? percentilePhrase(top.percentile, top.skill)
    : 'Ranking builds as more people take this'
  return (
    <div className="mt-7 rounded-2xl border p-5 text-center" style={{ background: `${TEAL}0a`, borderColor: `${TEAL}30` }}>
      <div className="text-[11px] font-bold uppercase tracking-widest text-white/70">Your benchmark</div>
      <div className="font-podium text-[clamp(1.5rem,5vw,2.2rem)] uppercase mt-1.5" style={{ color: scope.confident ? TEAL : '#ffffff' }}>
        {headline}
      </div>
      {scope.confident ? (
        <div className="text-white font-semibold text-[13.5px] mt-1.5">
          Ranked against {scope.sample.toLocaleString()} {scope.sample === 1 ? 'person' : 'people'} who took the same simulation.
        </div>
      ) : (
        <div className="text-white font-medium text-[13px] mt-1.5">
          You scored {Math.round(scope.percentileOverall)} on our calibrated norm. A live percentile appears once enough people have taken this.
        </div>
      )}
    </div>
  )
}

function ScoreDial({ value, passed, passMark }: { value: number; passed: boolean; passMark: number }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    // Count up rather than snap: the number is the payoff of the whole session.
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1100)
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])

  const R = 78
  const C = 2 * Math.PI * R
  const color = passed ? TEAL : RED

  return (
    <div className="flex justify-center pt-4">
      <div className="relative w-[200px] h-[200px]">
        <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
          <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="10" />
          <circle
            cx="100" cy="100" r={R} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C - (C * shown) / 100}
            style={{ transition: 'stroke-dashoffset .1s linear', filter: `drop-shadow(0 0 12px ${color}66)` }}
          />
          {/* the bar the company set */}
          <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="10"
            strokeDasharray={`2 ${C}`} strokeDashoffset={-(C * passMark) / 100} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-podium text-6xl tabular-nums" style={{ color }}>{shown}</div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-white mt-1">pass at {passMark}</div>
        </div>
      </div>
    </div>
  )
}
