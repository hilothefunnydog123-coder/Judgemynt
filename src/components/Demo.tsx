'use client'
/* ════════════════════════════════════════════════════════════════════════
   The landing demo. The whole pitch in 90 seconds, no signup.

   A visitor plays the support agent on a refund that looks out of policy.
   They can ask an AI that only has the ticket (it confidently gives the
   wrong answer), and they can open the two documents the AI never saw. The
   right call is only visible in the billing record. When they make it, they
   have FELT the product: the AI is not the skill, reading what you were
   handed is.

   Deliberately NOT one of the six real catalog tasks: this scenario is
   original, so playing the demo never spoils an assessment a candidate might
   sit later. It is scripted and self-contained, so it costs no tokens, never
   fails, and works before anyone signs in.
   ════════════════════════════════════════════════════════════════════════ */
import { useState } from 'react'
import { FileText, Check, X, ArrowRight, RotateCcw } from 'lucide-react'

const TEAL = '#00d4aa'
const RED = '#ff5470'
const INK = '#04121a'
const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

const TICKET = `From: ops@meridian.co
Subject: cancel + refund?

We moved onto the annual plan 8 days ago and were charged $1,200. We have
decided to go a different direction. Your site says refunds are only within
7 days. Is there anything you can do?`

const AI_ANSWER = `Thanks for reaching out, and sorry to see you go. I checked your account and your payment was 8 days ago, just outside our 7-day refund window, so I am not able to issue a refund on the annual plan. I have made sure the plan will not auto-renew, so you will not be charged again next year.`

const DOCS = [
  {
    id: 'policy',
    title: 'Refund policy (internal)',
    kind: 'policy',
    body: `Full refund within 7 days of payment, no questions asked.
After 7 days: no refund.

EXCEPTION: an annual plan billed by Net-30 invoice that is still UNPAID may be
cancelled at no charge, any time before the invoice comes due. Nothing has been
collected, so there is nothing to refund. Void the invoice instead.`,
  },
  {
    id: 'billing',
    title: 'Billing record: Meridian Co.',
    kind: 'data',
    body: `Account:        Meridian Co.
Plan:           Annual, $1,200
Billing method: Net-30 invoice
Invoice issued: 8 days ago
Status:         UNPAID  (due in 22 days)`,
  },
]

type Step = 'intro' | 'asked' | 'reading' | 'result'

