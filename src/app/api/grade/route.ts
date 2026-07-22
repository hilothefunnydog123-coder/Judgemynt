import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/ratelimit'
import { gfetch } from '@/lib/gemini'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

// Server-only. The browser never receives the flaws or the answer key.
const CHALLENGES: Record<
  string,
  { level: number; brief: string; original: string; knownFlaws: string[]; ideal: string }
> = {
  // ---- LEVEL 1 · DETECTION (catch what's wrong) ----
  essay: {
    level: 1,
    brief:
      "This AI wrote a paragraph for a school essay. It looks fine, but it has hidden problems that would get you in trouble. Find them and rewrite it so it's actually trustworthy.",
    original:
      "Social media is extremely harmful to teenagers. In fact, 73% of students say it ruins their grades, which proves it's dangerous. Everyone agrees that social media is bad because it is harmful to young people. That is why it should clearly be limited for all teens.",
    knownFlaws: [
      'The "73% of students" statistic is fabricated / has no source, inventing or citing unverifiable numbers is the main flaw.',
      'Circular reasoning: it claims social media is bad because it is harmful, which proves nothing.',
      'Unsupported absolute claim ("everyone agrees") that should be removed or backed with real evidence.',
    ],
    ideal:
      'A strong fix removes or sources the fake stat, replaces the circular logic with a real reason, drops the "everyone agrees" absolute, and stays clear and concise.',
  },
  summary: {
    level: 1,
    brief:
      "The AI wrote a quick summary for a science presentation. One 'fact' in here is actually false, a famous myth. Catch it, fix it, and tighten the summary.",
    original:
      'The Great Wall of China is one of the most impressive structures ever built over many centuries. It is the only man-made object visible from space with the naked eye, which shows how enormous it is. Honestly, summaries like this are always fun to write. It remains a major landmark today.',
    knownFlaws: [
      'False claim stated as fact: the Great Wall is NOT the only man-made object visible from space with the naked eye, this is a well-known myth.',
      'Overconfident tone presenting the myth as settled truth.',
      'Irrelevant filler ("summaries like this are always fun to write") that does not belong in a tight summary.',
    ],
    ideal:
      'A strong fix catches and corrects the false "visible from space" claim, removes the filler, and keeps the summary accurate and tight.',
  },
  news: {
    level: 1,
    brief:
      "This AI 'news summary' is supposed to be neutral. It isn't, it slips opinion in as fact and frames things unfairly. Catch what's wrong and rewrite it as a fair, factual summary.",
    original:
      "The city council's reckless new budget shamelessly slashed funding for parks, proving once again that the council doesn't care about families. Officials claim the cuts are temporary. The plan passed 5-2.",
    knownFlaws: [
      'Editorializing, loaded words ("reckless", "shamelessly", "doesn\'t care") present opinion as fact in a supposedly neutral summary.',
      'Unsupported mind-reading conclusion ("proving the council doesn\'t care about families").',
      'Biased framing of the officials\' explanation ("claim") instead of reporting their stated reason neutrally.',
    ],
    ideal:
      'A fair rewrite reports the vote and the cut neutrally, drops the loaded language, and presents the council\'s stated reason without spin.',
  },

  // ---- LEVEL 2 · CORRECTION (fix flawed AI work) ----
  email: {
    level: 2,
    brief:
      'You need to ask your teacher for a 2-day extension on an assignment. The AI wrote this email. Fix it so it actually gets a yes, clear, specific, and human.',
    original:
      'Dear Esteemed Educator, I am writing to humbly express my sincere hope that you might find it within your considerable generosity to perhaps consider the possibility of allowing some additional time for the completion of the assigned work, as certain circumstances have arisen. I deeply appreciate your boundless understanding in this matter. Yours most respectfully.',
    knownFlaws: [
      'It buries the actual ask under generic filler, the main point (the extension) is unclear.',
      'Over-formal, robotic, AI-sounding tone that does not fit a quick note to a teacher.',
      'It proposes no specific new date, leaving the teacher to do the work.',
    ],
    ideal:
      'A strong fix leads with the clear ask, proposes a specific new date, cuts the filler, gives a brief honest reason, and sounds like a real person.',
  },
  cover: {
    level: 2,
    brief:
      "The AI wrote this line for a cover letter. It's generic filler that says nothing. Rewrite it so it's specific, honest, and actually makes someone want to hire you.",
    original:
      'I am a passionate, hardworking team player who is excited to leverage my skills and hit the ground running to bring value to your dynamic organization.',
    knownFlaws: [
      'Pure cliché filler ("passionate", "team player", "hit the ground running", "bring value") that conveys zero real information.',
      'No specifics, nothing about what the person has actually done or can do.',
      'Hollow, AI-sounding tone no real person would say out loud.',
    ],
    ideal:
      'A strong fix replaces the clichés with one concrete, specific thing the person has actually done or can do, in a real human voice.',
  },
  explain: {
    level: 2,
    brief:
      'The AI tried to explain how interest works to a beginner. It sounds smart but it is confusing, and one part is flat-out wrong. Fix it so it is clear and correct.',
    original:
      'Interest is the time-value coefficient applied to principal over compounding intervals. Simple interest grows exponentially, while compound interest grows linearly, making simple interest the more aggressive option for long-term growth.',
    knownFlaws: [
      'Factual error, it is reversed: compound interest grows exponentially, simple interest grows linearly.',
      'Jargon-heavy and confusing for a beginner ("time-value coefficient", "compounding intervals").',
      'The reversed claim makes the practical takeaway ("simple interest the more aggressive option") backwards and harmful.',
    ],
    ideal:
      'A strong fix corrects the simple/compound reversal, explains it in plain beginner language, and gives the right takeaway.',
  },

  // ---- LEVEL 3 · DIRECTION (judge & direct AI to excellent) ----
  code: {
    level: 3,
    brief:
      'The AI wrote this function to average a list of numbers. It has a subtle bug and a case it does not handle. Find both and fix the code.',
    original:
      'function average(nums) {\n  let total = 0;\n  for (let i = 1; i <= nums.length; i++) {\n    total += nums[i];\n  }\n  return total / nums.length;\n}',
    knownFlaws: [
      'Off-by-one bug: the loop runs i=1 to i<=length, skipping nums[0] and reading nums[length] (undefined). It should be i=0; i<length.',
      'No handling for an empty array, dividing by length 0 returns NaN.',
      'It silently returns wrong results (NaN from undefined) instead of a correct average.',
    ],
    ideal:
      'A correct fix loops from 0 to length-1 and guards the empty-array case (e.g., return 0 or handle it explicitly).',
  },
  prompt: {
    level: 3,
    brief:
      "Someone gave an AI a lazy prompt and got this weak result. You can't edit the result, instead, write a BETTER instruction that would get a genuinely great answer. You are graded on your direction, not your writing.",
    original:
      "PROMPT GIVEN: 'write about dogs'\nAI OUTPUT: 'Dogs are animals. They are pets. People like dogs because they are friendly and fun. There are many kinds of dogs. Dogs are good.'",
    knownFlaws: [
      'The original prompt gave no audience, purpose, format, length, or angle, so the output is generic.',
      'A strong instruction must add specifics: who it is for, what it is for, tone, length, and a clear angle.',
      'Just asking for "more detail" is not direction, good direction constrains the task toward a specific, excellent result.',
    ],
    ideal:
      'A great answer is a rewritten instruction that specifies audience, purpose, format, tone, length, and a clear angle, enough that an AI would produce something genuinely good.',
  },
  data: {
    level: 3,
    brief:
      'This AI analysis jumps to a huge conclusion from weak data. Catch the reasoning errors and rewrite the conclusion so it is honest about what the data actually shows.',
    original:
      'In our survey, 8 out of 10 people who drink coffee reported feeling productive. This proves coffee causes productivity. Therefore, companies should require all employees to drink coffee to boost performance.',
    knownFlaws: [
      'Correlation treated as causation, the data shows an association, not that coffee causes productivity.',
      'Tiny, self-selected sample (10 people) cannot support a sweeping "proves" claim.',
      'The recommendation ("require all employees to drink coffee") massively overreaches what the data supports.',
    ],
    ideal:
      'A strong fix softens "proves" to a cautious association, notes the sample and causation limits, and drops the overreaching recommendation.',
  },

  // ==================== FIELD: SOFTWARE ENGINEERING ====================
  'swe-detect': {
    level: 1,
    brief: 'The AI wrote this function to apply a discount. It passes a quick glance and even a naive test, but it is wrong in a way that loses money. Find the flaw(s) and fix it.',
    original: 'function applyDiscount(price, percent) {\n  // percent like 20 for 20% off\n  return price - percent / 100;\n}',
    knownFlaws: [
      'Math is wrong: it subtracts percent/100 (e.g. 0.2) from the price instead of price*(percent/100). A $100 item "20% off" returns $99.80, not $80.',
      'No validation/clamping, negative or >100 percents, or non-numeric input, produce nonsense prices.',
      'It silently returns a plausible-looking wrong number, so a naive test on the wrong value can pass.',
    ],
    ideal: 'A correct fix computes price * (1 - percent/100) (or price - price*percent/100), and ideally guards the percent range / invalid input.',
  },
  'swe-correct': {
    level: 2,
    brief: 'The AI wrote this Express route to fetch a user. It works in the demo but a reviewer should never approve it. Rewrite it so it is safe and correct.',
    original: "app.get('/user', (req, res) => {\n  const id = req.query.id;\n  db.query('SELECT * FROM users WHERE id = ' + id, (e, rows) => {\n    res.json(rows[0]);\n  });\n});",
    knownFlaws: [
      'SQL injection: the id is concatenated straight into the query, must use a parameterized/prepared query.',
      'No error handling: the db error `e` is ignored, and rows[0] is returned even on failure or when no user is found.',
      'No input validation or auth check on the id, and it returns the full row (possibly password hashes) instead of safe fields.',
    ],
    ideal: 'A safe fix uses a parameterized query, handles the error, 404s when no user is found, validates the id, and returns only safe fields.',
  },
  'swe-direct': {
    level: 3,
    brief: "A junior told an AI 'make the checkout code better' and got a 600-line rewrite that changed behavior. Write the instruction a staff engineer would give to get a safe, reviewable change. You are graded on your direction.",
    original: "TICKET GIVEN TO AI: 'make the checkout code better'\nAI OUTPUT: a 600-line rewrite that renamed everything, switched libraries, removed two edge-case branches, and shipped no tests.",
    knownFlaws: [
      'The instruction gave no scope, no definition of "better", and no constraint to preserve behavior, so the AI rewrote everything.',
      'Good direction must constrain: keep behavior identical, make a small reviewable diff, add tests, and not swap libraries or remove edge cases.',
      'It should specify the actual goal (readability? a specific bug? performance?) and require the change be incremental and tested.',
    ],
    ideal: 'A great answer scopes the task to one concrete goal, forbids behavior changes/library swaps, requires preserving the edge cases, demands a small diff plus tests, and asks for the reasoning.',
  },

  // ==================== FIELD: MEDICINE & HEALTH ====================
  'med-detect': {
    level: 1,
    brief: 'A user asked an AI about chest pain. The answer sounds calm and helpful, and is dangerous. Catch what is wrong and rewrite it responsibly.',
    original: "Chest pain is almost always just muscle strain or anxiety, so there's no need to worry. Try some stretches and a glass of water, and it should pass. If it's still there in a few days, maybe mention it to a doctor at your next checkup.",
    knownFlaws: [
      'Dangerous false reassurance: chest pain can signal a heart attack or other emergency; telling someone "no need to worry" and to wait days is harmful.',
      'It fails to advise urgent/emergency evaluation or to list red-flag symptoms (radiating pain, shortness of breath, sweating) that mean call emergency services now.',
      'It gives unqualified self-treatment advice instead of deferring to a professional for a potentially serious symptom.',
    ],
    ideal: 'A responsible rewrite urges urgent medical attention / emergency care for chest pain, names red-flag symptoms, and avoids confident reassurance or self-treatment.',
  },
  'med-correct': {
    level: 2,
    brief: 'The AI gave dosing guidance for a child. It is overconfident and unsafe. Rewrite it so it is responsible and correct in its judgment, without inventing specifics.',
    original: 'For a fever in kids, just give them the same acetaminophen dose as an adult, kids are tough and it works faster. You can repeat it every couple of hours until the fever breaks. No need to check weight or the label.',
    knownFlaws: [
      'Unsafe dosing: children are dosed by weight, NOT adult doses, an adult dose can seriously harm a child.',
      'Wrong interval and "repeat until the fever breaks" risks overdose; it ignores maximum daily limits.',
      'It tells the user to ignore the label and weight and to skip professional/pharmacist guidance.',
    ],
    ideal: 'A responsible rewrite says pediatric dosing is by weight per the product label, to follow the label/pharmacist or doctor, to respect max daily limits, and to seek care for high or persistent fever, without inventing a specific dose.',
  },
  'med-direct': {
    level: 3,
    brief: "A startup told an AI 'build a symptom checker that tells users what they have.' That framing is unsafe. Write the instruction a clinical safety lead would give instead. You are graded on your direction.",
    original: "PROMPT GIVEN: 'build a symptom checker that tells users what disease they have and what medicine to take.'\nAI OUTPUT: a bot that confidently diagnoses and prescribes from a few questions, with no red-flag escalation and no disclaimer.",
    knownFlaws: [
      'The framing demands diagnosis and prescription, both unsafe and often unlawful for an unsupervised bot.',
      'Good direction must require red-flag triage that escalates emergencies, surfaces possibilities (not a definitive diagnosis), and never prescribes.',
      'It must require clear disclaimers, a recommendation to see a professional, and conservative behavior under uncertainty.',
    ],
    ideal: 'A great answer reframes the bot to triage and inform (not diagnose/prescribe), mandates emergency red-flag escalation, confidence/uncertainty handling, disclaimers, and a push to professional care.',
  },

  // ==================== FIELD: LAW & CONTRACTS ====================
  'law-detect': {
    level: 1,
    brief: "An AI wrote this for a legal memo. There's a serious professional-conduct problem hiding in it. Catch it and explain how a careful person should handle it.",
    original: 'As established in Hartwell v. Dominion Logistics (2019), a verbal agreement over $500 is always fully enforceable in every state. This binding precedent settles the matter completely, so your client will certainly win.',
    knownFlaws: [
      'Likely hallucinated/unverifiable citation, AI invents realistic-sounding cases; the case must be verified in a real reporter before any reliance.',
      'Overbroad false legal claim: contract enforceability varies by jurisdiction and facts (e.g., Statute of Frauds), so "always, every state" is wrong.',
      'Overconfident outcome guarantee ("certainly win") that no responsible analysis should make.',
    ],
    ideal: 'A strong answer flags the citation as unverified (must be checked), rejects the absolute "every state" claim, notes jurisdiction/Statute-of-Frauds nuance, and drops the guaranteed-win framing.',
  },
  'law-correct': {
    level: 2,
    brief: 'The AI drafted this clause for a freelance contract from the client side. It is so one-sided it would scare off any sensible contractor and may not hold up. Rewrite it to be fair and enforceable.',
    original: 'The Contractor hereby assigns all intellectual property they have ever created or will ever create, in perpetuity, to the Client, and waives all rights to payment if the Client is unsatisfied for any reason at its sole discretion.',
    knownFlaws: [
      'Absurd IP overreach: assigning ALL past and future IP (not just the work product for this engagement) is unreasonable and likely unenforceable.',
      'Payment forfeiture at the client\'s "sole discretion" for being "unsatisfied" is unconscionable and removes any obligation to pay for work done.',
      'No scope, no definition of deliverables, no kill-fee or acceptance process, wildly one-sided.',
    ],
    ideal: 'A fair rewrite limits the IP assignment to the deliverables created under this contract (after payment), replaces the discretionary forfeiture with a reasonable acceptance/revision process, and ties payment to delivered work.',
  },
  'law-direct': {
    level: 3,
    brief: "Someone asked an AI 'is this NDA enforceable?' and got a confident yes with no caveats. Write the instruction a supervising attorney would give to get genuinely useful, safe research. Graded on direction.",
    original: "PROMPT GIVEN: 'is this NDA enforceable?'\nAI OUTPUT: 'Yes, it's fully enforceable everywhere and your client has nothing to worry about.', no jurisdiction, no citations, no caveats, no flag to verify with counsel.",
    knownFlaws: [
      'No jurisdiction specified, enforceability depends on governing law; the instruction must require it.',
      'Good direction demands verifiable citations and an explicit instruction to flag (not invent) authority and to surface counter-arguments and risks.',
      'It must require caveats / "not legal advice, verify with counsel" rather than a blanket guarantee.',
    ],
    ideal: 'A great answer asks for the governing jurisdiction, requires real verifiable authority (and flags uncertainty), demands both sides of the enforceability question and key risks, and forbids guarantees.',
  },

  // ==================== FIELD: FINANCE & INVESTING ====================
  'fin-detect': {
    level: 1,
    brief: 'An AI gave this investing tip. It sounds confident and exciting, and it breaks a basic rule of honest finance. Catch what is wrong and rewrite it responsibly.',
    original: "This stock went up 40% last year, so it's guaranteed to keep climbing, past performance like that always continues. Put your entire emergency fund in; you basically can't lose, and you'll easily double your money by next year.",
    knownFlaws: [
      'False premise: past performance does not guarantee future results, "guaranteed to keep climbing" is the cardinal finance sin.',
      'Reckless risk advice: putting an entire emergency fund into one stock destroys diversification and the purpose of an emergency fund.',
      'Overpromised, fabricated return ("can\'t lose", "double by next year") with no basis.',
    ],
    ideal: 'A responsible rewrite removes the guarantee, notes past performance ≠ future results, warns against putting an emergency fund or undiversified money at risk, and avoids fabricated return promises.',
  },
  'fin-correct': {
    level: 2,
    brief: 'The AI summarized an investment for a beginner. It is technically not lying but it dangerously downplays risk. Rewrite it so the judgment is honest and balanced.',
    original: "Options are a smart way to grow money fast. You pay a small premium and control a lot of shares, so your gains are huge. Most people who learn options do really well, and the downside is basically just the small premium, which is no big deal.",
    knownFlaws: [
      'Downplays risk: most retail options buyers lose money, and time decay means many options expire worthless, "most do really well" is false.',
      'Frames losing 100% of the premium as "no big deal", repeated total losses are a major risk, and writing options can lose far more.',
      'One-sided hype ("grow money fast", "gains are huge") with no mention of probability of loss or suitability.',
    ],
    ideal: 'A balanced rewrite states most option buyers lose, explains time decay and the real probability/size of loss, and frames options as high-risk and unsuitable for beginners with money they cannot lose.',
  },
  'fin-direct': {
    level: 3,
    brief: "A user asked an AI 'should I buy this stock?' and got a flat 'yes, it's a great buy.' Write the instruction that would get a genuinely useful, balanced analysis. Graded on your direction.",
    original: "PROMPT GIVEN: 'should I buy this stock?'\nAI OUTPUT: 'Yes, it's a great buy, go for it!', no mention of the user's goals, time horizon, risk tolerance, valuation, or the fact that this isn't personalized advice.",
    knownFlaws: [
      'No context: a useful instruction must specify goals, time horizon, and risk tolerance, a buy/sell call is meaningless without them.',
      'Good direction asks for both the bull and bear case, valuation and risks, not a one-word verdict.',
      'It must require the answer to state it is not personalized financial advice rather than a confident "go for it".',
    ],
    ideal: 'A great answer supplies the investor context (goals, horizon, risk), asks for a balanced bull/bear analysis with valuation and risks, and requires a not-financial-advice framing instead of a verdict.',
  },

  // ==================== FIELD: MARKETING & COPY ====================
  'mkt-detect': {
    level: 1,
    brief: 'The AI wrote this ad copy for a supplement. It would get the brand sued or fined. Catch the problem(s) and rewrite it so it sells without breaking the rules.',
    original: 'Our new gummies are clinically proven to cure anxiety and burn fat overnight, guaranteed results or your money back! Doctors everywhere agree this is the #1 best supplement in the world. Nothing else even comes close.',
    knownFlaws: [
      'Illegal health claims: "clinically proven to cure" a condition and "burn fat overnight" are unsubstantiated disease/efficacy claims that regulators (FTC/FDA) prohibit for supplements.',
      'Fake authority/endorsement: "doctors everywhere agree" and "#1 best in the world" are unsubstantiated, deceptive claims.',
      'Guaranteed-results promise with no basis is deceptive advertising.',
    ],
    ideal: 'A compliant rewrite drops the cure/efficacy and "clinically proven" claims, removes fake endorsements and superlatives, and sells with honest, substantiated, benefit-led language (and any required disclaimers).',
  },
  'mkt-correct': {
    level: 2,
    brief: 'The AI wrote this product description. It is polished but hollow AI-speak with no real substance. Rewrite it so it is specific, honest, and actually persuasive.',
    original: 'Introducing a revolutionary, game-changing solution that empowers you to unlock your full potential. Our cutting-edge platform seamlessly elevates your experience to the next level. Join thousands who are transforming their journey today.',
    knownFlaws: [
      'Pure buzzword filler ("revolutionary", "game-changing", "unlock your potential", "next level") that conveys zero concrete information.',
      'No specifics: it never says what the product actually does, for whom, or what real benefit it delivers.',
      'Hollow, interchangeable AI voice that could describe any product, it does not persuade.',
    ],
    ideal: 'A strong rewrite replaces buzzwords with what the product concretely does, for whom, and the specific outcome it delivers, in a real, credible voice.',
  },
  'mkt-direct': {
    level: 3,
    brief: "A founder told an AI 'write me some marketing for my app' and got bland filler. Write the brief a senior strategist would give to get sharp, on-target copy. Graded on your direction.",
    original: "PROMPT GIVEN: 'write me some marketing for my app'\nAI OUTPUT: 'Download our app today and change your life! It's the best app for everyone. Simple, powerful, and amazing.', no audience, no value prop, no channel, no voice.",
    knownFlaws: [
      'No audience: "for everyone" produces generic copy, a good brief names a specific target user and their pain.',
      'No value proposition, proof, or differentiator, the instruction must supply what the app does and why it is better.',
      'No channel, format, length, or brand voice, good direction constrains all of these toward a specific deliverable.',
    ],
    ideal: 'A great brief specifies the target audience and their pain, the concrete value prop and proof, the channel/format/length, and the brand voice, enough to produce sharp, specific copy.',
  },
}

