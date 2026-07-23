/* ════════════════════════════════════════════════════════════════════════
   The marketplace.

   A JOB is a posting backed by one of the company's assessment roles, so
   applying IS taking the assessment: apply creates an application row and
   hands back an invite token that carries the application id. When the
   session is graded, /api/assess writes the score onto the application.

   The employer sees applicants with scores, and decides. A decision flips
   the status, emails the candidate (best effort, via Resend), and, on
   accept, unlocks a private message thread between the two of them.

   Authorisation is the same shape as /api/company: the user comes from the
   bearer token, every query is scoped by their id, and nothing is trusted
   from the body. Messages additionally verify the caller is one of the two
   parties on an ACCEPTED application before reading or writing.
   ════════════════════════════════════════════════════════════════════════ */
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { rateLimit } from '@/lib/ratelimit'
import { admin, encodeInvite, profileFor, userFromAuth, type Profile } from '@/lib/db'

const str = (v: unknown, max: number): string => String(v ?? '').trim().slice(0, max)

const EMAIL_OK = !!(process.env.RESEND_API_KEY && !process.env.RESEND_API_KEY.includes('your_'))
const FROM = process.env.EMAIL_FROM ?? 'Judgemynt <onboarding@resend.dev>'

function esc(s: unknown): string {
  return String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] as string)
}

/** Best-effort decision email. A failed email never blocks the decision. */
async function sendDecisionEmail(opts: {
  to: string
  candidateName: string
  companyName: string
  jobTitle: string
  accepted: boolean
}): Promise<void> {
  if (!EMAIL_OK || !opts.to) return
  const subject = opts.accepted
    ? `${opts.companyName}: next steps on your ${opts.jobTitle} application`
    : `${opts.companyName}: an update on your ${opts.jobTitle} application`
  const body = opts.accepted
    ? `<p>Hi ${esc(opts.candidateName)},</p>
<p><b>${esc(opts.companyName)}</b> reviewed your assessment for <b>${esc(opts.jobTitle)}</b> and wants to move forward.</p>
<p>Sign in to Judgemynt and open the Marketplace: a direct message thread with ${esc(opts.companyName)} is now unlocked on your application, and they will take it from there.</p>
<p>Judgemynt</p>`
    : `<p>Hi ${esc(opts.candidateName)},</p>
<p><b>${esc(opts.companyName)}</b> reviewed your assessment for <b>${esc(opts.jobTitle)}</b> and decided not to move forward this time.</p>
<p>Your score and credential remain yours, and every other job in the Marketplace is still open to you.</p>
<p>Judgemynt</p>`
  try {
    await new Resend(process.env.RESEND_API_KEY).emails.send({ from: FROM, to: opts.to, subject, html: body })
  } catch {
    /* the status change is the source of truth; email is a courtesy */
  }
}

