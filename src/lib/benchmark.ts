/* ════════════════════════════════════════════════════════════════════════
   Judgemynt, the benchmark engine.

   A raw score is not a credential. "82/100" tells a stranger on LinkedIn
   nothing: 82 against what bar, out of whom? What makes the credential worth
   putting on a profile is the SENTENCE it lets the holder write, "top 8% at
   catching hidden operational risk." This file turns a score into that
   sentence, and does it for every completed session, not just the passes.

   TWO LAYERS, ONE NUMBER
   ──────────────────────
   1. The empirical rank. Every finished session is pooled by scope and a score
      is ranked inside that pool: what share of the field it beat. This is the
      real thing, and it is the moat: the more sessions run, the sharper it gets.
   2. The seeded prior. A pool is untrustworthy while it is tiny, so below a
      minimum sample the rank falls back to a calibrated, per-dimension,
      difficulty-aware norm (the tables below). It is the same mechanism a
      standardized test uses before its norming cohort exists.
   The published number is the EMPIRICAL rank once the pool clears MIN_SAMPLE,
   and the SEEDED rank before then. Callers get a `confident` flag and the real
   `sample` size, so a decision surface can withhold the claim entirely ("not
   enough data yet") while the viral credential still shows its seeded hero.

   THE TWO SCOPES (apples to apples)
   ─────────────────────────────────
     • task — every result for a catalog task, pooled ACROSS all companies and
              practice runs. The candidate-facing benchmark and the biggest
              pool: "everyone who has ever taken the slugify task." Custom roles
              (task_id = __custom__) are never pooled this way; the id is shared
              but nothing else is.
     • role — every result for one company's specific role: one rubric, one
              context pack, one brief. The exact pool an employer compares their
              applicants inside.

   Everything is derived from the raw scores already on judgemynt_results, so
   history stays comparable: the source of truth is the score, not a frozen
   percentile. A snapshot IS written onto each row for cheap rendering and as a
   record of what the candidate was shown, but any surface that wants a live
   rank recomputes from the pool with the functions here.
   ════════════════════════════════════════════════════════════════════════ */
import type { SupabaseClient } from '@supabase/supabase-js'

export type Difficulty = 'core' | 'senior' | 'staff'

export interface BenchmarkInput {
  taskId: string
  difficulty: Difficulty
  /** Weighted overall score, 0-100. */
  overall: number
  /** Per-dimension scores, keyed by dimension id. */
  dimensions: Record<string, number>
  /** Dimension ids and their labels, in rubric order. */
  dimensionLabels: { id: string; label: string }[]
}

/** One prior attempt at the SAME scope, drawn from the SAME population.
 *  Optional: the reference norm stands on its own until enough of these exist
 *  to rank against empirically. */
export interface BenchmarkSample {
  overall: number
  dimensions: Record<string, number>
}

export interface DimensionPercentile {
  id: string
  label: string
  /** The LinkedIn-ready phrase for this dimension, e.g. "catching hidden operational risk". */
  skill: string
  score: number
  /** Percentile rank, 1-99: scored at or above this share of the field. */
  percentile: number
}

export interface BenchmarkResult {
  /** Overall percentile RANK, 1-99: scored at or above this share of the field. */
  percentileOverall: number
  /** Per-dimension percentile rank, keyed by dimension id. */
  dimensionPercentiles: Record<string, number>
  /** The dimension the holder ranks highest on. The credential's headline. */
  top: DimensionPercentile
}

/* ── the calibrated norm (the seeded prior) ────────────────────────────────
   Whole-population mean and spread for the overall score, per difficulty
   tier. Harder tiers norm lower: the same 80 is a rarer result on a staff
   simulation than on a core one. Used as the fallback prior while a pool is
   below MIN_SAMPLE, and never once real data takes over, so it can bias an
   early estimate but never the mature, published benchmark. */
const OVERALL_NORM: Record<Difficulty, { mean: number; sd: number }> = {
  core: { mean: 60, sd: 17 },
  senior: { mean: 56, sd: 18 },
  staff: { mean: 53, sd: 19 },
}

