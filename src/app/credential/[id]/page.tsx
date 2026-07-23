/* ════════════════════════════════════════════════════════════════════════
   A credential, publicly verifiable. The viral artifact.

   This is the URL a holder puts on LinkedIn, so it has to do two jobs at once:
   read as a real, checkable certification, and carry the one number that makes
   it worth sharing, the PERCENTILE. The hero is not the raw score. It is
   "top 8% at catching hidden operational risk," the sentence the benchmark
   engine froze into this row the moment it was issued.

   It renders server-side from the credentials table. Everything shown here is
   stored on the row, so the page is a faithful, tamper-evident view of a single
   issued credential, and nothing else on the account is reachable from it. Rows
   issued before the richer schema simply fall back to the score.
   ════════════════════════════════════════════════════════════════════════ */
import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { admin } from '@/lib/db'

const TEAL = '#00d4aa'
const INK = '#04121a'

interface Credential {
  id: string
  holder_name: string | null
  task_id: string | null
  task_title: string | null
  category: string | null
  difficulty: string | null
  score: number | null
  pass_mark: number | null
  verdict: string | null
  model: string | null
  time_limit: number | null
  tokens_budget: number | null
  dimensions: Record<string, number> | null
  dimension_labels: { id: string; label: string }[] | null
  dimension_percentiles: Record<string, number> | null
  percentile_overall: number | null
  top_dimension: string | null
  top_dimension_label: string | null
  top_dimension_skill: string | null
  top_dimension_percentile: number | null
  sample_size: number | null
  issuer: string | null
  created_at: string
}

/* ── small pure helpers ──────────────────────────────────────────────────── */
const topPct = (rank: number): number => Math.max(1, Math.min(99, 100 - Math.round(rank)))

function ordinal(n: number): string {
  const v = Math.round(n) % 100
  const s = ['th', 'st', 'nd', 'rd']
  return `${Math.round(n)}${s[(v - 20) % 10] || s[v] || s[0]}`
}

const DIFFICULTY_LABEL: Record<string, string> = { core: 'Core', senior: 'Senior', staff: 'Staff' }

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

async function siteOrigin(): Promise<string> {
  try {
    const h = await headers()
    const host = h.get('x-forwarded-host') || h.get('host')
    const proto = h.get('x-forwarded-proto') || 'https'
    if (host) return `${proto}://${host}`
  } catch {
    /* fall through */
  }
  return 'https://judgemynt.com'
}

async function load(id: string): Promise<Credential | null> {
  // Only UUIDs are ever valid ids; refusing early keeps junk out of the query.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const db = admin()
  if (!db) return null
  // select('*') so a deploy that has not run the widening migration yet still
  // renders the legacy columns instead of erroring on a missing one.
  const { data } = await db.from('judgemynt_credentials').select('*').eq('id', id).maybeSingle()
  return (data as Credential) || null
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const c = await load(id)
  if (!c) return { title: 'Credential not found' }

  const who = c.holder_name || 'A Judgemynt holder'
  const task = c.task_title || 'an AI work simulation'
  const skill = c.top_dimension_skill
  const rank = c.top_dimension_percentile ?? c.percentile_overall
  const headline =
    rank != null && skill
      ? `Top ${topPct(rank)}% at ${skill}`
      : rank != null
        ? `Top ${topPct(rank)}% overall`
        : c.score != null
          ? `Scored ${c.score}`
          : 'Verified credential'

  const title = `${who}: ${headline}`
  const description =
    rank != null && skill
      ? `Verified Judgemynt work simulation. ${who} performed in the top ${topPct(rank)}% at ${skill} on "${task}". Publicly verifiable.`
      : `Verified Judgemynt work simulation credential for "${task}". Publicly verifiable.`

  return {
    title,
    description,
    openGraph: { title, description, type: 'profile' },
    twitter: { card: 'summary_large_image', title, description },
    robots: { index: true, follow: true },
  }
}

