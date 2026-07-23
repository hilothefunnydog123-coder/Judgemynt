'use client'
/* ════════════════════════════════════════════════════════════════════════
   The marketplace.

   One page, two faces, decided by the profile:

   Candidate: browse jobs, apply (which means taking the company's
   assessment), watch application status, and, once accepted, DM the
   company directly.

   Employer: post jobs backed by assessment roles, watch applicants and
   their scores come in, accept or reject (each sends the candidate an
   email), and DM accepted candidates.

   The chat is a plain polling thread: fetch on open, refetch every few
   seconds while the panel is up. No sockets to babysit, and a hiring
   conversation does not need sub-second latency.
   ════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  Briefcase, Check, ChevronLeft, Loader2, MessageSquare, Plus, Send, Trash2, X, ExternalLink, Users,
} from 'lucide-react'
import { useProfile } from '@/hooks/useProfile'
import Onboarding from '@/components/Onboarding'

const TEAL = '#00d4aa'
const RED = '#ff5470'
const AMBER = '#f59e0b'
const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

interface Job {
  id: string
  company_id: string
  company_name: string | null
  company_url: string | null
  role_id: string
  title: string
  description: string | null
  active?: boolean
  created_at: string
}

interface Application {
  id: string
  job_id: string
  job_title?: string
  company_name?: string
  candidate_name: string | null
  candidate_email: string | null
  status: 'applied' | 'assessed' | 'accepted' | 'rejected'
  score: number | null
  invite?: string | null
  created_at: string
}

interface RoleOption {
  id: string
  name: string
}

interface ChatMsg {
  id: string
  sender_kind: 'employer' | 'candidate'
  body: string
  created_at: string
}

const STATUS_COLOR: Record<Application['status'], string> = {
  applied: 'rgba(255,255,255,.6)',
  assessed: AMBER,
  accepted: TEAL,
  rejected: RED,
}

const STATUS_LABEL: Record<Application['status'], string> = {
  applied: 'awaiting assessment',
  assessed: 'assessed',
  accepted: 'accepted',
  rejected: 'rejected',
}

export default function Marketplace() {
  const {
    isLoggedIn, loading, signInWithGoogle, signOut, getToken,
    profile, profileReady, saveProfile, refreshProfile,
  } = useProfile()

  const [jobs, setJobs] = useState<Job[]>([])
  const [myJobs, setMyJobs] = useState<Job[]>([])
  const [apps, setApps] = useState<Application[]>([])
  const [roles, setRoles] = useState<RoleOption[]>([])
  const [tab, setTab] = useState<'board' | 'mine'>('board')
  const [editingJob, setEditingJob] = useState<Partial<Job> | null>(null)
  const [chatApp, setChatApp] = useState<Application | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')

  const call = useCallback(
    async (body: Record<string, unknown>) => {
      const token = await getToken()
      const res = await fetch('/api/marketplace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Request failed')
      return d
    },
    [getToken]
  )

  /* The public board loads for everyone, signed in or not. */
  useEffect(() => {
    fetch('/api/marketplace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'jobs.list' }),
    })
      .then((r) => r.json())
      .then((d) => Array.isArray(d?.jobs) && setJobs(d.jobs))
      .catch(() => {})
  }, [])

  const refresh = useCallback(async () => {
    if (!profile) return
    setBusy(true)
    setErr('')
    try {
      if (profile.kind === 'employer') {
        const [j, a] = await Promise.all([call({ action: 'jobs.mine' }), call({ action: 'applications.list' })])
        setMyJobs(j.jobs || [])
        setApps(a.applications || [])
        // Role options for the job form come from the employer console API.
        const token = await getToken()
        const r = await fetch('/api/company', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ action: 'roles.list' }),
        }).then((x) => x.json())
        setRoles(Array.isArray(r?.roles) ? r.roles.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })) : [])
      } else {
        const a = await call({ action: 'applications.mine' })
        setApps(a.applications || [])
      }
    } catch (e) {
      setErr((e as Error).message)
    }
    setBusy(false)
  }, [call, getToken, profile])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function apply(job: Job) {
    setErr('')
    setBusy(true)
    try {
      const d = await call({ action: 'apply', jobId: job.id })
      // The assessment IS the application: send them straight into it.
      window.location.assign(`/?invite=${d.invite}`)
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  async function saveJob() {
    if (!editingJob) return
    setBusy(true)
    setErr('')
    try {
      await call({
        action: 'jobs.save',
        id: editingJob.id,
        title: editingJob.title || '',
        description: editingJob.description || '',
        role_id: editingJob.role_id || '',
      })
      setEditingJob(null)
      await refresh()
    } catch (e) {
      setErr((e as Error).message)
    }
    setBusy(false)
  }

  async function decide(app: Application, decision: 'accepted' | 'rejected') {
    setBusy(true)
    setErr('')
    try {
      const d = await call({ action: 'decide', applicationId: app.id, decision })
      setNotice(
        d.emailed
          ? `Decision saved. ${app.candidate_name || 'The candidate'} has been emailed.`
          : 'Decision saved. Email is not configured on this deployment, so no message was sent.'
      )
      setTimeout(() => setNotice(''), 5000)
      await refresh()
    } catch (e) {
      setErr((e as Error).message)
    }
    setBusy(false)
  }

  /* ── gates: signed out, then onboarding ─────────────────────────────── */
  if (!loading && !isLoggedIn) {
    return (
      <Shell onSignOut={null}>
        <div className="max-w-md mx-auto text-center pt-24">
          <div className="font-podium text-3xl uppercase">The marketplace</div>
          <p className="text-white font-medium mt-3 leading-relaxed">
            Jobs where the interview is a work sample, not a vibe. Sign in to apply as a candidate or to
            post as a company.
          </p>
          <button
            onClick={async () => {
              const r = await signInWithGoogle()
              if (r?.error) setErr(r.error)
            }}
            className="mt-6 rounded-full px-7 py-3.5 font-bold text-[#04121a] hover:brightness-110 transition"
            style={{ background: TEAL }}
          >
            Sign in with Google
          </button>
          {err && <Banner tone="bad">{err}</Banner>}
        </div>
      </Shell>
    )
  }

  if (loading || !profileReady) {
    return (
      <Shell onSignOut={null}>
        <div className="flex items-center gap-3 text-white font-semibold pt-24 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      </Shell>
    )
  }

  if (isLoggedIn && !profile) {
    return (
      <Shell onSignOut={signOut}>
        <Onboarding onSave={saveProfile} onDone={refreshProfile} />
      </Shell>
    )
  }

  const isEmployer = profile?.kind === 'employer'

  return (
    <Shell onSignOut={signOut}>
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-podium text-[clamp(1.8rem,5vw,3rem)] uppercase">Marketplace</h1>
        <span className="text-[11px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full" style={{ background: `${TEAL}18`, color: TEAL }}>
          {isEmployer ? profile?.company_name || 'Employer' : `${profile?.first_name || ''} ${profile?.last_name || ''}`}
        </span>
        {busy && <Loader2 className="w-4 h-4 animate-spin text-white/60" />}
      </div>

      <div className="flex gap-2 mt-6">
        {(['board', 'mine'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[13.5px] font-semibold border transition"
            style={{
              background: tab === t ? `${TEAL}18` : 'transparent',
              borderColor: tab === t ? `${TEAL}55` : 'rgba(255,255,255,.12)',
              color: tab === t ? TEAL : '#ffffff',
            }}
          >
            {t === 'board' ? <Briefcase className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
            {t === 'board'
              ? `Open jobs (${jobs.length})`
              : isEmployer
                ? `My jobs and applicants`
                : `My applications (${apps.length})`}
          </button>
        ))}
      </div>

      {err && <Banner tone="bad">{err}</Banner>}
      {notice && <Banner tone="ok">{notice}</Banner>}

      {/* ── the public board ──────────────────────────────────────────── */}
      {tab === 'board' && (
        <div className="mt-6 space-y-3">
          {jobs.length === 0 && (
            <Empty title="No open jobs yet">
              {isEmployer
                ? 'Post the first one from the other tab.'
                : 'Companies post here; check back soon or take a practice test for the credential meanwhile.'}
            </Empty>
          )}
          {jobs.map((j) => {
            const mine = apps.find((a) => a.job_id === j.id)
            return (
              <div key={j.id} className="rounded-2xl border border-white/[0.09] p-5" style={{ background: 'rgba(255,255,255,.02)' }}>
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="font-podium text-lg uppercase leading-tight">{j.title}</div>
                    <div className="flex items-center gap-2 mt-1.5 text-[13.5px] font-semibold text-white flex-wrap">
                      <span>{j.company_name || 'Company'}</span>
                      {j.company_url && (
                        <a href={j.company_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:brightness-125 transition" style={{ color: TEAL }}>
                          <ExternalLink className="w-3.5 h-3.5" /> site
                        </a>
                      )}
                    </div>
                  </div>
                  {!isEmployer &&
                    (mine ? (
                      <span className="text-[12px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,.06)', color: STATUS_COLOR[mine.status] }}>
                        {STATUS_LABEL[mine.status]}
                      </span>
                    ) : (
                      <button
                        onClick={() => apply(j)}
                        disabled={busy}
                        className="rounded-full px-5 py-2 font-bold text-[#04121a] disabled:opacity-40 hover:brightness-110 transition"
                        style={{ background: TEAL }}
                      >
                        Apply: take the assessment
                      </button>
                    ))}
                </div>
                {j.description && <p className="text-white font-medium text-[14px] mt-3 leading-relaxed whitespace-pre-wrap">{j.description}</p>}
                <div className="text-[11.5px] font-medium text-white/70 mt-3" style={{ fontFamily: mono }}>
                  posted {new Date(j.created_at).toLocaleDateString()}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── candidate: my applications ────────────────────────────────── */}
      {tab === 'mine' && !isEmployer && (
        <div className="mt-6 space-y-3">
          {apps.length === 0 && (
            <Empty title="No applications yet">Apply to a job on the board; the assessment is the application.</Empty>
          )}
          {apps.map((a) => (
            <div key={a.id} className="rounded-2xl border border-white/[0.09] p-5" style={{ background: 'rgba(255,255,255,.02)' }}>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[15px]">{a.job_title}</div>
                  <div className="text-white font-medium text-[13px] mt-0.5">{a.company_name}</div>
                </div>
                {a.score !== null && (
                  <span className="font-bold tabular-nums text-lg" style={{ fontFamily: mono, color: TEAL }}>{a.score}</span>
                )}
                <span className="text-[11px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,255,255,.06)', color: STATUS_COLOR[a.status] }}>
                  {STATUS_LABEL[a.status]}
                </span>
                {a.status === 'applied' && a.invite && (
                  <Link href={`/?invite=${a.invite}`} className="rounded-full px-4 py-1.5 text-[13px] font-bold text-[#04121a]" style={{ background: TEAL }}>
                    Take the assessment
                  </Link>
                )}
                {a.status === 'accepted' && (
                  <button onClick={() => setChatApp(a)} className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-bold border transition hover:bg-white/5" style={{ borderColor: `${TEAL}55`, color: TEAL }}>
                    <MessageSquare className="w-3.5 h-3.5" /> Chat
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── employer: jobs + applicants ───────────────────────────────── */}
      {tab === 'mine' && isEmployer && (
        <div className="mt-6">
          {!editingJob && (
            <button
              onClick={() => setEditingJob({ title: '', description: '', role_id: roles[0]?.id })}
              className="flex items-center gap-2 rounded-full px-5 py-2.5 font-bold text-[#04121a] hover:brightness-110 transition"
              style={{ background: TEAL }}
            >
              <Plus className="w-4 h-4" /> Post a job
            </button>
          )}

          {editingJob && (
            <div className="rounded-2xl border p-5 space-y-3" style={{ background: 'rgba(255,255,255,.02)', borderColor: `${TEAL}40` }}>
              <div className="font-podium text-lg uppercase">{editingJob.id ? 'Edit job' : 'New job'}</div>
              <input
                value={editingJob.title || ''}
                onChange={(e) => setEditingJob({ ...editingJob, title: e.target.value })}
                placeholder="Job title, e.g. Customer Support Specialist"
                className="w-full bg-white/[0.04] border border-white/10 focus:border-white/30 rounded-xl px-3.5 py-2.5 outline-none transition"
              />
              <textarea
                value={editingJob.description || ''}
                onChange={(e) => setEditingJob({ ...editingJob, description: e.target.value })}
                rows={4}
                placeholder="Describe the role: what they will do, pay range, location or remote, anything a candidate should know before spending 20 minutes on your assessment."
                className="w-full bg-white/[0.04] border border-white/10 focus:border-white/30 rounded-xl px-3.5 py-2.5 outline-none resize-y transition"
              />
              <div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-white mb-2">The assessment behind it</div>
                {roles.length === 0 ? (
                  <p className="text-white font-medium text-[14px]">
                    You have no assessment roles yet. <Link href="/employers" className="underline" style={{ color: TEAL }}>Build one first</Link>, then come back.
                  </p>
                ) : (
                  <select
                    value={editingJob.role_id || ''}
                    onChange={(e) => setEditingJob({ ...editingJob, role_id: e.target.value })}
                    className="bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2.5 outline-none w-full sm:w-auto"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id} style={{ background: '#0b1420' }}>{r.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={saveJob}
                  disabled={busy || !editingJob.title?.trim() || !editingJob.role_id}
                  className="rounded-full px-6 py-2.5 font-bold text-[#04121a] disabled:opacity-40 hover:brightness-110 transition"
                  style={{ background: TEAL }}
                >
                  {editingJob.id ? 'Save job' : 'Post job'}
                </button>
                <button onClick={() => setEditingJob(null)} className="rounded-full px-5 py-2.5 font-semibold border border-white/15 hover:bg-white/5 transition">
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="mt-5 space-y-3">
            {myJobs.length === 0 && !editingJob && (
              <Empty title="No jobs posted">Each job is backed by one of your assessment roles; applying means taking it.</Empty>
            )}
            {myJobs.map((j) => {
              const jobApps = apps.filter((a) => a.job_id === j.id)
              return (
                <div key={j.id} className="rounded-2xl border border-white/[0.09] p-5" style={{ background: 'rgba(255,255,255,.02)' }}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="font-podium text-lg uppercase">{j.title}</div>
                    <span className="text-[11.5px] font-semibold text-white/80" style={{ fontFamily: mono }}>
                      {jobApps.length} applicant{jobApps.length === 1 ? '' : 's'}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      <button onClick={() => setEditingJob(j)} className="text-[13px] font-semibold text-white hover:text-[#00d4aa] transition">Edit</button>
                      <button
                        onClick={async () => { await call({ action: 'jobs.delete', id: j.id }); refresh() }}
                        className="text-white/60 hover:text-[#ff5470] transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {jobApps.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {jobApps.map((a) => (
                        <div key={a.id} className="flex items-center gap-3 rounded-xl border border-white/[0.08] px-4 py-3 flex-wrap" style={{ background: 'rgba(255,255,255,.02)' }}>
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center font-bold tabular-nums shrink-0"
                            style={{ background: a.score !== null ? `${TEAL}16` : 'rgba(255,255,255,.05)', color: a.score !== null ? TEAL : 'rgba(255,255,255,.6)', fontFamily: mono }}
                          >
                            {a.score ?? '--'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-[14px] truncate">{a.candidate_name || 'Candidate'}</div>
                            <div className="text-white/80 font-medium text-[12px] truncate">{a.candidate_email}</div>
                          </div>
                          <span className="text-[10.5px] font-bold uppercase tracking-widest" style={{ color: STATUS_COLOR[a.status] }}>
                            {STATUS_LABEL[a.status]}
                          </span>
                          {a.status === 'assessed' && (
                            <div className="flex gap-2">
                              <button onClick={() => decide(a, 'accepted')} disabled={busy} className="flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold text-[#04121a] disabled:opacity-40" style={{ background: TEAL }}>
                                <Check className="w-3.5 h-3.5" /> Accept
                              </button>
                              <button onClick={() => decide(a, 'rejected')} disabled={busy} className="flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold border disabled:opacity-40" style={{ borderColor: `${RED}55`, color: RED }}>
                                <X className="w-3.5 h-3.5" /> Reject
                              </button>
                            </div>
                          )}
                          {a.status === 'accepted' && (
                            <button onClick={() => setChatApp(a)} className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold border transition hover:bg-white/5" style={{ borderColor: `${TEAL}55`, color: TEAL }}>
                              <MessageSquare className="w-3.5 h-3.5" /> Chat
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {chatApp && (
        <ChatPanel
          app={chatApp}
          isEmployer={!!isEmployer}
          call={call}
          onClose={() => setChatApp(null)}
        />
      )}
    </Shell>
  )
}

/* ═══════════════════════════ pieces ═══════════════════════════ */

function Shell({ children, onSignOut }: { children: ReactNode; onSignOut: (() => void) | null }) {
  return (
    <div className="min-h-screen text-[#eaf4fa]">
      <link rel="stylesheet" href="https://db.onlinewebfonts.com/c/8b75d9dcff6a48c35a46656192adf019?family=FSP+DEMO+-+PODIUM+Sharp+4.11" />
      <style>{`.font-podium{font-family:"FSP DEMO - PODIUM Sharp 4.11", var(--font-sans), system-ui, sans-serif;}`}</style>
      <nav className="flex items-center gap-4 px-5 sm:px-8 py-5 max-w-5xl mx-auto">
        <Link href="/" className="font-podium text-xl uppercase tracking-wider flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Judgemynt
        </Link>
        <span className="text-white/40">/</span>
        <span className="text-white font-semibold text-[13.5px]">Marketplace</span>
        <div className="ml-auto flex items-center gap-4 text-[13.5px]">
          <Link href="/employers" className="text-white font-semibold hover:text-[#00d4aa] transition">Employer console</Link>
          {onSignOut && (
            <button onClick={onSignOut} className="text-white font-semibold hover:text-[#00d4aa] transition">Sign out</button>
          )}
        </div>
      </nav>
      <main className="max-w-5xl mx-auto px-5 sm:px-8 pb-20">{children}</main>
    </div>
  )
}

function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.09] p-8 text-center" style={{ background: 'rgba(255,255,255,.02)' }}>
      <div className="font-podium text-xl uppercase">{title}</div>
      <p className="text-white font-medium mt-2 max-w-md mx-auto leading-relaxed">{children}</p>
    </div>
  )
}

function Banner({ tone, children }: { tone: 'bad' | 'ok'; children: ReactNode }) {
  const c = tone === 'bad' ? RED : TEAL
  return (
    <div className="mt-4 rounded-xl border px-4 py-2.5 text-[13.5px] font-semibold" style={{ background: `${c}0d`, borderColor: `${c}35`, color: c }}>
      {children}
    </div>
  )
}

function ChatPanel({
  app, isEmployer, call, onClose,
}: {
  app: Application
  isEmployer: boolean
  call: (body: Record<string, unknown>) => Promise<{ messages?: ChatMsg[] }>
  onClose: () => void
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const other = isEmployer ? app.candidate_name || 'Candidate' : app.company_name || 'Company'

  const load = useCallback(async () => {
    try {
      const d = await call({ action: 'messages.list', applicationId: app.id })
      setMessages(d.messages || [])
    } catch {
      /* keep the last good list; the next poll retries */
    }
  }, [app.id, call])

  useEffect(() => {
    load()
    const id = setInterval(load, 4000)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setInput('')
    try {
      const d = await call({ action: 'messages.send', applicationId: app.id, body: text })
      setMessages(d.messages || [])
    } catch {
      setInput(text)
    }
    setSending(false)
  }

  const mineKind = isEmployer ? 'employer' : 'candidate'

  return (
    <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg h-[80vh] sm:h-[70vh] rounded-t-2xl sm:rounded-2xl border flex flex-col"
        style={{ background: '#080f18', borderColor: `${TEAL}30` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/10">
          <MessageSquare className="w-4 h-4" style={{ color: TEAL }} />
          <div className="min-w-0">
            <div className="font-bold leading-tight truncate">{other}</div>
            <div className="text-white/80 font-medium text-[12px] truncate">{app.job_title || 'Application'}</div>
          </div>
          <button onClick={onClose} className="ml-auto text-white/60 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-white font-medium text-[13.5px] text-center pt-8">
              No messages yet. This thread opened when the application was accepted; say hello.
            </p>
          )}
          {messages.map((m) => {
            const mine = m.sender_kind === mineKind
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap"
                  style={
                    mine
                      ? { background: `${TEAL}18`, border: `1px solid ${TEAL}30`, borderBottomRightRadius: 6 }
                      : { background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderBottomLeftRadius: 6 }
                  }
                >
                  {m.body}
                  <div className="text-[10px] font-medium text-white/60 mt-1" style={{ fontFamily: mono }}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="border-t border-white/10 p-3">
          <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 focus-within:border-white/25 transition">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              rows={1}
              placeholder={`Message ${other}…`}
              className="flex-1 bg-transparent outline-none resize-none text-[14.5px] max-h-32 py-1"
            />
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              className="rounded-xl px-3 py-2 disabled:opacity-30 transition"
              style={{ background: `${TEAL}1a`, color: TEAL }}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
