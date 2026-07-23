/* ════════════════════════════════════════════════════════════════════════
   A credential, publicly verifiable.

   This is the URL a holder puts on LinkedIn. It renders server-side from
   the credentials table and shows exactly what an employer needs to check:
   who, which task, what score against what bar, and when. Nothing else on
   the account is reachable from here.
   ════════════════════════════════════════════════════════════════════════ */
import type { Metadata } from 'next'
import Link from 'next/link'
import { admin } from '@/lib/db'

const TEAL = '#00d4aa'

interface Credential {
  id: string
  holder_name: string | null
  task_title: string | null
  score: number | null
  pass_mark: number | null
  verdict: string | null
  created_at: string
}

async function load(id: string): Promise<Credential | null> {
  // Only UUIDs are ever valid ids; refusing early keeps junk out of the query.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const db = admin()
  if (!db) return null
  const { data } = await db
    .from('judgemynt_credentials')
    .select('id, holder_name, task_title, score, pass_mark, verdict, created_at')
    .eq('id', id)
    .maybeSingle()
  return (data as Credential) || null
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const c = await load(id)
  return {
    title: c ? `${c.holder_name || 'Credential'}: Judgemynt AI Judgment Credential` : 'Credential not found',
  }
}

export default async function CredentialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const c = await load(id)

  return (
    <div className="min-h-screen text-[#eaf4fa] flex items-center justify-center px-5 py-12">
      <link rel="stylesheet" href="https://db.onlinewebfonts.com/c/8b75d9dcff6a48c35a46656192adf019?family=FSP+DEMO+-+PODIUM+Sharp+4.11" />
      <style>{`.font-podium{font-family:"FSP DEMO - PODIUM Sharp 4.11", var(--font-sans), system-ui, sans-serif;}`}</style>
      <div className="w-full max-w-xl">
        {!c ? (
          <div className="rounded-2xl border border-white/10 p-8 text-center" style={{ background: 'rgba(255,255,255,.02)' }}>
            <div className="font-podium text-2xl uppercase">No such credential</div>
            <p className="text-white font-medium mt-3">
              This id does not match any issued credential. If someone showed it to you, treat that as the answer.
            </p>
            <Link href="/" className="inline-block mt-6 rounded-full px-6 py-2.5 font-bold text-[#04121a]" style={{ background: TEAL }}>
              Judgemynt
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border p-8" style={{ background: 'rgba(255,255,255,.02)', borderColor: `${TEAL}40` }}>
            <div className="flex items-center gap-2.5">
              <span
                className="w-8 h-8 rounded-lg inline-flex items-center justify-center font-black text-[12px] text-[#06121f]"
                style={{ background: TEAL }}
              >
                JM
              </span>
              <span className="font-podium uppercase tracking-wider text-lg">Judgemynt</span>
              <span className="ml-auto text-[10px] font-bold uppercase tracking-widest" style={{ color: TEAL }}>
                Verified credential
              </span>
            </div>

            <div className="font-podium text-[clamp(1.6rem,5vw,2.6rem)] uppercase leading-tight mt-7">
              {c.holder_name || 'Credential holder'}
            </div>
            <p className="text-white font-semibold mt-2">
              passed the AI judgment work-sample assessment
            </p>
            <p className="text-white font-bold text-lg mt-1">{c.task_title || 'Assessment'}</p>

            <div className="flex items-end gap-8 mt-7">
              <div>
                <div className="font-podium text-5xl tabular-nums" style={{ color: TEAL }}>{c.score ?? '--'}</div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-white mt-1">
                  score, pass at {c.pass_mark ?? 70}
                </div>
              </div>
              {c.verdict && (
                <div className="pb-2">
                  <div className="text-[11px] font-bold uppercase tracking-widest text-white">Examiner verdict</div>
                  <div className="font-semibold" style={{ color: TEAL }}>{c.verdict}</div>
                </div>
              )}
            </div>

            <div className="mt-7 pt-5 border-t border-white/10 flex items-center gap-4 flex-wrap text-[12.5px] font-medium text-white">
              <span>Issued {new Date(c.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
              <span className="text-white/50">·</span>
              <span className="break-all">ID {c.id}</span>
            </div>

            <p className="text-white font-medium text-[13.5px] mt-5 leading-relaxed">
              This assessment hands the candidate a live AI assistant and a pack of context documents with
              hidden judgment traps, then grades whether they caught what the documents imply. The score
              measures the person directing the AI, not the AI.
            </p>

            <Link href="/" className="inline-block mt-6 rounded-full px-6 py-2.5 font-bold text-[#04121a] hover:brightness-110 transition" style={{ background: TEAL }}>
              Take the same assessment
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
