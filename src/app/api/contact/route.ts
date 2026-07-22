import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const FROM = process.env.EMAIL_FROM ?? 'Judgemynt <onboarding@resend.dev>'
const TO = process.env.CONTACT_EMAIL ?? 'judgemynt@gmail.com'
const OK = !!(process.env.RESEND_API_KEY && !process.env.RESEND_API_KEY.includes('your_'))

/** Built on demand, never at module load.
 *
 * `new Resend(undefined)` throws, and at module scope that throw happens while
 * Next collects page data at BUILD time — so an unconfigured deployment could
 * not compile at all, let alone degrade gracefully. Construct it only once we
 * know there is a key and we are actually about to send. */
function client(): Resend {
  return new Resend(process.env.RESEND_API_KEY)
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] as string)
}

export async function POST(req: NextRequest) {
  const { name, email, company, message } = await req.json().catch(() => ({}))
  if (!email || !message) return NextResponse.json({ error: 'Email and message are required.' }, { status: 400 })
  if (!OK) return NextResponse.json({ ok: true, note: 'Logged (email not configured).' })
  try {
    await client().emails.send({
      from: FROM,
      to: TO,
      subject: `Judgemynt, employer inquiry from ${esc(company || name || email)}`,
      html: `<p><b>Name:</b> ${esc(name)}</p>
<p><b>Company:</b> ${esc(company)}</p>
<p><b>Email:</b> ${esc(email)}</p>
<p><b>Message:</b></p>
<p>${esc(message).replace(/\n/g, '<br>')}</p>`,
    })
  } catch {
    return NextResponse.json({ error: 'Could not send, please email us directly.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