/* Per-dimension whole-population means. Judgment, noticing what the documents
   imply and acting on it, is the hardest and the most valuable, so it norms
   lowest: a high judgment score is the rarest and most quotable result the
   platform produces. Each dimension also carries the skill phrase the
   credential renders. */
const DIMENSION_NORM: Record<string, { mean: number; sd: number; skill: string }> = {
  judgment: { mean: 50, sd: 19, skill: 'catching hidden operational risk' },
  direction: { mean: 58, sd: 18, skill: 'briefing AI with the right context' },
  quality: { mean: 62, sd: 18, skill: 'shipping correct, complete work' },
  efficiency: { mean: 63, sd: 19, skill: 'getting results with minimal waste' },
  communication: { mean: 60, sd: 18, skill: 'writing that lands with its audience' },
}

const DIFFICULTY_SHIFT: Record<Difficulty, number> = { core: 0, senior: -3, staff: -6 }

// A company can invent a dimension we have no norm for; fall back to a middling
// one so the percentile is still sane rather than absent.
const DEFAULT_DIM = { mean: 58, sd: 19 }

function normFor(id: string, difficulty: Difficulty): { mean: number; sd: number } {
  const base = DIMENSION_NORM[id] || DEFAULT_DIM
  const shift = DIFFICULTY_SHIFT[difficulty] ?? 0
  return { mean: base.mean + shift, sd: base.sd }
}

function skillFor(id: string, label: string): string {
  return DIMENSION_NORM[id]?.skill || (label || '').toLowerCase()
}

/** Abramowitz and Stegun 7.1.26 erf, accurate to about 1e-7. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * ax)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax)
  return sign * y
}

/** P(X <= v) for a normal(mean, sd), returned as a 0-100 rank. */
function normRank(v: number, mean: number, sd: number): number {
  const safeSd = sd > 0 ? sd : 1
  const cdf = 0.5 * (1 + erf((v - mean) / (safeSd * Math.SQRT2)))
  return cdf * 100
}

/** Empirical rank of v within a sample, 0-100. NaN when the sample is empty. */
function empiricalRank(v: number, sample: number[]): number {
  if (!sample.length) return NaN
  let atOrBelow = 0
  for (const s of sample) if (s <= v) atOrBelow++
  return (atOrBelow / sample.length) * 100
}

/* Blend the calibrated rank with the observed rank. Weight on the observed
   distribution grows with sample size and only overtakes the reference past a
   few hundred attempts, so one lucky cohort never swings a percentile. This is
   the ORIGINAL smooth-blend scorer, retained for any caller that wants a single
   always-present number with no hard threshold. The scope engine below instead
   uses a clean switch at MIN_SAMPLE so a published rank is pure observed data. */
const BLEND_K = 300
function blend(modelRank: number, sample: number[], v: number): number {
  const emp = empiricalRank(v, sample)
  if (Number.isNaN(emp)) return modelRank
  const w = sample.length / (sample.length + BLEND_K)
  return modelRank * (1 - w) + emp * w
}

// Passing already implies a strong percentile, so the floor is not 0. The
// ceiling stops any single credential from claiming "top 0%".
const clampRank = (r: number): number => Math.round(Math.max(1, Math.min(99, r)))

/** Tie-break order for the headline dimension: judgment first, the signature
 *  skill of the whole product. Unknown dimensions sort last. */
const HEADLINE_PRIORITY = ['judgment', 'direction', 'quality', 'communication', 'efficiency']
const priorityOf = (id: string): number => {
  const i = HEADLINE_PRIORITY.indexOf(id)
  return i === -1 ? HEADLINE_PRIORITY.length : i
}

/**
 * The original smooth-blend scorer. Ranks a session against the seeded prior,
 * blending toward the observed sample as it grows (BLEND_K). Always returns a
 * number, never withholds. Retained for backward compatibility; new code should
 * prefer `computeBenchmark`/`summarizeScope`, which pool by scope, switch to
 * pure observed data at MIN_SAMPLE, and expose a confidence flag.
 */
