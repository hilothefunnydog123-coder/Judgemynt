/**
 * GEMINI GOVERNOR — the ceiling on the bill.
 *
 * Grading is the only expensive thing Judgemynt does, and it is also the thing
 * a bored visitor can hit in a loop. gfetch() is a DROP-IN replacement for
 * fetch() on generativelanguage URLs that gives every call site, uniformly:
 *
 *   • response caching — an identical prompt within the TTL returns the cached
 *     answer instead of being paid for twice
 *   • a shared DAILY BUDGET, counted separately for grounded (expensive)
 *     and plain flash calls — past it, callers get their cached answer if
 *     one exists, else a clean 429 their existing error paths already handle
 *   • stale-serving — an upstream error or 429 from Google returns the last
 *     good response instead of breaking the page
 *
 * Per-IP limiting is a different job and lives in lib/ratelimit.ts: this caps
 * the daily bill, that caps one abuser.
 */

const CACHE_MAX = 400
const mem = new Map<string, { at: number; status: number; body: string }>()

const GROUNDED_CAP = 150   // grounded Google-Search calls/day (free tier ≈500 total; edge board budgets its own 200)
const FLASH_CAP = 700      // plain gemini-2.5-flash calls/day
let day = ''
let grounded = 0
let flash = 0

function rollDay(): void {
  const d = new Date().toISOString().slice(0, 10)
  if (d !== day) { day = d; grounded = 0; flash = 0 }
}

function fnv(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(36)
}

/** Spend counters, for diagnostics. */
export function geminiSpend(): { day: string; grounded: number; flash: number; groundedCap: number; flashCap: number } {
  rollDay()
  return { day, grounded, flash, groundedCap: GROUNDED_CAP, flashCap: FLASH_CAP }
}

export interface GFetchOptions {
  /** Cache TTL for an identical (url,body). Default: 4h grounded, 15min flash. */
  ttlMs?: number
}

/** Drop-in fetch() for Gemini calls — cache → budget → live → stale fallback. */
export async function gfetch(input: string, init?: RequestInit, opts: GFetchOptions = {}): Promise<Response> {
  const body = typeof init?.body === 'string' ? init.body : ''
  const isGrounded = body.includes('google_search')
  const ttl = opts.ttlMs ?? (isGrounded ? 4 * 3600_000 : 15 * 60_000)
  rollDay()

  const key = `${input.split('?')[0]}|${fnv(body)}`
  const hit = mem.get(key)
  const asResponse = (h: { status: number; body: string }) =>
    new Response(h.body, { status: h.status, headers: { 'Content-Type': 'application/json' } })

  if (hit && Date.now() - hit.at < ttl) return asResponse(hit)

  const overBudget = isGrounded ? grounded >= GROUNDED_CAP : flash >= FLASH_CAP
  if (overBudget) {
    if (hit) return asResponse(hit) // stale beats nothing
    return new Response(
      JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Daily free-tier AI budget spent, feature resumes tomorrow.' } }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    )
  }
  if (isGrounded) grounded++
  else flash++

  try {
    const res = await fetch(input, init)
    const text = await res.text()
    if (res.ok) {
      if (mem.size >= CACHE_MAX) {
        const oldest = mem.keys().next().value
        if (oldest) mem.delete(oldest)
      }
      mem.set(key, { at: Date.now(), status: res.status, body: text })
    } else if (hit) {
      return asResponse(hit)
    }
    return new Response(text, { status: res.status, headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' } })
  } catch (e) {
    if (hit) return asResponse(hit)
    throw e
  }
}
