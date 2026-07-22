'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Crown, Copy, Check, RefreshCw, Send, Building2, Code2, Users } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

const TEAL = '#00d4aa'
const BLUE = '#1e90ff'

interface Result {
  candidate_name?: string
  candidate_email?: string
  score?: number
  creativity?: number
  efficiency?: number
  quality?: number
  verdict?: string
  created_at?: string
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

export default function EmployersPage() {
  const { user, isLoggedIn, signInWithGoogle, getToken, signOut } = useAuth()
  const meta = (user?.user_metadata || {}) as Record<string, string>
  const companyName = meta.company_name || ''
  const isCompany = isLoggedIn && companyName.length > 0
  const companyId = user?.id || ''

  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])

  const inviteToken = companyId ? btoa(companyId).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : ''
  const inviteLink = origin && inviteToken ? `${origin}/?invite=${inviteToken}` : ''
  const widgetSnippet = origin && companyId ? `<iframe src="${origin}/widget?c=${companyId}" width="100%" height="440" style="border:0;border-radius:16px"></iframe>` : ''

  return (
    <div className="min-h-screen bg-[#040a12] text-[#eaf4fa] font-inter">
      <link rel="stylesheet" href="https://db.onlinewebfonts.com/c/8b75d9dcff6a48c35a46656192adf019?family=FSP+DEMO+-+PODIUM+Sharp+4.11" />
      <style>{`
        .font-podium{font-family:"FSP DEMO - PODIUM Sharp 4.11", var(--font-sans), system-ui, sans-serif;}
        .font-inter{font-family:var(--font-sans), Inter, system-ui, sans-serif;}
      `}</style>

      <nav className="flex items-center justify-between px-6 sm:px-10 py-5 border-b border-white/5">
        <Link href="/" className="font-podium text-xl font-bold uppercase tracking-wider text-white">
          Judgemynt
        </Link>
        <span className="text-[11px] uppercase tracking-widest text-white/50">For Employers</span>
      </nav>

      <div className="max-w-4xl mx-auto px-6 sm:px-10 py-12 pb-24">
        <div className="text-xs uppercase tracking-[0.3em]" style={{ color: TEAL }}>For Employers</div>
        <h1 className="font-podium text-[clamp(2.2rem,6vw,4.2rem)] uppercase leading-[0.95] mt-3">
          Hire people who can
          <br />
          actually use AI.
        </h1>
        <p className="text-white/60 max-w-xl mt-4 text-sm sm:text-base">
          Send candidates a real, timed AI-judgment exam. Get back a verified score, creativity, efficiency, and quality,
          and watch it land on your hiring page automatically.
        </p>

        {!isCompany ? (
          <CompanyGate isLoggedIn={isLoggedIn} onGoogle={signInWithGoogle} suggested={meta.company_name || meta.name || ''} />
        ) : (
          <Dashboard
            companyName={companyName}
            inviteLink={inviteLink}
            widgetSnippet={widgetSnippet}
            origin={origin}
            companyId={companyId}
            getToken={getToken}
            onSignOut={signOut}
          />
        )}

        <ContactForm defaultCompany={companyName} defaultEmail={user?.email || ''} />
      </div>
    </div>
  )
}