export function benchmark(input: BenchmarkInput, samples: BenchmarkSample[] = []): BenchmarkResult {
  const overallNorm = OVERALL_NORM[input.difficulty] || OVERALL_NORM.core
  const overallSample = samples.map((s) => s.overall).filter((n) => Number.isFinite(n))
  const percentileOverall = clampRank(
    blend(normRank(input.overall, overallNorm.mean, overallNorm.sd), overallSample, input.overall)
  )

  const dimensionPercentiles: Record<string, number> = {}
  const ranked: DimensionPercentile[] = []
  for (const { id, label } of input.dimensionLabels) {
    const score = Number(input.dimensions[id]) || 0
    const norm = normFor(id, input.difficulty)
    const dimSample = samples
      .map((s) => Number(s.dimensions?.[id]))
      .filter((n) => Number.isFinite(n))
    const rank = clampRank(blend(normRank(score, norm.mean, norm.sd), dimSample, score))
    dimensionPercentiles[id] = rank
    ranked.push({ id, label, skill: skillFor(id, label), score, percentile: rank })
  }

  const top =
    [...ranked].sort(
      (a, b) => b.percentile - a.percentile || priorityOf(a.id) - priorityOf(b.id)
    )[0] || { id: '', label: 'Overall', skill: 'directing AI on real work', score: input.overall, percentile: percentileOverall }

  return { percentileOverall, dimensionPercentiles, top }
}

/** "top 8%" from a percentile rank. Never returns "top 0%". */
export function topPercent(rank: number): number {
  return Math.max(1, Math.min(99, 100 - Math.round(rank)))
}

/* ══════════════════════════════════════════════════════════════════════════
   THE SCOPE ENGINE: pooled, scope-aware, small-sample-aware.
   ══════════════════════════════════════════════════════════════════════════ */

/** Below this many peers in a scope, a rank is a rumour: the published number
 *  falls back to the seeded prior and `confident` is false, so a decision
 *  surface can say "not enough data yet" instead of claiming a percentile. */
export const MIN_SAMPLE = 20

/** Most-recent rows pulled per scope to build a distribution. A rank is stable
 *  well before this, and the cap bounds memory as a task goes viral. Ordering
 *  by created_at desc means the benchmark tracks the recent field rather than
 *  being anchored to the very first cohort forever. */
export const DIST_CAP = 5000

/** A custom role's task id. These never share a task-scope pool. */
export const CUSTOM_TASK_ID = '__custom__'

/** Sentinel company id under which practice (non-invited) runs are recorded, so
 *  they join the task-scope distribution while staying invisible to every real
 *  employer console, all of which filter judgemynt_results by their own id. */
export const PRACTICE_COMPANY_ID = '__practice__'

export interface ScopeDimension extends DimensionPercentile {
  /** Enough peers on THIS dimension for the rank to be observed, not seeded. */
  confident: boolean
  /** Peers with a score for this dimension (excludes this candidate). */
  sample: number
}

export interface ScopeBenchmark {
  scope: 'task' | 'role'
  /** The task_id or role_id this pool was keyed on. */
  ref: string
  /** Peers in the pool, excluding this candidate. */
  sample: number
  /** sample >= minSample: the overall rank is observed, not seeded. */
  confident: boolean
  basis: 'observed' | 'seeded'
  minSample: number
  /** Overall percentile rank 1-99. Always present (seeded when not confident). */
  percentileOverall: number
  /** Per-dimension rank keyed by dimension id. Mirrors BenchmarkResult. */
  dimensionPercentiles: Record<string, number>
  /** Rich per-dimension detail: label, skill phrase, score, rank, confidence. */
  dimensions: ScopeDimension[]
  /** Highest-ranked dimension, judgment-first tie-break. The credential hero. */
  top: DimensionPercentile
}

export interface ScopedBenchmark {
  /** Which scope a candidate-facing surface should headline. */
  primary: 'task' | 'role' | null
  minSample: number
  task: ScopeBenchmark | null
  role: ScopeBenchmark | null
}

