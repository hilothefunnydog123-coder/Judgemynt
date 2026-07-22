'use client'
/* ════════════════════════════════════════════════════════════════════════
   Judgemynt — the front door.

   The old landing sold an exam that tests whether you can spot bad AI writing.
   That test dies the moment a candidate thinks to paste it into a chatbot.

   This one sells the opposite promise, loudly: use any AI you want, that is
   the point. What gets measured is whether you read the context you were
   handed and directed the AI with it. The page has to make that switch legible
   in about four seconds, which is why the hero shows an actual trap rather
   than describing one.
   ════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Check, X, Clock, Zap, FileText, Loader2, Lock } from 'lucide-react'
import Workspace from './Workspace'
import { useAuth } from '@/hooks/useAuth'

const TEAL = '#00d4aa'
const BLUE = '#1e90ff'
const RED = '#ff5470'
const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

interface CatalogTask {
  id: string
  title: string
  role: string
  roleEmoji: string
  color: string
  tagline: string
  difficulty: string
  docs: number
  budget: { tokens: number; seconds: number }
}

/* The rotating proof in the hero. Each is a real trap from a real task in the
   catalog — showing the specific thing an undirected AI gets wrong persuades
   faster than any adjective we could write about it. */
const PROOFS = [
  {
    role: 'Customer Support',
    color: TEAL,
    ask: 'Customer wants a refund 45 days in. Policy says 30.',
    naive: 'Politely declines. Cites the 30-day window. Offers a discount code.',
    real: 'Cross-checks the incident log — their region had a 6-hour outage in week one. An exception applies. Refund issued.',
  },
  {
    role: 'Engineering Management',
    color: '#fbbf24',
    ask: 'Five bugs, one sprint. Which two ship?',
    naive: 'Ships the one with six angry emails and a CC to the CEO.',
    real: 'Notices the quiet ticket is a $310k account three days from an SLA breach that voids the renewal.',
  },
  {
    role: 'Data & Analytics',
    color: '#34d399',
    ask: 'Churn number for Thursday’s board deck.',
    naive: 'Divides cancellations by accounts. Reports 1.0%. Flat, reassuring, wrong.',
    real: 'Catches that annual plans stay "active" for months after the customer quits. The real number is somewhere else.',
  },
  {
    role: 'Marketing',
    color: '#a78bfa',
    ask: 'Hero copy for a sleep supplement.',
    naive: '"Clinically proven to beat insomnia." Two regulatory violations in six words.',
    real: 'Sells on dosage and third-party testing. Passes legal unchanged.',
  },
]

