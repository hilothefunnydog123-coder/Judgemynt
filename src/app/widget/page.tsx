'use client'

import { useEffect, useState } from 'react'

const TEAL = '#00d4aa'

interface Row {
  candidate_name?: string
  score?: number
  verdict?: string
}

export default function WidgetPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('c') || ''
    if (!c) {
      setLoaded(true)
      return
    }
    fetch('/api/enterprise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'widget', company_id: c }),
    })
      .then((r) => r.json())
      .then((d) => setRows(d.results || []))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const band = (s?: number) => (s == null ? '#7d97ab' : s >= 90 ? TEAL : s >= 70 ? '#5ee0c0' : s >= 40 ? '#f59e0b' : '#ff5470')

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#06121f',
        color: '#eaf4fa',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ width: 22, height: 22, borderRadius: 6, background: `linear-gradient(135deg, ${TEAL}, #1e90ff)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#06121f', fontWeight: 900, fontSize: 10 }}>JM</span>
        <span style={{ fontWeight: 800, fontSize: 14 }}>Verified by Judgemynt</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#46596b', letterSpacing: 1, textTransform: 'uppercase' }}>AI Judgment Exam</span>
      </div>

      {!loaded ? (
        <div style={{ color: '#7d97ab', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ color: '#7d97ab', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>No verified candidates yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '10px 14px' }}>
              <span style={{ width: 40, fontWeight: 900, fontSize: 18, color: band(r.score), fontVariantNumeric: 'tabular-nums' }}>{r.score ?? '--'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{r.candidate_name || 'Anonymous'}</div>
                {r.verdict && <div style={{ fontSize: 12, color: '#7d97ab', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.verdict}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
