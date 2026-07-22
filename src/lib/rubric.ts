/* ════════════════════════════════════════════════════════════════════════
   Judgemynt, the rubric.

   A rubric is the part a company actually wants to own. Two teams hiring for
   the "same" role want different things: an agency cares that the deliverable
   is shippable, a platform team cares that the candidate noticed the
   constraint nobody wrote down. Rather than shipping one opinion, a role
   carries a rubric, which dimensions count, how much each is worth, what the
   bar is, and any house rules the examiner should apply.

   Weights are relative, not percentages; they are normalised at scoring time
   so a company can type 3 and 1 without doing arithmetic.
   ════════════════════════════════════════════════════════════════════════ */

export interface Dimension {
  id: string
  label: string
  /** Relative weight. Normalised against the other dimensions in the rubric. */
  weight: number
  /** Handed to the examiner verbatim, this is what the dimension MEANS here. */
  prompt: string
}

export interface Rubric {
  dimensions: Dimension[]
  /** Score at or above which the candidate passes. */
  passMark: number
  /** Whether trap resolution feeds the judgment dimension and the report. */
  useTraps: boolean
  /** Free-text house rules appended to the examiner prompt. Company-authored. */
  houseRules?: string
}

/** The four dimensions that survive across roles. A company may drop or reweight any. */
export const DIMENSION_LIBRARY: Dimension[] = [
  {
    id: 'judgment',
    label: 'Judgment',
    weight: 3,
    prompt:
      'Did they notice what the context pack actually implied and act on it? This is the core signal: someone who read the documents and changed their approach because of what they found scores high. Someone who produced a clean deliverable that ignores a constraint sitting in the documents scores low no matter how polished it reads.',
  },
  {
    id: 'direction',
    label: 'Direction',
    weight: 2,
    prompt:
      'How well did they drive the AI? Specific, loaded instructions that carry the constraints forward score high. "Make it better", "fix it", and pasting the brief verbatim score low. Reward candidates who gave the AI the context it needed instead of hoping it would guess.',
  },
  {
    id: 'quality',
    label: 'Quality',
    weight: 3,
    prompt:
      'Is the final deliverable correct, complete, and in the requested format? Check it against every stated requirement. A deliverable that is 90% right but breaks one hard requirement is not 90%.',
  },
  {
    id: 'efficiency',
    label: 'Efficiency',
    weight: 1,
    prompt:
      'How surgically did they spend tokens and time? Few precise moves that land = high. Flailing, re-asking the same thing, or running out = low. Do not reward speed that produced a worse deliverable, finishing early with a wrong answer is not efficient.',
  },
  {
    id: 'communication',
    label: 'Communication',
    weight: 1,
    prompt:
      'If the deliverable is something a human will read, an email, a spec, slide copy, judge whether it lands with its actual audience. Plain, specific, and appropriately brief scores high.',
  },
]

export const DEFAULT_RUBRIC: Rubric = {
  dimensions: DIMENSION_LIBRARY.filter((d) =>
    ['judgment', 'direction', 'quality', 'efficiency'].includes(d.id)
  ),
  passMark: 70,
  useTraps: true,
}

/** Normalise weights to fractions of 1. Tolerates zero/negative input. */
export function normalized(rubric: Rubric): { dim: Dimension; share: number }[] {
  const dims = rubric.dimensions.filter((d) => d && d.id)
  const total = dims.reduce((s, d) => s + Math.max(0, d.weight || 0), 0)
  if (!total) return dims.map((d) => ({ dim: d, share: 1 / (dims.length || 1) }))
  return dims.map((d) => ({ dim: d, share: Math.max(0, d.weight || 0) / total }))
}

/** Weighted overall from per-dimension 0-100 scores. */
export function overallFrom(rubric: Rubric, scores: Record<string, number>): number {
  const parts = normalized(rubric)
  const sum = parts.reduce((s, { dim, share }) => s + (scores[dim.id] ?? 0) * share, 0)
  return Math.max(0, Math.min(100, Math.round(sum)))
}

/** Accept a company's stored JSON without trusting any of it. */
export function sanitizeRubric(input: unknown): Rubric {
  const raw = (input || {}) as Partial<Rubric>
  const dims = Array.isArray(raw.dimensions) ? raw.dimensions : []
  const clean: Dimension[] = dims
    .map((d) => {
      const known = DIMENSION_LIBRARY.find((k) => k.id === d?.id)
      const id = String(d?.id || '').slice(0, 40)
      if (!id) return null
      return {
        id,
        label: String(d?.label || known?.label || id).slice(0, 60),
        weight: Math.max(0, Math.min(10, Number(d?.weight) || 0)),
        // A company may rewrite what a dimension means, but never leave it empty.
        prompt: String(d?.prompt || known?.prompt || '').slice(0, 1200) || known?.prompt || '',
      }
    })
    .filter((d): d is Dimension => !!d && !!d.prompt)
    .slice(0, 8)

  return {
    dimensions: clean.length ? clean : DEFAULT_RUBRIC.dimensions,
    passMark: Math.max(0, Math.min(100, Math.round(Number(raw.passMark) || DEFAULT_RUBRIC.passMark))),
    useTraps: raw.useTraps === undefined ? true : !!raw.useTraps,
    houseRules: raw.houseRules ? String(raw.houseRules).slice(0, 2000) : undefined,
  }
}
