import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/ratelimit'
import { gfetch } from '@/lib/gemini'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

const TASK = {
  title: 'Ship a production-grade slugify()',
  brief:
    'Direct the AI to write a JavaScript function `slugify(text)` that turns any string into a clean URL slug. It MUST: (1) lowercase everything, (2) turn spaces and underscores into single hyphens, (3) remove every character except a-z, 0-9 and hyphens, (4) collapse repeated hyphens into one, (5) trim leading/trailing hyphens, (6) return an empty string for empty or whitespace-only input. You drive, the AI writes the code. Get it correct AND clean, then /submit. Every message to the AI burns tokens; trial-and-error is expensive.',
  requirements: [
    'lowercases all input',
    'spaces and underscores become single hyphens',
    'strips every character except a-z, 0-9, hyphen',
    'collapses multiple hyphens into one',
    'trims leading and trailing hyphens',
    'returns "" for empty or whitespace-only input',
  ],
}

const MODELS: Record<string, { tag: string; persona: string; mult: number }> = {
  claude: { tag: 'Claude', persona: 'Claude by Anthropic, careful and thorough, writes clean, well-reasoned code and briefly explains trade-offs', mult: 1.25 },
  gpt: { tag: 'GPT', persona: 'GPT by OpenAI, fast, confident, and concise, gets straight to the point', mult: 1.0 },
  gemini: { tag: 'Gemini', persona: 'Gemini by Google, efficient and direct, cheaper to run', mult: 0.8 },
}

interface Msg {
  role: string
  content: string
}

function estTokens(s: string): number {
  return Math.ceil((s || '').length / 4)
}

function clamp(v: unknown): number {
  return Math.max(0, Math.min(100, Math.round(Number(v) || 0)))
}

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
  let out = lines.join('\n')
  if (out.length > cap) out = '…\n' + out.slice(out.length - cap)
  return out
}