export default function Demo({ onStart }: { onStart: () => void }) {
  const [step, setStep] = useState<Step>('intro')
  const [choice, setChoice] = useState<'void' | 'deny' | null>(null)
  const correct = choice === 'void'

  const card = 'rounded-2xl border'
  const cardStyle = { background: 'rgba(255,255,255,.02)', borderColor: 'rgba(255,255,255,.1)' }

  return (
    <div className={card} style={cardStyle}>
      {/* header bar, echoes the real workspace */}
      <div className="flex items-center gap-3 px-5 sm:px-6 py-3.5 border-b border-white/[0.08] flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full" style={{ background: `${TEAL}18`, color: TEAL }}>
          Customer Support
        </span>
        <span className="text-[13.5px] font-semibold text-white">A refund that looks out of policy</span>
        <span className="ml-auto text-[11px] font-bold uppercase tracking-widest text-white/50">Live demo · no signup</span>
      </div>

      <div className="p-5 sm:p-6">
        {/* the ticket */}
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/70 mb-2">
          <FileText className="w-3.5 h-3.5" /> The ticket
        </div>
        <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-white rounded-xl border border-white/[0.08] bg-black/25 px-4 py-3" style={{ fontFamily: mono }}>
          {TICKET}
        </pre>

        {/* intro: the two paths */}
        {step === 'intro' && (
          <>
            <p className="text-white font-bold text-[15px] mt-5">You are the support agent. What do you do?</p>
            <div className="flex flex-wrap gap-2.5 mt-3">
              <button
                onClick={() => setStep('asked')}
                className="rounded-full px-5 py-2.5 font-bold border transition hover:bg-white/5"
                style={{ borderColor: 'rgba(255,255,255,.2)', color: '#ffffff' }}
              >
                Ask the AI with just this
              </button>
              <button
                onClick={() => setStep('reading')}
                className="rounded-full px-5 py-2.5 font-bold text-[#04121a] hover:brightness-110 transition"
                style={{ background: TEAL, color: INK }}
              >
                Open the 2 documents
              </button>
            </div>
          </>
        )}

        {/* they asked the AI: it answers confidently and wrong */}
        {step === 'asked' && (
          <>
            <div className="mt-5">
              <div className="text-[11px] font-bold uppercase tracking-widest mb-1.5" style={{ color: TEAL }}>AI, given only the ticket</div>
              <div className="text-[14px] leading-relaxed text-white rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                {AI_ANSWER}
              </div>
            </div>
            <div className="mt-3 rounded-xl border px-4 py-3" style={{ background: `${RED}0d`, borderColor: `${RED}35` }}>
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest" style={{ color: RED }}>
                <X className="w-3.5 h-3.5" /> Confident, polite, and wrong
              </div>
              <p className="text-white font-medium text-[13.5px] mt-1.5 leading-relaxed">
                It just told the customer to pay $1,200 it never needed to collect. It never looked at how they were
                billed, because you never handed it the documents.
              </p>
            </div>
            <button
              onClick={() => setStep('reading')}
              className="mt-4 flex items-center gap-2 rounded-full px-5 py-2.5 font-bold text-[#04121a] hover:brightness-110 transition"
              style={{ background: TEAL, color: INK }}
            >
              Now open the documents <ArrowRight className="w-4 h-4" />
            </button>
          </>
        )}

        {/* reading + the decision */}
        {(step === 'reading' || step === 'result') && (
          <>
            <div className="grid sm:grid-cols-2 gap-2.5 mt-5">
              {DOCS.map((d) => (
                <div key={d.id} className="rounded-xl border border-white/[0.09] bg-black/25 p-3.5">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4" style={{ color: TEAL }} />
                    <span className="text-[13px] font-semibold text-white">{d.title}</span>
                    <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-white/50" style={{ fontFamily: mono }}>{d.kind}</span>
                  </div>
                  <pre className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-white/90" style={{ fontFamily: mono }}>{d.body}</pre>
                </div>
              ))}
            </div>

            {step === 'reading' && (
              <>
                <p className="text-white font-bold text-[15px] mt-5">Now make the call.</p>
                <div className="flex flex-wrap gap-2.5 mt-3">
                  <button
                    onClick={() => { setChoice('deny'); setStep('result') }}
                    className="rounded-full px-5 py-2.5 font-bold border transition hover:bg-white/5"
                    style={{ borderColor: 'rgba(255,255,255,.2)', color: '#ffffff' }}
                  >
                    Deny: it is past the 7-day window
                  </button>
                  <button
                    onClick={() => { setChoice('void'); setStep('result') }}
                    className="rounded-full px-5 py-2.5 font-bold border transition hover:bg-white/5"
                    style={{ borderColor: 'rgba(255,255,255,.2)', color: '#ffffff' }}
                  >
                    Void the unpaid invoice
                  </button>
                </div>
              </>
            )}

            {step === 'result' && (
              <div
                className="mt-5 rounded-xl border p-4"
                style={{ background: correct ? `${TEAL}0d` : `${RED}0d`, borderColor: correct ? `${TEAL}40` : `${RED}40` }}
              >
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest" style={{ color: correct ? TEAL : RED }}>
                  {correct ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                  {correct ? 'That is the call' : 'That is the trap'}
                </div>
                {correct ? (
                  <p className="text-white font-medium text-[14px] mt-2 leading-relaxed">
                    You read the billing record. The invoice is Net-30 and still unpaid, so there is nothing to refund:
                    you void it, the customer owes nothing, and the relationship stays clean. The AI never made that call,
                    because it never saw the document. You did.
                  </p>
                ) : (
                  <p className="text-white font-medium text-[14px] mt-2 leading-relaxed">
                    That is the same answer the AI gave. Look again at the billing record: the invoice is Net-30 and
                    UNPAID. Nothing was ever charged, so the policy exception applies. There is a better call here.
                  </p>
                )}
                {!correct && (
                  <button
                    onClick={() => { setChoice(null); setStep('reading') }}
                    className="mt-3 flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold border transition hover:bg-white/5"
                    style={{ borderColor: 'rgba(255,255,255,.2)', color: '#ffffff' }}
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Look again
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* the payoff, once they have engaged at all */}
        {step !== 'intro' && (
          <div className="mt-6 pt-5 border-t border-white/10">
            <p className="text-white font-semibold text-[14px] leading-relaxed">
              That is the whole idea. Judgemynt hands every candidate an AI and the documents it does not have, then
              measures whether they read them. The real assessment is timed, graded on a rubric, and benchmarked against
              everyone else who took it.
            </p>
            <button
              onClick={onStart}
              className="mt-4 flex items-center gap-2 rounded-full px-6 py-3 font-bold text-[#04121a] hover:brightness-110 transition"
              style={{ background: TEAL, color: INK }}
            >
              Take a real one, free <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
