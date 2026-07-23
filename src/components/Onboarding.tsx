'use client'
/* ════════════════════════════════════════════════════════════════════════
   Onboarding: the one question every new account answers.

   Are you here to take assessments or to give them? A candidate signs with
   their legal name, because that name goes on credentials and applications.
   An employer signs with a company name and link, because that is what a
   candidate sees before deciding to spend twenty minutes on their test.
   ════════════════════════════════════════════════════════════════════════ */
import { useState } from 'react'
import { Briefcase, UserRound, Loader2 } from 'lucide-react'

const TEAL = '#00d4aa'
const RED = '#ff5470'

export default function Onboarding({
  onSave,
  onDone,
}: {
  onSave: (fields: Record<string, string>) => Promise<{ error?: string }>
  onDone: () => void
}) {
  const [kind, setKind] = useState<'candidate' | 'employer' | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [companyUrl, setCompanyUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!kind || busy) return
    setBusy(true)
    setErr('')
    const r = await onSave(
      kind === 'candidate'
        ? { kind, first_name: firstName, last_name: lastName }
        : { kind, company_name: companyName, company_url: companyUrl }
    )
    setBusy(false)
    if (r.error) setErr(r.error)
    else onDone()
  }

  const canSubmit =
    kind === 'candidate' ? !!(firstName.trim() && lastName.trim()) : !!(companyName.trim() && companyUrl.trim())

  const input =
    'w-full bg-white/[0.04] border border-white/10 focus:border-white/30 rounded-xl px-3.5 py-2.5 outline-none transition'

  return (
    <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl border my-8 p-6 sm:p-8" style={{ background: '#080f18', borderColor: `${TEAL}30` }}>
        <div className="font-podium text-2xl uppercase leading-tight">One thing first</div>
        <p className="text-white font-medium mt-2">What brings you to Judgemynt?</p>

        <div className="grid sm:grid-cols-2 gap-2.5 mt-5">
          <button
            onClick={() => setKind('candidate')}
            className="text-left rounded-xl border p-4 transition"
            style={{
              background: kind === 'candidate' ? `${TEAL}12` : 'rgba(255,255,255,.02)',
              borderColor: kind === 'candidate' ? `${TEAL}70` : 'rgba(255,255,255,.1)',
            }}
          >
            <UserRound className="w-5 h-5" style={{ color: TEAL }} />
            <div className="font-bold mt-2">I take assessments</div>
            <div className="text-white font-medium text-[13px] mt-1">
              Earn credentials and apply to jobs in the marketplace.
            </div>
          </button>
          <button
            onClick={() => setKind('employer')}
            className="text-left rounded-xl border p-4 transition"
            style={{
              background: kind === 'employer' ? `${TEAL}12` : 'rgba(255,255,255,.02)',
              borderColor: kind === 'employer' ? `${TEAL}70` : 'rgba(255,255,255,.1)',
            }}
          >
            <Briefcase className="w-5 h-5" style={{ color: TEAL }} />
            <div className="font-bold mt-2">I give assessments</div>
            <div className="text-white font-medium text-[13px] mt-1">
              Build assessments, post jobs, and see candidate scores.
            </div>
          </button>
        </div>

        {kind === 'candidate' && (
          <div className="mt-5 space-y-3">
            <p className="text-white font-semibold text-[14px]">
              Your legal name. It goes on your credentials and your applications.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Legal first name" className={input} />
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Legal last name" className={input} />
            </div>
          </div>
        )}

        {kind === 'employer' && (
          <div className="mt-5 space-y-3">
            <p className="text-white font-semibold text-[14px]">
              Your company. Candidates see this on every job you post.
            </p>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company name" className={input} />
            <input value={companyUrl} onChange={(e) => setCompanyUrl(e.target.value)} placeholder="Company link, e.g. https://yourcompany.com" className={input} />
          </div>
        )}

        {err && (
          <div className="mt-4 rounded-xl border px-4 py-2.5 text-[13.5px] font-semibold" style={{ background: `${RED}0d`, borderColor: `${RED}40`, color: RED }}>
            {err}
          </div>
        )}

        {kind && (
          <button
            onClick={submit}
            disabled={busy || !canSubmit}
            className="mt-6 rounded-full px-7 py-3 font-bold text-[#04121a] disabled:opacity-40 hover:brightness-110 transition flex items-center gap-2"
            style={{ background: TEAL }}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Continue
          </button>
        )}
      </div>
    </div>
  )
}
