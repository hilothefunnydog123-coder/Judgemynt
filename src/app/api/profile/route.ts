/* ════════════════════════════════════════════════════════════════════════
   Profiles.

   Everyone who uses Judgemynt signed in has exactly one profile row saying
   which side of the marketplace they are on:

     candidate — legal first and last name. This is the name that goes on
                 credentials and applications, so it is required.
     employer  — company name and link. This is what candidates see on a
                 job posting, so the name is required.

   Two actions: 'get' returns the caller's profile (or null, which the UI
   treats as "onboarding not done"), 'save' validates and upserts it.
   ════════════════════════════════════════════════════════════════════════ */
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/ratelimit'
import { admin, userFromAuth } from '@/lib/db'

const str = (v: unknown, max: number): string => String(v ?? '').trim().slice(0, max)

/** Accept "example.com" and store "https://example.com". Reject junk. */
function cleanUrl(v: unknown): string {
  let s = str(v, 300)
  if (!s) return ''
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`
  try {
    const u = new URL(s)
    if (!u.hostname.includes('.')) return ''
    return u.toString()
  } catch {
    return ''
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { limit: 60, windowMs: 60000, tag: 'jm-profile' })
  if (!rl.ok)
    return NextResponse.json(
      { error: 'Slow down a moment.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    )

  const user = await userFromAuth(req)
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const db = admin()
  if (!db) return NextResponse.json({ error: 'Database is not configured on this deployment.' }, { status: 503 })

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const action = String(body.action || '')

  if (action === 'get') {
    const { data } = await db.from('judgemynt_profiles').select('*').eq('user_id', user.id).maybeSingle()
    return NextResponse.json({ profile: data || null })
  }

  if (action === 'save') {
    const kind = body.kind === 'employer' ? 'employer' : 'candidate'
    const firstName = str(body.first_name, 80)
    const lastName = str(body.last_name, 80)
    const companyName = str(body.company_name, 160)
    const companyUrl = cleanUrl(body.company_url)

    if (kind === 'candidate' && (!firstName || !lastName)) {
      return NextResponse.json({ error: 'Your legal first and last name are both required.' }, { status: 400 })
    }
    if (kind === 'employer' && !companyName) {
      return NextResponse.json({ error: 'Your company name is required.' }, { status: 400 })
    }
    if (kind === 'employer' && !companyUrl) {
      return NextResponse.json({ error: 'A working company link is required, e.g. https://yourcompany.com.' }, { status: 400 })
    }

    const row = {
      user_id: user.id,
      kind,
      email: user.email || null,
      first_name: kind === 'candidate' ? firstName : null,
      last_name: kind === 'candidate' ? lastName : null,
      company_name: kind === 'employer' ? companyName : null,
      company_url: kind === 'employer' ? companyUrl : null,
    }

    const { data, error } = await db
      .from('judgemynt_profiles')
      .upsert(row, { onConflict: 'user_id' })
      .select()
      .maybeSingle()
    if (error || !data) return NextResponse.json({ error: 'Could not save your profile.' }, { status: 500 })
    return NextResponse.json({ profile: data })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
