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
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Check, X, Clock, Zap, FileText, Loader2, Lock } from 'lucide-react'
import Workspace from './Workspace'
import { useAuth } from '@/hooks/useAuth'

const TEAL = '#00d4aa'
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

/* The rotating proof in the hero.
 *
 * These are DEMONSTRATIONS, deliberately not drawn from the live catalog.
 * An earlier draft used the real traps, which meant the marketing page
 * published the answers to four of the six tasks — anyone who scrolled before
 * starting would pass for the wrong reason. Illustrate the shape of the thing;
 * never spoil a task someone is about to take. If you add a scenario here,
 * check it does not exist in lib/tasks.ts first. */
const PROOFS = [
  {
    role: 'Account Management',
    color: TEAL,
    ask: 'Client wants out of their contract early.',
    naive: 'Quotes the termination clause. Confirms they can leave at the end of the term.',
    real: 'Finds the auto-renewal notice window in the signed order form. It closed nine days ago.',
  },
  {
    role: 'Operations',
    color: '#fbbf24',
    ask: 'Approve or reject a $420 expense claim.',
    naive: 'Rejects it. The nightly cap in the handbook is $180.',
    real: 'Checks the travel annexe: the cap is suspended for the three cities on the conference list.',
  },
  {
    role: 'Recruiting',
    color: '#34d399',
    ask: 'Write the rejection email for a final-round candidate.',
    naive: 'Sends the warm standard template within the hour.',
    real: 'Notices they were sourced through a referral with a 30-day feedback obligation attached.',
  },
  {
    role: 'IT & Security',
    color: '#a78bfa',
    ask: 'A vendor asks for admin access to close a ticket.',
    naive: 'Grants read-write for 24 hours. Reasonable, helpful, logged.',
    real: 'Reads the DPA. This vendor is not cleared for systems holding customer records.',
  },
]