function CompanyGate({ isLoggedIn, onGoogle, suggested }: { isLoggedIn: boolean; onGoogle: () => void; suggested: string }) {
  const [name, setName] = useState(suggested)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  if (!isLoggedIn) {
    return (
      <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center max-w-md">
        <Building2 className="w-9 h-9 mx-auto" style={{ color: TEAL }} />
        <div className="font-podium text-xl uppercase mt-3">Employers only</div>
        <p className="text-white/55 text-sm mt-2">Sign in to set up your company and start issuing assessments.</p>
        <button onClick={onGoogle} className="mt-5 w-full rounded-xl py-3 font-semibold text-sm bg-white text-[#1f2937] flex items-center justify-center gap-2">
          <GoogleMark /> Continue with Google
        </button>
      </div>
    )
  }

  return (
    <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-8 max-w-md">
      <div className="font-podium text-xl uppercase">Set up your company</div>
      <p className="text-white/55 text-sm mt-1">This name appears to candidates and on your dashboard.</p>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Company name" className="mt-4 w-full bg-white/[0.04] border border-white/10 focus:border-white/30 rounded-xl px-3 py-2.5 text-sm outline-none" />
      {err && <div className="text-[#ff5470] text-xs mt-2">{err}</div>}
      <button
        onClick={async () => {
          if (name.trim().length < 2) { setErr('Enter your company name.'); return }
          if (!supabase) { setErr('Auth not configured.'); return }
          setSaving(true); setErr('')
          const { error } = await supabase.auth.updateUser({ data: { company_name: name.trim(), account_type: 'company' } })
          setSaving(false)
          if (error) setErr(error.message)
          else window.location.reload()
        }}
        disabled={saving}
        className="mt-4 w-full rounded-xl py-3 font-semibold text-sm text-[#06121f] disabled:opacity-60"
        style={{ background: `linear-gradient(110deg, ${TEAL}, ${BLUE})` }}
      >
        {saving ? 'Saving…' : 'Create company account'}
      </button>
    </div>
  )
}

function CopyRow({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-stretch gap-2 mt-3">
      <code className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white/70 overflow-x-auto whitespace-nowrap">{value || '…'}</code>
      <button
        onClick={() => { if (value) { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) } }}
        className="rounded-xl px-3 flex items-center gap-1.5 text-sm font-semibold text-[#06121f]"
        style={{ background: TEAL }}
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  )
}

