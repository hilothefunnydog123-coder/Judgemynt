'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronLeft, Cpu, Clock, Zap, CornerDownLeft, Crown, Plus, Mic, ChevronDown, AudioLines } from 'lucide-react'

const TEAL = '#00d4aa'
const BLUE = '#1e90ff'
const BUDGET = 10000
const TIME = 1200 // 20 minutes

const MODEL_INFO: Record<string, { tag: string; mult: number; blurb: string }> = {
  claude: { tag: 'Claude', mult: 1.25, blurb: 'Careful & thorough. Best code, costs the most per call.' },
  gpt: { tag: 'GPT', mult: 1.0, blurb: 'Fast & confident. Balanced cost.' },
  gemini: { tag: 'Gemini', mult: 0.8, blurb: 'Efficient & direct. Cheapest per call.' },
}
// Per-persona brand cues used by the model picker + the live exam skins.
const MODEL_ACCENT: Record<string, string> = { claude: '#e8853b', gpt: '#ffffff', gemini: '#4285f4' }
const MODEL_GLYPH: Record<string, string> = { claude: '✻', gpt: '✶', gemini: '✦' }
const MODEL_SKIN: Record<string, string> = {
  claude: 'Terminal interface',
  gpt: 'ChatGPT interface',
  gemini: 'Gemini interface',
}
const MODEL_IDS = Object.keys(MODEL_INFO)
const tagOf = (id: string) => MODEL_INFO[id]?.tag || 'AI'
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

const FALLBACK_TASK = {
  title: 'Ship a production-grade slugify()',
  brief:
    'Direct the AI to write a JavaScript function slugify(text) that turns any string into a clean URL slug. It MUST: (1) lowercase everything, (2) turn spaces and underscores into single hyphens, (3) remove every character except a-z, 0-9 and hyphens, (4) collapse repeated hyphens into one, (5) trim leading/trailing hyphens, (6) return an empty string for empty or whitespace-only input. You drive, the AI writes the code. Get it correct AND clean, then /submit.',
}

interface Msg {
  role: 'user' | 'assistant' | 'system'
  content: string
  cost?: number
}
interface Grade {
  overall: number
  verdict: string
  dimensions: { creativity: number; efficiency: number; quality: number }
  steps: { move: string; take: string }[]
  analysis: string
  hire: string
}