/** clamp to [0,100] before the display-rounding clampRank; keeps a stray NaN
 *  from poisoning a stored int. */
const clampPct = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 50)

/**
 * Rank one value inside one sample: pure empirical mid-rank once the pool
 * clears `minSample`, the seeded prior below it.
 *
 * The empirical rank counts strictly-below plus half of ties, with this
 * candidate folded into the denominator (n + 1). Consequences, all intended:
 *   • an empty pool never reaches here (it is below minSample, so seeded),
 *   • the observed rank is strictly inside (0, 100), so nobody "beats everyone"
 *     or "loses to everyone" off a finite sample,
 *   • at exactly minSample the number is real data, not a prior-diluted blend,
 *     so a claim, once made, means what it says.
 */
function rankValue(
  v: number,
  sample: number[],
  seedMean: number,
  seedSd: number,
  minSample: number
): { pct: number; confident: boolean; sample: number } {
  const clean = sample.filter((s) => Number.isFinite(s))
  const n = clean.length
  if (n >= minSample) {
    let below = 0
    let equal = 0
    for (const s of clean) {
      if (s < v) below++
      else if (s === v) equal++
    }
    return { pct: clampPct((100 * (below + 0.5 * (equal + 1))) / (n + 1)), confident: true, sample: n }
  }
  return { pct: clampPct(normRank(v, seedMean, seedSd)), confident: false, sample: n }
}

/**
 * Rank one session inside one already-fetched sample. Pure: no I/O, fully
 * deterministic and unit-testable. Reuses the calibrated norm as the seed and
 * the same headline-dimension tie-break as `benchmark`.
 */
export function summarizeScope(
  scope: 'task' | 'role',
  ref: string,
  input: BenchmarkInput,
  samples: BenchmarkSample[],
  minSample: number = MIN_SAMPLE
): ScopeBenchmark {
  const overallNorm = OVERALL_NORM[input.difficulty] || OVERALL_NORM.core
  const overallSample = samples.map((s) => Number(s.overall)).filter((n) => Number.isFinite(n))
  const o = rankValue(input.overall, overallSample, overallNorm.mean, overallNorm.sd, minSample)
  const percentileOverall = clampRank(o.pct)

  const dimensionPercentiles: Record<string, number> = {}
  const dims: ScopeDimension[] = []
  for (const { id, label } of input.dimensionLabels) {
    const score = Number(input.dimensions[id]) || 0
    const norm = normFor(id, input.difficulty)
    const dimSample = samples.map((s) => Number(s.dimensions?.[id])).filter((n) => Number.isFinite(n))
    const r = rankValue(score, dimSample, norm.mean, norm.sd, minSample)
    const rank = clampRank(r.pct)
    dimensionPercentiles[id] = rank
    dims.push({ id, label, skill: skillFor(id, label), score, percentile: rank, confident: r.confident, sample: r.sample })
  }

  const top =
    [...dims].sort((a, b) => b.percentile - a.percentile || priorityOf(a.id) - priorityOf(b.id))[0] || {
      id: '',
      label: 'Overall',
      skill: 'directing AI on real work',
      score: input.overall,
      percentile: percentileOverall,
    }

  return {
    scope,
    ref,
    sample: o.sample,
    confident: o.confident,
    basis: o.confident ? 'observed' : 'seeded',
    minSample,
    percentileOverall,
    dimensionPercentiles,
    dimensions: dims,
    top: { id: top.id, label: top.label, skill: top.skill, score: top.score, percentile: top.percentile },
  }
}

/* ── Supabase reads ────────────────────────────────────────────────────── */

/**
 * Pull a scope's distribution from judgemynt_results as ranking samples.
 *
 * Task scope keys on task_id with NO company filter, so it pools every
 * company's invited results plus practice runs for that catalog task. Role
 * scope keys on role_id, which only ever belongs to one company. Rows with a
 * null score are skipped; each sample keeps its raw per-dimension scores so a
 * dimension can be ranked even when an older row was graded on a leaner rubric.
 */