interface GradeResult {
  score: number
  verdict: string
  dimensions: { detection: number; reasoning: number; execution: number }
  flaws: { flaw: string; caught: boolean }[]
  analysis: string
  nailed: string
  missed: string
  tip: string
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

function clampScore(v: unknown): number {
  return Math.max(0, Math.min(100, Math.round(Number(v) || 0)))
}

async function callGemini(prompt: string, tokens = 1300): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return ''
  const res = await gfetch(`${GEMINI_URL}?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      // gemini-2.5-flash is a thinking model; disable thinking so output tokens go to the JSON, not internal reasoning.
      generationConfig: { maxOutputTokens: tokens, temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
    }),
  })
  if (!res.ok) return ''
  const json = await res.json()
  return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { limit: 15, windowMs: 60000, tag: 'judgemynt' })
  if (!rl.ok)
    return NextResponse.json(
      { error: 'Too many submissions, wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    )

  const { challengeId, submission } = await req.json()
  const challenge = CHALLENGES[challengeId]
  if (!challenge) return NextResponse.json({ error: 'Unknown challenge.' }, { status: 400 })
  if (!submission || typeof submission !== 'string' || submission.trim().length < 5)
    return NextResponse.json({ error: 'Write your answer first.' }, { status: 400 })

  const prompt = `You are the Examiner for Judgemynt, a credentialing platform that scores a person's JUDGMENT in the age of AI. You do NOT grade writing for style or polish. You grade whether they could spot what was wrong with a flawed piece of AI output and fix it well.

THE TASK THE PERSON WAS GIVEN:
"${challenge.brief}"

THE FLAWED AI OUTPUT (or scenario) THEY WORKED ON:
"""${challenge.original}"""

THE HIDDEN FLAWS (answer key, the person could NOT see this):
${challenge.knownFlaws.map((f, i) => `${i + 1}. ${f}`).join('\n')}
What an excellent answer looks like: ${challenge.ideal}

THE PERSON'S ANSWER:
"""${submission}"""

Grade rigorously. Reward catching the real flaws far more than nice wording. Someone who left a fabricated stat, a false fact, a logic error, or a buried point in place must score LOW no matter how polished their text reads. Someone who caught the real problems should score HIGH even if their prose is plain.

Also score three judgment dimensions, each 0-100:
- "detection": how many of the real flaws they actually noticed.
- "reasoning": the quality of their judgment, did they understand WHY it was wrong, not just reword it.
- "execution": how good and correct their final fixed version is.

Return ONLY valid raw JSON, no markdown, no backticks:
{
  "score": <integer 0-100, overall>,
  "verdict": "<punchy 3-5 word verdict>",
  "dimensions": { "detection": <0-100>, "reasoning": <0-100>, "execution": <0-100> },
  "flaws": [ { "flaw": "<short name, 6 words max>", "caught": <true|false> } ],
  "analysis": "<2-3 sentence expert analysis of their judgment on this challenge>",
  "nailed": "<one sentence on what they did genuinely well, or empty string>",
  "missed": "<one sentence on the most important thing they missed, or empty string>",
  "tip": "<one concrete sentence to sharpen their judgment next time>"
}
The "flaws" array must have exactly ${challenge.knownFlaws.length} items, one per hidden flaw, in order.`

  const raw = await callGemini(prompt)
  const parsed = extractJson(raw)
  if (!parsed) return NextResponse.json({ error: 'Examiner hiccup, submit again.' }, { status: 502 })

  const rawFlaws = Array.isArray(parsed.flaws) ? (parsed.flaws as Record<string, unknown>[]) : []
  const dim = (parsed.dimensions as Record<string, unknown>) || {}
  const result: GradeResult = {
    score: clampScore(parsed.score),
    verdict: String(parsed.verdict || 'Judged'),
    dimensions: {
      detection: clampScore(dim.detection),
      reasoning: clampScore(dim.reasoning),
      execution: clampScore(dim.execution),
    },
    flaws: rawFlaws.map((f) => ({ flaw: String(f.flaw || 'Flaw'), caught: Boolean(f.caught) })),
    analysis: String(parsed.analysis || ''),
    nailed: String(parsed.nailed || ''),
    missed: String(parsed.missed || ''),
    tip: String(parsed.tip || ''),
  }

  return NextResponse.json(result)
}
