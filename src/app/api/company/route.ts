/* ════════════════════════════════════════════════════════════════════════
   Company configuration API.

   Everything a company owns about their own assessments: roles, their context
   documents, rubric weights, budgets, invite links, and the results those
   produce.

   Authorisation is uniform and boring on purpose — every action resolves the
   company from the bearer token via Supabase and scopes every query by that
   id. A company id is never read from the request body, so no request can ask
   about someone else's roles by guessing.
   ════════════════════════════════════════════════════════════════════════ */
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/ratelimit'
import { admin, companyFromAuth, encodeInvite } from '@/lib/db'
import { roleProblems, sanitizeRole, resolveRole, publicRole, type Role } from '@/lib/roles'
import { DIMENSION_LIBRARY, DEFAULT_RUBRIC } from '@/lib/rubric'
import { TASKS, taskById } from '@/lib/tasks'
import { computeBenchmark, type Difficulty } from '@/lib/benchmark'

const unauth = () => NextResponse.json({ error: 'Sign in as a company.' }, { status: 401 })
const nodb = () =>
  NextResponse.json({ error: 'Database is not configured on this deployment.' }, { status: 503 })

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { limit: 60, windowMs: 60000, tag: 'jm-company' })
  if (!rl.ok)
    return NextResponse.json(
      { error: 'Slow down a moment.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    )

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const action = String(body.action || '')

  /* ── what a role can be built from. No auth: it is a public catalog. ── */
  if (action === 'options') {
    return NextResponse.json({
      tasks: TASKS.map((t) => ({
        id: t.id,
        title: t.title,
        role: t.role,
        roleEmoji: t.roleEmoji,
        color: t.color,
        tagline: t.tagline,
        difficulty: t.difficulty,
        docs: t.docs.map((d) => ({ id: d.id, title: d.title, kind: d.kind })),
        budget: t.budget,
      })),
      dimensions: DIMENSION_LIBRARY,
      defaultRubric: DEFAULT_RUBRIC,
    })
  }

  const company = await companyFromAuth(req)
  if (!company) return unauth()
  const db = admin()
  if (!db) return nodb()

  /* ── roles ──────────────────────────────────────────────────────────── */
  if (action === 'roles.list') {
    const { data, error } = await db
      .from('judgemynt_roles')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) return NextResponse.json({ error: 'Could not load roles.' }, { status: 500 })
    const roles = (data || []) as Role[]
    return NextResponse.json({
      roles: roles.map((r) => ({
        ...r,
        invite: encodeInvite(company.id, r.id),
        preview: publicRole(resolveRole(r)),
      })),
    })
  }

  if (action === 'roles.save') {
    const clean = sanitizeRole(body.role, company.id)
    const problems = roleProblems(clean)
    if (problems.length) return NextResponse.json({ error: problems[0], problems }, { status: 400 })

    const id = body.id ? String(body.id) : ''
    if (id) {
      // Scope the update by company_id as well as id: an id alone must never
      // be enough to edit someone else's role.
      const { data, error } = await db
        .from('judgemynt_roles')
        .update(clean)
        .eq('id', id)
        .eq('company_id', company.id)
        .select()
        .maybeSingle()
      if (error || !data) return NextResponse.json({ error: 'Could not save.' }, { status: 500 })
      const role = data as Role
      return NextResponse.json({ role, invite: encodeInvite(company.id, role.id) })
    }

    const { data, error } = await db.from('judgemynt_roles').insert(clean).select().maybeSingle()
    if (error || !data) return NextResponse.json({ error: 'Could not create.' }, { status: 500 })
    const role = data as Role
    return NextResponse.json({ role, invite: encodeInvite(company.id, role.id) })
  }

  if (action === 'roles.delete') {
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'Missing role id.' }, { status: 400 })
    await db.from('judgemynt_roles').delete().eq('id', id).eq('company_id', company.id)
    return NextResponse.json({ ok: true })
  }

  /* ── invites ────────────────────────────────────────────────────────── */
  if (action === 'invite') {
    const roleId = body.roleId ? String(body.roleId) : null
    if (roleId) {
      const { data } = await db
        .from('judgemynt_roles')
        .select('id')
        .eq('id', roleId)
        .eq('company_id', company.id)
        .maybeSingle()
      if (!data) return NextResponse.json({ error: 'Unknown role.' }, { status: 404 })
    }
    return NextResponse.json({ token: encodeInvite(company.id, roleId) })
  }

  /* ── results ────────────────────────────────────────────────────────── */
  if (action === 'results.list') {
    const roleId = body.roleId ? String(body.roleId) : ''
    let q = db
      .from('judgemynt_results')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
      .limit(300)
    if (roleId) q = q.eq('role_id', roleId)
    const { data, error } = await q
    if (error) return NextResponse.json({ results: [] })
    return NextResponse.json({ results: data || [] })
  }

  /* One candidate in full — transcript included. This is the screen a hiring
     manager actually spends time on, and the only way to audit a disputed score. */
  if (action === 'results.get') {
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 })
    const { data } = await db
      .from('judgemynt_results')
      .select('*')
      .eq('id', id)
      .eq('company_id', company.id)
      .maybeSingle()
    if (!data) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    /* Live percentile against the CURRENT pool. The stored `percentiles`
       snapshot was true only at grading time; an employer comparing today's
       applicants wants today's rank, and role scope is this company's own pool.
       Falls back to the stored snapshot if the recompute fails. */
    let benchmark: unknown = (data as { percentiles?: unknown }).percentiles ?? null
    try {
      const dims = ((data as { dimensions?: Record<string, number> }).dimensions || {}) as Record<string, number>
      const labelById = Object.fromEntries(DIMENSION_LIBRARY.map((d) => [d.id, d.label]))
      const dimensionLabels = Object.keys(dims).map((id) => ({ id, label: labelById[id] || id }))
      const difficulty = (taskById(String(data.task_id || ''))?.difficulty || 'core') as Difficulty
      benchmark = await computeBenchmark(db, {
        taskId: String(data.task_id || ''),
        roleId: data.role_id ? String(data.role_id) : null,
        difficulty,
        overall: Number(data.score) || 0,
        dimensions: dims,
        dimensionLabels,
      })
    } catch {
      /* keep the stored snapshot */
    }
    return NextResponse.json({ result: data, benchmark })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