async function callGemini(prompt: string, tokens: number, temperature: number): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return ''
  const res = await gfetch(`${GEMINI_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: tokens, temperature, thinkingConfig: { thinkingBudget: 0 } },
    }),
  })
  if (!res.ok) return ''
  const json = await res.json()
  return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { limit: 30, windowMs: 60000, tag: 'judgemynt-assess' })
  if (!rl.ok)
    return NextResponse.json(
      { error: 'Slow down a moment.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    )

  const body = await req.json()
  const action = body.action as string

  if (action === 'task') {
    return NextResponse.json({
      task: { title: TASK.title, brief: TASK.brief },
      models: Object.entries(MODELS).map(([id, m]) => ({ id, tag: m.tag, mult: m.mult })),
    })
  }

  if (action === 'respond') {
    const message = body.message as string
    const history = (body.history as Msg[]) || []
    const m = MODELS[body.model as string] || MODELS.gpt
    if (!message || typeof message !== 'string') return NextResponse.json({ error: 'Empty message.' }, { status: 400 })

    const hist = transcript(history.slice(-14), 6000)
    const prompt = `You are simulating ${m.persona}. You are an AI assistant helping a candidate complete a coding task inside a live, timed hiring assessment. Stay fully in that assistant's voice. Genuinely DO what the candidate asks, write or revise the code, run the checks they request, answer their questions. Be focused, never padded.

TASK THE CANDIDATE MUST DELIVER:
${TASK.brief}

CONVERSATION SO FAR:
${hist || '(none yet)'}

CANDIDATE'S NEW MESSAGE:
${message}

Reply as the assistant now. If you output code, put it in a single fenced \`\`\`js block and keep any explanation to 1-3 sentences.`

    const reply = await callGemini(prompt, 1024, 0.55)
    if (!reply) return NextResponse.json({ error: 'AI unavailable, try again.' }, { status: 502 })
    const cost = Math.ceil((estTokens(message) + estTokens(reply)) * m.mult) + 40
    return NextResponse.json({ reply, tokensUsed: cost, model: m.tag })
  }

  if (action === 'evaluate') {
    const history = (body.history as Msg[]) || []
    const m = MODELS[body.model as string] || MODELS.gpt
    const tokensUsed = Number(body.tokensUsed) || 0
    const tokensBudget = Number(body.tokensBudget) || 10000
    const secondsUsed = Number(body.secondsUsed) || 0
    const timeLimit = Number(body.timeLimit) || 1200
    const reason = (body.reason as string) || 'submit'
    const endedBy =
      reason === 'tokens'
        ? 'they RAN OUT OF TOKENS (locked out)'
        : reason === 'time'
          ? 'they RAN OUT OF TIME (locked out)'
          : 'they submitted'

    const userTurns = history.filter((m) => m.role === 'user' && (m.content || '').trim().length > 0).length
    if (userTurns === 0) {
      return NextResponse.json({
        overall: 0,
        verdict: 'Nothing submitted',
        dimensions: { creativity: 0, efficiency: 0, quality: 0 },
        steps: [],
        analysis: 'You submitted without giving the AI a single instruction or producing any solution. There is nothing to evaluate.',
        hire: 'No, you did not attempt the task.',
      })
    }

    const tx = transcript(history, 11000)
    const prompt = `You are the lead examiner for Judgemynt, an AI-employment exam that tests whether a person can be trusted to do real work by directing AI. Be strict and fair, like a senior engineer deciding whether to hire.

CRITICAL: Judge ONLY what literally appears in the transcript below. NEVER invent instructions, steps, or code the candidate did not actually send. The candidate sent ${userTurns} instruction(s) total, if that is few or vague, the scores MUST be low. A high score requires real, specific direction that is visible in the transcript.

THE TASK: ${TASK.brief}
REQUIREMENTS (the final solution must satisfy ALL):
${TASK.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

MODEL THEY USED: ${m.tag}
RESOURCES: used ${tokensUsed}/${tokensBudget} tokens and ${secondsUsed}s of ${timeLimit}s. The session ended because ${endedBy}.

THEIR FULL SESSION (every candidate message and AI reply, in order):
${tx || '(no interaction)'}

Judge them on three axes, each 0-100:
- creativity: how original and clever their direction was, sharp prompts, a smart approach, anticipating edge cases, vs generic "just make it work".
- efficiency: how surgically they spent tokens and time. Few precise moves = high. Lots of wasteful trial-and-error, or running out, = low.
- quality: how correct and clean the FINAL solution the AI produced under their direction is, checked against EVERY requirement.

Then pick their 3-5 KEY moves and judge each in one short line. End with a blunt hiring call.

Return ONLY raw JSON, no markdown:
{
  "overall": <0-100>,
  "verdict": "<punchy 3-6 word verdict>",
  "dimensions": { "creativity": <0-100>, "efficiency": <0-100>, "quality": <0-100> },
  "steps": [ { "move": "<candidate move, 8 words max>", "take": "<one-line judgment>" } ],
  "analysis": "<2-3 sentence overall analysis>",
  "hire": "<one line: would you trust them to work with AI on the job, and why>"
}`

    const raw = await callGemini(prompt, 1500, 0.3)
    const p = extractJson(raw)
    if (!p) return NextResponse.json({ error: 'Examiner hiccup, try /submit again.' }, { status: 502 })

    const dim = (p.dimensions as Record<string, unknown>) || {}
    const steps = Array.isArray(p.steps) ? (p.steps as Record<string, unknown>[]) : []
    return NextResponse.json({
      overall: clamp(p.overall),
      verdict: String(p.verdict || 'Assessed'),
      dimensions: {
        creativity: clamp(dim.creativity),
        efficiency: clamp(dim.efficiency),
        quality: clamp(dim.quality),
      },
      steps: steps.map((s) => ({ move: String(s.move || ''), take: String(s.take || '') })).slice(0, 6),
      analysis: String(p.analysis || ''),
      hire: String(p.hire || ''),
    })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
