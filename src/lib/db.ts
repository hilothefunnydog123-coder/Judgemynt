/* Server-side Supabase access.
 *
 * Two clients, deliberately separated:
 *   admin() — service role, bypasses RLS. Every real read and write.
 *   anon()  — used ONLY to verify a bearer token belongs to a real user.
 *
 * Both return null when unconfigured so the app runs without a database:
 * candidates can still take an assessment, the result just is not stored.
 * Callers must handle null rather than assume a client exists.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

let _admin: SupabaseClient | null | undefined
let _anon: SupabaseClient | null | undefined

export function admin(): SupabaseClient | null {
  if (_admin !== undefined) return _admin
  _admin = URL.startsWith('http') && SERVICE ? createClient(URL, SERVICE) : null
  return _admin
}

export function anon(): SupabaseClient | null {
  if (_anon !== undefined) return _anon
  _anon = URL.startsWith('http') && ANON ? createClient(URL, ANON) : null
  return _anon
}

export interface Company {
  id: string
  name: string
}

/** The signed-in company behind a request, or null. Never trusts a body field. */
export async function companyFromAuth(req: NextRequest): Promise<Company | null> {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const c = anon()
  if (!token || !c) return null
  const { data } = await c.auth.getUser(token)
  if (!data?.user) return null
  const meta = (data.user.user_metadata || {}) as Record<string, string>
  return { id: data.user.id, name: meta.company_name || meta.full_name || '' }
}

/* ── Invite tokens ────────────────────────────────────────────────────────
 * A token carries the company id and, optionally, the role being assessed.
 * It is an identifier, not a secret: it grants the right to TAKE an
 * assessment and to write one result, never to read anything. Encoding is
 * base64url of "companyId" or "companyId:roleId".
 */
export function encodeInvite(companyId: string, roleId?: string | null): string {
  const raw = roleId ? `${companyId}:${roleId}` : companyId
  return Buffer.from(raw, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeInvite(token: string): { companyId: string; roleId: string | null } | null {
  try {
    const raw = Buffer.from(String(token).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    if (!raw) return null
    const [companyId, roleId] = raw.split(':')
    if (!companyId) return null
    return { companyId, roleId: roleId || null }
  } catch {
    return null
  }
}