export default function Assessment({
  onExit,
  userName,
  onDownloadDegree,
  inviteToken,
  candidate,
}: {
  onExit: () => void
  userName?: string
  onDownloadDegree?: (title: string, name: string, sub: string) => void
  inviteToken?: string
  candidate?: { name: string; email: string }
}) {
  const [phase, setPhase] = useState<'intro' | 'run' | 'result'>('intro')
  const [model, setModel] = useState('claude')
  const [task, setTask] = useState<{ title: string; brief: string }>(FALLBACK_TASK)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [used, setUsed] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(TIME)
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState<null | 'tokens' | 'time'>(null)
  const [grade, setGrade] = useState<Grade | null>(null)
  const [gradeError, setGradeError] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const endedRef = useRef(false)

  const remaining = Math.max(0, BUDGET - used)
  const tokenPct = (remaining / BUDGET) * 100
  const tokenColor = tokenPct > 40 ? TEAL : tokenPct > 15 ? '#f59e0b' : '#ff5470'
  const timeColor = secondsLeft > 60 ? '#cdd6f4' : '#ff5470'

  useEffect(() => {
    fetch('/api/assess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'task' }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.task) setTask(d.task)
      })
      .catch(() => {})
  }, [])

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
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [messages, busy])

  function sys(content: string) {
    setMessages((m) => [...m, { role: 'system', content }])
  }

  function begin() {
    setPhase('run')
    setMessages([
      { role: 'system', content: `TASK, ${task.title}\n\n${task.brief}` },
      {
        role: 'assistant',
        content: `I'm ${tagOf(model)}. I'll write the code, you direct me. Tell me what to build, or type /help.`,
      },
    ])
  }

  async function end(reason: 'submit' | 'tokens' | 'time') {
    if (endedRef.current) return
    endedRef.current = true
    if (reason !== 'submit') setLocked(reason)
    setBusy(true)
    setGradeError(false)
    setPhase('result')
    try {
      const res = await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'evaluate',
          model,
          history: messages,
          tokensUsed: used,
          tokensBudget: BUDGET,
          secondsUsed: TIME - secondsLeft,
          timeLimit: TIME,
          reason,
        }),
      })
      const d = await res.json()
      if (res.ok) {
        setGrade(d as Grade)
        if (inviteToken) {
          const grd = d as Grade
          fetch('/api/enterprise', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'result',
              token: inviteToken,
              candidate_name: candidate?.name || userName || '',
              candidate_email: candidate?.email || '',
              score: grd.overall,
              creativity: grd.dimensions?.creativity,
              efficiency: grd.dimensions?.efficiency,
              quality: grd.dimensions?.quality,
              verdict: grd.verdict,
            }),
          }).catch(() => {})
        }
      } else {
        setGradeError(true)
        endedRef.current = false // allow a retry
      }
    } catch {
      setGradeError(true)
      endedRef.current = false // allow a retry
    }
    setBusy(false)
  }

  async function ask(text: string) {
    if (busy || phase !== 'run') return
    const userMsg: Msg = { role: 'user', content: text }
    const history = [...messages, userMsg]
    setMessages(history)
    setBusy(true)
    try {
      const res = await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'respond', model, history, message: text }),
      })
      const d = await res.json()
      if (!res.ok) {
        sys(d.error || 'AI error, try again.')
        setBusy(false)
        return
      }
      const cost = Number(d.tokensUsed) || 0
      const next = used + cost
      setUsed(next)
      setMessages((m) => [...m, { role: 'assistant', content: d.reply, cost }])
      setBusy(false)
      if (next >= BUDGET) end('tokens')
    } catch {
      sys('Network error.')
      setBusy(false)
    }
  }

  function command(raw: string) {
    const [c, ...rest] = raw.slice(1).split(' ')
    const arg = rest.join(' ').trim().toLowerCase()
    switch (c.toLowerCase()) {
      case 'help':
        sys(
          'COMMANDS\n/task, show the brief\n/model <claude|gpt|gemini>, switch model (changes token cost)\n/run, test your current solution against every requirement\n/tokens, tokens left\n/time, time left\n/reset, make the AI forget the current approach (tokens are NOT refunded)\n/clear, clear the screen\n/submit, finish and get graded\n\nAnything without a / is sent to the AI and costs tokens.'
        )
        break
      case 'task':
        sys(task ? `TASK, ${task.title}\n\n${task.brief}` : 'Loading task…')
        break
      case 'tokens':
        sys(`${remaining.toLocaleString()} / ${BUDGET.toLocaleString()} tokens left.`)
        break
      case 'time':
        sys(`${fmt(secondsLeft)} left.`)
        break
      case 'model':
        if (MODEL_IDS.includes(arg)) {
          setModel(arg)
          sys(`Switched to ${tagOf(arg)}, token cost x${MODEL_INFO[arg].mult}.`)
        } else sys('Usage: /model claude | gpt | gemini')
        break
      case 'run':
        ask('Run my current solution against every requirement and tell me precisely which pass and which fail. For any failure, show the exact input that breaks it.')
        break
      case 'reset':
        setMessages((m) => [
          ...m,
          { role: 'system', content: '· context reset · the AI forgets the prior approach (spent tokens are not refunded) ·' },
          { role: 'assistant', content: `Fresh start. I'm ${tagOf(model)}. What should I build?` },
        ])
        break
      case 'clear':
        setMessages([])
        break
      case 'submit':
        end('submit')
        break
      default:
        sys(`Unknown command: /${c}, try /help`)
    }
  }

  function onSubmit() {
    const raw = input.trim()
    if (!raw || busy || phase !== 'run') return
    setInput('')
    if (raw.startsWith('/')) command(raw)
    else ask(raw)
  }

  const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

  /* ---------------- INTRO ---------------- */
  if (phase === 'intro') {
    return (
      <div className="min-h-screen px-6 sm:px-10 lg:px-16 py-10 max-w-3xl mx-auto">
        <button onClick={onExit} className="flex items-center gap-1 text-white/50 text-sm hover:text-white">
          <ChevronLeft className="w-4 h-4" /> Judgemynt
        </button>
        <div className="text-xs uppercase tracking-[0.3em] mt-6" style={{ color: TEAL }}>
          AI Employment Exam
        </div>
        <h1 className="font-podium text-[clamp(2rem,6vw,3.6rem)] uppercase leading-[0.95] mt-3">
          Can you actually
          <br />
          work with AI?
        </h1>
        <p className="text-white/60 mt-4 text-sm sm:text-base max-w-xl">
          You get a real task and a real AI assistant. You direct it. Every message burns tokens, and you have 20 minutes.
          Run out of either and you&apos;re locked out. At the end, the examiner scores how you actually performed, not what you claim.
        </p>

        <div className="mt-6 rounded-xl border p-5" style={{ background: 'rgba(0,212,170,.05)', borderColor: 'rgba(0,212,170,.25)' }}>
          <div className="text-[11px] uppercase tracking-widest mb-2" style={{ color: TEAL }}>
            Your task
          </div>
          <div className="font-semibold text-white">{task.title}</div>
          <p className="text-white/65 text-sm mt-1.5 leading-relaxed">{task.brief}</p>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 mt-8">
          {[
            ['10,000', 'token budget', <Zap key="z" className="w-4 h-4" />],
            ['20:00', 'on the clock', <Clock key="c" className="w-4 h-4" />],
            ['3 axes', 'creativity · efficiency · quality', <Cpu key="p" className="w-4 h-4" />],
          ].map(([a, b, ic]) => (
            <div key={b as string} className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
              <div className="flex items-center gap-2" style={{ color: TEAL }}>
                {ic}
                <span className="font-bold text-lg text-white">{a}</span>
              </div>
              <div className="text-white/45 text-xs mt-1">{b}</div>
            </div>
          ))}
        </div>

        <div className="text-[11px] uppercase tracking-widest text-white/40 mt-8 mb-2">Pick your model, the exam looks like the real thing</div>
        <div className="grid sm:grid-cols-3 gap-3">
          {MODEL_IDS.map((id) => {
            const selected = model === id
            const accent = MODEL_ACCENT[id]
            return (
              <button
                key={id}
                onClick={() => setModel(id)}
                aria-pressed={selected}
                className="text-left rounded-xl p-4 border transition relative overflow-hidden"
                style={{
                  background: selected ? `${accent}14` : 'rgba(255,255,255,.02)',
                  borderColor: selected ? `${accent}66` : 'rgba(255,255,255,.08)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-bold">
                    <span aria-hidden style={{ color: accent }}>{MODEL_GLYPH[id]}</span>
                    {MODEL_INFO[id].tag}
                  </span>
                  <span className="text-[11px]" style={{ color: selected ? accent : '#7d97ab' }}>
                    x{MODEL_INFO[id].mult}
                  </span>
                </div>
                <div className="text-white/45 text-xs mt-1 leading-snug">{MODEL_INFO[id].blurb}</div>
                <div className="text-[10px] mt-2 uppercase tracking-widest" style={{ color: selected ? accent : 'rgba(255,255,255,.3)' }}>
                  {MODEL_SKIN[id]}
                </div>
              </button>
            )
          })}
        </div>

        <button
          onClick={begin}
          className="mt-8 w-full rounded-xl py-4 font-semibold text-[#06121f]"
          style={{ background: `linear-gradient(110deg, ${TEAL}, ${BLUE})` }}
        >
          Begin the exam, 20:00 · 10,000 tokens
        </button>
        <p className="text-center text-white/35 text-xs mt-3">The clock starts the moment you begin. No pausing.</p>
      </div>
    )
  }

  /* ---------------- RESULT ---------------- */
  if (phase === 'result') {
    const dims = grade?.dimensions
    return (
      <div className="min-h-screen px-6 sm:px-10 lg:px-16 py-10 max-w-3xl mx-auto">
        <button onClick={onExit} className="flex items-center gap-1 text-white/50 text-sm hover:text-white">
          <ChevronLeft className="w-4 h-4" /> Judgemynt
        </button>

        {locked && (
          <div className="mt-5 rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(255,84,112,.08)', border: '1px solid rgba(255,84,112,.3)', color: '#ff8da3' }}>
            🔒 Locked out, you ran out of {locked === 'tokens' ? 'tokens' : 'time'}. The examiner still graded what you did.
          </div>
        )}

        {busy && <div className="text-center text-white/60 py-20">The examiner is reviewing your whole session…</div>}

        {!busy && gradeError && !grade && (
          <div className="text-center py-20">
            <div className="text-white/70 text-base">The examiner couldn&apos;t finish grading.</div>
            <p className="text-white/40 text-sm mt-2">This is usually a brief network hiccup, your session is still here.</p>
            <div className="flex gap-3 justify-center mt-6">
              <button onClick={onExit} className="rounded-xl px-5 py-3 font-semibold text-sm bg-white/[0.04] border border-white/10 hover:border-white/30">
                Exit
              </button>
              <button
                onClick={() => end(locked || 'submit')}
                className="rounded-xl px-5 py-3 font-semibold text-sm text-[#06121f]"
                style={{ background: `linear-gradient(110deg, ${TEAL}, ${BLUE})` }}
              >
                Retry grading
              </button>
            </div>
          </div>
        )}

        {!busy && grade && (
          <>
            <div className="text-center py-7">
              <div className="text-xs uppercase tracking-[0.25em] text-white/50">Assessment Score</div>
              <div className="font-bold leading-none my-1" style={{ fontSize: 'clamp(60px,15vw,104px)', color: TEAL }}>
                {grade.overall}
              </div>
              <div className="text-white/55 text-sm">&ldquo;{grade.verdict}&rdquo;</div>
            </div>

            {grade.overall >= 70 && (
              <div
                className="max-w-xl mx-auto rounded-2xl p-6 text-center mb-6"
                style={{ background: 'linear-gradient(160deg,#06121f,#0a1726)', border: `1px solid ${TEAL}44`, boxShadow: '0 0 40px rgba(0,212,170,.12)' }}
              >
                <Crown className="w-8 h-8 mx-auto" style={{ color: TEAL }} />
                <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 mt-2">Degree earned</div>
                <div className="font-podium text-2xl uppercase mt-1" style={{ color: TEAL }}>
                  AI Operator
                </div>
                <div className="text-white text-lg mt-2">{userName || 'Your Name'}</div>
                <div className="text-white/45 text-xs mt-2">
                  Certified at {grade.overall}/100 · {new Date().toLocaleDateString()}
                </div>
                {onDownloadDegree && (
                  <button
                    onClick={() => onDownloadDegree('AI Operator', userName || '', `Certified at ${grade.overall}/100`)}
                    className="mt-4 rounded-xl px-5 py-2.5 text-sm font-semibold text-[#06121f]"
                    style={{ background: `linear-gradient(110deg, ${TEAL}, ${BLUE})` }}
                  >
                    Download degree (PNG)
                  </button>
                )}
              </div>
            )}

            <div className="space-y-4 max-w-xl mx-auto">
              {dims &&
                ([
                  ['Creativity', dims.creativity, 'how cleverly you directed'],
                  ['Efficiency', dims.efficiency, 'tokens + time discipline'],
                  ['Quality', dims.quality, 'how good the final result is'],
                ] as const).map(([label, val, hint]) => (
                  <div key={label}>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="text-sm font-semibold">
                        {label} <span className="text-white/40 font-normal text-xs">, {hint}</span>
                      </span>
                      <span className="text-sm font-bold" style={{ color: TEAL }}>
                        {val}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${val}%`, background: `linear-gradient(90deg, ${TEAL}, ${BLUE})` }} />
                    </div>
                  </div>
                ))}
            </div>

            <div className="max-w-xl mx-auto mt-7">
              <div className="text-[11px] uppercase tracking-widest mb-2" style={{ color: TEAL }}>
                Step-by-step
              </div>
              <div className="space-y-2">
                {grade.steps.map((s, i) => (
                  <div key={i} className="rounded-lg bg-white/[0.03] border border-white/10 px-3 py-2">
                    <div className="text-sm font-semibold text-white">{s.move}</div>
                    <div className="text-white/55 text-xs mt-0.5">{s.take}</div>
                  </div>
                ))}
              </div>

              {grade.analysis && (
                <div className="mt-5 rounded-xl bg-white/[0.03] border border-white/10 p-4 text-white/80 text-sm leading-relaxed">
                  {grade.analysis}
                </div>
              )}
              <div className="mt-4 pl-3.5" style={{ borderLeft: `3px solid ${BLUE}` }}>
                <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: BLUE }}>
                  The hiring call
                </div>
                <div className="text-white text-sm leading-snug mt-0.5">{grade.hire}</div>
              </div>

              <div className="flex gap-3 mt-8">
                <button onClick={onExit} className="flex-1 rounded-xl py-3.5 font-semibold text-sm bg-white/[0.04] border border-white/10 hover:border-white/30">
                  Exit
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="flex-1 rounded-xl py-3.5 font-semibold text-sm text-[#06121f]"
                  style={{ background: `linear-gradient(110deg, ${TEAL}, ${BLUE})` }}
                >
                  Take it again
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  /* ---------------- RUN — per-model skins ---------------- */
  // Shared mechanics (state, ask, command, onSubmit, budgets) are identical across
  // skins; only the chrome / colors / fonts / greeting copy change per persona.

  const firstName = (userName || '').trim().split(/\s+/)[0] || ''

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmit()
    }
  }

  // Compact status pills reused by the non-terminal skins.
  const StatusPills = ({ theme }: { theme: 'gemini' | 'gpt' }) => {
    const muted = theme === 'gemini' ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.5)'
    const chip = theme === 'gemini' ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.05)'
    return (
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        <span
          className="flex items-center gap-1.5 text-xs font-medium tabular-nums px-2.5 py-1 rounded-full"
          style={{ background: chip, color: tokenColor }}
          title="Tokens remaining"
        >
          <Zap className="w-3.5 h-3.5" /> {remaining.toLocaleString()}
        </span>
        <span
          className="flex items-center gap-1.5 text-xs font-medium tabular-nums px-2.5 py-1 rounded-full"
          style={{ background: chip, color: timeColor }}
          title="Time remaining"
        >
          <Clock className="w-3.5 h-3.5" /> {fmt(secondsLeft)}
        </span>
        <button
          onClick={() => command('/task')}
          className="text-xs px-2.5 py-1 rounded-full hover:opacity-100 transition"
          style={{ background: chip, color: muted }}
        >
          🎯 Brief
        </button>
        <button
          onClick={() => command('/submit')}
          className="text-xs font-semibold px-3 py-1 rounded-full"
          style={
            theme === 'gemini'
              ? { background: 'linear-gradient(90deg,#4285f4,#9b72ff)', color: '#fff' }
              : { background: '#fff', color: '#000' }
          }
        >
          Submit
        </button>
      </div>
    )
  }

  /* ===== CLAUDE — terminal (dark, monospace) ===== */
  if (model === 'claude') {
    return (
      <div className="h-screen flex flex-col" style={{ background: '#0f0e0c' }}>
        {/* status bar */}
        <div className="flex items-center gap-4 px-4 sm:px-6 py-3 border-b border-[#3a2f25]/60 flex-wrap" style={{ background: '#181613' }}>
          <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: '#e8853b', fontFamily: mono }}>
            <Cpu className="w-4 h-4" /> Claude
          </span>
          <div className="flex items-center gap-2 flex-1 min-w-[160px] max-w-xs">
            <Zap className="w-4 h-4" style={{ color: tokenColor }} />
            <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${tokenPct}%`, background: tokenColor }} />
            </div>
            <span className="text-xs font-mono tabular-nums" style={{ color: tokenColor }}>
              {remaining.toLocaleString()}
            </span>
          </div>
          <span className="flex items-center gap-1.5 text-sm font-mono tabular-nums" style={{ color: timeColor }}>
            <Clock className="w-4 h-4" /> {fmt(secondsLeft)}
          </span>
          <button onClick={() => command('/submit')} className="text-xs uppercase tracking-widest px-3 py-1.5 rounded-lg" style={{ background: '#e8853b', color: '#0f0e0c', fontWeight: 700 }}>
            /submit
          </button>
        </div>

        {/* task strip */}
        <button onClick={() => command('/task')} className="w-full text-left px-4 sm:px-6 py-2 border-b border-[#3a2f25]/40 text-[11px] text-white/45 hover:text-white/70 truncate" style={{ fontFamily: mono }}>
          🎯 {task.title}, tap or type <span style={{ color: '#e8853b' }}>/task</span> for the full brief
        </button>

        {/* transcript */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4" style={{ fontFamily: mono }}>
          {messages.map((m, i) => (
            <div key={i}>
              {m.role === 'system' ? (
                <pre className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-white/45 border-l-2 border-[#e8853b]/30 pl-3">{m.content}</pre>
              ) : (
                <div>
                  <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: m.role === 'user' ? '#e8853b' : '#9b8b7a' }}>
                    {m.role === 'user' ? 'you' : 'Claude'}
                    {m.cost ? <span className="text-white/30 ml-2">−{m.cost} tok</span> : null}
                  </div>
                  <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#e6ddd2]">{m.content}</pre>
                </div>
              )}
            </div>
          ))}
          {busy && <div className="text-[13px] animate-pulse" style={{ color: '#9b8b7a' }}>Claude is working…</div>}
        </div>

        {/* input */}
        <div className="border-t border-[#3a2f25]/60 px-4 sm:px-6 py-3" style={{ background: '#181613' }}>
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Message Claude, or /help"
              rows={1}
              disabled={busy}
              className="flex-1 resize-none bg-black/30 border border-[#3a2f25] focus:border-[#e8853b]/60 rounded-xl px-4 py-3 text-[13px] outline-none disabled:opacity-50 text-[#e6ddd2]"
              style={{ fontFamily: mono, maxHeight: 140 }}
            />
            <button
              onClick={onSubmit}
              disabled={busy}
              className="rounded-xl px-4 py-3 disabled:opacity-50 flex items-center gap-1.5 text-sm font-semibold"
              style={{ background: '#e8853b', color: '#0f0e0c' }}
              aria-label="Send message"
            >
              <CornerDownLeft className="w-4 h-4" />
            </button>
          </div>
          <div className="text-[10px] text-white/30 mt-1.5" style={{ fontFamily: mono }}>Enter to send · Shift+Enter for newline · everything you send to the AI costs tokens</div>
        </div>
      </div>
    )
  }

  /* ===== GEMINI — Google Gemini look (airy, blue glow) ===== */
  if (model === 'gemini') {
    const gSans = '"Google Sans", "Product Sans", Roboto, system-ui, -apple-system, sans-serif'
    const hasChat = messages.some((m) => m.role !== 'system')
    return (
      <div className="h-screen flex flex-col relative overflow-hidden" style={{ background: '#0c0c0e', fontFamily: gSans }}>
        {/* soft blue radial glow */}
        <div
          className="pointer-events-none absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2"
          style={{ width: 'min(900px,120vw)', height: 'min(900px,120vw)', background: 'radial-gradient(circle, rgba(66,133,244,.20) 0%, rgba(155,114,255,.10) 35%, rgba(12,12,14,0) 68%)' }}
        />
        {/* top chrome */}
        <div className="relative z-10 flex items-center justify-between px-4 sm:px-6 py-3.5">
          <button onClick={() => command('/task')} className="flex items-center gap-1.5 text-[15px] font-medium text-white/90 hover:text-white transition">
            Gemini <ChevronDown className="w-4 h-4 text-white/50" />
          </button>
          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,.08)', color: '#c7d2fe' }}>
              ✦ Upgrade
            </span>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold text-white" style={{ background: 'linear-gradient(135deg,#4285f4,#9b72ff)' }}>
              {(firstName[0] || 'Y').toUpperCase()}
            </div>
          </div>
        </div>

        {/* center / transcript */}
        {!hasChat ? (
          <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center">
            <h1 className="text-[clamp(1.9rem,6vw,3.2rem)] font-medium leading-tight">
              <span style={{ background: 'linear-gradient(90deg,#4285f4,#9b72ff,#d96570)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                {firstName ? `What's next, ${firstName}?` : "What's next?"}
              </span>
            </h1>
            <p className="text-white/45 text-sm mt-4 max-w-md">{task.title}, direct Gemini to build it. Tap <span style={{ color: '#8ab4f8' }}>🎯 Brief</span> for the full task.</p>
          </div>
        ) : (
          <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-5 max-w-3xl w-full mx-auto">
            {messages.map((m, i) =>
              m.role === 'system' ? (
                <div key={i} className="text-[12.5px] leading-relaxed text-white/40 rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,.04)' }}>
                  <pre className="whitespace-pre-wrap" style={{ fontFamily: gSans }}>{m.content}</pre>
                </div>
              ) : m.role === 'user' ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] rounded-3xl rounded-br-md px-4 py-2.5 text-[14px] leading-relaxed text-white" style={{ background: 'rgba(255,255,255,.10)' }}>
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex gap-3">
                  <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[13px]" style={{ background: 'linear-gradient(135deg,#4285f4,#9b72ff)' }}>✦</div>
                  <div className="flex-1">
                    <pre className="whitespace-pre-wrap text-[14px] leading-relaxed text-[#e8eaed]" style={{ fontFamily: gSans }}>{m.content}</pre>
                    {m.cost ? <div className="text-white/25 text-[11px] mt-1">−{m.cost} tokens</div> : null}
                  </div>
                </div>
              ),
            )}
            {busy && (
              <div className="flex items-center gap-2 text-white/50 text-sm">
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#8ab4f8' }} /> Gemini is thinking…
              </div>
            )}
          </div>
        )}

        {/* status + input */}
        <div className="relative z-10 px-4 sm:px-6 pb-5 pt-2 max-w-3xl w-full mx-auto">
          <div className="flex justify-center mb-3">
            <StatusPills theme="gemini" />
          </div>
          <div
            className="flex items-center gap-2 rounded-full pl-3 pr-2 py-2"
            style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.10)', backdropFilter: 'blur(8px)' }}
          >
            <button className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:bg-white/10 transition" aria-label="Add">
              <Plus className="w-5 h-5" />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask Gemini"
              rows={1}
              disabled={busy}
              className="flex-1 resize-none bg-transparent text-[15px] outline-none disabled:opacity-50 text-white placeholder-white/45 py-2"
              style={{ fontFamily: gSans, maxHeight: 140 }}
            />
            <button className="shrink-0 hidden sm:flex items-center gap-1 text-[13px] text-white/60 px-2 py-1.5 rounded-full hover:bg-white/10 transition" aria-label="Model">
              Flash <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onSubmit}
              disabled={busy}
              className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-50 text-white"
              style={{ background: input.trim() ? 'linear-gradient(135deg,#4285f4,#9b72ff)' : 'transparent' }}
              aria-label={input.trim() ? 'Send message' : 'Microphone'}
            >
              {input.trim() ? <CornerDownLeft className="w-4 h-4" /> : <Mic className="w-5 h-5 text-white/70" />}
            </button>
          </div>
          <div className="text-center text-[11px] text-white/30 mt-2">Enter to send · Shift+Enter for newline · every message costs tokens</div>
        </div>
      </div>
    )
  }

  /* ===== GPT — ChatGPT look (pure black, monochrome) ===== */
  const hasChatGpt = messages.some((m) => m.role !== 'system')
  const uiSans = 'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif'
  return (
    <div className="h-screen flex flex-col" style={{ background: '#000', fontFamily: uiSans }}>
      {/* top chrome */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3.5">
        <button onClick={() => command('/task')} className="flex items-center gap-1.5 text-[15px] font-medium text-white/90 hover:text-white transition">
          ChatGPT <ChevronDown className="w-4 h-4 text-white/50" />
        </button>
        <div className="flex items-center gap-3">
          <span className="hidden sm:flex items-center text-[13px] font-medium px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,.10)', color: '#fff' }}>
            Upgrade
          </span>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold text-black bg-white">
            {(firstName[0] || 'Y').toUpperCase()}
          </div>
        </div>
      </div>

      {/* center / transcript */}
      {!hasChatGpt ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <h1 className="text-[clamp(1.7rem,5vw,2.6rem)] font-semibold text-white leading-tight">What&apos;s on your mind today?</h1>
          <p className="text-white/40 text-sm mt-3 max-w-md">{task.title}, direct ChatGPT to build it. Tap a chip below or just start typing.</p>
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-5 max-w-3xl w-full mx-auto">
          {messages.map((m, i) =>
            m.role === 'system' ? (
              <div key={i} className="text-[12.5px] leading-relaxed text-white/40 rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,.05)' }}>
                <pre className="whitespace-pre-wrap" style={{ fontFamily: uiSans }}>{m.content}</pre>
              </div>
            ) : m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-3xl rounded-br-md px-4 py-2.5 text-[15px] leading-relaxed text-white" style={{ background: '#303030' }}>
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex gap-3">
                <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full flex items-center justify-center border border-white/30 text-white text-[14px]">✶</div>
                <div className="flex-1">
                  <pre className="whitespace-pre-wrap text-[15px] leading-relaxed text-[#ececec]" style={{ fontFamily: uiSans }}>{m.content}</pre>
                  {m.cost ? <div className="text-white/25 text-[11px] mt-1">−{m.cost} tokens</div> : null}
                </div>
              </div>
            ),
          )}
          {busy && (
            <div className="flex items-center gap-2 text-white/50 text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" /> ChatGPT is thinking…
            </div>
          )}
        </div>
      )}

      {/* status + input */}
      <div className="px-4 sm:px-6 pb-5 pt-2 max-w-3xl w-full mx-auto">
        <div className="flex justify-center mb-3">
          <StatusPills theme="gpt" />
        </div>
        {!hasChatGpt && (
          <div className="flex flex-wrap justify-center gap-2 mb-3">
            {['Create an image', 'Write or edit', 'Look something up'].map((s) => (
              <button
                key={s}
                onClick={() => setInput(s + ': ')}
                className="text-[13px] text-white/80 px-3.5 py-2 rounded-full border border-white/15 hover:bg-white/10 transition"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 rounded-3xl pl-3 pr-2 py-2" style={{ background: '#2f2f2f' }}>
          <button className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white/80 hover:bg-white/10 transition" aria-label="Add">
            <Plus className="w-5 h-5" />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask anything"
            rows={1}
            disabled={busy}
            className="flex-1 resize-none bg-transparent text-[15px] outline-none disabled:opacity-50 text-white placeholder-white/45 py-2"
            style={{ fontFamily: uiSans, maxHeight: 140 }}
          />
          <button className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:bg-white/10 transition" aria-label="Voice">
            <Mic className="w-5 h-5" />
          </button>
          <button
            onClick={onSubmit}
            disabled={busy}
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-50"
            style={{ background: input.trim() ? '#fff' : 'rgba(255,255,255,.18)' }}
            aria-label={input.trim() ? 'Send message' : 'Dictate'}
          >
            {input.trim() ? <CornerDownLeft className="w-4 h-4 text-black" /> : <AudioLines className="w-5 h-5 text-white" />}
          </button>
        </div>
        <div className="text-center text-[11px] text-white/30 mt-2">Enter to send · Shift+Enter for newline · every message costs tokens</div>
      </div>
    </div>
  )
}
