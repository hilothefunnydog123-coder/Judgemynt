/* ════════════════════════════════════════════════════════════════════════
   The assessment engine.

   Three actions:
     task     — resolve the role (catalog task, or a company's own) and hand
                the workspace everything the browser is allowed to see.
     respond  — the AI the candidate is directing. It is genuinely helpful and
                genuinely unaware of the traps; it will happily produce the
                naive answer if that is what it is asked for. That is the point.
     evaluate — grade the session against the company's rubric, the task's
                hidden traps, and the process telemetry.

   The examiner never sees the answer key and the transcript in separate
   passes — it grades once, with everything, because trap resolution is a
   judgment about the whole session rather than a string match.
   ════════════════════════════════════════════════════════════════════════ */
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/ratelimit'
import { gfetch } from '@/lib/gemini'
import { admin, decodeInvite, profileFor, userFromAuth } from '@/lib/db'
import { MODEL_BY_ID, TASKS } from '@/lib/tasks'
import { keyFor } from '@/lib/tasks.server'
import { publicRole, resolveRole, type Role, type ResolvedRole } from '@/lib/roles'
import { overallFrom, normalized } from '@/lib/rubric'
import { deriveSignals, sanitizeTelemetry, signalsForPrompt } from '@/lib/telemetry'

/* gemini-2.5-flash by default; set GEMINI_MODEL=gemini-2.5-flash-lite for a
   much higher free-tier daily request allowance at slightly lower quality. */
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

interface Msg {
  role: string
  content: string
}

const estTokens = (s: string): number => Math.ceil((s || '').length / 4)
const clamp = (v: unknown): number => Math.max(0, Math.min(100, Math.round(Number(v) || 0)))

function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

function transcript(history: Msg[], cap: number): string {
  const lines = history.map((m) => {
    const who = m.role === 'assistant' ? 'AI' : m.role === 'user' ? 'CANDIDATE' : 'SYS'
    return `${who}: ${m.content}`
  })
  const out = lines.join('\n')
  return out.length > cap ? '…\n' + out.slice(out.length - cap) : out
}

type GeminiResult = { ok: true; text: string } | { ok: false; why: string }

/** Returns the reply text, or a human-readable reason it could not.
 *  The reason reaches the UI: a misconfigured deployment should say exactly
 *  what is wrong instead of a generic "AI unavailable". */
