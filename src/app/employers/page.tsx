'use client'
/* ════════════════════════════════════════════════════════════════════════
   Employer console.

   The whole pitch of the paid side is on this page: a company does not buy a
   generic assessment, they build one out of their own documents. So the role
   builder is the centre of the screen, not a settings sub-page — adding your
   real refund policy has to feel like the main thing you came to do.
   ════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  Plus, Trash2, Copy, Check, X, FileText, Loader2, ChevronLeft, ChevronDown,
  Link2, Users, SlidersHorizontal, Eye, AlertTriangle,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

const TEAL = '#00d4aa'
const RED = '#ff5470'
const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

interface Dimension { id: string; label: string; weight: number; prompt: string }
interface Rubric { dimensions: Dimension[]; passMark: number; useTraps: boolean; houseRules?: string }
interface Doc { id: string; title: string; kind: string; body: string }
interface PresetTask {
  id: string; title: string; role: string; roleEmoji: string; color: string
  tagline: string; difficulty: string; docs: { id: string; title: string; kind: string }[]
  budget: { tokens: number; seconds: number }
}
interface Role {
  id?: string
  name: string
  kind: 'preset' | 'custom'
  task_id: string | null
  brief: string | null
  deliverable: string | null
  docs: Doc[]
  requirements: string[]
  budget_tokens: number
  budget_seconds: number
  rubric: Rubric
  active: boolean
  invite?: string
}
interface Result {
  id: string
  candidate_name: string | null
  candidate_email: string | null
  score: number | null
  verdict: string | null
  role_name: string | null
  passed: boolean | null
  pass_mark: number | null
  dimensions: Record<string, number> | null
  traps: { id: string; name: string; resolved: boolean; note: string }[] | null
  signals: { notes?: string[] } | null
  analysis: string | null
  hire: string | null
  tokens_used: number | null
  seconds_used: number | null
  model: string | null
  ended_by: string | null
  transcript: { role: string; content: string }[] | null
  created_at: string
}

const KINDS = ['policy', 'data', 'spec', 'thread', 'log']

export default function Employers() {
  const { user, signInWithGoogle, signOut, getToken, isLoggedIn, loading } = useAuth()
  const [tab, setTab] = useState<'roles' | 'results'>('roles')
  const [presets, setPresets] = useState<PresetTask[]>([])
  const [library, setLibrary] = useState<Dimension[]>([])
  const [defaultRubric, setDefaultRubric] = useState<Rubric | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [editing, setEditing] = useState<Role | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const [openResult, setOpenResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState('')

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const companyId = user?.id || ''

  const call = useCallback(
    async (body: Record<string, unknown>) => {
      const token = await getToken()
      const res = await fetch('/api/company', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Request failed')
      return d
    },
    [getToken]
  )

  // Options are public, so they load whether or not anyone is signed in.
  useEffect(() => {
    fetch('/api/company', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'options' }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.tasks)) setPresets(d.tasks)
        if (Array.isArray(d?.dimensions)) setLibrary(d.dimensions)
        if (d?.defaultRubric) setDefaultRubric(d.defaultRubric)
      })
      .catch(() => {})
  }, [])

  const refresh = useCallback(async () => {
    if (!isLoggedIn) return
    setBusy(true)
    setErr('')
    try {
      const [r, s] = await Promise.all([call({ action: 'roles.list' }), call({ action: 'results.list' })])
      setRoles(r.roles || [])
      setResults(s.results || [])
    } catch (e) {
      setErr((e as Error).message)
    }
    setBusy(false)
  }, [call, isLoggedIn])

  useEffect(() => {
    refresh()
  }, [refresh])

  function blankRole(): Role {
    return {
      name: '',
      kind: 'preset',
      task_id: presets[0]?.id || 'slugify',
      brief: null,
      deliverable: null,
      docs: [],
      requirements: [],
      budget_tokens: 10000,
      budget_seconds: 1200,
      rubric: defaultRubric || { dimensions: library.slice(0, 4), passMark: 70, useTraps: true },
      active: true,
    }
  }

  async function saveRole() {
    if (!editing) return
    setBusy(true)
    setErr('')
    try {
      await call({ action: 'roles.save', id: editing.id, role: editing })
      setEditing(null)
      await refresh()
    } catch (e) {
      setErr((e as Error).message)
    }
    setBusy(false)
  }

  async function removeRole(id: string) {
    setBusy(true)
    try {
      await call({ action: 'roles.delete', id })
      await refresh()
    } catch (e) {
      setErr((e as Error).message)
    }
    setBusy(false)
  }

  function copy(text: string, tag: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(tag)
      setTimeout(() => setCopied(''), 1600)
    })
  }

  /* ── signed out ─────────────────────────────────────────────────────── */
  if (!loading && !isLoggedIn) {
    return (
      <Shell>
        <div className="max-w-md mx-auto text-center pt-24">
          <div className="font-podium text-3xl uppercase">Employers only</div>
          <p className="text-white font-medium mt-3 leading-relaxed">
            Sign in to build an assessment out of your own documents, send it to candidates, and
            read what came back.
          </p>
          <button
            onClick={async () => {
              setErr('')
              const r = await signInWithGoogle()
              if (r?.error) setErr(r.error)
            }}
            className="mt-6 rounded-full px-7 py-3.5 font-semibold text-[#04121a] hover:brightness-110 transition"
            style={{ background: TEAL }}
          >
            Sign in with Google
          </button>
          {err && <Banner tone="bad">{err}</Banner>}
          <div className="mt-10 text-white font-medium text-sm">
            Not hiring?{' '}
            <Link href="/" className="underline hover:text-[#00d4aa]">
              Take an assessment instead
            </Link>
          </div>
        </div>
      </Shell>
    )
  }

  /* ── role editor ────────────────────────────────────────────────────── */
  if (editing) {
    const preset = presets.find((p) => p.id === editing.task_id)
    return (
      <Shell>
        <button onClick={() => setEditing(null)} className="flex items-center gap-1 text-white font-semibold text-sm hover:text-[#00d4aa] transition">
          <ChevronLeft className="w-4 h-4" /> All roles
        </button>

        <h1 className="font-podium text-[clamp(1.8rem,5vw,3rem)] uppercase mt-5">
          {editing.id ? 'Edit role' : 'New role'}
        </h1>

        {err && <Banner tone="bad">{err}</Banner>}

        <Field label="Role name" hint="What the candidate sees at the top of their assessment.">
          <input
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="Support Specialist, final round"
            className="w-full bg-white/[0.04] border border-white/10 focus:border-white/30 rounded-xl px-3.5 py-2.5 outline-none transition"
          />
        </Field>

        <Field label="Task" hint="Start from a built-in task, or write your own from scratch.">
          <div className="flex gap-2 mb-3">
            {(['preset', 'custom'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setEditing({ ...editing, kind: k })}
                className="rounded-full px-4 py-1.5 text-[13px] border transition"
                style={{
                  background: editing.kind === k ? `${TEAL}18` : 'transparent',
                  borderColor: editing.kind === k ? `${TEAL}55` : 'rgba(255,255,255,.12)',
                  color: editing.kind === k ? TEAL : 'rgba(255,255,255,.6)',
                }}
              >
                {k === 'preset' ? 'Built-in task' : 'Write my own'}
              </button>
            ))}
          </div>

          {editing.kind === 'preset' ? (
            <div className="grid sm:grid-cols-2 gap-2">
              {presets.map((t) => (
                <button
                  key={t.id}
                  onClick={() =>
                    setEditing({
                      ...editing,
                      task_id: t.id,
                      budget_tokens: t.budget.tokens,
                      budget_seconds: t.budget.seconds,
                    })
                  }
                  className="text-left rounded-xl border p-3.5 transition"
                  style={{
                    background: editing.task_id === t.id ? `${t.color}12` : 'rgba(255,255,255,.02)',
                    borderColor: editing.task_id === t.id ? `${t.color}60` : 'rgba(255,255,255,.09)',
                  }}
                >
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest" style={{ color: t.color }}>
                    <span>{t.roleEmoji}</span> {t.role}
                  </div>
                  <div className="text-[14px] font-medium mt-2 leading-snug">{t.title}</div>
                  <div className="text-white/80 text-[12px] font-medium mt-1">{t.docs.length} built-in documents</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <textarea
                value={editing.brief || ''}
                onChange={(e) => setEditing({ ...editing, brief: e.target.value })}
                rows={5}
                placeholder="What is the candidate being asked to do? Write it as you would brief a new hire. The AI they direct sees this too."
                className="w-full bg-white/[0.04] border border-white/10 focus:border-white/30 rounded-xl px-3.5 py-2.5 outline-none resize-y transition"
              />
              <input
                value={editing.deliverable || ''}
                onChange={(e) => setEditing({ ...editing, deliverable: e.target.value })}
                placeholder="What must they hand in? e.g. 'The final customer email, ready to send.'"
                className="w-full bg-white/[0.04] border border-white/10 focus:border-white/30 rounded-xl px-3.5 py-2.5 outline-none transition"
              />
            </div>
          )}
        </Field>

        {editing.kind === 'preset' && preset && (
          <Field label="Override the brief" hint="Optional. Leave empty to use the built-in wording.">
            <textarea
              value={editing.brief || ''}
              onChange={(e) => setEditing({ ...editing, brief: e.target.value || null })}
              rows={3}
              placeholder={preset.title}
              className="w-full bg-white/[0.04] border border-white/10 focus:border-white/30 rounded-xl px-3.5 py-2.5 outline-none resize-y transition text-[14px]"
            />
          </Field>
        )}

        {/* the differentiator */}
        <Field
          label="Your context documents"
          hint="This is the part that makes the assessment yours. Paste in your real policy, SLA, brand rules, or data. The candidate can read these; the AI cannot, unless they tell it."
        >
          {editing.kind === 'preset' && preset && preset.docs.length > 0 && (
            <div className="mb-3 rounded-xl border border-white/[0.08] p-3 bg-white/[0.02]">
              <div className="text-[11px] font-bold uppercase tracking-widest text-white mb-2">
                Built in to this task, kept automatically
              </div>
              <div className="flex flex-wrap gap-1.5">
                {preset.docs.map((d) => (
                  <span key={d.id} className="text-[11.5px] font-medium px-2 py-1 rounded-full bg-white/[0.05] text-white">
                    {d.title}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            {editing.docs.map((d, i) => (
              <div key={i} className="rounded-xl border border-white/10 p-3.5 bg-white/[0.02]">
                <div className="flex gap-2 items-center">
                  <FileText className="w-4 h-4 text-white/30 shrink-0" />
                  <input
                    value={d.title}
                    onChange={(e) => {
                      const docs = [...editing.docs]
                      docs[i] = { ...d, title: e.target.value }
                      setEditing({ ...editing, docs })
                    }}
                    placeholder="Document title, e.g. 'Refund policy (internal)'"
                    className="flex-1 bg-transparent outline-none text-[14px]"
                  />
                  <select
                    value={d.kind}
                    onChange={(e) => {
                      const docs = [...editing.docs]
                      docs[i] = { ...d, kind: e.target.value }
                      setEditing({ ...editing, docs })
                    }}
                    className="bg-white/[0.05] border border-white/10 rounded-lg px-2 py-1 text-[12px] outline-none"
                    style={{ fontFamily: mono }}
                  >
                    {KINDS.map((k) => (
                      <option key={k} value={k} style={{ background: '#0b1420' }}>
                        {k}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setEditing({ ...editing, docs: editing.docs.filter((_, j) => j !== i) })}
                    className="text-white/30 hover:text-[#ff5470] transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <textarea
                  value={d.body}
                  onChange={(e) => {
                    const docs = [...editing.docs]
                    docs[i] = { ...d, body: e.target.value }
                    setEditing({ ...editing, docs })
                  }}
                  rows={5}
                  placeholder="Paste the document. Anything the candidate should be able to look up, and anything that changes what the right answer is."
                  className="w-full mt-2.5 bg-black/25 border border-white/[0.07] rounded-lg px-3 py-2 outline-none resize-y text-[13px] leading-relaxed"
                  style={{ fontFamily: mono }}
                />
              </div>
            ))}
          </div>

          <button
            onClick={() =>
              setEditing({
                ...editing,
                docs: [...editing.docs, { id: `doc-${Date.now()}`, title: '', kind: 'policy', body: '' }],
              })
            }
            className="mt-2.5 flex items-center gap-1.5 text-[13.5px] rounded-full px-4 py-2 border border-white/15 hover:bg-white/5 transition"
          >
            <Plus className="w-3.5 h-3.5" /> Add a document
          </button>
        </Field>

        <Field label="Extra requirements" hint="Objective things the deliverable must do. Checked one by one when scoring Quality.">
          <div className="space-y-2">
            {editing.requirements.map((r, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={r}
                  onChange={(e) => {
                    const reqs = [...editing.requirements]
                    reqs[i] = e.target.value
                    setEditing({ ...editing, requirements: reqs })
                  }}
                  placeholder="e.g. mentions the customer by name"
                  className="flex-1 bg-white/[0.04] border border-white/10 focus:border-white/30 rounded-xl px-3.5 py-2 outline-none text-[14px] transition"
                />
                <button
                  onClick={() => setEditing({ ...editing, requirements: editing.requirements.filter((_, j) => j !== i) })}
                  className="text-white/30 hover:text-[#ff5470] transition px-2"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setEditing({ ...editing, requirements: [...editing.requirements, ''] })}
            className="mt-2 flex items-center gap-1.5 text-[13.5px] rounded-full px-4 py-2 border border-white/15 hover:bg-white/5 transition"
          >
            <Plus className="w-3.5 h-3.5" /> Add requirement
          </button>
        </Field>

        <Field label="Budget" hint="How much AI they get, and how long. Tighter budgets test prioritisation; looser ones test depth.">
          <div className="grid sm:grid-cols-2 gap-3">
            <Num
              label="Tokens"
              value={editing.budget_tokens}
              min={2000}
              max={60000}
              step={1000}
              onChange={(v) => setEditing({ ...editing, budget_tokens: v })}
            />
            <Num
              label="Minutes"
              value={Math.round(editing.budget_seconds / 60)}
              min={5}
              max={120}
              step={5}
              onChange={(v) => setEditing({ ...editing, budget_seconds: v * 60 })}
            />
          </div>
        </Field>

        <Field label="Rubric" hint="What you actually care about. Weights are relative: 3 and 1 means the first counts three times as much.">
          <div className="space-y-2.5">
            {editing.rubric.dimensions.map((d, i) => (
              <div key={d.id} className="flex items-center gap-3 rounded-xl border border-white/10 p-3 bg-white/[0.02]">
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold">{d.label}</div>
                  <div className="text-white/80 text-[12.5px] font-medium mt-0.5 line-clamp-2">{d.prompt}</div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={5}
                  step={1}
                  value={d.weight}
                  onChange={(e) => {
                    const dims = [...editing.rubric.dimensions]
                    dims[i] = { ...d, weight: Number(e.target.value) }
                    setEditing({ ...editing, rubric: { ...editing.rubric, dimensions: dims } })
                  }}
                  className="w-28 accent-[#00d4aa]"
                />
                <span className="w-6 text-right tabular-nums text-[13px]" style={{ fontFamily: mono, color: d.weight ? TEAL : 'rgba(255,255,255,.25)' }}>
                  {d.weight}
                </span>
                <button
                  onClick={() =>
                    setEditing({
                      ...editing,
                      rubric: { ...editing.rubric, dimensions: editing.rubric.dimensions.filter((_, j) => j !== i) },
                    })
                  }
                  className="text-white/25 hover:text-[#ff5470] transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {library.filter((l) => !editing.rubric.dimensions.some((d) => d.id === l.id)).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {library
                .filter((l) => !editing.rubric.dimensions.some((d) => d.id === l.id))
                .map((l) => (
                  <button
                    key={l.id}
                    onClick={() =>
                      setEditing({
                        ...editing,
                        rubric: { ...editing.rubric, dimensions: [...editing.rubric.dimensions, l] },
                      })
                    }
                    className="flex items-center gap-1.5 text-[13px] rounded-full px-3.5 py-1.5 border border-white/15 hover:bg-white/5 transition"
                  >
                    <Plus className="w-3 h-3" /> {l.label}
                  </button>
                ))}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            <Num
              label="Pass mark"
              value={editing.rubric.passMark}
              min={0}
              max={100}
              step={5}
              onChange={(v) => setEditing({ ...editing, rubric: { ...editing.rubric, passMark: v } })}
            />
            <label className="flex items-center gap-2.5 rounded-xl border border-white/10 px-3.5 py-2.5 bg-white/[0.02] cursor-pointer">
              <input
                type="checkbox"
                checked={editing.rubric.useTraps}
                onChange={(e) => setEditing({ ...editing, rubric: { ...editing.rubric, useTraps: e.target.checked } })}
                className="accent-[#00d4aa]"
              />
              <span className="text-[13.5px]">Report hidden traps</span>
            </label>
          </div>

          <textarea
            value={editing.rubric.houseRules || ''}
            onChange={(e) => setEditing({ ...editing, rubric: { ...editing.rubric, houseRules: e.target.value } })}
            rows={3}
            placeholder="House rules for the examiner. e.g. 'We hire for bluntness. Do not reward hedging.' These override our defaults where they conflict."
            className="w-full mt-3 bg-white/[0.04] border border-white/10 focus:border-white/30 rounded-xl px-3.5 py-2.5 outline-none resize-y text-[14px] transition"
          />
        </Field>

        <div className="flex gap-3 mt-8 mb-16">
          <button
            onClick={saveRole}
            disabled={busy || !editing.name.trim()}
            className="rounded-full px-7 py-3 font-bold text-[#04121a] disabled:opacity-40 hover:brightness-110 transition"
            style={{ background: TEAL }}
          >
            {busy ? 'Saving…' : 'Save role'}
          </button>
          <button onClick={() => setEditing(null)} className="rounded-full px-6 py-3 border border-white/15 hover:bg-white/5 transition">
            Cancel
          </button>
          {!editing.name.trim() && (
            <span className="self-center text-[13.5px] font-semibold text-white">
              Name the role at the top to enable Save.
            </span>
          )}
        </div>
      </Shell>
    )
  }

  /* ── console ────────────────────────────────────────────────────────── */
  return (
    <Shell>
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-podium text-[clamp(1.8rem,5vw,3rem)] uppercase">Your assessments</h1>
        <button onClick={signOut} className="ml-auto text-white font-semibold hover:text-[#00d4aa] text-[13.5px] transition">
          Sign out
        </button>
      </div>

      <div className="flex gap-2 mt-6">
        {(['roles', 'results'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[13.5px] border transition"
            style={{
              background: tab === t ? `${TEAL}18` : 'transparent',
              borderColor: tab === t ? `${TEAL}55` : 'rgba(255,255,255,.12)',
              color: tab === t ? TEAL : 'rgba(255,255,255,.6)',
            }}
          >
            {t === 'roles' ? <SlidersHorizontal className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
            {t === 'roles' ? `Roles (${roles.length})` : `Candidates (${results.length})`}
          </button>
        ))}
        {busy && <Loader2 className="w-4 h-4 animate-spin text-white/30 self-center ml-2" />}
      </div>

      {err && <Banner tone="bad">{err}</Banner>}

      {tab === 'roles' && (
        <>
          <button
            onClick={() => setEditing(blankRole())}
            className="mt-6 flex items-center gap-2 rounded-full px-5 py-2.5 font-bold text-[#04121a] transition hover:brightness-110"
            style={{ background: TEAL }}
          >
            <Plus className="w-4 h-4" /> New role
          </button>

          {roles.length === 0 && !busy && (
            <div className="mt-8 rounded-2xl border border-white/[0.09] p-8 text-center" style={{ background: 'rgba(255,255,255,.02)' }}>
              <div className="font-podium text-xl uppercase">No roles yet</div>
              <p className="text-white font-medium mt-2 max-w-md mx-auto leading-relaxed">
                A role is one assessment: a task, your documents, your rubric, and a link you send.
                Start from a built-in task and paste one of your real policies into it.
              </p>
            </div>
          )}

          <div className="mt-5 space-y-3">
            {roles.map((r) => {
              const link = `${origin}/?invite=${r.invite}`
              return (
                <div key={r.id} className="rounded-2xl border border-white/[0.09] p-5" style={{ background: 'rgba(255,255,255,.02)' }}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="font-podium text-lg uppercase">{r.name}</div>
                    <span className="text-[11px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/[0.06] text-white/45">
                      {r.kind === 'custom' ? 'custom task' : r.task_id}
                    </span>
                    {!r.active && (
                      <span className="text-[11px] uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: `${RED}18`, color: RED }}>
                        paused
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      <button onClick={() => setEditing(r)} className="text-[13px] text-white/50 hover:text-white transition">
                        Edit
                      </button>
                      <button onClick={() => r.id && removeRole(r.id)} className="text-white/25 hover:text-[#ff5470] transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-2.5 text-[12px] text-white/80" style={{ fontFamily: mono }}>
                    <span>{r.docs.length} own docs</span>
                    <span>{(r.budget_tokens / 1000).toFixed(0)}k tokens</span>
                    <span>{Math.round(r.budget_seconds / 60)}m</span>
                    <span>pass {r.rubric?.passMark ?? 70}</span>
                  </div>

                  <div className="flex items-center gap-2 mt-3.5 rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                    <Link2 className="w-3.5 h-3.5 text-white/30 shrink-0" />
                    <span className="flex-1 truncate text-[12.5px] text-white/55" style={{ fontFamily: mono }}>
                      {link}
                    </span>
                    <button onClick={() => copy(link, r.id || '')} className="shrink-0 text-white/40 hover:text-white transition">
                      {copied === r.id ? <Check className="w-4 h-4" style={{ color: TEAL }} /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {companyId && (
            <div className="mt-10 rounded-2xl border border-white/[0.09] p-5" style={{ background: 'rgba(255,255,255,.02)' }}>
              <div className="text-[11px] font-bold uppercase tracking-widest text-white mb-2">Embed your scoreboard</div>
              <p className="text-white font-medium text-[14px] mb-3">
                Drop this on your careers page. Shows first names and scores only.
              </p>
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                <span className="flex-1 truncate text-[12px] text-white/50" style={{ fontFamily: mono }}>
                  {`<iframe src="${origin}/widget?c=${companyId}" width="100%" height="320" style="border:0;border-radius:16px"></iframe>`}
                </span>
                <button
                  onClick={() =>
                    copy(
                      `<iframe src="${origin}/widget?c=${companyId}" width="100%" height="320" style="border:0;border-radius:16px"></iframe>`,
                      'embed'
                    )
                  }
                  className="shrink-0 text-white/40 hover:text-white transition"
                >
                  {copied === 'embed' ? <Check className="w-4 h-4" style={{ color: TEAL }} /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'results' && (
        <div className="mt-6">
          {results.length === 0 && !busy && (
            <div className="rounded-2xl border border-white/[0.09] p-8 text-center" style={{ background: 'rgba(255,255,255,.02)' }}>
              <div className="font-podium text-xl uppercase">Nothing back yet</div>
              <p className="text-white font-medium mt-2">Send a role link to a candidate and their session lands here.</p>
            </div>
          )}
          <div className="space-y-2">
            {results.map((r) => (
              <button
                key={r.id}
                onClick={() => setOpenResult(r)}
                className="w-full text-left rounded-xl border border-white/[0.09] p-4 hover:bg-white/[0.03] transition flex items-center gap-4"
                style={{ background: 'rgba(255,255,255,.02)' }}
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center font-bold tabular-nums shrink-0"
                  style={{
                    background: r.passed ? `${TEAL}16` : `${RED}14`,
                    color: r.passed ? TEAL : RED,
                    fontFamily: mono,
                  }}
                >
                  {r.score ?? '--'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14.5px] font-semibold truncate">{r.candidate_name || r.candidate_email || 'Anonymous'}</div>
                  <div className="text-white/80 font-medium text-[12.5px] truncate">
                    {r.role_name || 'Assessment'} · {r.verdict || '--'}
                  </div>
                </div>
                <div className="text-white/70 text-[11.5px] shrink-0 hidden sm:block" style={{ fontFamily: mono }}>
                  {new Date(r.created_at).toLocaleDateString()}
                </div>
                <Eye className="w-4 h-4 text-white/25 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {openResult && <ResultModal r={openResult} onClose={() => setOpenResult(null)} />}
    </Shell>
  )
}

/* ═══════════════════════════ pieces ═══════════════════════════ */

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen text-[#eaf4fa]">
      <link rel="stylesheet" href="https://db.onlinewebfonts.com/c/8b75d9dcff6a48c35a46656192adf019?family=FSP+DEMO+-+PODIUM+Sharp+4.11" />
      <style>{`.font-podium{font-family:"FSP DEMO - PODIUM Sharp 4.11", var(--font-sans), system-ui, sans-serif;}`}</style>
      <nav className="flex items-center gap-4 px-5 sm:px-8 py-5 max-w-5xl mx-auto">
        <Link href="/" className="font-podium text-xl uppercase tracking-wider">
          Judgemynt
        </Link>
        <span className="text-white/40">/</span>
        <span className="text-white font-semibold text-[13.5px]">Employers</span>
      </nav>
      <main className="max-w-5xl mx-auto px-5 sm:px-8 pb-20">{children}</main>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mt-8">
      <div className="text-[11px] font-bold uppercase tracking-widest text-white">{label}</div>
      {hint && <p className="text-white font-medium text-[14px] mt-1 mb-3 leading-relaxed max-w-2xl">{hint}</p>}
      <div className={hint ? '' : 'mt-3'}>{children}</div>
    </div>
  )
}

function Num({
  label, value, min, max, step, onChange,
}: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="rounded-xl border border-white/10 px-3.5 py-2.5 bg-white/[0.02] flex items-center gap-3">
      <span className="text-[13px] text-white/50 shrink-0">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className="flex-1 min-w-0 bg-transparent outline-none text-right tabular-nums"
        style={{ fontFamily: mono }}
      />
    </label>
  )
}

function Banner({ tone, children }: { tone: 'bad' | 'ok'; children: ReactNode }) {
  const c = tone === 'bad' ? RED : TEAL
  return (
    <div className="mt-4 rounded-xl border px-4 py-2.5 text-[13.5px] flex items-center gap-2" style={{ background: `${c}0d`, borderColor: `${c}35`, color: c }}>
      <AlertTriangle className="w-4 h-4 shrink-0" /> {children}
    </div>
  )
}

function ResultModal({ r, onClose }: { r: Result; onClose: () => void }) {
  const [showTranscript, setShowTranscript] = useState(false)
  const dims = useMemo(() => Object.entries(r.dimensions || {}), [r.dimensions])

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl border my-8"
        style={{ background: '#080f18', borderColor: 'rgba(255,255,255,.12)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg tabular-nums"
            style={{ background: r.passed ? `${TEAL}16` : `${RED}14`, color: r.passed ? TEAL : RED, fontFamily: mono }}
          >
            {r.score ?? '--'}
          </div>
          <div className="min-w-0">
            <div className="font-semibold leading-tight truncate">{r.candidate_name || 'Anonymous'}</div>
            <div className="text-white/80 font-medium text-[12.5px] truncate">
              {r.candidate_email} · {r.role_name || 'Assessment'}
            </div>
          </div>
          <button onClick={onClose} className="ml-auto text-white/40 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-6">
          <div className="flex items-center gap-3 flex-wrap text-[12px] text-white/80" style={{ fontFamily: mono }}>
            <span>{r.verdict}</span>
            {r.model && <span>· {r.model}</span>}
            {r.tokens_used !== null && <span>· {r.tokens_used} tokens</span>}
            {r.seconds_used !== null && <span>· {Math.round((r.seconds_used || 0) / 60)}m</span>}
            {r.ended_by && r.ended_by !== 'submit' && <span style={{ color: RED }}>· ran out of {r.ended_by}</span>}
          </div>

          {dims.length > 0 && (
            <div className="space-y-2.5">
              {dims.map(([k, v]) => (
                <div key={k}>
                  <div className="flex justify-between text-[12.5px] mb-1">
                    <span className="text-white font-semibold capitalize">{k}</span>
                    <span className="tabular-nums text-white font-semibold" style={{ fontFamily: mono }}>{v}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${v}%`, background: v >= 70 ? TEAL : v >= 45 ? '#f59e0b' : RED }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!!r.traps?.length && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-widest text-white mb-2.5">What they caught</div>
              <div className="space-y-2">
                {r.traps.map((t) => (
                  <div key={t.id} className="flex gap-2.5 text-[13.5px]">
                    <span className="mt-0.5 shrink-0" style={{ color: t.resolved ? TEAL : RED }}>
                      {t.resolved ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                    </span>
                    <div>
                      <div className="text-white font-semibold">{t.name}</div>
                      {t.note && <div className="text-white/90 font-medium text-[12.5px] mt-0.5">{t.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!!r.signals?.notes?.length && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-widest text-white mb-2">How they worked</div>
              <ul className="space-y-1">
                {r.signals.notes.map((n, i) => (
                  <li key={i} className="text-white font-medium text-[13px] flex gap-2">
                    <span className="text-white/40">·</span> {n}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {r.analysis && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-widest text-white mb-2">Examiner</div>
              <p className="text-white font-medium text-[13.5px] leading-relaxed">{r.analysis}</p>
            </div>
          )}

          {r.hire && (
            <div className="rounded-xl border p-4" style={{ background: `${TEAL}0a`, borderColor: `${TEAL}30` }}>
              <div className="text-[11px] font-bold uppercase tracking-widest mb-1.5" style={{ color: TEAL }}>The call</div>
              <p className="text-white font-semibold text-[14px] leading-relaxed">{r.hire}</p>
            </div>
          )}

          {!!r.transcript?.length && (
            <div>
              <button
                onClick={() => setShowTranscript((s) => !s)}
                className="flex items-center gap-1.5 text-[13px] font-semibold text-white hover:text-[#00d4aa] transition"
              >
                <ChevronDown className={`w-4 h-4 transition ${showTranscript ? 'rotate-180' : ''}`} />
                {showTranscript ? 'Hide' : 'Show'} full session ({r.transcript.length} messages)
              </button>
              {showTranscript && (
                <div className="mt-3 space-y-2.5 max-h-[50vh] overflow-y-auto rounded-xl border border-white/[0.08] bg-black/25 p-3.5">
                  {r.transcript.map((m, i) => (
                    <div key={i}>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-white/70 mb-0.5" style={{ fontFamily: mono }}>
                        {m.role === 'user' ? 'candidate' : m.role}
                      </div>
                      <div className="text-[13px] text-white/90 whitespace-pre-wrap leading-relaxed">{m.content}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
