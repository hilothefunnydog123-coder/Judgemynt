// Lightweight per-IP rate limiter for expensive API routes.
// Note: in-memory + per serverless instance (best-effort). It meaningfully
// slows scripted abuse of the paid AI endpoints without an external store.
// For hard, distributed limits, back this with Upstash/Supabase later.

type Hit = { count: number; reset: number }
const buckets = new Map<string, Hit>()

export function rateLimit(
  req: Request,
  opts: { limit: number; windowMs: number; tag?: string },
): { ok: boolean; retryAfter: number } {
  const ip =
    req.headers.get('x-nf-client-connection-ip') ||
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown'
  const key = `${opts.tag ?? 'g'}:${ip}`
  const now = Date.now()

  // occasional cleanup so the map can't grow unbounded
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k)
  }

  const hit = buckets.get(key)
  if (!hit || now > hit.reset) {
    buckets.set(key, { count: 1, reset: now + opts.windowMs })
    return { ok: true, retryAfter: 0 }
  }
  hit.count++
  if (hit.count > opts.limit) {
    return { ok: false, retryAfter: Math.ceil((hit.reset - now) / 1000) }
  }
  return { ok: true, retryAfter: 0 }
}