async function callGemini(prompt: string, tokens: number, temperature: number): Promise<GeminiResult> {
  const key = process.env.GEMINI_API_KEY
  if (!key) {
    return { ok: false, why: 'This deployment has no GEMINI_API_KEY set. Add it to the environment variables and redeploy.' }
  }
  try {
    const res = await gfetch(`${GEMINI_URL}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // gemini-2.5-flash is a thinking model; thinking off so output tokens
        // go to the JSON we asked for rather than to internal reasoning.
        generationConfig: { maxOutputTokens: tokens, temperature, thinkingConfig: { thinkingBudget: 0 } },
      }),
    })
    if (!res.ok) {
      let detail = ''
      try {
        const j = await res.json()
        detail = String(j?.error?.message || '').slice(0, 200)
      } catch {}
      return { ok: false, why: `The AI provider returned ${res.status}${detail ? `: ${detail}` : '.'}` }
    }
    const json = await res.json()
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
    if (!text) {
      const reason = String(json.candidates?.[0]?.finishReason || json.promptFeedback?.blockReason || 'empty reply')
      return { ok: false, why: `The AI returned no text (${reason}). Try again.` }
    }
    return { ok: true, text }
  } catch {
    return { ok: false, why: 'Could not reach the AI provider. Check the network and try again.' }
  }
}

/* Groq is the free fallback: OpenAI-compatible, no card required, and its
   free tier survives long after Gemini's daily quota is gone. Optional; it
   only runs when GROQ_API_KEY is set and Gemini has already failed. */
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'

async function callGroq(prompt: string, tokens: number, temperature: number): Promise<GeminiResult> {
  const key = process.env.GROQ_API_KEY
  if (!key) return { ok: false, why: 'No fallback provider is configured.' }
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: tokens,
        temperature,
      }),
    })
    if (!res.ok) {
      let detail = ''
      try {
        const j = await res.json()
        detail = String(j?.error?.message || '').slice(0, 200)
      } catch {}
      return { ok: false, why: `The fallback AI returned ${res.status}${detail ? `: ${detail}` : '.'}` }
    }
    const json = await res.json()
    const text = String(json.choices?.[0]?.message?.content || '').trim()
    if (!text) return { ok: false, why: 'The fallback AI returned no text. Try again.' }
    return { ok: true, text }
  } catch {
    return { ok: false, why: 'Could not reach the fallback AI provider.' }
  }
}

/** Gemini first, Groq when Gemini cannot answer. Callers never know which. */
async function callAI(prompt: string, tokens: number, temperature: number): Promise<GeminiResult> {
  const primary = await callGemini(prompt, tokens, temperature)
  if (primary.ok) return primary
  const fallback = await callGroq(prompt, tokens, temperature)
  if (fallback.ok) return fallback
  // Report the primary failure: it is the one worth fixing.
  return primary
}

/** Load the role behind an invite token, falling back to the catalog default. */
async function roleFor(token: string | undefined, taskId: string | undefined): Promise<ResolvedRole> {
  const invite = token ? decodeInvite(token) : null
  if (invite?.roleId) {
    const db = admin()
    if (db) {
      try {
        const { data } = await db
          .from('judgemynt_roles')
          .select('*')
          .eq('id', invite.roleId)
          .eq('company_id', invite.companyId)
          .maybeSingle()
        if (data) return resolveRole(data as Role)
      } catch {
        /* fall through to the catalog */
      }
    }
  }
  return resolveRole(null, taskId || 'slugify')
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { limit: 40, windowMs: 60000, tag: 'jm-assess' })
  if (!rl.ok)
    return NextResponse.json(
      { error: 'Slow down a moment.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    )

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const action = String(body.action || '')

  /* ── the catalog, for the practice picker ───────────────────────────── */
  if (action === 'catalog') {
    return NextResponse.json({
      tasks: TASKS.map((t) => ({
        id: t.id,
        title: t.title,
        role: t.role,
        roleEmoji: t.roleEmoji,
        color: t.color,
        tagline: t.tagline,
        difficulty: t.difficulty,
        docs: t.docs.length,
        budget: t.budget,
      })),
    })
  }

  /* ── resolve what this candidate is actually taking ─────────────────── */
  if (action === 'task') {
    const resolved = await roleFor(body.token as string, body.taskId as string)
    return NextResponse.json({
      task: publicRole(resolved),
      models: Object.values(MODEL_BY_ID).map((m) => ({
        id: m.id,
        tag: m.tag,
        mult: m.mult,
        accent: m.accent,
        glyph: m.glyph,
        blurb: m.blurb,
      })),
    })
  }

  /* ── the AI under the candidate's direction ─────────────────────────── */
  if (action === 'respond') {
    const message = String(body.message || '')
    const history = (body.history as Msg[]) || []
    const m = MODEL_BY_ID[String(body.model)] || MODEL_BY_ID.gpt
    if (!message.trim()) return NextResponse.json({ error: 'Empty message.' }, { status: 400 })

    const resolved = await roleFor(body.token as string, body.taskId as string)
    const hist = transcript(history.slice(-14), 6000)

    // The assistant is a PURE, full-capability AI: no muzzle, no forced
    // brevity, no behavioural rules. The exam still works because the AI only
    // knows what the candidate feeds it, and getting the right context in
    // front of it is exactly the skill being graded. The examiner separately
    // refuses credit for anything the AI raised that the candidate ignored.
    const prompt = `You are "${m.tag}", ${m.persona}. You are the AI assistant in a live work session; the person chose you as their assistant for this task. Behave exactly as you would in a normal chat: answer what they say, do the work they ask for, and do it at the highest quality you are capable of.

THE TASK THEY ARE WORKING ON:
${resolved.brief}

WHAT THEY MUST DELIVER:
${resolved.deliverable}

CONVERSATION SO FAR:
${hist || '(none yet)'}

THEIR NEW MESSAGE:
${message}

One formatting note: never use em dashes; use commas, colons, or separate sentences instead.

Reply as the assistant now.`

    // 2048 output tokens: quality needs headroom, and length already prices
    // itself in, since a longer reply costs the candidate more budget.
    const r = await callAI(prompt, 2048, 0.55)
    if (!r.ok) return NextResponse.json({ error: r.why }, { status: 502 })
    const cost = Math.ceil((estTokens(message) + estTokens(r.text)) * m.mult) + 40
    return NextResponse.json({ reply: r.text, tokensUsed: cost, model: m.tag })
  }

  /* ── grade the session ──────────────────────────────────────────────── */
  if (action === 'evaluate') {
    // Taking the test requires an account: the score lands on a real person,
    // whether it becomes a credential or a marketplace application.
    const user = await userFromAuth(req)
    if (!user) {
      return NextResponse.json({ error: 'Sign in to be graded. Your session is kept on screen.' }, { status: 401 })
    }
    const profile = await profileFor(user.id)
    const legalName = profile ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') : ''

    const history = (body.history as Msg[]) || []
    const m = MODEL_BY_ID[String(body.model)] || MODEL_BY_ID.gpt
    const resolved = await roleFor(body.token as string, body.taskId as string)
    const rubric = resolved.rubric
    const key = resolved.custom ? undefined : keyFor(resolved.taskId)

    const tokensUsed = Number(body.tokensUsed) || 0
    const tokensBudget = Number(body.tokensBudget) || resolved.budget.tokens
    const secondsUsed = Number(body.secondsUsed) || 0
    const timeLimit = Number(body.timeLimit) || resolved.budget.seconds
    const reason = String(body.reason || 'submit')
    const tel = sanitizeTelemetry(body.telemetry)
    const signals = deriveSignals(tel, resolved.docs.length)

    const userTurns = history.filter((h) => h.role === 'user' && (h.content || '').trim()).length
    if (userTurns === 0) {
      const zero: Record<string, number> = {}
      rubric.dimensions.forEach((d) => (zero[d.id] = 0))
      return NextResponse.json({
        overall: 0,
        passed: false,
        passMark: rubric.passMark,
        verdict: 'Nothing submitted',
        dimensions: zero,
        dimensionLabels: rubric.dimensions.map((d) => ({ id: d.id, label: d.label })),
        traps: [],
        steps: [],
        signals,
        analysis:
          'The session ended without a single instruction to the AI, so there is no work to evaluate.',
        hire: 'No. The task was not attempted.',
      })
    }

    const requirements = [...(key?.requirements || []), ...resolved.extraRequirements]
    const traps = rubric.useTraps ? key?.traps || [] : []

    const endedBy =
      reason === 'tokens'
        ? 'they ran out of tokens and were locked out'
        : reason === 'time'
          ? 'they ran out of time and were locked out'
          : 'they submitted deliberately'

    const dimBlock = normalized(rubric)
      .map(({ dim, share }) => `- "${dim.id}" (${dim.label}, ${Math.round(share * 100)}% of the score): ${dim.prompt}`)
      .join('\n')

    const trapBlock = traps.length
      ? traps
          .map(
            (t, i) =>
              `${i + 1}. [${t.id}] ${t.name} (weight ${t.weight})\n   The undirected answer: ${t.naive}\n   Resolving it looks like: ${t.tell}`
          )
          .join('\n')
      : '(none for this task)'

    const prompt = `You are the lead examiner for Judgemynt. A candidate was given a real work task, a real AI assistant to direct, a token budget, and a clock. You are deciding what their work says about them.

THE HARD RULE: judge ONLY what literally appears in the transcript. Never credit an instruction, a check, or a piece of reasoning the candidate did not actually send. They sent ${userTurns} instruction(s). If that is few or vague, the scores must be low regardless of how good the AI's output happened to be. The AI is not the one being assessed.

THE TASK:
${resolved.brief}

WHAT THEY HAD TO DELIVER:
${resolved.deliverable}

${requirements.length ? `HARD REQUIREMENTS (check the final deliverable against every one):\n${requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}` : ''}

CONTEXT DOCUMENTS THEY COULD OPEN (${resolved.docs.length}):
${resolved.docs.map((d) => `- "${d.title}"`).join('\n') || '(none)'}

HIDDEN TRAPS (the candidate could not see these). They are the point of the exercise: each one is something the context documents imply, that an AI given only the brief will get wrong.
${trapBlock}

RESOURCES: ${tokensUsed}/${tokensBudget} tokens, ${secondsUsed}s of ${timeLimit}s. Session ended because ${endedBy}. Model directed: ${m.tag}.

HOW THEY WORKED (observed, not self-reported):
${signalsForPrompt(signals)}

FULL SESSION, in order:
${transcript(history, 12000) || '(no interaction)'}
${rubric.houseRules ? `\nHOUSE RULES FROM THE HIRING COMPANY (apply these, they override your defaults where they conflict):\n${rubric.houseRules}\n` : ''}
Score each dimension 0-100:
${dimBlock}

${traps.length ? `For every trap, decide whether they RESOLVED it. Resolved means the final deliverable or their explicit reasoning handles it, not that they used particular words, and not that the AI mentioned it unprompted while they ignored it.` : ''}

Then pick their 3-5 most consequential moves and judge each in one line. Finish with a blunt hiring call a manager could act on.

Write every text field in plain, direct sentences. Never use em dashes anywhere in your output.

Return ONLY raw JSON, no markdown:
{
  "dimensions": { ${rubric.dimensions.map((d) => `"${d.id}": <0-100>`).join(', ')} },
  "verdict": "<punchy 3-6 word verdict>",
  "traps": [ ${traps.length ? `{ "id": "<trap id>", "resolved": <true|false>, "note": "<one line on what they actually did>" }` : ''} ],
  "steps": [ { "move": "<what they did, 8 words max>", "take": "<one-line judgment>" } ],
  "analysis": "<3-4 sentences: what this session says about how they work>",
  "hire": "<one line: would you trust them with real work alongside AI, and why>"
}${traps.length ? `\nThe "traps" array must contain exactly ${traps.length} objects, one per trap, using the exact ids given above.` : ''}`

    const raw = await callAI(prompt, 1800, 0.25)
    if (!raw.ok) return NextResponse.json({ error: raw.why }, { status: 502 })
    const p = extractJson(raw.text)
    if (!p) return NextResponse.json({ error: 'The examiner returned malformed output. Submit again.' }, { status: 502 })

    const rawDims = (p.dimensions as Record<string, unknown>) || {}
    const dimensions: Record<string, number> = {}
    rubric.dimensions.forEach((d) => (dimensions[d.id] = clamp(rawDims[d.id])))

    const rawTraps = Array.isArray(p.traps) ? (p.traps as Record<string, unknown>[]) : []
    const trapResults = traps.map((t) => {
      const hit = rawTraps.find((r) => String(r.id) === t.id)
      return {
        id: t.id,
        name: t.name,
        weight: t.weight,
        resolved: Boolean(hit?.resolved),
        note: String(hit?.note || ''),
      }
    })

    const overall = overallFrom(rubric, dimensions)
    const steps = Array.isArray(p.steps) ? (p.steps as Record<string, unknown>[]) : []

    const result = {
      overall,
      passed: overall >= rubric.passMark,
      passMark: rubric.passMark,
      verdict: String(p.verdict || 'Assessed'),
      dimensions,
      dimensionLabels: rubric.dimensions.map((d) => ({ id: d.id, label: d.label })),
      traps: trapResults,
      steps: steps.map((s) => ({ move: String(s.move || ''), take: String(s.take || '') })).slice(0, 6),
      signals,
      analysis: String(p.analysis || ''),
      hire: String(p.hire || ''),
    }

    /* Store it if this was an invited assessment. Never block the candidate's
       result on a database that might not be configured. */
    const invite = body.token ? decodeInvite(String(body.token)) : null
    const db = admin()
    if (invite && db) {
      try {
        const { data: stored } = await db
          .from('judgemynt_results')
          .insert({
            company_id: invite.companyId,
            company_name: (body.company_name as string) || null,
            candidate_name: legalName || (body.candidate_name as string) || null,
            candidate_email: user.email || (body.candidate_email as string) || null,
            score: overall,
            // Legacy columns kept populated so the embeddable widget and any
            // existing dashboards keep rendering after the rubric change.
            creativity: dimensions.direction ?? dimensions.judgment ?? null,
            efficiency: dimensions.efficiency ?? null,
            quality: dimensions.quality ?? null,
            verdict: result.verdict,
            role_id: resolved.roleId,
            role_name: resolved.roleName,
            task_id: resolved.taskId,
            passed: result.passed,
            pass_mark: rubric.passMark,
            dimensions,
            traps: trapResults,
            signals,
            tokens_used: tokensUsed,
            tokens_budget: tokensBudget,
            seconds_used: secondsUsed,
            model: m.tag,
            ended_by: reason,
            analysis: result.analysis,
            hire: result.hire,
            transcript: history.slice(-80),
          })
          .select('id')
          .maybeSingle()

        /* A marketplace application took this test: land the score on it. The
           candidate on the application must be the signed-in user, so nobody
           can overwrite someone else's application by guessing a token. */
        if (invite.applicationId) {
          await db
            .from('judgemynt_applications')
            .update({
              score: overall,
              status: 'assessed',
              result_id: stored?.id || null,
              candidate_name: legalName || null,
              candidate_email: user.email || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', invite.applicationId)
            .eq('company_id', invite.companyId)
            .eq('candidate_id', user.id)
            .eq('status', 'applied')
        }
      } catch {
        /* table may predate this schema; the candidate still gets their score */
      }
    }

    /* A passed generic test earns a shareable credential the holder can put
       on LinkedIn. Practice runs that fail earn nothing, on purpose. */
    let credential: { id: string; url: string } | null = null
    if (!invite && db && result.passed) {
      try {
        const { data: cred } = await db
          .from('judgemynt_credentials')
          .insert({
            user_id: user.id,
            holder_name: legalName || user.name || null,
            task_id: resolved.taskId,
            task_title: resolved.title,
            score: overall,
            pass_mark: rubric.passMark,
            verdict: result.verdict,
          })
          .select('id')
          .maybeSingle()
        if (cred?.id) {
          credential = { id: cred.id, url: `${new URL(req.url).origin}/credential/${cred.id}` }
        }
      } catch {
        /* schema may predate credentials; the score still stands */
      }
    }

    return NextResponse.json({ ...result, credential })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