function Dashboard({
  companyName, inviteLink, widgetSnippet, origin, companyId, getToken, onSignOut,
}: {
  companyName: string
  inviteLink: string
  widgetSnippet: string
  origin: string
  companyId: string
  getToken: () => Promise<string | null>
  onSignOut: () => void
}) {
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/enterprise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
        body: JSON.stringify({ action: 'list' }),
      })
      const d = await res.json()
      setResults(d.results || [])
    } catch { /* ignore */ }
    setLoading(false)
  }
  useEffect(() => { refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const card = 'rounded-2xl border border-white/10 bg-white/[0.03] p-6 mt-6'

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/50">Signed in as <span className="text-white">{companyName}</span></span>
        <button onClick={onSignOut} className="text-white/40 hover:text-white">Sign out</button>
      </div>

      {/* Issue an assessment */}
      <div className={card}>
        <div className="flex items-center gap-2 text-sm font-semibold"><Users className="w-4 h-4" style={{ color: TEAL }} /> Issue an assessment</div>
        <p className="text-white/55 text-sm mt-1">Send this link to anyone applying. They take the exam; their score lands in your dashboard and widget automatically.</p>
        <CopyRow value={inviteLink} label="invite link" />
      </div>

      {/* Results */}
      <div className={card}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold"><Building2 className="w-4 h-4" style={{ color: TEAL }} /> Candidate results</div>
          <button onClick={refresh} className="text-white/50 hover:text-white text-xs flex items-center gap-1"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
        </div>
        {results.length === 0 ? (
          <p className="text-white/45 text-sm mt-3">No candidates yet. Share your invite link above, results appear here automatically.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/40 text-[11px] uppercase tracking-wider">
                  <th className="text-left font-medium pb-2">Candidate</th>
                  <th className="text-right font-medium pb-2">Score</th>
                  <th className="text-right font-medium pb-2 hidden sm:table-cell">Crea</th>
                  <th className="text-right font-medium pb-2 hidden sm:table-cell">Eff</th>
                  <th className="text-right font-medium pb-2 hidden sm:table-cell">Qual</th>
                  <th className="text-left font-medium pb-2 pl-3">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="py-2.5 pr-2">{r.candidate_name || 'Anonymous'}</td>
                    <td className="py-2.5 text-right font-bold" style={{ color: TEAL }}>{r.score ?? '--'}</td>
                    <td className="py-2.5 text-right text-white/60 hidden sm:table-cell">{r.creativity ?? '--'}</td>
                    <td className="py-2.5 text-right text-white/60 hidden sm:table-cell">{r.efficiency ?? '--'}</td>
                    <td className="py-2.5 text-right text-white/60 hidden sm:table-cell">{r.quality ?? '--'}</td>
                    <td className="py-2.5 pl-3 text-white/55">{r.verdict || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Widget */}
      <div className={card}>
        <div className="flex items-center gap-2 text-sm font-semibold"><Code2 className="w-4 h-4" style={{ color: TEAL }} /> Embed the scoreboard</div>
        <p className="text-white/55 text-sm mt-1">Paste this on your careers or hiring page, candidate scores update live.</p>
        <CopyRow value={widgetSnippet} label="embed code" />
        {origin && companyId && (
          <div className="mt-4">
            <div className="text-[11px] uppercase tracking-widest text-white/40 mb-2">Live preview</div>
            <iframe src={`${origin}/widget?c=${companyId}`} width="100%" height="320" style={{ border: 0, borderRadius: 16 }} title="Judgemynt widget preview" />
          </div>
        )}
      </div>
    </div>
  )
}

function ContactForm({ defaultCompany, defaultEmail }: { defaultCompany: string; defaultEmail: string }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState(defaultEmail)
  const [company, setCompany] = useState(defaultCompany)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { setEmail((e) => e || defaultEmail); setCompany((c) => c || defaultCompany) }, [defaultEmail, defaultCompany])

  return (
    <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
      <div className="text-xs uppercase tracking-[0.3em]" style={{ color: TEAL }}>Talk to us</div>
      <div className="font-podium text-2xl uppercase mt-2">Hiring at scale?</div>
      <p className="text-white/55 text-sm mt-1">Custom roles, bulk seats, ATS integration, tell us what you need.</p>

      {sent ? (
        <div className="mt-5 rounded-xl px-4 py-4 text-sm" style={{ background: 'rgba(0,212,170,.08)', border: `1px solid ${TEAL}40`, color: '#aef0e0' }}>
          Got it, we&apos;ll get back to you shortly.
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-3 mt-5">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="bg-white/[0.04] border border-white/10 focus:border-white/30 rounded-xl px-3 py-2.5 text-sm outline-none" />
            <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" className="bg-white/[0.04] border border-white/10 focus:border-white/30 rounded-xl px-3 py-2.5 text-sm outline-none" />
          </div>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Work email" className="mt-3 w-full bg-white/[0.04] border border-white/10 focus:border-white/30 rounded-xl px-3 py-2.5 text-sm outline-none" />
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What are you hiring for?" rows={4} className="mt-3 w-full bg-white/[0.04] border border-white/10 focus:border-white/30 rounded-xl px-3 py-2.5 text-sm outline-none resize-y" />
          {err && <div className="text-[#ff5470] text-xs mt-2">{err}</div>}
          <button
            onClick={async () => {
              if (!email.trim() || !message.trim()) { setErr('Add your email and a message.'); return }
              setSending(true); setErr('')
              try {
                const res = await fetch('/api/contact', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name, email, company, message }),
                })
                const d = await res.json()
                if (!res.ok) setErr(d.error || 'Could not send.')
                else setSent(true)
              } catch { setErr('Network error.') }
              setSending(false)
            }}
            disabled={sending}
            className="mt-4 flex items-center gap-2 rounded-xl px-6 py-3 font-semibold text-sm text-[#06121f] disabled:opacity-60"
            style={{ background: `linear-gradient(110deg, ${TEAL}, ${BLUE})` }}
          >
            <Send className="w-4 h-4" /> {sending ? 'Sending…' : 'Send'}
          </button>
        </>
      )}
    </div>
  )
}