export default async function CredentialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const c = await load(id)
  const origin = await siteOrigin()

  const fontLink = (
    <>
      <link
        rel="stylesheet"
        href="https://db.onlinewebfonts.com/c/8b75d9dcff6a48c35a46656192adf019?family=FSP+DEMO+-+PODIUM+Sharp+4.11"
      />
      <style>{`.font-podium{font-family:"FSP DEMO - PODIUM Sharp 4.11", var(--font-sans), system-ui, sans-serif;}`}</style>
    </>
  )

  if (!c) {
    return (
      <div className="min-h-screen text-[#eaf4fa] flex items-center justify-center px-5 py-12">
        {fontLink}
        <div className="w-full max-w-md rounded-2xl border p-8 text-center" style={{ background: '#070e1a', borderColor: 'rgba(255,255,255,.1)' }}>
          <div className="font-podium text-2xl uppercase">No such credential</div>
          <p className="text-white font-semibold mt-3 leading-relaxed">
            This id does not match any credential Judgemynt has issued. If someone showed it to you as proof, treat that as your answer.
          </p>
          <Link href="/" className="inline-block mt-6 rounded-full px-6 py-2.5 font-bold" style={{ background: TEAL, color: INK }}>
            Go to Judgemynt
          </Link>
        </div>
      </div>
    )
  }

  /* ── derived, with graceful fallback for legacy rows ─────────────────────── */
  const category = c.category || null
  const difficulty = c.difficulty ? DIFFICULTY_LABEL[c.difficulty] || c.difficulty : null

  // Hero: the top-dimension percentile if we have it, else the overall
  // percentile, else the bare score for pre-percentile credentials.
  const heroRank = c.top_dimension_percentile ?? c.percentile_overall ?? null
  const heroSkill =
    c.top_dimension_percentile != null
      ? c.top_dimension_skill || (c.top_dimension_label || '').toLowerCase() || 'directing AI on real work'
      : 'directing AI on real work'
  const heroIsOverall = c.top_dimension_percentile == null

  const labels = Array.isArray(c.dimension_labels) ? c.dimension_labels : []
  const dims = c.dimensions || {}
  const dimPct = c.dimension_percentiles || {}

  const stats: { label: string; value: string }[] = []
  if (c.score != null) stats.push({ label: 'Score', value: `${c.score} / pass ${c.pass_mark ?? 70}` })
  if (c.percentile_overall != null) stats.push({ label: 'Overall percentile', value: `Top ${topPct(c.percentile_overall)}%` })
  if (c.model) stats.push({ label: 'AI directed', value: c.model })
  if (difficulty) stats.push({ label: 'Difficulty', value: difficulty })
  if (c.time_limit != null) stats.push({ label: 'Time limit', value: `${Math.round(c.time_limit / 60)} min` })
  if (c.tokens_budget != null) stats.push({ label: 'Token budget', value: c.tokens_budget.toLocaleString() })

  const certUrl = `${origin}/credential/${c.id}`
  const issued = new Date(c.created_at)
  const linkedinName = `Judgemynt Work Simulation: ${c.task_title || 'AI Work Simulation'}`
  const linkedinUrl =
    `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME` +
    `&name=${encodeURIComponent(linkedinName)}` +
    `&organizationName=Judgemynt` +
    `&issueYear=${issued.getFullYear()}` +
    `&issueMonth=${issued.getMonth() + 1}` +
    `&certUrl=${encodeURIComponent(certUrl)}` +
    `&certId=${c.id}`

  return (
    <div className="min-h-screen text-[#eaf4fa] flex items-center justify-center px-4 sm:px-6 py-10 sm:py-14">
      {fontLink}

      <article
        className="w-full max-w-[760px] rounded-[24px] border overflow-hidden"
        style={{ background: '#070e1a', borderColor: `${TEAL}33` }}
      >
        {/* a flat accent rule, not a gradient */}
        <div style={{ height: 4, background: TEAL }} />

        <div className="p-6 sm:p-9">
          {/* ── issuer bar + trust mark ─────────────────────────────────── */}
          <div className="flex items-center gap-3">
            <span
              className="w-9 h-9 rounded-lg inline-flex items-center justify-center font-black text-[13px]"
              style={{ background: TEAL, color: INK }}
            >
              JM
            </span>
            <span className="font-podium uppercase tracking-wider text-lg leading-none">Judgemynt</span>
            <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: TEAL }}>
              <ShieldCheck />
              Verified credential
            </span>
          </div>

          {/* ── who and what ────────────────────────────────────────────── */}
          <div className="mt-8">
            {(category || difficulty) && (
              <div className="text-[11px] font-black uppercase tracking-[0.22em]" style={{ color: TEAL }}>
                {[category, difficulty && `${difficulty} level`].filter(Boolean).join('  ·  ')}
              </div>
            )}
            <h1 className="font-podium text-[clamp(1.7rem,6vw,2.8rem)] uppercase leading-[0.98] mt-2.5">
              {c.holder_name || 'Credential holder'}
            </h1>
            <p className="text-white font-bold text-lg mt-2 leading-snug">{c.task_title || 'AI work simulation'}</p>
          </div>

          {/* ── the hero: the percentile ────────────────────────────────── */}
          {heroRank != null ? (
            <div className="mt-7 rounded-2xl border p-6 sm:p-7" style={{ background: `${TEAL}0f`, borderColor: `${TEAL}3a` }}>
              <div className="text-[10.5px] font-black uppercase tracking-[0.22em] text-white">
                Benchmarked performance
              </div>
              <div className="flex items-end gap-4 mt-1.5 flex-wrap">
                <div className="font-podium leading-[0.85] tabular-nums" style={{ color: TEAL, fontSize: 'clamp(3.2rem,15vw,5.6rem)' }}>
                  TOP {topPct(heroRank)}%
                </div>
              </div>
              <div className="font-podium uppercase text-[clamp(1.05rem,3.4vw,1.5rem)] leading-tight mt-1">
                at {heroSkill}
              </div>
              <p className="text-white font-semibold text-[13.5px] mt-3 leading-relaxed">
                {heroIsOverall
                  ? `${ordinal(c.percentile_overall ?? 0)} percentile overall, benchmarked against everyone who has taken this simulation.`
                  : `${ordinal(heroRank)} percentile on this dimension${
                      c.percentile_overall != null ? `, ${ordinal(c.percentile_overall)} percentile overall` : ''
                    }, benchmarked against everyone who has taken this simulation.`}
              </p>
            </div>
          ) : (
            // Pre-percentile legacy row: the score carries the hero.
            <div className="mt-7 rounded-2xl border p-6" style={{ background: `${TEAL}0f`, borderColor: `${TEAL}3a` }}>
              <div className="font-podium text-6xl tabular-nums" style={{ color: TEAL }}>{c.score ?? '--'}</div>
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white mt-1">
                score, pass at {c.pass_mark ?? 70}
              </div>
            </div>
          )}

          {/* ── stat strip ──────────────────────────────────────────────── */}
          {stats.length > 0 && (
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-px rounded-2xl overflow-hidden border" style={{ borderColor: 'rgba(255,255,255,.08)', background: 'rgba(255,255,255,.08)' }}>
              {stats.map((s) => (
                <div key={s.label} className="p-3.5" style={{ background: '#070e1a' }}>
                  <div className="text-[10px] font-black uppercase tracking-[0.15em] text-white/90">{s.label}</div>
                  <div className="text-white font-bold text-[15px] mt-1 tabular-nums">{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── per-dimension rubric breakdown ──────────────────────────── */}
          {labels.length > 0 && (
            <div className="mt-8">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white mb-3.5">Rubric breakdown</div>
              <div className="space-y-3.5">
                {labels.map((d) => {
                  const score = Number(dims[d.id] ?? 0)
                  const rank = dimPct[d.id]
                  return (
                    <div key={d.id}>
                      <div className="flex items-baseline gap-3 mb-1.5">
                        <span className="text-[13.5px] font-bold text-white">{d.label}</span>
                        {rank != null && (
                          <span
                            className="text-[10.5px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                            style={{ background: `${TEAL}1f`, color: TEAL }}
                          >
                            Top {topPct(rank)}%
                          </span>
                        )}
                        <span className="ml-auto text-[13.5px] font-bold tabular-nums text-white">{score}</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.08)' }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, score))}%`, background: TEAL }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── examiner verdict ────────────────────────────────────────── */}
          {c.verdict && (
            <div className="mt-7">
              <div className="text-[10.5px] font-black uppercase tracking-[0.2em] text-white">Examiner verdict</div>
              <div className="font-podium uppercase text-xl mt-1" style={{ color: TEAL }}>{c.verdict}</div>
            </div>
          )}

          {/* ── what this measures ──────────────────────────────────────── */}
          <p className="text-white font-semibold text-[13.5px] mt-7 leading-relaxed">
            This is not a quiz. The holder was handed real source documents with hidden judgment traps, a live AI
            assistant, a token budget, and a clock, then measured on what a person actually does with AI: find what
            matters in the documents, brief the model, catch its errors, and make the final call. The score measures
            the person directing the AI, not the AI.
          </p>

          {/* ── trust footer ────────────────────────────────────────────── */}
          <div className="mt-7 pt-6 border-t" style={{ borderColor: 'rgba(255,255,255,.1)' }}>
            <div className="flex items-center gap-2" style={{ color: TEAL }}>
              <ShieldCheck />
              <span className="text-[12px] font-black uppercase tracking-[0.18em]">Verified by {c.issuer || 'Judgemynt'}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] font-semibold text-white">
              <span>Issued {fmtDate(c.created_at)}</span>
              <span className="text-white/30">·</span>
              <span>Issuer {c.issuer || 'Judgemynt'}</span>
              {c.sample_size != null && c.sample_size > 1 && (
                <>
                  <span className="text-white/30">·</span>
                  <span>One of {c.sample_size.toLocaleString()} verified holders</span>
                </>
              )}
            </div>
            <div className="mt-2 text-[12px] font-semibold text-white/90 break-all" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>
              Verification ID {c.id}
            </div>
            <p className="mt-2 text-[12px] font-medium text-white/80 leading-relaxed">
              This page is the verification. Each credential id is issued once, rendered from the source record, and cannot be edited by its holder.
            </p>
          </div>

          {/* ── actions ─────────────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-3 mt-7">
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full px-6 py-3 font-bold hover:brightness-110 transition"
              style={{ background: TEAL, color: INK }}
            >
              <LinkedInGlyph /> Add to LinkedIn
            </a>
            <Link
              href="/"
              className="inline-flex items-center rounded-full px-6 py-3 font-bold border hover:bg-white/5 transition"
              style={{ borderColor: 'rgba(255,255,255,.18)' }}
            >
              Take the same assessment
            </Link>
          </div>
        </div>
      </article>
    </div>
  )
}

/* ═══════════════════════════ inline glyphs (no external assets) ═══════════ */

function ShieldCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ display: 'inline-block' }}>
      <path d="M12 2 4 5v6c0 5 3.4 8.3 8 11 4.6-2.7 8-6 8-11V5l-8-3Z" fill="currentColor" opacity="0.16" />
      <path d="M12 2 4 5v6c0 5 3.4 8.3 8 11 4.6-2.7 8-6 8-11V5l-8-3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m8.5 12 2.4 2.4L15.8 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LinkedInGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4.98 3.5A2.5 2.5 0 1 0 5 8.5a2.5 2.5 0 0 0-.02-5ZM3 9h4v12H3V9Zm6 0h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.5c0-1.3-.02-3-1.83-3-1.83 0-2.11 1.43-2.11 2.9V21H9V9Z" />
    </svg>
  )
}
