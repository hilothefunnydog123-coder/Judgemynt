import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
function getAdmin() {
  if (!URL.startsWith('http') || !SERVICE) return null
  try {
    return createClient(URL, SERVICE)
  } catch {
    return null
  }
}

function getAnon() {
  if (!URL.startsWith('http') || !ANON) return null
  try {
    return createClient(URL, ANON)
  } catch {
    return null
  }
}

// Invite tokens are just the employer's user id, base64url-encoded.
function decodeToken(t: string): string | null {
  try {
    return Buffer.from(t.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  } catch {
    return null
  }
}

async function companyFromAuth(req: NextRequest): Promise<{ id: string; name: string } | null> {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const c = getAnon()
  if (!token || !c) return null
  const { data } = await c.auth.getUser(token)
  if (!data?.user) return null
  const meta = (data.user.user_metadata || {}) as Record<string, string>
  return { id: data.user.id, name: meta.company_name || meta.full_name || '' }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const action = body.action as string

  // Candidate finished an invited exam — store the result.
  if (action === 'result') {
    const companyId = decodeToken(String(body.token || ''))
    if (!companyId) return NextResponse.json({ error: 'Invalid invite token.' }, { status: 400 })
    const admin = getAdmin()
    if (admin) {
      try {
        await admin.from('judgemynt_results').insert({
          company_id: companyId,
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

  // Employer dashboard — list their candidates' results.
  if (action === 'list') {
    const company = await companyFromAuth(req)
    if (!company) return NextResponse.json({ error: 'Sign in as a company.' }, { status: 401 })
    const admin = getAdmin()
    if (!admin) return NextResponse.json({ results: [] })
    try {
      const { data } = await admin
        .from('judgemynt_results')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
        .limit(200)
      return NextResponse.json({ results: data || [] })
    } catch {
      return NextResponse.json({ results: [] })
    }
  }

  // Public embeddable widget — scores for one company.
  if (action === 'widget') {
    const companyId = String(body.company_id || '')
    const admin = getAdmin()
    if (!companyId || !admin) return NextResponse.json({ results: [] })
    try {
      const { data } = await admin
        .from('judgemynt_results')
        .select('candidate_name,score,creativity,efficiency,quality,verdict,created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(50)
      return NextResponse.json({ results: data || [] })
    } catch {
      return NextResponse.json({ results: [] })
    }
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
