/* ════════════════════════════════════════════════════════════════════════
   Judgemynt — roles.

   A ROLE is a company's configured assessment: which task, how long, what the
   rubric weighs, and — the part that matters — their own context documents.

   The catalog tasks are good demos. They are not what makes a company stay.
   What makes a company stay is dropping their actual refund policy, their
   actual SLA, their actual brand rules into the context pack, so the exam
   measures judgment about THEIR business. A candidate who does well on
   "Acme's returns policy has an exception you have to find" has demonstrated
   something a generic assessment cannot demonstrate.

   Two shapes of role:
     • preset  — a catalog task, optionally with extra company documents
                 appended and the rubric reweighted.
     • custom  — the company writes the brief, deliverable, documents, and
                 requirements themselves. The catalog is not involved.
   ════════════════════════════════════════════════════════════════════════ */
import type { JmDoc, JmTask } from './tasks'
import { taskById } from './tasks'
import { DEFAULT_RUBRIC, sanitizeRubric, type Rubric } from './rubric'

export interface Role {
  id: string
  company_id: string
  name: string
  /** 'preset' uses task_id from the catalog; 'custom' uses the fields below. */
  kind: 'preset' | 'custom'
  task_id: string | null

  /** Custom-task fields (also used to OVERRIDE a preset when non-empty). */
  brief: string | null
  deliverable: string | null
  /** Company-supplied context documents, appended to the catalog task's own. */
  docs: JmDoc[]
  /** Company-supplied requirements, appended to the catalog task's key. */
  requirements: string[]

  budget_tokens: number
  budget_seconds: number
  rubric: Rubric
  active: boolean
  created_at?: string
}

/** What the workspace actually runs: a role resolved against the catalog. */
export interface ResolvedRole {
  roleId: string | null
  roleName: string
  taskId: string
  title: string
  role: string
  roleEmoji: string
  color: string
  brief: string
  deliverable: string
  docs: JmDoc[]
  budget: { tokens: number; seconds: number }
  rubric: Rubric
  /** Requirements added by the company on top of the catalog key. */
  extraRequirements: string[]
  custom: boolean
}

const CUSTOM_TASK_ID = '__custom__'

/**
 * Turn a stored role into something the workspace can run.
 *
 * Falls back rather than throwing at every step: a role pointing at a task id
 * that no longer exists should degrade to a runnable assessment, not a 500 in
 * front of a candidate who is already nervous.
 */
export function resolveRole(role: Role | null, fallbackTaskId = 'slugify'): ResolvedRole {
  const preset: JmTask | undefined =
    role?.kind === 'custom' ? undefined : taskById(role?.task_id || fallbackTaskId) || taskById(fallbackTaskId)

  const docs: JmDoc[] = [...(preset?.docs || []), ...(role?.docs || [])]

  return {
    roleId: role?.id ?? null,
    roleName: role?.name || preset?.title || 'Assessment',
    taskId: preset?.id || CUSTOM_TASK_ID,
    title: role?.kind === 'custom' ? role.name : preset?.title || 'Assessment',
    role: preset?.role || 'Custom',
    roleEmoji: preset?.roleEmoji || '◉',
    color: preset?.color || '#00d4aa',
    brief: (role?.brief || preset?.brief || '').trim(),
    deliverable: (role?.deliverable || preset?.deliverable || 'Your finished work.').trim(),
    docs,
    budget: {
      tokens: role?.budget_tokens || preset?.budget.tokens || 10000,
      seconds: role?.budget_seconds || preset?.budget.seconds || 1200,
    },
    rubric: role?.rubric || DEFAULT_RUBRIC,
    extraRequirements: role?.requirements || [],
    custom: role?.kind === 'custom',
  }
}

/** Everything the browser is allowed to know about a resolved role. */
export function publicRole(r: ResolvedRole) {
  return {
    roleId: r.roleId,
    roleName: r.roleName,
    taskId: r.taskId,
    title: r.title,
    role: r.role,
    roleEmoji: r.roleEmoji,
    color: r.color,
    brief: r.brief,
    deliverable: r.deliverable,
    docs: r.docs,
    budget: r.budget,
    passMark: r.rubric.passMark,
    dimensions: r.rubric.dimensions.map((d) => ({ id: d.id, label: d.label })),
    custom: r.custom,
  }
}

const str = (v: unknown, max: number): string => String(v ?? '').slice(0, max)

export function sanitizeDocs(input: unknown): JmDoc[] {
  const arr = Array.isArray(input) ? input : []
  const kinds = ['policy', 'data', 'spec', 'thread', 'log']
  return arr.slice(0, 12).map((d, i) => {
    const raw = (d || {}) as Partial<JmDoc>
    const kind = kinds.includes(String(raw.kind)) ? (raw.kind as JmDoc['kind']) : 'spec'
    return {
      id: str(raw.id, 40) || `doc-${i + 1}`,
      title: str(raw.title, 120) || `Document ${i + 1}`,
      kind,
      // Generous but bounded: real policies are long, prompts are not infinite.
      body: str(raw.body, 8000),
    }
  })
}

/** Validate a role coming from the network before it is stored or run. */
export function sanitizeRole(input: unknown, companyId: string): Omit<Role, 'id' | 'created_at'> {
  const raw = (input || {}) as Partial<Role>
  const kind: Role['kind'] = raw.kind === 'custom' ? 'custom' : 'preset'
  const taskId = kind === 'preset' ? str(raw.task_id, 60) || 'slugify' : null

  return {
    company_id: companyId,
    name: str(raw.name, 120) || 'Untitled role',
    kind,
    task_id: taskId,
    brief: raw.brief ? str(raw.brief, 4000) : null,
    deliverable: raw.deliverable ? str(raw.deliverable, 1000) : null,
    docs: sanitizeDocs(raw.docs),
    requirements: (Array.isArray(raw.requirements) ? raw.requirements : [])
      .slice(0, 20)
      .map((r) => str(r, 300))
      .filter(Boolean),
    // Clamped so a typo cannot create a 40-hour exam or a 3-token one.
    budget_tokens: Math.max(2000, Math.min(60000, Number(raw.budget_tokens) || 10000)),
    budget_seconds: Math.max(300, Math.min(7200, Number(raw.budget_seconds) || 1200)),
    rubric: sanitizeRubric(raw.rubric),
    active: raw.active === undefined ? true : !!raw.active,
  }
}

/** A custom role with no brief cannot be run; say so before a candidate hits it. */
export function roleProblems(role: Omit<Role, 'id' | 'created_at'>): string[] {
  const out: string[] = []
  if (role.kind === 'custom') {
    if (!role.brief || role.brief.trim().length < 40)
      out.push('A custom role needs a brief of at least 40 characters — this is what the candidate is asked to do.')
    if (!role.deliverable) out.push('Say what the candidate must hand in, or grading has nothing to check.')
    if (!role.requirements.length)
      out.push('Add at least one requirement, otherwise the examiner has no objective bar for Quality.')
  }
  if (role.kind === 'preset' && !taskById(role.task_id || '')) out.push('That task no longer exists in the catalog.')
  return out
}
