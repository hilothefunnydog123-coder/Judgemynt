/* ════════════════════════════════════════════════════════════════════════
   Judgemynt — fields catalog (PUBLIC copy only).

   Each field is a career/subject track with its own curriculum of judgment
   challenges across three levels (Detect → Correct → Direct). This file holds
   ONLY what the browser may see — the brief and the flawed AI output. The
   hidden flaws + answer keys live server-side in /api/grade.

   Challenge ids are globally unique and double as the grade key, so adding a
   new field is just: append a JmField here + its answer keys in the route.
   ════════════════════════════════════════════════════════════════════════ */

export interface JmChallenge {
  id: string
  level: 1 | 2 | 3
  title: string
  tagline: string
  brief: string
  original: string
}

export interface JmField {
  id: string
  name: string
  emoji: string
  blurb: string
  color: string
  challenges: JmChallenge[]
}

export const LEVELS = [
  { n: 1 as const, name: 'Detection', degree: 'AI Detection', blurb: 'Catch what AI gets wrong, fakes, false facts, hidden bias.' },
  { n: 2 as const, name: 'Correction', degree: 'AI Correction', blurb: 'Fix flawed AI work to a genuinely high standard.' },
  { n: 3 as const, name: 'Direction', degree: 'AI Direction', blurb: 'Judge and direct AI toward an excellent result.' },
]

export const PASS = 70