interface AppRow {
  id: string
  job_id: string
  company_id: string
  candidate_id: string
  candidate_name: string | null
  candidate_email: string | null
  status: string
  score: number | null
  created_at: string
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { limit: 120, windowMs: 60000, tag: 'jm-market' })
  if (!rl.ok)
    return NextResponse.json(
      { error: 'Slow down a moment.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    )

  const db = admin()
  if (!db) return NextResponse.json({ error: 'Database is not configured on this deployment.' }, { status: 503 })

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const action = String(body.action || '')

  /* ── the board itself is public: anyone can window-shop ─────────────── */
  if (action === 'jobs.list') {
    const { data } = await db
      .from('judgemynt_jobs')
      .select('id, company_id, company_name, company_url, role_id, title, description, created_at')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(100)
    return NextResponse.json({ jobs: data || [] })
  }

  /* ── everything else needs a signed-in user with a finished profile ── */
  const user = await userFromAuth(req)
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const profile: Profile | null = await profileFor(user.id)
  if (!profile) return NextResponse.json({ error: 'Finish your profile first.' }, { status: 403 })

  const isEmployer = profile.kind === 'employer'
  const candidateName = [profile.first_name, profile.last_name].filter(Boolean).join(' ')

  /* ── employer: manage postings ──────────────────────────────────────── */
  if (action === 'jobs.mine') {
    if (!isEmployer) return NextResponse.json({ error: 'Employer account required.' }, { status: 403 })
    const { data } = await db
      .from('judgemynt_jobs')
      .select('*')
      .eq('company_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)
    return NextResponse.json({ jobs: data || [] })
  }

  if (action === 'jobs.save') {
    if (!isEmployer) return NextResponse.json({ error: 'Employer account required.' }, { status: 403 })
    const title = str(body.title, 140)
    const description = str(body.description, 4000)
    const roleId = str(body.role_id, 60)
    if (!title) return NextResponse.json({ error: 'The job needs a title.' }, { status: 400 })
    if (!roleId) return NextResponse.json({ error: 'Pick which assessment backs this job.' }, { status: 400 })

    // The role must be this company's; a job must never point at someone
    // else's assessment.
    const { data: role } = await db
      .from('judgemynt_roles')
      .select('id')
      .eq('id', roleId)
      .eq('company_id', user.id)
      .maybeSingle()
    if (!role) return NextResponse.json({ error: 'That assessment role was not found in your account.' }, { status: 404 })

    const row = {
      company_id: user.id,
      company_name: profile.company_name,
      company_url: profile.company_url,
      role_id: roleId,
      title,
      description,
      active: body.active === undefined ? true : !!body.active,
    }

    const id = body.id ? String(body.id) : ''
    if (id) {
      const { data, error } = await db
        .from('judgemynt_jobs')
        .update(row)
        .eq('id', id)
        .eq('company_id', user.id)
        .select()
        .maybeSingle()
      if (error || !data) return NextResponse.json({ error: 'Could not save the job.' }, { status: 500 })
      return NextResponse.json({ job: data })
    }
    const { data, error } = await db.from('judgemynt_jobs').insert(row).select().maybeSingle()
    if (error || !data) return NextResponse.json({ error: 'Could not post the job.' }, { status: 500 })
    return NextResponse.json({ job: data })
  }

  if (action === 'jobs.delete') {
    if (!isEmployer) return NextResponse.json({ error: 'Employer account required.' }, { status: 403 })
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'Missing job id.' }, { status: 400 })
    await db.from('judgemynt_jobs').delete().eq('id', id).eq('company_id', user.id)
    return NextResponse.json({ ok: true })
  }

  /* ── candidate: apply, which mints the assessment invite ────────────── */
  if (action === 'apply') {
    if (isEmployer) return NextResponse.json({ error: 'Employer accounts cannot apply to jobs.' }, { status: 403 })
    const jobId = String(body.jobId || '')
    const { data: job } = await db
      .from('judgemynt_jobs')
      .select('id, company_id, role_id, title, active')
      .eq('id', jobId)
      .maybeSingle()
    if (!job || !job.active) return NextResponse.json({ error: 'That job is no longer open.' }, { status: 404 })

    const { data: existing } = await db
      .from('judgemynt_applications')
      .select('*')
      .eq('job_id', jobId)
      .eq('candidate_id', user.id)
      .maybeSingle()

    let app = existing as AppRow | null
    if (!app) {
      const { data, error } = await db
        .from('judgemynt_applications')
        .insert({
          job_id: jobId,
          company_id: job.company_id,
          candidate_id: user.id,
          candidate_name: candidateName,
          candidate_email: profile.email || user.email || null,
        })
        .select()
        .maybeSingle()
      if (error || !data) return NextResponse.json({ error: 'Could not create the application.' }, { status: 500 })
      app = data as AppRow
    }

    return NextResponse.json({
      application: app,
      // Taking the assessment writes the score straight onto this application.
      invite: encodeInvite(job.company_id, job.role_id, app.id),
    })
  }

  if (action === 'applications.mine') {
    if (isEmployer) return NextResponse.json({ error: 'Employer accounts cannot apply to jobs.' }, { status: 403 })
    const { data: apps } = await db
      .from('judgemynt_applications')
      .select('*')
      .eq('candidate_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)
    const jobIds = [...new Set((apps || []).map((a) => a.job_id))]
    const { data: jobs } = jobIds.length
      ? await db.from('judgemynt_jobs').select('id, title, company_name, company_url, role_id, company_id').in('id', jobIds)
      : { data: [] }
    const jobById = Object.fromEntries((jobs || []).map((j) => [j.id, j]))
    return NextResponse.json({
      applications: (apps || []).map((a) => {
        const j = jobById[a.job_id]
        return {
          ...a,
          job_title: j?.title || 'Job',
          company_name: j?.company_name || 'Company',
          // A candidate can retake only while unassessed; the invite stays valid.
          invite: a.status === 'applied' && j ? encodeInvite(a.company_id, j.role_id, a.id) : null,
        }
      }),
    })
  }

  /* ── employer: applicants and decisions ─────────────────────────────── */
  if (action === 'applications.list') {
    if (!isEmployer) return NextResponse.json({ error: 'Employer account required.' }, { status: 403 })
    let q = db
      .from('judgemynt_applications')
      .select('*')
      .eq('company_id', user.id)
      .order('created_at', { ascending: false })
      .limit(300)
    const jobId = body.jobId ? String(body.jobId) : ''
    if (jobId) q = q.eq('job_id', jobId)
    const { data: apps } = await q
    const jobIds = [...new Set((apps || []).map((a) => a.job_id))]
    const { data: jobs } = jobIds.length
      ? await db.from('judgemynt_jobs').select('id, title').in('id', jobIds)
      : { data: [] }
    const titleById = Object.fromEntries((jobs || []).map((j) => [j.id, j.title]))
    return NextResponse.json({
      applications: (apps || []).map((a) => ({ ...a, job_title: titleById[a.job_id] || 'Job' })),
    })
  }

  if (action === 'decide') {
    if (!isEmployer) return NextResponse.json({ error: 'Employer account required.' }, { status: 403 })
    const id = String(body.applicationId || '')
    const decision = body.decision === 'accepted' ? 'accepted' : body.decision === 'rejected' ? 'rejected' : ''
    if (!id || !decision) return NextResponse.json({ error: 'Missing application or decision.' }, { status: 400 })

    const { data: app } = await db
      .from('judgemynt_applications')
      .select('*')
      .eq('id', id)
      .eq('company_id', user.id)
      .maybeSingle()
    if (!app) return NextResponse.json({ error: 'Application not found.' }, { status: 404 })

    const { data: updated, error } = await db
      .from('judgemynt_applications')
      .update({ status: decision, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', user.id)
      .select()
      .maybeSingle()
    if (error || !updated) return NextResponse.json({ error: 'Could not save the decision.' }, { status: 500 })

    const { data: job } = await db.from('judgemynt_jobs').select('title').eq('id', app.job_id).maybeSingle()
    await sendDecisionEmail({
      to: app.candidate_email || '',
      candidateName: app.candidate_name || 'there',
      companyName: profile.company_name || 'The company',
      jobTitle: job?.title || 'the role',
      accepted: decision === 'accepted',
    })

    return NextResponse.json({ application: updated, emailed: EMAIL_OK && !!app.candidate_email })
  }

  /* ── the DM thread: both parties, accepted applications only ────────── */
  if (action === 'messages.list' || action === 'messages.send') {
    const appId = String(body.applicationId || '')
    const { data: app } = await db.from('judgemynt_applications').select('*').eq('id', appId).maybeSingle()
    if (!app) return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
    const isParty = app.company_id === user.id || app.candidate_id === user.id
    if (!isParty) return NextResponse.json({ error: 'Not your conversation.' }, { status: 403 })
    if (app.status !== 'accepted')
      return NextResponse.json({ error: 'Chat unlocks when the application is accepted.' }, { status: 403 })

    if (action === 'messages.send') {
      const text = str(body.body, 4000)
      if (!text) return NextResponse.json({ error: 'Empty message.' }, { status: 400 })
      const { error } = await db.from('judgemynt_messages').insert({
        application_id: appId,
        sender_id: user.id,
        sender_kind: app.company_id === user.id ? 'employer' : 'candidate',
        body: text,
      })
      if (error) return NextResponse.json({ error: 'Could not send.' }, { status: 500 })
    }

    const { data: messages } = await db
      .from('judgemynt_messages')
      .select('id, sender_kind, body, created_at')
      .eq('application_id', appId)
      .order('created_at', { ascending: true })
      .limit(500)
    return NextResponse.json({ messages: messages || [], mine: app.company_id === user.id ? 'employer' : 'candidate' })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