export default function Home() {
  const [stage, setStage] = useState<'home' | 'run'>('home')
  const [tasks, setTasks] = useState<CatalogTask[]>([])
  const [picked, setPicked] = useState<string | undefined>()
  const [invite, setInvite] = useState<string | undefined>()
  const [proof, setProof] = useState(0)
  const [held, setHeld] = useState(false)
  const [authError, setAuthError] = useState('')

  const { user, signInWithGoogle, signOut, isLoggedIn } = useAuth()

  async function googleSignIn() {
    setAuthError('')
    const r = await signInWithGoogle()
    if (r?.error) setAuthError(r.error)
  }
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
      <FontLink />

      {/* ── nav ───────────────────────────────────────────────────────── */}
      <nav className="relative z-20 flex items-center gap-4 px-5 sm:px-8 py-5">
        <span className="font-podium text-xl sm:text-2xl uppercase tracking-wider">Judgemynt</span>
        <div className="ml-auto flex items-center gap-3 sm:gap-5 text-[13.5px]">
          <a href="#tasks" className="text-white font-semibold hover:text-[#00d4aa] transition hidden sm:block">Tasks</a>
          <a href="#how" className="text-white font-semibold hover:text-[#00d4aa] transition hidden sm:block">How it works</a>
          <Link href="/employers" className="text-white font-semibold hover:text-[#00d4aa] transition">For employers</Link>
          {isLoggedIn ? (
            <button onClick={signOut} className="text-white font-semibold hover:text-[#00d4aa] transition">
              {displayName || 'Sign out'}
            </button>
          ) : (
            <button onClick={googleSignIn} className="rounded-full px-4 py-1.5 border border-white/15 hover:bg-white/5 transition">
              Sign in
            </button>
          )}
        </div>
      </nav>

      {authError && (
        <div className="relative z-20 mx-5 sm:mx-8 rounded-xl border px-4 py-2.5 text-[14px] font-semibold" style={{ borderColor: `${RED}50`, color: RED, background: `${RED}10` }}>
          {authError}
        </div>
      )}

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
          <span style={{ color: TEAL }}>That&apos;s the point.</span>
        </h1>

        <p className="text-white font-semibold mt-6 text-[15px] sm:text-[17px] leading-relaxed max-w-xl">
          Every screening test broke the day candidates got ChatGPT. Ours starts by handing you one.
          Then it hands you the documents the AI doesn&apos;t have, and measures whether you read them.
        </p>

        <div className="flex flex-wrap gap-3 mt-8">
          <button
            onClick={() => start()}
            className="rounded-full px-7 py-3.5 font-bold text-[#04121a] transition hover:brightness-110"
            style={{ background: TEAL }}
          >
            Take one now, free
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
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: RED }}>
                <X className="w-3.5 h-3.5" /> AI with just the brief
              </div>
              <p className="text-white font-medium leading-relaxed text-[14.5px]">{p.naive}</p>
              <div className="mt-4 text-[11px] font-bold uppercase tracking-widest" style={{ color: RED }}>Fails</div>
            </div>
            <div className="p-5 sm:p-7" style={{ background: `${p.color}07` }}>
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: p.color }}>
                <Check className="w-3.5 h-3.5" /> A person who read the context
              </div>
              <p className="text-white font-medium leading-relaxed text-[14.5px]">{p.real}</p>
              <div className="mt-4 text-[11px] font-bold uppercase tracking-widest" style={{ color: p.color }}>Passes</div>
            </div>
          </div>
        </div>
        <p className="text-white font-semibold text-[14px] mt-3 max-w-2xl leading-relaxed">
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
              d: 'Not a puzzle. A refund to answer, a sprint to triage, a number for a board deck. The work someone actually does on a Tuesday.',
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
              <p className="text-white font-medium text-[14px] mt-2.5 leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── tasks ─────────────────────────────────────────────────────── */}
      <section id="tasks" className="relative z-10 px-5 sm:px-8 max-w-6xl mx-auto mt-24">
        <h2 className="font-podium text-[clamp(1.8rem,5vw,3.2rem)] uppercase leading-[0.95]">Pick your task</h2>
        <p className="text-white font-semibold mt-2 text-[15px]">Free, unlimited, and the score is yours to share.</p>

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
                <div className="relative">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: t.color }}>
                    <span className="text-sm">{t.roleEmoji}</span> {t.role}
                    <span className="ml-auto text-white/80 tracking-normal" style={{ fontFamily: mono }}>{t.difficulty}</span>
                  </div>
                  <div className="font-podium text-[17px] uppercase leading-tight mt-3.5">{t.title}</div>
                  <p className="text-white font-medium text-[13.5px] mt-2 leading-relaxed">{t.tagline}</p>
                  <div className="flex items-center gap-3.5 mt-4 text-[11px] text-white/80" style={{ fontFamily: mono }}>
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
        <div className="rounded-3xl border p-7 sm:p-11" style={{ borderColor: `${TEAL}40`, background: 'rgba(255,255,255,.02)' }}>
          <div className="text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: TEAL }}>For employers</div>
          <h2 className="font-podium text-[clamp(1.8rem,5vw,3.4rem)] uppercase leading-[0.95] mt-3 max-w-2xl">
            Put your own documents in the exam
          </h2>
          <p className="text-white font-medium mt-4 max-w-2xl leading-relaxed">
            Drop in your real refund policy, your real SLA, your real brand rules. The trap becomes
            something only a person who understands <em>your</em> business can find. Set the rubric,
            the weights, and the bar. Send a link. Get back a scored session with the transcript,
            what they missed, and how they worked.
          </p>
          <div className="flex flex-wrap gap-3 mt-7">
            <Link
              href="/employers"
              className="rounded-full px-7 py-3.5 font-bold text-[#04121a] transition hover:brightness-110"
              style={{ background: TEAL }}
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
        <span className="text-white font-semibold text-[13.5px]">Proof you can be trusted with AI.</span>
        <Link href="/employers" className="ml-auto text-white font-semibold hover:text-[#00d4aa] text-[13.5px] transition">For employers</Link>
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

