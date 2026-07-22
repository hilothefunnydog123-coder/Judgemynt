'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowUpRight, Award, Crown, X, Check, ChevronLeft, Lock, Sparkles } from 'lucide-react'
import Assessment from './Assessment'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'
import { FIELDS, LEVELS, PASS, type JmField, type JmChallenge } from '@/lib/fields'

const TEAL = '#00d4aa'
const BLUE = '#1e90ff'

type Challenge = JmChallenge

interface Dimensions {
  detection: number
  reasoning: number
  execution: number
}
interface Flaw {
  flaw: string
  caught: boolean
}
interface Grade {
  score: number
  verdict: string
  dimensions: Dimensions
  flaws: Flaw[]
  analysis: string
  nailed: string
  missed: string
  tip: string
}

function band(score: number): { label: string; color: string } {
  if (score >= 90) return { label: 'Elite judgment', color: TEAL }
  if (score >= PASS) return { label: 'Passed', color: '#5ee0c0' }
  if (score >= 40) return { label: 'Not yet', color: '#f59e0b' }
  return { label: 'Got fooled', color: '#ff5470' }
}

export default function JudgemyntPage() {
  const [stage, setStage] = useState<'hero' | 'fields' | 'curriculum' | 'challenge' | 'result' | 'certs' | 'assess'>('hero')
  const [menuOpen, setMenuOpen] = useState(false)
  const [field, setField] = useState<JmField>(FIELDS[0])
  const [active, setActive] = useState<Challenge | null>(null)
  const [submission, setSubmission] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [grade, setGrade] = useState<Grade | null>(null)
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [viewDegree, setViewDegree] = useState<string | null>(null)
  const [invite, setInvite] = useState<string | null>(null)
  const { user, signInWithGoogle, updateName, signOut, isLoggedIn } = useAuth()
  const meta = (user?.user_metadata || {}) as Record<string, string>
  const fullName = `${meta.first_name || ''} ${meta.last_name || ''}`.trim()
  const ready = isLoggedIn && fullName.length > 0

  // load saved progress
  useEffect(() => {
    try {
      const raw = localStorage.getItem('judgemynt-progress-v1')
      if (raw) setProgress(JSON.parse(raw))
    } catch {}
  }, [])

  useEffect(() => {
    try {
      const inv = new URLSearchParams(window.location.search).get('invite')
      if (inv) setInvite(inv)
    } catch {}
  }, [])

  useEffect(() => {
    if (invite && stage === 'hero') setStage('assess')
  }, [invite, stage])

  function saveScore(id: string, score: number) {
    setProgress((prev) => {
      const next = { ...prev, [id]: Math.max(prev[id] ?? 0, score) }
      try {
        localStorage.setItem('judgemynt-progress-v1', JSON.stringify(next))
      } catch {}
      return next
    })
  }

  const levelChallenges = (n: number) => field.challenges.filter((c) => c.level === n)
  const levelPassed = (n: number) => { const cs = levelChallenges(n); return cs.length > 0 && cs.every((c) => (progress[c.id] ?? 0) >= PASS) }
  const capstoneEarned = [1, 2, 3].every((n) => levelPassed(n))
  const fieldDegree = (base: string) => (field.id === 'everyday' ? base : `${base} · ${field.name}`)

  function go(s: typeof stage) {
    // Judgemynt requires an account — any action while signed out triggers Google sign-in.
    if (!isLoggedIn && s !== 'hero') {
      signInWithGoogle()
      return
    }
    setMenuOpen(false)
    setStage(s)
    if (typeof window !== 'undefined') window.scrollTo(0, 0)
  }

  function start(c: Challenge) {
    setActive(c)
    setSubmission('')
    setGrade(null)
    setError('')
    go('challenge')
  }

  async function submit() {
    if (!active) return
    if (submission.trim().length < 5) {
      setError('Write your answer first.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: active.id, submission }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong, try again.')
        setLoading(false)
        return
      }
      setGrade(data as Grade)
      saveScore(active.id, (data as Grade).score)
      go('result')
    } catch {
      setError('Could not reach the examiner, check your connection.')
    }
    setLoading(false)
  }

  const navLinks = [
    { label: 'Fields', to: 'fields' as const },
    { label: 'AI Exam', to: 'assess' as const },
    { label: 'Degrees', to: 'certs' as const },
  ]

  return (
    <div className="min-h-screen bg-[#040a12] text-[#eaf4fa] font-inter overflow-x-hidden">
      {/* fonts + animations, scoped to this page */}
      <link
        rel="stylesheet"
        href="https://db.onlinewebfonts.com/c/8b75d9dcff6a48c35a46656192adf019?family=FSP+DEMO+-+PODIUM+Sharp+4.11"
      />
      <style>{`
        .font-podium{font-family:"FSP DEMO - PODIUM Sharp 4.11", var(--font-sans), system-ui, sans-serif;}
        .font-inter{font-family:var(--font-sans), Inter, system-ui, sans-serif;}
        @keyframes jm-fade-up{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
        .jm-fade-up{opacity:0;animation:jm-fade-up .8s ease-out forwards;}
        .jm-d1{animation-delay:.2s}.jm-d2{animation-delay:.4s}.jm-d3{animation-delay:.6s}.jm-d4{animation-delay:.8s}
        @keyframes jm-bar{from{width:0}}
        .jm-bar{animation:jm-bar 1s ease-out forwards;}
      `}</style>

      {/* ===================== HERO ===================== */}
      {stage === 'hero' && (
        <section className="relative h-screen w-full overflow-hidden">
          <BrainCanvas />
          <div className="absolute inset-0 bg-gradient-to-r from-[#040a12]/85 via-[#040a12]/20 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#040a12] via-transparent to-transparent" />

          {/* navbar */}
          <nav className="relative z-20 flex items-center justify-between px-6 sm:px-10 lg:px-16 py-5 lg:py-7">
            <span className="font-podium text-2xl sm:text-3xl font-bold uppercase tracking-wider text-white">
              Judgemynt
            </span>
            <div className="hidden md:flex items-center gap-9">
              {navLinks.map((l) => (
                <button
                  key={l.label}
                  onClick={() => go(l.to)}
                  className="font-inter text-sm uppercase tracking-widest text-white/80 hover:text-white transition"
                >
                  {l.label}
                </button>
              ))}
              <Link
                href="/employers"
                className="font-inter text-sm uppercase tracking-widest text-white/80 hover:text-white transition"
              >
                For Employers
              </Link>
            </div>
            <button
              onClick={() => go('curriculum')}
              className="hidden md:flex items-center gap-2 border border-white/30 hover:border-white/60 hover:bg-white/10 px-6 py-3 text-xs uppercase tracking-widest text-white transition"
            >
              Start the exam <ArrowUpRight className="w-4 h-4" />
            </button>
            <button onClick={() => setMenuOpen(true)} className="md:hidden flex flex-col space-y-1.5" aria-label="Menu">
              <span className="w-6 h-0.5 bg-white" />
              <span className="w-6 h-0.5 bg-white" />
              <span className="w-4 h-0.5 bg-white" />
            </button>
          </nav>

          {/* hero content */}
          <div className="relative z-10 flex h-[calc(100vh-90px)] flex-col justify-center px-6 sm:px-10 lg:px-16 max-w-5xl">
            <div
              className="jm-fade-up mb-6 lg:mb-8 inline-flex w-fit items-center gap-2 rounded-full border px-3.5 py-1.5"
              style={{ borderColor: `${TEAL}40`, background: `${TEAL}0d` }}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: TEAL }} />
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: TEAL }} />
              </span>
              <span className="font-inter text-[10px] sm:text-xs uppercase tracking-[0.3em] text-white/80">
                Judgment is the last human edge
              </span>
            </div>

            <h1 className="font-podium uppercase text-white leading-[0.9] tracking-tight">
              <span className="jm-fade-up jm-d1 block text-[clamp(2.8rem,8vw,7rem)]">Detect.</span>
              <span className="jm-fade-up jm-d1 block text-[clamp(2.8rem,8vw,7rem)]">Correct.</span>
              <span
                className="jm-fade-up jm-d1 block text-[clamp(2.8rem,8vw,7rem)]"
                style={{ background: `linear-gradient(100deg, ${TEAL}, ${BLUE})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}
              >
                Direct.
              </span>
            </h1>

            <p className="jm-fade-up jm-d2 mt-6 lg:mt-8 max-w-lg font-inter text-sm sm:text-base lg:text-lg leading-relaxed text-white/70">
              AI can write anything. The scarce skill now is knowing when it&apos;s{' '}
              <span className="font-semibold text-white">wrong</span>. Judgemynt is the exam that proves your
              AI judgment, and the <span className="font-semibold text-white">credential employers can verify</span>.
            </p>

            <div className="jm-fade-up jm-d3 mt-8 lg:mt-10 flex flex-wrap items-center gap-3 sm:gap-4">
              <button
                onClick={() => go('fields')}
                className="group flex items-center gap-2 px-5 sm:px-7 py-3.5 sm:py-4 text-[11px] sm:text-xs uppercase tracking-widest font-semibold text-[#06121f] transition hover:brightness-110"
                style={{ background: `linear-gradient(110deg, ${TEAL}, ${BLUE})`, boxShadow: `0 8px 30px ${TEAL}33` }}
              >
                Take the exam, free
                <ArrowUpRight className="w-4 h-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </button>
              <button
                onClick={() => go('assess')}
                className="group flex items-center gap-2 border border-white/30 hover:border-white/60 hover:bg-white/10 px-5 sm:px-7 py-3.5 sm:py-4 text-[11px] sm:text-xs uppercase tracking-widest text-white transition"
              >
                AI Employment Exam
                <ArrowUpRight className="w-4 h-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </button>
            </div>

            <div className="jm-fade-up jm-d4 mt-8 sm:mt-10 lg:mt-14 flex flex-wrap items-center gap-6 sm:gap-10 lg:gap-14">
              {[
                [String(FIELDS.length), 'Career fields'],
                [String(FIELDS.reduce((n, f) => n + f.challenges.length, 0)), 'Judgment exams'],
                ['100%', 'AI-graded'],
              ].map(([v, l], i) => (
                <div key={l} className="flex items-center gap-6 sm:gap-10 lg:gap-14">
                  {i > 0 && <span className="hidden sm:block h-8 w-px bg-white/15" aria-hidden />}
                  <div>
                    <div className="font-inter font-bold tracking-tight text-2xl sm:text-4xl lg:text-5xl text-white">
                      {v}
                    </div>
                    <div className="mt-1 text-[9px] sm:text-xs uppercase tracking-widest text-white/50">{l}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="jm-fade-up jm-d4 mt-7 flex items-center gap-2 text-white/45">
              <Award className="w-4 h-4" style={{ color: TEAL }} />
              <span className="text-[11px] sm:text-xs tracking-wide">
                Verifiable credential · for upskillers and the teams that hire them
              </span>
            </div>
          </div>

          {/* mobile menu */}
          <div
            className={`fixed inset-0 z-50 bg-black/95 backdrop-blur-sm transition-all duration-500 md:hidden ${
              menuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
            }`}
          >
            <div className="flex items-center justify-between px-6 py-5">
              <span className="font-podium text-2xl font-bold uppercase tracking-wider text-white">Judgemynt</span>
              <button onClick={() => setMenuOpen(false)} aria-label="Close">
                <X className="w-7 h-7 text-white" />
              </button>
            </div>
            <div className="flex h-[70vh] flex-col items-start justify-center gap-6 px-8">
              {navLinks.map((l, i) => (
                <button
                  key={l.label}
                  onClick={() => go(l.to)}
                  className="font-podium text-4xl sm:text-5xl uppercase text-white"
                  style={menuItemStyle(menuOpen, i)}
                >
                  {l.label}
                </button>
              ))}
              <Link
                href="/employers"
                onClick={() => setMenuOpen(false)}
                className="font-podium text-4xl sm:text-5xl uppercase text-white"
                style={menuItemStyle(menuOpen, navLinks.length)}
              >
                For Employers
              </Link>
              <button
                onClick={() => go('curriculum')}
                className="mt-4 flex items-center gap-2 border border-white/30 px-6 py-3 text-xs uppercase tracking-widest text-white"
                style={menuItemStyle(menuOpen, navLinks.length + 1)}
              >
                Start the exam <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ===================== FIELDS ===================== */}
      {stage === 'fields' && (
        <Shell onHome={() => go('hero')} onCerts={() => go('certs')}>
          <div className="jm-fade-up">
            <div className="text-xs uppercase tracking-[0.3em]" style={{ color: TEAL }}>Choose your field</div>
            <h2 className="font-podium text-[clamp(2rem,6vw,4rem)] uppercase leading-[0.95] mt-3">
              Judgment, for<br />your field.
            </h2>
            <p className="text-white/60 max-w-xl mt-4 text-sm sm:text-base">
              Each field has its own curriculum and its own degrees. Prove you can out-judge AI where it actually counts for you.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-9">
            {FIELDS.map((f, i) => {
              const passedCount = [1, 2, 3].filter((n) => { const cs = f.challenges.filter((c) => c.level === n); return cs.length > 0 && cs.every((c) => (progress[c.id] ?? 0) >= PASS) }).length
              return (
                <button key={f.id} onClick={() => { setField(f); go('curriculum') }}
                  className={`jm-fade-up jm-d${Math.min(4, i + 1)} text-left rounded-2xl p-6 border transition group relative overflow-hidden`}
                  style={{ background: 'rgba(255,255,255,.02)', borderColor: `${f.color}33` }}>
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition" style={{ background: `radial-gradient(400px 200px at 0% 0%, ${f.color}12, transparent 70%)` }} />
                  <div className="relative flex items-center justify-between">
                    <span className="text-3xl">{f.emoji}</span>
                    <span className="text-[10px] uppercase tracking-widest" style={{ color: passedCount ? f.color : 'rgba(255,255,255,.3)' }}>{passedCount}/3 degrees</span>
                  </div>
                  <div className="relative font-podium text-xl uppercase mt-4" style={{ color: '#fff' }}>{f.name}</div>
                  <div className="relative text-white/50 text-[13px] leading-snug mt-2">{f.blurb}</div>
                  <div className="relative mt-4 text-[11px] uppercase tracking-widest flex items-center gap-1" style={{ color: f.color }}>
                    {f.challenges.length} exams <ArrowUpRight className="w-3 h-3" />
                  </div>
                </button>
              )
            })}
          </div>
        </Shell>
      )}

      {stage === 'assess' &&
        (ready ? (
          <Assessment
            onExit={() => go('hero')}
            userName={fullName}
            onDownloadDegree={downloadDegree}
            inviteToken={invite || undefined}
            candidate={{ name: fullName, email: user?.email || '' }}
          />
        ) : (
          <Shell onHome={() => go('hero')} onCerts={() => go('certs')}>
            <div className="jm-fade-up text-xs uppercase tracking-[0.3em]" style={{ color: TEAL }}>
              AI Employment Exam
            </div>
            <h2 className="font-podium text-[clamp(1.8rem,5vw,3rem)] uppercase leading-[0.95] mt-3">Sign in to take it</h2>
            <p className="text-white/60 text-sm mt-3 max-w-md">
              The exam issues a real, downloadable credential, so you need an account and your real name first.
            </p>
            <AccountGate isLoggedIn={isLoggedIn} user={user} onGoogle={signInWithGoogle} onSaveName={updateName} />
          </Shell>
        ))}

      {/* ===================== CURRICULUM ===================== */}
      {stage === 'curriculum' && (
        <Shell onHome={() => go('hero')} onCerts={() => go('certs')}>
          <div className="jm-fade-up">
            <button onClick={() => go('fields')} className="flex items-center gap-2 text-xs uppercase tracking-[0.3em]" style={{ color: field.color }}>
              <span className="text-lg">{field.emoji}</span> {field.name} <span className="text-white/30 normal-case tracking-normal">· change field</span>
            </button>
            <h2 className="font-podium text-[clamp(2rem,6vw,4rem)] uppercase leading-[0.95] mt-3">
              Three levels.
              <br />
              Three degrees.
            </h2>
            <p className="text-white/60 max-w-xl mt-4 text-sm sm:text-base">
              Pass every exam in a level (score {PASS}+) to earn its <span className="text-white font-semibold">{field.name}</span> degree. Clear all three and you earn the full{' '}
              <span className="text-white font-semibold">{fieldDegree('Judgment Degree')}</span>.
            </p>
          </div>

          <div className="mt-10 space-y-8">
            {LEVELS.map((lvl) => {
              const passed = levelPassed(lvl.n)
              return (
                <div key={lvl.n} className="jm-fade-up jm-d1 border-t border-white/10 pt-7">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-podium text-xl uppercase tracking-wide">
                      Level {lvl.n} · {lvl.name}
                    </span>
                    {passed && (
                      <span
                        className="flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-1 rounded-full"
                        style={{ color: TEAL, border: `1px solid ${TEAL}55` }}
                      >
                        <Check className="w-3 h-3" /> Degree earned
                      </span>
                    )}
                  </div>
                  <p className="text-white/50 text-sm mt-1">{lvl.blurb}</p>
                  <div className="grid sm:grid-cols-3 gap-3 mt-5">
                    {levelChallenges(lvl.n).map((c) => {
                      const best = progress[c.id]
                      return (
                        <button
                          key={c.id}
                          onClick={() => start(c)}
                          className="text-left bg-white/[0.03] border border-white/10 hover:border-white/30 rounded-xl p-4 transition group"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-[15px]">{c.title}</span>
                            {best != null && (
                              <span className="text-xs font-bold" style={{ color: band(best).color }}>
                                {best}
                              </span>
                            )}
                          </div>
                          <div className="text-white/45 text-xs mt-1.5 leading-snug">{c.tagline}</div>
                          <div
                            className="mt-3 text-[11px] uppercase tracking-widest flex items-center gap-1 opacity-60 group-hover:opacity-100 transition"
                            style={{ color: TEAL }}
                          >
                            {best != null ? 'Retake' : 'Start'} <ArrowUpRight className="w-3 h-3" />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          <button
            onClick={() => go('certs')}
            className="mt-12 flex items-center gap-2 border border-white/20 hover:border-white/50 px-6 py-3 text-xs uppercase tracking-widest transition"
          >
            <Crown className="w-4 h-4" style={{ color: TEAL }} /> View your degrees
          </button>
        </Shell>
      )}

      {/* ===================== CHALLENGE ===================== */}
      {stage === 'challenge' && active && (
        <Shell onHome={() => go('hero')} onCerts={() => go('certs')}>
          <button onClick={() => go('curriculum')} className="flex items-center gap-1 text-white/50 text-sm hover:text-white">
            <ChevronLeft className="w-4 h-4" /> Curriculum
          </button>
          <div className="jm-fade-up mt-5">
            <div className="text-xs uppercase tracking-widest" style={{ color: TEAL }}>
              Level {active.level} · {active.title}
            </div>
            <p className="text-white/90 text-base sm:text-lg leading-snug mt-2 max-w-2xl">{active.brief}</p>

            <div className="text-[11px] text-white/40 uppercase tracking-widest mt-6 mb-2">The AI produced this 👇</div>
            <pre className="whitespace-pre-wrap font-inter bg-[#ff5470]/[0.05] border border-[#ff5470]/20 rounded-xl p-4 text-[#d8e2ea] text-sm leading-relaxed">
              {active.original}
            </pre>

            <div className="text-[11px] text-white/40 uppercase tracking-widest mt-6 mb-2">Your answer</div>
            <textarea
              value={submission}
              onChange={(e) => setSubmission(e.target.value)}
              placeholder="Fix what's actually wrong…"
              aria-label="Your answer"
              rows={8}
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl p-4 text-[#eaf4fa] text-sm leading-relaxed outline-none focus:border-white/30 resize-y"
            />
            {error && <div className="text-[#ff5470] text-sm mt-3">{error}</div>}
            <button
              onClick={submit}
              disabled={loading}
              className="mt-4 w-full rounded-xl py-4 font-semibold text-base text-[#06121f] disabled:opacity-60"
              style={{ background: loading ? '#0d3b33' : `linear-gradient(110deg, ${TEAL}, ${BLUE})` }}
            >
              {loading ? 'The examiner is judging your call…' : 'Submit for judgment'}
            </button>
          </div>
        </Shell>
      )}

      {/* ===================== RESULT ===================== */}
      {stage === 'result' && grade && active && (
        <Shell onHome={() => go('hero')} onCerts={() => go('certs')}>
          <button onClick={() => go('curriculum')} className="flex items-center gap-1 text-white/50 text-sm hover:text-white">
            <ChevronLeft className="w-4 h-4" /> Curriculum
          </button>

          <div className="jm-fade-up text-center py-7">
            <div className="text-xs uppercase tracking-[0.25em] text-white/50">Judgment Score</div>
            <div
              className="font-inter font-bold leading-none tracking-tight my-1"
              style={{ fontSize: 'clamp(64px,16vw,112px)', color: band(grade.score).color }}
            >
              {grade.score}
            </div>
            <div className="font-semibold text-lg" style={{ color: band(grade.score).color }}>
              {band(grade.score).label}
            </div>
            <div className="text-white/55 text-sm mt-1">&ldquo;{grade.verdict}&rdquo;</div>
          </div>

          {/* dimensions */}
          <div className="space-y-4 max-w-xl mx-auto">
            <ScoreBar label="Detection" hint="did you spot what was wrong" value={grade.dimensions.detection} />
            <ScoreBar label="Reasoning" hint="did you understand why" value={grade.dimensions.reasoning} />
            <ScoreBar label="Execution" hint="how good your fix was" value={grade.dimensions.execution} />
          </div>

          {/* flaws */}
          <div className="mt-8 grid gap-2.5 max-w-xl mx-auto">
            {grade.flaws.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl px-4 py-3 border"
                style={{
                  background: 'rgba(255,255,255,.03)',
                  borderColor: f.caught ? 'rgba(0,212,170,.25)' : 'rgba(255,84,112,.22)',
                }}
              >
                <span>{f.caught ? '✅' : '❌'}</span>
                <span className={`text-sm ${f.caught ? 'text-white' : 'text-white/60'}`}>{f.flaw}</span>
                <span
                  className="ml-auto text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: f.caught ? TEAL : '#ff5470' }}
                >
                  {f.caught ? 'caught' : 'missed'}
                </span>
              </div>
            ))}
          </div>

          <div className="max-w-xl mx-auto">
            {grade.analysis && (
              <div className="mt-7 rounded-xl bg-white/[0.03] border border-white/10 p-4">
                <div className="text-[11px] uppercase tracking-widest mb-2" style={{ color: TEAL }}>
                  Examiner&apos;s analysis
                </div>
                <p className="text-white/80 text-sm leading-relaxed">{grade.analysis}</p>
              </div>
            )}
            {grade.nailed && <Note label="What you nailed" color={TEAL} text={grade.nailed} />}
            {grade.missed && <Note label="What slipped past you" color="#f59e0b" text={grade.missed} />}
            {grade.tip && <Note label="Sharpen next time" color={BLUE} text={grade.tip} />}

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => start(active)}
                className="flex-1 rounded-xl py-3.5 font-semibold text-sm bg-white/[0.04] border border-white/10 hover:border-white/30"
              >
                Retake
              </button>
              <button
                onClick={() => go('curriculum')}
                className="flex-1 rounded-xl py-3.5 font-semibold text-sm text-[#06121f]"
                style={{ background: `linear-gradient(110deg, ${TEAL}, ${BLUE})` }}
              >
                Next exam →
              </button>
            </div>
            <p className="text-center text-white/40 text-xs mt-5">
              Screenshot your score and send it to a friend, see who&apos;s got the sharper eye.
            </p>
          </div>
        </Shell>
      )}

      {/* ===================== DEGREES / CERTIFICATES ===================== */}
      {stage === 'certs' && (
        <Shell onHome={() => go('hero')} onCerts={() => go('certs')}>
          <div className="jm-fade-up">
            <div className="text-xs uppercase tracking-[0.3em]" style={{ color: TEAL }}>
              Your Degrees
            </div>
            <h2 className="font-podium text-[clamp(2rem,6vw,4rem)] uppercase leading-[0.95] mt-3">
              Earn it.
              <br />
              Own it forever.
            </h2>
            <p className="text-white/60 max-w-xl mt-4 text-sm sm:text-base">
              A real, verifiable credential for the one skill AI can&apos;t fake for you: judgment.
            </p>
          </div>

          {!ready && (
            <AccountGate isLoggedIn={isLoggedIn} user={user} onGoogle={signInWithGoogle} onSaveName={updateName} />
          )}

          {ready && (
          <>
          <div className="flex items-center justify-between mt-8 mb-1 text-xs">
            <span className="text-white/50">
              Signed in as <span className="text-white">{fullName}</span>
            </span>
            <button onClick={() => signOut()} className="text-white/40 hover:text-white">
              Sign out
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            {LEVELS.map((lvl) => {
              const earned = levelPassed(lvl.n)
              return (
                <DegreeCard
                  key={lvl.n}
                  title={fieldDegree(lvl.degree)}
                  sub={`Level ${lvl.n} · ${lvl.name} · ${field.name}`}
                  earned={earned}
                  onView={() => {
                    if (earned) setViewDegree(fieldDegree(lvl.degree))
                  }}
                />
              )
            })}
            <DegreeCard
              title={fieldDegree('The Judgment Degree')}
              sub={`Capstone · ${field.name}`}
              earned={capstoneEarned}
              capstone
              onView={() => {
                if (capstoneEarned) setViewDegree(fieldDegree('The Judgment Degree'))
              }}
            />
          </div>

          <button
            onClick={() => go('curriculum')}
            className="mt-10 flex items-center gap-2 text-sm text-white/60 hover:text-white"
          >
            <ChevronLeft className="w-4 h-4" /> Back to curriculum
          </button>
          </>
          )}
        </Shell>
      )}

      {/* diploma overlay */}
      {viewDegree && (
        <Diploma
          degree={viewDegree}
          name={fullName}
          onDownload={() => downloadDegree(viewDegree, fullName, `${field.name} · Judgemynt verified degree`)}
          onClose={() => setViewDegree(null)}
        />
      )}
    </div>
  )
}

/* ---------------- sub-components ---------------- */

function BrainCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let raf = 0
    let w = 0
    let h = 0
    type Pt = { x: number; y: number; vx: number; vy: number; r: number; ph: number }
    type Sig = { a: number; b: number; t: number; speed: number }
    let nodes: Pt[] = []
    let signals: Sig[] = []
    const DIST = 120

    function build() {
      const count = Math.round(Math.min(120, Math.max(55, (w * h) / 14000)))
      const cx = w / 2
      const cy = h * 0.45
      nodes = []
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2
        const rad = Math.pow(Math.random(), 0.6) * Math.min(w, h) * 0.5
        nodes.push({
          x: cx + Math.cos(ang) * rad * 1.4 + (Math.random() - 0.5) * w * 0.1,
          y: cy + Math.sin(ang) * rad + (Math.random() - 0.5) * h * 0.1,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.15,
          r: Math.random() * 1.6 + 0.6,
          ph: Math.random() * Math.PI * 2,
        })
      }
      signals = []
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas!.clientWidth
      h = canvas!.clientHeight
      canvas!.width = w * dpr
      canvas!.height = h * dpr
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      build()
    }

    function frame() {
      ctx!.clearRect(0, 0, w, h)
      const cx = w / 2
      const cy = h * 0.45
      const glow = ctx!.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.55)
      glow.addColorStop(0, 'rgba(0,212,170,0.10)')
      glow.addColorStop(1, 'rgba(0,212,170,0)')
      ctx!.fillStyle = glow
      ctx!.fillRect(0, 0, w, h)

      for (const n of nodes) {
        n.x += n.vx
        n.y += n.vy
        n.ph += 0.02
        if (n.x < 0 || n.x > w) n.vx *= -1
        if (n.y < 0 || n.y > h) n.vy *= -1
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]
          const b = nodes[j]
          const d = Math.hypot(a.x - b.x, a.y - b.y)
          if (d < DIST) {
            ctx!.strokeStyle = `rgba(120,180,255,${(1 - d / DIST) * 0.22})`
            ctx!.lineWidth = 0.6
            ctx!.beginPath()
            ctx!.moveTo(a.x, a.y)
            ctx!.lineTo(b.x, b.y)
            ctx!.stroke()
          }
        }
      }

      for (const n of nodes) {
        const pulse = (Math.sin(n.ph) + 1) / 2
        ctx!.beginPath()
        ctx!.arc(n.x, n.y, n.r + pulse * 0.6, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(180,230,255,${0.5 + pulse * 0.4})`
        ctx!.fill()
      }

      if (signals.length < 22 && Math.random() < 0.35 && nodes.length) {
        const a = Math.floor(Math.random() * nodes.length)
        const near: number[] = []
        for (let j = 0; j < nodes.length; j++) {
          if (j === a) continue
          if (Math.hypot(nodes[a].x - nodes[j].x, nodes[a].y - nodes[j].y) < DIST) near.push(j)
        }
        if (near.length)
          signals.push({ a, b: near[Math.floor(Math.random() * near.length)], t: 0, speed: 0.015 + Math.random() * 0.02 })
      }

      signals = signals.filter((s) => s.t < 1)
      for (const s of signals) {
        s.t += s.speed
        const a = nodes[s.a]
        const b = nodes[s.b]
        if (!a || !b) {
          s.t = 1
          continue
        }
        const x = a.x + (b.x - a.x) * s.t
        const y = a.y + (b.y - a.y) * s.t
        ctx!.shadowColor = 'rgba(0,255,200,0.8)'
        ctx!.shadowBlur = 8
        ctx!.beginPath()
        ctx!.arc(x, y, 1.8, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(0,255,200,${1 - s.t})`
        ctx!.fill()
        ctx!.shadowBlur = 0
      }

      raf = requestAnimationFrame(frame)
    }

    resize()
    raf = requestAnimationFrame(frame)
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])
  return <canvas ref={ref} aria-hidden="true" className="absolute inset-0 h-full w-full" />
}

function Shell({ children, onHome, onCerts }: { children: ReactNode; onHome: () => void; onCerts: () => void }) {
  return (
    <div className="min-h-screen">
      <nav className="flex items-center justify-between px-6 sm:px-10 lg:px-16 py-5 lg:py-6 border-b border-white/5">
        <button onClick={onHome} className="font-podium text-xl sm:text-2xl font-bold uppercase tracking-wider text-white">
          Judgemynt
        </button>
        <button
          onClick={onCerts}
          className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-white/70 hover:text-white"
        >
          <Crown className="w-4 h-4" style={{ color: TEAL }} /> Degrees
        </button>
      </nav>
      <div className="px-6 sm:px-10 lg:px-16 py-10 lg:py-14 max-w-4xl mx-auto pb-24">{children}</div>
    </div>
  )
}

function ScoreBar({ label, hint, value }: { label: string; hint: string; value: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-semibold">
          {label} <span className="text-white/40 font-normal text-xs">, {hint}</span>
        </span>
        <span className="text-sm font-bold" style={{ color: band(value).color }}>
          {value}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className="jm-bar h-full rounded-full"
          style={{ width: `${value}%`, background: `linear-gradient(90deg, ${TEAL}, ${BLUE})` }}
        />
      </div>
    </div>
  )
}

function Note({ label, color, text }: { label: string; color: string; text: string }) {
  return (
    <div className="mt-3 pl-3.5" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color }}>
        {label}
      </div>
      <div className="text-[#eaf4fa] text-sm leading-snug mt-0.5">{text}</div>
    </div>
  )
}

function DegreeCard({
  title,
  sub,
  earned,
  capstone,
  onView,
}: {
  title: string
  sub: string
  earned: boolean
  capstone?: boolean
  onView: () => void
}) {
  return (
    <button
      onClick={onView}
      disabled={!earned}
      className="text-left rounded-2xl p-6 border transition relative overflow-hidden"
      style={{
        background: earned ? 'rgba(0,212,170,.06)' : 'rgba(255,255,255,.02)',
        borderColor: earned ? 'rgba(0,212,170,.3)' : 'rgba(255,255,255,.08)',
        cursor: earned ? 'pointer' : 'default',
      }}
    >
      <div className="flex items-center justify-between">
        {capstone ? (
          <Crown className="w-7 h-7" style={{ color: earned ? TEAL : '#46596b' }} />
        ) : (
          <Award className="w-7 h-7" style={{ color: earned ? TEAL : '#46596b' }} />
        )}
        {earned ? (
          <Sparkles className="w-5 h-5" style={{ color: TEAL }} />
        ) : (
          <Lock className="w-5 h-5 text-white/25" />
        )}
      </div>
      <div className="font-podium text-2xl uppercase mt-4" style={{ color: earned ? '#fff' : 'rgba(255,255,255,.5)' }}>
        {title}
      </div>
      <div className="text-white/40 text-xs uppercase tracking-widest mt-1">{sub}</div>
      <div className="mt-4 text-[11px] uppercase tracking-widest" style={{ color: earned ? TEAL : 'rgba(255,255,255,.3)' }}>
        {earned ? 'View certificate →' : 'Locked, pass the level'}
      </div>
    </button>
  )
}

function Diploma({
  degree,
  name,
  onDownload,
  onClose,
}: {
  degree: string
  name: string
  onDownload: () => void
  onClose: () => void
}) {
  const id = 'JM-' + Math.abs(hashStr(degree + (name || 'x'))).toString(36).toUpperCase().slice(0, 8)
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  return (
    <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="relative w-full max-w-xl my-8">
        <button onClick={onClose} className="absolute -top-10 right-0 text-white/70 hover:text-white" aria-label="Close">
          <X className="w-7 h-7" />
        </button>
        <div
          className="rounded-2xl p-8 sm:p-12 text-center"
          style={{
            background: 'linear-gradient(160deg, #06121f, #0a1726)',
            border: `1px solid ${TEAL}44`,
            boxShadow: `0 0 60px rgba(0,212,170,.15)`,
          }}
        >
          <Crown className="w-10 h-10 mx-auto" style={{ color: TEAL }} />
          <div className="font-podium text-2xl uppercase tracking-wider mt-3 text-white">Judgemynt</div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/40 mt-1">Certified Judgment · AI Era</div>

          <div className="text-white/50 text-xs uppercase tracking-widest mt-8">This certifies that</div>
          <div className="font-podium text-3xl sm:text-4xl uppercase text-white py-2 mt-2">{name || 'Your Name'}</div>
          <div className="text-white/50 text-xs uppercase tracking-widest mt-6">has earned the degree of</div>
          <div className="font-podium text-2xl sm:text-3xl uppercase mt-2" style={{ color: TEAL }}>
            {degree}
          </div>

          <div className="flex items-center justify-center gap-8 mt-8 text-left">
            <div>
              <div className="text-[9px] uppercase tracking-widest text-white/40">Issued</div>
              <div className="text-sm text-white/80">{date}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-widest text-white/40">Credential ID</div>
              <div className="text-sm text-white/80 font-mono">{id}</div>
            </div>
          </div>

          <div className="mt-8 border-t border-white/10 pt-4 text-[10px] uppercase tracking-widest text-white/30">
            judgemynt, proof you can tell when AI is wrong
          </div>
        </div>
        <button
          onClick={onDownload}
          className="mt-4 w-full rounded-xl py-3 font-semibold text-sm text-[#06121f]"
          style={{ background: `linear-gradient(110deg, ${TEAL}, ${BLUE})` }}
        >
          Download degree (PNG)
        </button>
      </div>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.8 6.1C12.2 13.3 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-4 6.8-9.9 6.8-17.4z" />
      <path fill="#FBBC05" d="M10.3 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.8-6.1C.9 16.3 0 20 0 24s.9 7.7 2.5 10.7l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.3-5.7c-2 1.4-4.7 2.3-7.9 2.3-6.4 0-11.8-3.8-13.7-9.3l-7.8 6.1C6.4 42.6 14.6 48 24 48z" />
    </svg>
  )
}

function AccountGate({
  isLoggedIn,
  user,
  onGoogle,
  onSaveName,
}: {
  isLoggedIn: boolean
  user: { user_metadata?: Record<string, string> } | null
  onGoogle: () => void
  onSaveName: (first: string, last: string) => Promise<{ error?: string }>
}) {
  const m = user?.user_metadata || {}
  const guessFirst = m.first_name || m.given_name || (m.full_name || m.name || '').split(' ')[0] || ''
  const guessLast = m.last_name || m.family_name || (m.full_name || m.name || '').split(' ').slice(1).join(' ') || ''
  const [first, setFirst] = useState(guessFirst)
  const [last, setLast] = useState(guessLast)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  if (!isLoggedIn) {
    return (
      <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center max-w-md mx-auto">
        <Crown className="w-9 h-9 mx-auto" style={{ color: TEAL }} />
        <div className="font-podium text-xl uppercase mt-3">Claim your degree</div>
        <p className="text-white/55 text-sm mt-2">Sign in to earn a verifiable degree with your real name on it.</p>
        <button
          onClick={onGoogle}
          className="mt-5 w-full rounded-xl py-3 font-semibold text-sm bg-white text-[#1f2937] flex items-center justify-center gap-2"
        >
          <GoogleMark /> Continue with Google
        </button>
      </div>
    )
  }

  return (
    <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-8 max-w-md mx-auto">
      <div className="font-podium text-xl uppercase">Your real name</div>
      <p className="text-white/55 text-sm mt-1">This goes on your certificate exactly as you type it, use your real first and last name.</p>
      <div className="grid grid-cols-2 gap-3 mt-5">
        <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name" className="bg-white/[0.04] border border-white/10 focus:border-white/30 rounded-xl px-3 py-2.5 text-sm outline-none" />
        <input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name" className="bg-white/[0.04] border border-white/10 focus:border-white/30 rounded-xl px-3 py-2.5 text-sm outline-none" />
      </div>
      {err && <div className="text-[#ff5470] text-xs mt-2">{err}</div>}
      <button
        onClick={async () => {
          if (first.trim().length < 1 || last.trim().length < 1) {
            setErr('Enter your first and last name.')
            return
          }
          setSaving(true)
          setErr('')
          const r = await onSaveName(first.trim(), last.trim())
          setSaving(false)
          if (r?.error) setErr(r.error)
        }}
        disabled={saving}
        className="mt-4 w-full rounded-xl py-3 font-semibold text-sm text-[#06121f] disabled:opacity-60"
        style={{ background: `linear-gradient(110deg, ${TEAL}, ${BLUE})` }}
      >
        {saving ? 'Saving…' : 'Save & continue'}
      </button>
    </div>
  )
}

function downloadDegree(title: string, name: string, sub: string) {
  const W = 1200
  const H = 820
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const x = c.getContext('2d')
  if (!x) return
  x.fillStyle = '#06121f'
  x.fillRect(0, 0, W, H)
  const g = x.createRadialGradient(W / 2, H * 0.33, 0, W / 2, H * 0.33, W * 0.55)
  g.addColorStop(0, 'rgba(0,212,170,0.14)')
  g.addColorStop(1, 'rgba(0,212,170,0)')
  x.fillStyle = g
  x.fillRect(0, 0, W, H)
  x.strokeStyle = 'rgba(0,212,170,0.45)'
  x.lineWidth = 3
  x.strokeRect(44, 44, W - 88, H - 88)
  x.textAlign = 'center'
  const f = (px: number, w = 400) => `${w} ${px}px Inter, system-ui, sans-serif`
  x.fillStyle = TEAL
  x.font = f(30, 700)
  x.fillText('JUDGEMYNT', W / 2, 150)
  x.fillStyle = 'rgba(255,255,255,0.45)'
  x.font = f(15)
  x.fillText('CERTIFIED JUDGMENT · AI ERA', W / 2, 184)
  x.fillStyle = 'rgba(255,255,255,0.6)'
  x.font = f(17)
  x.fillText('This certifies that', W / 2, 330)
  x.fillStyle = '#ffffff'
  x.font = f(66, 900)
  x.fillText(name || 'Your Name', W / 2, 405)
  x.fillStyle = 'rgba(255,255,255,0.6)'
  x.font = f(17)
  x.fillText('has earned the degree of', W / 2, 470)
  x.fillStyle = TEAL
  x.font = f(46, 900)
  x.fillText(title.toUpperCase(), W / 2, 532)
  x.fillStyle = 'rgba(255,255,255,0.55)'
  x.font = f(15)
  x.fillText(sub, W / 2, 580)
  const id = 'JM-' + Math.abs(hashStr(name + title)).toString(36).toUpperCase().slice(0, 8)
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  x.fillStyle = 'rgba(255,255,255,0.4)'
  x.font = f(14)
  x.fillText(`Issued ${date}      ·      Credential ${id}`, W / 2, 700)
  x.fillStyle = 'rgba(255,255,255,0.3)'
  x.font = f(12)
  x.fillText('judgemynt, proof you can tell when AI is wrong', W / 2, 740)
  c.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `judgemynt-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`
    a.click()
    URL.revokeObjectURL(url)
  })
}

function menuItemStyle(open: boolean, i: number): CSSProperties {
  return {
    opacity: open ? 1 : 0,
    transform: open ? 'translateY(0)' : 'translateY(20px)',
    transition: 'opacity .5s, transform .5s',
    transitionDelay: `${i * 80 + 100}ms`,
  }
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return h
}