export default function Home() {
  const [stage, setStage] = useState<'home' | 'run'>('home')
  const [tasks, setTasks] = useState<CatalogTask[]>([])
  const [picked, setPicked] = useState<string | undefined>()
  const [invite, setInvite] = useState<string | undefined>()
  const [proof, setProof] = useState(0)
  const [held, setHeld] = useState(false)

  const { user, signInWithGoogle, signOut, isLoggedIn } = useAuth()
  const meta = (user?.user_metadata || {}) as Record<string, string>
  const displayName = meta.full_name || meta.first_name || user?.email?.split('@')[0] || ''

  useEffect(() => {
    fetch('/api/assess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'catalog' }),
    })
      .then((r) => r.json())
      .then((d) => Array.isArray(d?.tasks) && setTasks(d.tasks))
      .catch(() => {})
  }, [])

  // An ?invite= link drops the candidate straight into their employer's role.
  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('invite')
      if (t) {
        setInvite(t)
        setStage('run')
      }
    } catch {}
  }, [])

  // Rotate the hero proof, but stop once the visitor takes manual control.
  useEffect(() => {
    if (held) return
    const id = setInterval(() => setProof((p) => (p + 1) % PROOFS.length), 5200)
    return () => clearInterval(id)
  }, [held])

  function start(taskId?: string) {
    setPicked(taskId)
    setStage('run')
  }

  if (stage === 'run') {
    return (
      <Workspace
        onExit={() => {
          setStage('home')
          setInvite(undefined)
          // Drop ?invite= so a refresh does not silently restart the exam.
          try {
            window.history.replaceState({}, '', window.location.pathname)
          } catch {}
        }}
        inviteToken={invite}
        taskId={picked}
        candidate={displayName ? { name: displayName, email: user?.email || '' } : undefined}
      />
    )
  }

  const p = PROOFS[proof]

  return (
    <div className="min-h-screen text-[#eaf4fa] overflow-x-hidden">
      <Atmosphere />
      <FontLink />

      {/* ── nav ───────────────────────────────────────────────────────── */}
      <nav className="relative z-20 flex items-center gap-4 px-5 sm:px-8 py-5">
        <span className="font-podium text-xl sm:text-2xl uppercase tracking-wider">Judgemynt</span>
        <div className="ml-auto flex items-center gap-3 sm:gap-5 text-[13.5px]">
          <a href="#tasks" className="text-white/55 hover:text-white transition hidden sm:block">Tasks</a>
          <a href="#how" className="text-white/55 hover:text-white transition hidden sm:block">How it works</a>
          <Link href="/employers" className="text-white/55 hover:text-white transition">For employers</Link>
          {isLoggedIn ? (
            <button onClick={signOut} className="text-white/40 hover:text-white transition">
              {displayName || 'Sign out'}
            </button>
          ) : (
            <button onClick={signInWithGoogle} className="rounded-full px-4 py-1.5 border border-white/15 hover:bg-white/5 transition">
              Sign in
            </button>
          )}
        </div>
      </nav>

      {/* ── hero ──────────────────────────────────────────────────────── */}
      <header className="relative z-10 px-5 sm:px-8 pt-10 sm:pt-16 pb-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.35em]" style={{ color: TEAL }}>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70" style={{ background: TEAL }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: TEAL }} />
          </span>
          The assessment that assumes you have AI
        </div>

        <h1 className="font-podium uppercase leading-[0.88] tracking-tight mt-5 text-[clamp(2.6rem,9vw,7rem)]">
          Use any AI
          <br />
          you want.
          <br />
          <span
            style={{
              background: `linear-gradient(100deg, ${TEAL}, ${BLUE})`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            That&apos;s the point.
          </span>
        </h1>

        <p className="text-white/55 mt-6 text-[15px] sm:text-[17px] leading-relaxed max-w-xl">
          Every screening test broke the day candidates got ChatGPT. Ours starts by handing you one.
          Then it hands you the documents the AI doesn&apos;t have — and measures whether you read them.
        </p>

        <div className="flex flex-wrap gap-3 mt-8">
          <button
            onClick={() => start()}
            className="rounded-full px-7 py-3.5 font-semibold text-[#04121a] transition hover:brightness-110"
            style={{ background: `linear-gradient(110deg, ${TEAL}, ${BLUE})`, boxShadow: `0 12px 44px ${TEAL}35` }}
          >
            Take one now — free
          </button>
          <Link
            href="/employers"
            className="rounded-full px-7 py-3.5 font-semibold border border-white/15 hover:bg-white/5 transition flex items-center gap-1.5"
          >
            Assess candidates <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {/* ── the proof: same task, two answers ────────────────────────── */}
      <section className="relative z-10 px-5 sm:px-8 max-w-6xl mx-auto mt-8 sm:mt-14">
        <div className="rounded-3xl border overflow-hidden" style={{ borderColor: 'rgba(255,255,255,.1)', background: 'rgba(255,255,255,.02)' }}>
          <div className="flex items-center gap-3 px-5 sm:px-7 py-3.5 border-b border-white/[0.08] flex-wrap">
            <span className="text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full" style={{ background: `${p.color}18`, color: p.color }}>
              {p.role}
            </span>
            <span className="text-[13.5px] text-white/70">{p.ask}</span>
            <div className="ml-auto flex gap-1.5">
              {PROOFS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setProof(i); setHeld(true) }}
                  className="h-1 rounded-full transition-all"
                  style={{ width: i === proof ? 20 : 7, background: i === proof ? p.color : 'rgba(255,255,255,.2)' }}
                  aria-label={`Example ${i + 1}`}
                />
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2">
            <div className="p-5 sm:p-7 border-b md:border-b-0 md:border-r border-white/[0.08]">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest mb-3" style={{ color: RED }}>
                <X className="w-3.5 h-3.5" /> AI with just the brief
              </div>
              <p className="text-white/60 leading-relaxed text-[14.5px]">{p.naive}</p>
              <div className="mt-4 text-[11px] uppercase tracking-widest text-white/25">Fails</div>
            </div>
            <div className="p-5 sm:p-7" style={{ background: `${p.color}07` }}>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest mb-3" style={{ color: p.color }}>
                <Check className="w-3.5 h-3.5" /> A person who read the context
              </div>
              <p className="text-white/85 leading-relaxed text-[14.5px]">{p.real}</p>
              <div className="mt-4 text-[11px] uppercase tracking-widest" style={{ color: p.color }}>Passes</div>
            </div>
          </div>
        </div>
        <p className="text-white/35 text-[13px] mt-3 max-w-2xl leading-relaxed">
          Both answers came from the same model. The difference is entirely the person driving it,
          which is the only thing left worth measuring.
        </p>
      </section>

      {/* ── how ───────────────────────────────────────────────────────── */}
      <section id="how" className="relative z-10 px-5 sm:px-8 max-w-6xl mx-auto mt-24">
        <h2 className="font-podium text-[clamp(1.8rem,5vw,3.2rem)] uppercase leading-[0.95]">How it works</h2>
        <div className="grid md:grid-cols-3 gap-4 mt-8">
          {[
            {
              n: '01',
              t: 'You get a real task',
              d: 'Not a puzzle. A refund to answer, a sprint to triage, a number for a board deck — the work someone actually does on a Tuesday.',
              icon: <FileText className="w-4 h-4" />,
            },
            {
              n: '02',
              t: 'And a real AI, and a budget',
              d: 'Pick your assistant. Every message costs tokens and the clock runs. The careful model costs more, so choosing is part of the test.',
              icon: <Zap className="w-4 h-4" />,
            },
            {
              n: '03',
              t: 'The context decides it',
              d: 'A policy with an exception. An SLA nobody mentioned. Read it and you pass. Skip it and you ship the confident wrong answer.',
              icon: <Lock className="w-4 h-4" />,
            },
          ].map((s) => (
            <div key={s.n} className="rounded-2xl border border-white/[0.09] p-6" style={{ background: 'rgba(255,255,255,.02)' }}>
              <div className="flex items-center gap-2.5" style={{ color: TEAL }}>
                {s.icon}
                <span className="text-[11px] tabular-nums tracking-widest" style={{ fontFamily: mono }}>{s.n}</span>
              </div>
              <div className="font-podium text-xl uppercase mt-4 leading-tight">{s.t}</div>
              <p className="text-white/50 text-[14px] mt-2.5 leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── tasks ─────────────────────────────────────────────────────── */}
      <section id="tasks" className="relative z-10 px-5 sm:px-8 max-w-6xl mx-auto mt-24">
        <h2 className="font-podium text-[clamp(1.8rem,5vw,3.2rem)] uppercase leading-[0.95]">Pick your task</h2>
        <p className="text-white/45 mt-2 text-[14.5px]">Free, unlimited, and the score is yours to share.</p>

        {tasks.length === 0 ? (
          <div className="flex items-center gap-2 text-white/35 mt-10">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading tasks…
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5 mt-8">
            {tasks.map((t) => (
              <button
                key={t.id}
                onClick={() => start(t.id)}
                className="group relative text-left rounded-2xl border p-5 overflow-hidden transition hover:-translate-y-0.5"
                style={{ background: 'rgba(255,255,255,.02)', borderColor: `${t.color}28` }}
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition pointer-events-none"
                  style={{ background: `radial-gradient(400px 220px at 0% 0%, ${t.color}14, transparent 70%)` }}
                />
                <div className="relative">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest" style={{ color: t.color }}>
                    <span className="text-sm">{t.roleEmoji}</span> {t.role}
                    <span className="ml-auto text-white/25 tracking-normal" style={{ fontFamily: mono }}>{t.difficulty}</span>
                  </div>
                  <div className="font-podium text-[17px] uppercase leading-tight mt-3.5">{t.title}</div>
                  <p className="text-white/45 text-[13.5px] mt-2 leading-relaxed">{t.tagline}</p>
                  <div className="flex items-center gap-3.5 mt-4 text-[11px] text-white/30" style={{ fontFamily: mono }}>
                    <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{t.docs} docs</span>
                    <span className="flex items-center gap-1"><Zap className="w-3 h-3" />{(t.budget.tokens / 1000).toFixed(0)}k</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{Math.round(t.budget.seconds / 60)}m</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── employers ────────────────────────────────────────────────── */}
      <section className="relative z-10 px-5 sm:px-8 max-w-6xl mx-auto mt-24 mb-24">
        <div className="rounded-3xl border p-7 sm:p-11" style={{ borderColor: `${TEAL}25`, background: `linear-gradient(120deg, ${TEAL}0b, ${BLUE}07)` }}>
          <div className="text-[11px] uppercase tracking-[0.3em]" style={{ color: TEAL }}>For employers</div>
          <h2 className="font-podium text-[clamp(1.8rem,5vw,3.4rem)] uppercase leading-[0.95] mt-3 max-w-2xl">
            Put your own documents in the exam
          </h2>
          <p className="text-white/60 mt-4 max-w-2xl leading-relaxed">
            Drop in your real refund policy, your real SLA, your real brand rules. The trap becomes
            something only a person who understands <em>your</em> business can find. Set the rubric,
            the weights, and the bar. Send a link. Get back a scored session with the transcript,
            what they missed, and how they worked.
          </p>
          <div className="flex flex-wrap gap-3 mt-7">
            <Link
              href="/employers"
              className="rounded-full px-7 py-3.5 font-semibold text-[#04121a] transition hover:brightness-110"
              style={{ background: `linear-gradient(110deg, ${TEAL}, ${BLUE})` }}
            >
              Build your assessment
            </Link>
            <button onClick={() => start()} className="rounded-full px-7 py-3.5 font-semibold border border-white/15 hover:bg-white/5 transition">
              Take one first
            </button>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/[0.07] px-5 sm:px-8 py-8 max-w-6xl mx-auto flex items-center gap-4 flex-wrap">
        <span className="font-podium uppercase tracking-wider">Judgemynt</span>
        <span className="text-white/30 text-[13px]">Proof you can be trusted with AI.</span>
        <Link href="/employers" className="ml-auto text-white/40 hover:text-white text-[13px] transition">For employers</Link>
      </footer>
    </div>
  )
}

/* The display face is loaded per-page rather than in the layout so the exam
   surface renders immediately without waiting on a third-party stylesheet. */
function FontLink() {
  return (
    <>
      <link rel="stylesheet" href="https://db.onlinewebfonts.com/c/8b75d9dcff6a48c35a46656192adf019?family=FSP+DEMO+-+PODIUM+Sharp+4.11" />
      <style>{`.font-podium{font-family:"FSP DEMO - PODIUM Sharp 4.11", var(--font-sans), system-ui, sans-serif;}`}</style>
    </>
  )
}

/** Background: two slowly drifting colour fields plus grain. Pure CSS, no
 *  canvas — it has to be cheap enough to leave running under a timed exam,
 *  and it stops entirely for anyone who asked for reduced motion. */
function Atmosphere() {
  const [t, setT] = useState(0)

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const loop = () => {
      setT((x) => x + 0.0035)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const style = useMemo(
    () => ({
      background: `radial-gradient(760px 520px at ${18 + Math.sin(t) * 7}% ${-6 + Math.cos(t * 0.8) * 5}%, ${TEAL}18, transparent 62%),
                   radial-gradient(680px 460px at ${84 + Math.cos(t * 1.1) * 6}% ${12 + Math.sin(t * 0.9) * 6}%, ${BLUE}14, transparent 58%),
                   radial-gradient(900px 700px at 50% 105%, #a78bfa0d, transparent 60%)`,
    }),
    [t]
  )

  return (
    <>
      <div className="pointer-events-none fixed inset-0 -z-10" style={style} />
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </>
  )
}