export async function fetchScopeSamples(
  db: SupabaseClient,
  by: 'task' | 'role',
  ref: string,
  cap: number = DIST_CAP
): Promise<BenchmarkSample[]> {
  if (!ref) return []
  const column = by === 'task' ? 'task_id' : 'role_id'
  const { data, error } = await db
    .from('judgemynt_results')
    .select('score, dimensions')
    .eq(column, ref)
    .not('score', 'is', null)
    .order('created_at', { ascending: false })
    .limit(cap)
  if (error || !data) return []
  const out: BenchmarkSample[] = []
  for (const row of data as { score: unknown; dimensions: unknown }[]) {
    const overall = Number(row.score)
    if (!Number.isFinite(overall)) continue
    out.push({ overall, dimensions: (row.dimensions || {}) as Record<string, number> })
  }
  return out
}

/**
 * Compute a full benchmark for one session: fetch whichever scopes apply, rank
 * the session in each, and mark the primary (candidate-facing) scope.
 *
 * Scope selection:
 *   • a real catalog task_id  → task scope (pooled across all companies),
 *   • a role_id               → role scope (this company's pool),
 *   • both when both apply.
 * The primary headline is the task pool for generic catalog tasks (bigger, and
 * the same benchmark a credential shows), falling back to the role pool for
 * custom assessments where a cross-company task pool would be meaningless.
 *
 * Call BEFORE inserting this session's own row, so a candidate is never ranked
 * against themselves. Never throws on a query failure: a scope whose fetch fails
 * degrades to an empty sample, which simply ranks off the seeded prior with
 * `confident: false`.
 */
export async function computeBenchmark(
  db: SupabaseClient,
  input: BenchmarkInput & { roleId: string | null },
  opts: { minSample?: number; cap?: number } = {}
): Promise<ScopedBenchmark> {
  const minSample = opts.minSample ?? MIN_SAMPLE
  const cap = opts.cap ?? DIST_CAP
  const hasTask = !!input.taskId && input.taskId !== CUSTOM_TASK_ID
  const hasRole = !!input.roleId

  const [taskSamples, roleSamples] = await Promise.all([
    hasTask ? fetchScopeSamples(db, 'task', input.taskId, cap) : Promise.resolve<BenchmarkSample[] | null>(null),
    hasRole
      ? fetchScopeSamples(db, 'role', input.roleId as string, cap)
      : Promise.resolve<BenchmarkSample[] | null>(null),
  ])

  const task = taskSamples ? summarizeScope('task', input.taskId, input, taskSamples, minSample) : null
  const role = roleSamples ? summarizeScope('role', input.roleId as string, input, roleSamples, minSample) : null
  const primary: 'task' | 'role' | null = hasTask ? 'task' : hasRole ? 'role' : null

  return { primary, minSample, task, role }
}

/** The scope a candidate-facing surface should headline, or null. */
export function primaryScope(b: ScopedBenchmark | null | undefined): ScopeBenchmark | null {
  if (!b) return null
  if (b.primary === 'role') return b.role
  if (b.primary === 'task') return b.task
  return null
}

const ORD = ['th', 'st', 'nd', 'rd']
function ordinal(n: number): string {
  const r = Math.round(n)
  const v = r % 100
  return `${r}${ORD[(v - 20) % 10] || ORD[v] || ORD[0]}`
}

/**
 * The one line a surface prints. Above the median it flatters ("Top 6% at
 * Judgment"); at or below it stays honest ("42nd percentile"). Pass
 * `confident: false` to withhold the claim entirely on a decision surface;
 * `label` names the dimension and is omitted for the overall score.
 */
export function describePercentile(pct: number | null | undefined, label?: string, confident: boolean = true): string {
  if (!confident) return 'Not enough data yet'
  if (pct == null || !Number.isFinite(pct)) return 'Not enough data yet'
  const at = label ? ` at ${label}` : ''
  if (pct >= 50) return `Top ${topPercent(pct)}%${at}`
  return `${ordinal(pct)} percentile${at}`
}
