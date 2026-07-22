import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const SUPABASE_ENABLED = !!(
  url && key &&
  url !== 'your_supabase_url_here' &&
  key !== 'your_supabase_anon_key_here'
)

// Null when unconfigured rather than throwing, so the site still builds and
// renders for anyone who clones it without credentials. Every caller checks.
export const supabase = SUPABASE_ENABLED ? createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // PKCE is the current recommended OAuth flow: the Google redirect carries a
    // one-time code instead of tokens in the URL fragment, and supabase-js
    // exchanges it automatically because detectSessionInUrl is on.
    flowType: 'pkce',
  },
}) : null

/** A stored assessment result — mirrors supabase-judgemynt.sql. */
export interface JmResult {
  id: string
  company_id: string
  company_name: string | null
  candidate_name: string | null
  candidate_email: string | null
  score: number | null
  creativity: number | null
  efficiency: number | null
  quality: number | null
  verdict: string | null
  created_at: string
}
