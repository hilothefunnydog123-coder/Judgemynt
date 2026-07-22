/* Employer endpoints that are not role configuration.
 *
 * `widget` is deliberately public and unauthenticated — it backs the
 * embeddable scoreboard a company puts on their careers page, so it must work
 * inside an iframe on someone else's domain with no session. It therefore
 * returns only what a company has chosen to publish: first name, score,
 * verdict. Never emails, never transcripts, never the answer key.
 *
 * Role CRUD, full results, and transcripts live in /api/company behind auth.
 */
import { NextRequest, NextResponse } from 'next/server'
import { admin, companyFromAuth, decodeInvite } from '@/lib/db'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const action = String(body.action || '')

  // Legacy write path: older clients post their result here rather than
  // letting /api/assess store it. Kept so an in-flight assessment started
  // before a deploy still lands.
  if (action === 'result') {
    const invite = decodeInvite(String(body.token || ''))
    if (!invite) return NextResponse.json({ error: 'Invalid invite token.' }, { status: 400 })
    const db = admin()
    if (db) {
      try {
        await db.from('judgemynt_results').insert({
          company_id: invite.companyId,
          role_id: invite.roleId,
          company_name: body.company_name || null,
          candidate_name: body.candidate_name || null,
          candidate_email: body.candidate_email || null,
          score: body.score ?? null,
          creativity: body.creativity ?? null,
          efficiency: body.efficiency ?? null,
          quality: body.quality ?? null,
          verdict: body.verdict || null,
        })
      } catch {
        /* table may not exist yet */
      }
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'list') {
    const company = await companyFromAuth(req)
    if (!company) return NextResponse.json({ error: 'Sign in as a company.' }, { status: 401 })
    const db = admin()
    if (!db) return NextResponse.json({ results: [] })
    const { data } = await db
      .from('judgemynt_results')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
      .limit(200)
    return NextResponse.json({ results: data || [] })
  }

  if (action === 'widget') {
    const companyId = String(body.company_id || '')
    const db = admin()
    if (!companyId || !db) return NextResponse.json({ results: [] })
    const { data } = await db
      .from('judgemynt_results')
      .select('candidate_name,score,verdict,role_name,passed,created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(50)
    // Trim to a first name — the widget is public and a full name plus a low
    // score on someone else's careers page is a real harm.
    const results = (data || []).map((r: Record<string, unknown>) => ({
      ...r,
      candidate_name: String(r.candidate_name || '').trim().split(/\s+/)[0] || 'Candidate',
    }))
    return NextResponse.json({ results })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