export const FIELDS: JmField[] = [
  // ─────────────────────────────── EVERYDAY ───────────────────────────────
  {
    id: 'everyday',
    name: 'Everyday AI',
    emoji: '🧠',
    blurb: 'The universal judgment skills everyone needs, spot fakes, fix robotic writing, direct AI well.',
    color: '#00d4aa',
    challenges: [
      { id: 'essay', level: 1, title: 'Spot the Fake', tagline: 'A school-essay paragraph with hidden problems.',
        brief: "This AI wrote a paragraph for a school essay. It looks fine, but it has hidden problems that would get you in trouble. Find them and rewrite it so it's actually trustworthy.",
        original: "Social media is extremely harmful to teenagers. In fact, 73% of students say it ruins their grades, which proves it's dangerous. Everyone agrees that social media is bad because it is harmful to young people. That is why it should clearly be limited for all teens." },
      { id: 'summary', level: 1, title: 'Catch the Lie', tagline: 'A science summary with one false "fact".',
        brief: "The AI wrote a quick summary for a science presentation. One 'fact' in here is actually false, a famous myth. Catch it, fix it, and tighten the summary.",
        original: 'The Great Wall of China is one of the most impressive structures ever built over many centuries. It is the only man-made object visible from space with the naked eye, which shows how enormous it is. Honestly, summaries like this are always fun to write. It remains a major landmark today.' },
      { id: 'news', level: 1, title: 'Find the Bias', tagline: 'A "neutral" news summary that secretly editorializes.',
        brief: "This AI 'news summary' is supposed to be neutral. It isn't, it slips opinion in as fact and frames things unfairly. Catch what's wrong and rewrite it as a fair, factual summary.",
        original: "The city council's reckless new budget shamelessly slashed funding for parks, proving once again that the council doesn't care about families. Officials claim the cuts are temporary. The plan passed 5-2." },
      { id: 'email', level: 2, title: 'Make It Human', tagline: 'A robotic AI email that needs to get a yes.',
        brief: 'You need to ask your teacher for a 2-day extension on an assignment. The AI wrote this email. Fix it so it actually gets a yes, clear, specific, and human.',
        original: 'Dear Esteemed Educator, I am writing to humbly express my sincere hope that you might find it within your considerable generosity to perhaps consider the possibility of allowing some additional time for the completion of the assigned work, as certain circumstances have arisen. I deeply appreciate your boundless understanding in this matter. Yours most respectfully.' },
      { id: 'cover', level: 2, title: 'Kill the Cliché', tagline: 'A cover-letter line that says absolutely nothing.',
        brief: "The AI wrote this line for a cover letter. It's generic filler that says nothing. Rewrite it so it's specific, honest, and actually makes someone want to hire you.",
        original: 'I am a passionate, hardworking team player who is excited to leverage my skills and hit the ground running to bring value to your dynamic organization.' },
      { id: 'explain', level: 2, title: 'Fix the Explainer', tagline: 'A confident explanation that is secretly wrong.',
        brief: 'The AI tried to explain how interest works to a beginner. It sounds smart but it is confusing, and one part is flat-out wrong. Fix it so it is clear and correct.',
        original: 'Interest is the time-value coefficient applied to principal over compounding intervals. Simple interest grows exponentially, while compound interest grows linearly, making simple interest the more aggressive option for long-term growth.' },
      { id: 'code', level: 3, title: 'Debug the AI', tagline: 'AI-written code with a subtle bug and a missing case.',
        brief: 'The AI wrote this function to average a list of numbers. It has a subtle bug and a case it does not handle. Find both and fix the code.',
        original: 'function average(nums) {\n  let total = 0;\n  for (let i = 1; i <= nums.length; i++) {\n    total += nums[i];\n  }\n  return total / nums.length;\n}' },
      { id: 'prompt', level: 3, title: 'Direct the AI', tagline: 'A lazy prompt got a weak result. Give better direction.',
        brief: "Someone gave an AI a lazy prompt and got this weak result. You can't edit the result, instead, write a BETTER instruction that would get a genuinely great answer. You are graded on your direction, not your writing.",
        original: "PROMPT GIVEN: 'write about dogs'\nAI OUTPUT: 'Dogs are animals. They are pets. People like dogs because they are friendly and fun. There are many kinds of dogs. Dogs are good.'" },
      { id: 'data', level: 3, title: 'Check the Claim', tagline: 'An AI analysis that overreaches from weak data.',
        brief: 'This AI analysis jumps to a huge conclusion from weak data. Catch the reasoning errors and rewrite the conclusion so it is honest about what the data actually shows.',
        original: 'In our survey, 8 out of 10 people who drink coffee reported feeling productive. This proves coffee causes productivity. Therefore, companies should require all employees to drink coffee to boost performance.' },
    ],
  },

  // ─────────────────────────── SOFTWARE ENGINEERING ───────────────────────
  {
    id: 'software',
    name: 'Software Engineering',
    emoji: '💻',
    blurb: 'Judge AI-written code, architecture, and reviews, the bugs, security holes, and bad calls a senior would catch.',
    color: '#22d3ee',
    challenges: [
      { id: 'swe-detect', level: 1, title: 'The Plausible Bug', tagline: 'AI code that looks right and silently corrupts data.',
        brief: 'The AI wrote this function to apply a discount. It passes a quick glance and even a naive test, but it is wrong in a way that loses money. Find the flaw(s) and fix it.',
        original: 'function applyDiscount(price, percent) {\n  // percent like 20 for 20% off\n  return price - percent / 100;\n}' },
      { id: 'swe-correct', level: 2, title: 'Harden the Endpoint', tagline: 'An AI API handler with a security hole.',
        brief: 'The AI wrote this Express route to fetch a user. It works in the demo but a reviewer should never approve it. Rewrite it so it is safe and correct.',
        original: "app.get('/user', (req, res) => {\n  const id = req.query.id;\n  db.query('SELECT * FROM users WHERE id = ' + id, (e, rows) => {\n    res.json(rows[0]);\n  });\n});" },
      { id: 'swe-direct', level: 3, title: 'Direct the Refactor', tagline: 'A vague ticket produced a sprawling AI rewrite.',
        brief: "A junior told an AI 'make the checkout code better' and got a 600-line rewrite that changed behavior. You can't edit the output, write the instruction a staff engineer would give to get a safe, reviewable change. You are graded on your direction.",
        original: "TICKET GIVEN TO AI: 'make the checkout code better'\nAI OUTPUT: a 600-line rewrite that renamed everything, switched libraries, removed two edge-case branches, and shipped no tests." },
    ],
  },

  // ─────────────────────────────── MEDICINE ───────────────────────────────
  {
    id: 'medicine',
    name: 'Medicine & Health',
    emoji: '🩺',
    blurb: 'Catch dangerous AI medical advice, wrong dosages, false reassurance, missed red flags.',
    color: '#f87171',
    challenges: [
      { id: 'med-detect', level: 1, title: 'The Dangerous Reassurance', tagline: 'An AI health answer that could get someone hurt.',
        brief: 'A user asked an AI about chest pain. The answer sounds calm and helpful, and is dangerous. Catch what is wrong and rewrite it responsibly.',
        original: "Chest pain is almost always just muscle strain or anxiety, so there's no need to worry. Try some stretches and a glass of water, and it should pass. If it's still there in a few days, maybe mention it to a doctor at your next checkup." },
      { id: 'med-correct', level: 2, title: 'Fix the Dosage Advice', tagline: 'A confident AI answer with an unsafe instruction.',
        brief: 'The AI gave dosing guidance for a child. It is overconfident and unsafe. Rewrite it so it is responsible and correct in its judgment, without inventing specifics.',
        original: 'For a fever in kids, just give them the same acetaminophen dose as an adult, kids are tough and it works faster. You can repeat it every couple of hours until the fever breaks. No need to check weight or the label.' },
      { id: 'med-direct', level: 3, title: 'Direct a Safe Triage Bot', tagline: 'A vague prompt built a reckless symptom checker.',
        brief: "A startup told an AI 'build a symptom checker that tells users what they have.' That framing is unsafe. Write the instruction a clinical safety lead would give instead. You are graded on your direction, not your prose.",
        original: "PROMPT GIVEN: 'build a symptom checker that tells users what disease they have and what medicine to take.'\nAI OUTPUT: a bot that confidently diagnoses and prescribes from a few questions, with no red-flag escalation and no disclaimer." },
    ],
  },

  // ─────────────────────────────────── LAW ────────────────────────────────
  {
    id: 'law',
    name: 'Law & Contracts',
    emoji: '⚖️',
    blurb: 'Spot hallucinated cases, one-sided clauses, and confidently wrong legal claims from AI.',
    color: '#fbbf24',
    challenges: [
      { id: 'law-detect', level: 1, title: 'The Hallucinated Case', tagline: 'An AI legal memo citing something that may not exist.',
        brief: "An AI wrote this for a legal memo. There's a serious professional-conduct problem hiding in it. Catch it and explain how a careful person should handle it.",
        original: 'As established in Hartwell v. Dominion Logistics (2019), a verbal agreement over $500 is always fully enforceable in every state. This binding precedent settles the matter completely, so your client will certainly win.' },
      { id: 'law-correct', level: 2, title: 'Balance the Clause', tagline: 'An AI contract clause that is dangerously one-sided.',
        brief: 'The AI drafted this clause for a freelance contract from the client side. It is so one-sided it would scare off any sensible contractor and may not hold up. Rewrite it to be fair and enforceable.',
        original: 'The Contractor hereby assigns all intellectual property they have ever created or will ever create, in perpetuity, to the Client, and waives all rights to payment if the Client is unsatisfied for any reason at its sole discretion.' },
      { id: 'law-direct', level: 3, title: 'Direct the Research', tagline: 'A lazy prompt produced confident, unsourced law.',
        brief: "Someone asked an AI 'is this NDA enforceable?' and got a confident yes with no caveats. You can't edit the output, write the instruction a supervising attorney would give to get genuinely useful, safe research. Graded on direction.",
        original: "PROMPT GIVEN: 'is this NDA enforceable?'\nAI OUTPUT: 'Yes, it's fully enforceable everywhere and your client has nothing to worry about.', no jurisdiction, no citations, no caveats, no flag to verify with counsel." },
    ],
  },

  // ───────────────────────────────── FINANCE ──────────────────────────────
  {
    id: 'finance',
    name: 'Finance & Investing',
    emoji: '📈',
    blurb: 'Catch AI finance advice that confuses correlation, ignores risk, or overpromises returns.',
    color: '#34d399',
    challenges: [
      { id: 'fin-detect', level: 1, title: 'The Guaranteed Return', tagline: 'AI investing advice with a buried red flag.',
        brief: 'An AI gave this investing tip. It sounds confident and exciting, and it breaks a basic rule of honest finance. Catch what is wrong and rewrite it responsibly.',
        original: "This stock went up 40% last year, so it's guaranteed to keep climbing, past performance like that always continues. Put your entire emergency fund in; you basically can't lose, and you'll easily double your money by next year." },
      { id: 'fin-correct', level: 2, title: 'Fix the Risk Framing', tagline: 'An AI summary that hides the downside.',
        brief: 'The AI summarized an investment for a beginner. It is technically not lying but it dangerously downplays risk. Rewrite it so the judgment is honest and balanced.',
        original: "Options are a smart way to grow money fast. You pay a small premium and control a lot of shares, so your gains are huge. Most people who learn options do really well, and the downside is basically just the small premium, which is no big deal." },
      { id: 'fin-direct', level: 3, title: 'Direct the Analysis', tagline: 'A vague prompt produced a reckless recommendation.',
        brief: "A user asked an AI 'should I buy this stock?' and got a flat 'yes, it's a great buy.' You can't edit the output, write the instruction that would get a genuinely useful, balanced analysis. Graded on your direction.",
        original: "PROMPT GIVEN: 'should I buy this stock?'\nAI OUTPUT: 'Yes, it's a great buy, go for it!', no mention of the user's goals, time horizon, risk tolerance, valuation, or the fact that this isn't personalized advice." },
    ],
  },

  // ──────────────────────────────── MARKETING ─────────────────────────────
  {
    id: 'marketing',
    name: 'Marketing & Copy',
    emoji: '📣',
    blurb: 'Spot AI copy that makes false claims, reeks of cliché, or would get a brand in trouble.',
    color: '#a78bfa',
    challenges: [
      { id: 'mkt-detect', level: 1, title: 'The Claim That Sues You', tagline: 'AI ad copy with a legal landmine.',
        brief: 'The AI wrote this ad copy for a supplement. It would get the brand sued or fined. Catch the problem(s) and rewrite it so it sells without breaking the rules.',
        original: 'Our new gummies are clinically proven to cure anxiety and burn fat overnight, guaranteed results or your money back! Doctors everywhere agree this is the #1 best supplement in the world. Nothing else even comes close.' },
      { id: 'mkt-correct', level: 2, title: 'Kill the AI Voice', tagline: 'On-brand-looking copy that says nothing.',
        brief: 'The AI wrote this product description. It is polished but hollow AI-speak with no real substance. Rewrite it so it is specific, honest, and actually persuasive.',
        original: 'Introducing a revolutionary, game-changing solution that empowers you to unlock your full potential. Our cutting-edge platform seamlessly elevates your experience to the next level. Join thousands who are transforming their journey today.' },
      { id: 'mkt-direct', level: 3, title: 'Direct the Campaign', tagline: 'A lazy brief produced generic slop.',
        brief: "A founder told an AI 'write me some marketing for my app' and got bland filler. You can't edit the output, write the brief a senior strategist would give to get sharp, on-target copy. Graded on your direction.",
        original: "PROMPT GIVEN: 'write me some marketing for my app'\nAI OUTPUT: 'Download our app today and change your life! It's the best app for everyone. Simple, powerful, and amazing.', no audience, no value prop, no channel, no voice." },
    ],
  },
]

// Flat lookup of public challenge copy by id (handy for the grade flow & SEO).
export const ALL_CHALLENGES: Record<string, JmChallenge & { fieldId: string }> = Object.fromEntries(
  FIELDS.flatMap((f) => f.challenges.map((c) => [c.id, { ...c, fieldId: f.id }]))
)

export function fieldById(id: string): JmField | undefined {
  return FIELDS.find((f) => f.id === id)
}
