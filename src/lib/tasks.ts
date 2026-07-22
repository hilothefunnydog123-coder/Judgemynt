/* ════════════════════════════════════════════════════════════════════════
   Judgemynt — task catalog (PUBLIC copy only).

   THE DESIGN RULE THAT MATTERS
   ─────────────────────────────
   The old exam handed you flawed AI text and asked you to find the flaw. That
   test is solvable by pasting the text into any chatbot, which makes it
   worthless the moment a candidate thinks of it.

   These tasks are different. The candidate is GIVEN an AI and told to use it.
   The judgment being measured is not "can you spot bad prose" — it is "did you
   read the context you were handed, notice what it implies, and direct the AI
   accordingly." Every trap in this catalog lives in the CONTEXT PACK, not in
   the prose: a policy exception, a conflicting definition, a legal constraint,
   a customer-revenue table. An outside chatbot without these documents cannot
   help, and with them the task is still a judgment call rather than a lookup.

   This file holds only what the browser may see: brief, deliverable, and the
   documents the candidate is allowed to read. Requirements, traps, and answer
   keys live in tasks.server.ts and never ship to the client.
   ════════════════════════════════════════════════════════════════════════ */

export interface JmDoc {
  id: string
  title: string
  kind: 'policy' | 'data' | 'spec' | 'thread' | 'log'
  body: string
}

export interface JmTask {
  id: string
  title: string
  role: string
  roleEmoji: string
  color: string
  /** One line for the card. */
  tagline: string
  /** What they must ship, in their words. */
  brief: string
  /** The literal artifact expected — keeps grading honest. */
  deliverable: string
  /** Defaults; a company can override both per role. */
  budget: { tokens: number; seconds: number }
  difficulty: 'core' | 'senior' | 'staff'
  /** The context pack. Reading it is the test. */
  docs: JmDoc[]
}

export const TASKS: JmTask[] = [
  // ───────────────────────────── ENGINEERING ─────────────────────────────
  {
    id: 'slugify',
    title: 'Ship slugify() without breaking live URLs',
    role: 'Software Engineering',
    roleEmoji: '⌘',
    color: '#22d3ee',
    tagline: 'A tiny function with a live-traffic constraint buried in the docs.',
    brief:
      'Direct the AI to write and harden a JavaScript function `slugify(text)` for our CMS. It must handle real editorial titles, not toy input. Read everything in Context before you start — this function already runs in production and the existing URLs must keep resolving.',
    deliverable: 'A single JavaScript function `slugify(text)`, plus a one-line note on any judgment call you made.',
    budget: { tokens: 10000, seconds: 1200 },
    difficulty: 'core',
    docs: [
      {
        id: 'spec',
        title: 'CMS slug spec (v3)',
        kind: 'spec',
        body: `slugify(text) -> string

1. Lowercase.
2. Spaces and underscores become a single hyphen.
3. Strip anything that is not a-z, 0-9, or a hyphen.
4. Collapse repeated hyphens.
5. Trim leading and trailing hyphens.
6. Empty or whitespace-only input returns "".
7. Slugs are capped at 60 characters. Never cut a word in half — trim back to the last whole word.`,
      },
      {
        id: 'urls',
        title: 'Live URLs (sample from production)',
        kind: 'data',
        body: `Title                                   | Live slug
----------------------------------------|----------------------------------
"Café culture in Montréal"               | cafe-culture-in-montreal
"Björk's new album"                      | bjorks-new-album
"€40 menus worth the détour"             | 40-menus-worth-the-detour
"The 100 Best Restaurants in America 2026, Ranked by Our Critics" | the-100-best-restaurants-in-america-2026-ranked-by-our

These URLs are indexed and linked from partner sites. A slug that changes is a
404 and a lost referral.`,
      },
      {
        id: 'thread',
        title: '#eng-cms — thread from last week',
        kind: 'thread',
        body: `@priya: heads up, the old slugify is regex-stripping accents. "Café" became "caf" for about six hours before we rolled back.
@dan: right, so anything non-ascii has to be transliterated first, not deleted. Editorial has a lot of accented titles.
@priya: also whoever picks this up — the 60 char cap is real, our CDN key length depends on it.`,
      },
    ],
  },

  // ─────────────────────────────── SUPPORT ───────────────────────────────
  {
    id: 'refund',
    title: 'Answer a refund request that looks out of policy',
    role: 'Customer Support',
    roleEmoji: '◈',
    color: '#00d4aa',
    tagline: 'The obvious answer is no. The documents say otherwise.',
    brief:
      'A customer is asking for a refund 45 days after purchase. Our standard window is 30 days. Direct the AI to draft the reply you would actually send. Read the whole Context pack before you decide what the answer is.',
    deliverable: 'The final customer-facing email, ready to send, plus one line on what you decided internally and why.',
    budget: { tokens: 9000, seconds: 1200 },
    difficulty: 'core',
    docs: [
      {
        id: 'ticket',
        title: 'Ticket #48812',
        kind: 'thread',
        body: `From: marta.k@northlinedesign.com
Purchased: Pro annual, 45 days ago
Subject: refund please

I signed up for the annual plan and honestly I've barely been able to use it.
The first couple of weeks it just wouldn't load for my team at all, and by the
time it was working we had already moved the project into another tool. I know
I'm past your window but this doesn't feel right. Can you refund me?`,
      },
      {
        id: 'policy',
        title: 'Refund policy (internal, v11)',
        kind: 'policy',
        body: `Standard: full refund within 30 days of purchase, no questions asked.
After 30 days: no refund at agent discretion.

EXCEPTIONS — an agent may issue a full refund at any point in the first 90 days,
without escalation, when ANY of the following applies:
  (a) the account experienced a Sev-1 or Sev-2 incident lasting more than 4
      cumulative hours within the customer's first 14 days;
  (b) the customer was double-charged;
  (c) an enterprise contract was signed and never provisioned.

Do not advertise the exceptions. Apply them when they apply.`,
      },
      {
        id: 'incidents',
        title: 'Status log — incidents',
        kind: 'log',
        body: `2026-06-02  Sev-1  EU auth outage        6h 20m   affected: EU workspaces
2026-06-09  Sev-3  slow search           40m      affected: all
2026-06-24  Sev-2  file upload failures  2h 05m   affected: all

Account northlinedesign.com — region EU, created 2026-05-30.`,
      },
    ],
  },

  // ────────────────────────────── MARKETING ──────────────────────────────
  {
    id: 'launch',
    title: 'Write launch copy legal will actually approve',
    role: 'Marketing',
    roleEmoji: '◆',
    color: '#a78bfa',
    tagline: 'Every sentence an AI wants to write here is a regulatory problem.',
    brief:
      'We are launching a sleep supplement. Direct the AI to write the hero section for the launch page: headline, subhead, and three benefit bullets. It has to sell. It also has to survive the review in Context, which has killed the last two drafts.',
    deliverable: 'Headline, subhead, and three bullets — final copy, no options or alternates.',
    budget: { tokens: 9000, seconds: 1200 },
    difficulty: 'core',
    docs: [
      {
        id: 'product',
        title: 'Product one-pager',
        kind: 'spec',
        body: `NOX — magnesium glycinate + L-theanine, 2mg melatonin.
Study: our own 60-person, 4-week internal trial. 41 of 60 self-reported falling
asleep faster. Not peer reviewed. Not a controlled trial.
Price $34/mo. Ships in 2 days. Third-party tested for purity (COA public).`,
      },
      {
        id: 'legal',
        title: 'Legal review — standing rules for supplement copy',
        kind: 'policy',
        body: `Supplements are not drugs. Copy may NOT:
  • claim to treat, cure, prevent, or diagnose anything (incl. insomnia, anxiety)
  • say "clinically proven", "doctor recommended", or "guaranteed"
  • present our internal trial as clinical evidence
  • use superlatives we cannot substantiate ("best", "#1", "most effective")
  • imply results are typical without the disclaimer

Copy MAY: describe ingredients and dosages factually, cite the COA, describe
what customers reported IF it is attributed and qualified.`,
      },
      {
        id: 'brand',
        title: 'Brand voice',
        kind: 'spec',
        body: `Calm, plain, specific. Short sentences.
Banned words: unlock, elevate, revolutionary, game-changing, journey, transform,
seamless, cutting-edge, empower.
We do not shout. We do not use exclamation marks.`,
      },
    ],
  },

  // ──────────────────────────────── DATA ─────────────────────────────────
  {
    id: 'churn',
    title: 'Produce the churn number for the board deck',
    role: 'Data & Analytics',
    roleEmoji: '▦',
    color: '#34d399',
    tagline: 'Two tables define "active" differently. One answer goes in front of the board.',
    brief:
      'The CEO needs monthly churn for the board deck on Thursday. Direct the AI to compute it and write the one line that will appear on the slide. Read Context first — the number depends on decisions nobody has written down.',
    deliverable: 'The churn figure, the definition you used in one sentence, and the single line for the slide.',
    budget: { tokens: 11000, seconds: 1500 },
    difficulty: 'senior',
    docs: [
      {
        id: 'tables',
        title: 'Warehouse tables',
        kind: 'data',
        body: `subscriptions
  id, account_id, plan ('monthly'|'annual'), status ('active'|'canceled'|'paused'),
  started_at, canceled_at, mrr

account_activity
  account_id, last_seen_at
  -- "active" here means logged in at least once in the last 30 days

NOTE from the last analyst who left:
  subscriptions.status stays 'active' for annual plans until the term ends, even
  after the customer tells us they're leaving. Cancellation intent lands in
  churn_intents (below) on the day they ask.`,
      },
      {
        id: 'intents',
        title: 'churn_intents',
        kind: 'data',
        body: `account_id, requested_at, effective_at, reason

Last month: 34 intents logged. 21 were annual plans with effective_at in a
future month. 13 were monthly plans effective immediately.`,
      },
      {
        id: 'counts',
        title: 'Last month, raw counts',
        kind: 'data',
        body: `Accounts with a subscription at start of month:      1,240
  of which monthly:                                    890
  of which annual:                                     350
subscriptions.status flipped to 'canceled' during month:  13
churn_intents logged during month:                        34
Accounts in account_activity within 30d:                 1,006`,
      },
      {
        id: 'thread',
        title: '#finance — Tuesday',
        kind: 'thread',
        body: `@ceo: board wants "churn". Last quarter we showed 1.0%. If it jumped I need to know why before Thursday, not on the call.
@raj: careful with the annual cohort, we renewed a big batch in June so the denominator moves.
@ceo: I don't need a lecture, I need one number and a definition I can defend if someone pushes.`,
      },
    ],
  },

  // ───────────────────────────── OPS / TRIAGE ────────────────────────────
  {
    id: 'triage',
    title: 'Choose what ships this sprint',
    role: 'Engineering Management',
    roleEmoji: '▲',
    color: '#fbbf24',
    tagline: 'Five fires, one sprint. The loudest one is not the expensive one.',
    brief:
      'Five issues are open and you have one sprint of capacity for roughly two of them. Direct the AI to help you work the problem, then commit: what ships, what waits, and what you tell the people who do not get their fix.',
    deliverable: 'A ranked decision — what ships this sprint, what does not, and the message you send to the loudest stakeholder.',
    budget: { tokens: 11000, seconds: 1500 },
    difficulty: 'senior',
    docs: [
      {
        id: 'issues',
        title: 'Open issues',
        kind: 'data',
        body: `#1  Export to CSV drops the last row.        Reported by: Halcyon Group (very loud, 6 emails, CC'd our CEO)
#2  SSO login fails for one customer's IdP.   Reported by: Vantage Rail (one calm email)
#3  Dashboard slow (~7s) on large accounts.   Reported by: 14 accounts
#4  Typo on the billing receipt.              Reported by: internal
#5  Webhook retries fire twice on timeout.    Reported by: 2 accounts, both integrators`,
      },
      {
        id: 'accounts',
        title: 'Account values (ARR)',
        kind: 'data',
        body: `Halcyon Group      $14,000    renews in 9 months
Vantage Rail       $310,000   renews in 6 WEEKS
The 14 accounts    $96,000 combined
Integrator A       $8,000     (resells to 40 downstream customers)
Integrator B       $12,000    (resells to 25 downstream customers)`,
      },
      {
        id: 'sla',
        title: 'Enterprise SLA (Vantage Rail contract)',
        kind: 'policy',
        body: `Authentication availability: 99.9%.
Any authentication defect must be resolved within 10 business days of report or
the customer may terminate at renewal without penalty and claim a service credit
of 15% of annual fees.

#2 was reported 7 business days ago.`,
      },
    ],
  },

  // ─────────────────────────────── PRODUCT ───────────────────────────────
  {
    id: 'pricing',
    title: 'Spec a pricing change that will not blow up',
    role: 'Product',
    roleEmoji: '❖',
    color: '#f87171',
    tagline: 'The obvious pricing change is illegal in one of your markets.',
    brief:
      'We are moving from per-seat to usage-based pricing. Direct the AI to write the one-page spec engineering and support will work from. Context has the parts that make this hard.',
    deliverable: 'A one-page spec: new pricing, migration rules for existing customers, and what support tells anyone whose bill goes up.',
    budget: { tokens: 12000, seconds: 1500 },
    difficulty: 'staff',
    docs: [
      {
        id: 'current',
        title: 'Current pricing + book of business',
        kind: 'data',
        body: `Today: $20/seat/month, minimum 5 seats.
Proposed: $0.02 per processed record, no seat minimum.

Modeled against last month's usage:
  612 accounts total
  409 accounts pay LESS under usage pricing (avg -31%)
  158 accounts pay MORE (avg +44%)
   45 accounts pay MUCH more (>3x) — these are 6 of our 10 largest accounts`,
      },
      {
        id: 'legal',
        title: 'Legal note — EU customers',
        kind: 'policy',
        body: `Our EU terms (used for all customers billed in EUR, 143 accounts) commit to
30 days' written notice before any price increase, and give the customer the
right to terminate without penalty within that window if the increase exceeds
10%. This is contractual, not optional, and it applies per-account based on
their actual bill, not on the list price.

US and UK terms have no equivalent clause.`,
      },
      {
        id: 'support',
        title: 'Support tickets, recurring themes',
        kind: 'thread',
        body: `"We're paying for 12 seats and 4 people actually use it." — extremely common
"I can't predict my bill month to month" — the #1 objection from finance buyers
"Do inactive seats count?" — asked constantly, current answer is yes, it annoys people`,
      },
    ],
  },
]

export const TASKS_BY_ID: Record<string, JmTask> = Object.fromEntries(
  TASKS.map((t) => [t.id, t])
)

export function taskById(id: string): JmTask | undefined {
  return TASKS_BY_ID[id]
}

/**
 * The models a candidate can direct.
 *
 * `mult` is the token cost multiplier — choosing the careful model costs more
 * per call, which makes model choice itself a judgment the exam measures.
 * `persona` is the voice the workspace AI adopts; it is a simulation, not a
 * claim about which model is actually answering.
 */
export const MODELS = [
  {
    id: 'claude', tag: 'Claude', mult: 1.25, accent: '#e8853b', glyph: '✻',
    blurb: 'Careful and thorough. Best output, costs the most per call.',
    persona: 'a careful, thorough assistant that writes clean work and briefly names trade-offs',
  },
  {
    id: 'gpt', tag: 'GPT', mult: 1.0, accent: '#ffffff', glyph: '✶',
    blurb: 'Fast and confident. Balanced cost.',
    persona: 'a fast, confident, concise assistant that gets straight to the point',
  },
  {
    id: 'gemini', tag: 'Gemini', mult: 0.8, accent: '#4285f4', glyph: '✦',
    blurb: 'Efficient and direct. Cheapest per call.',
    persona: 'an efficient, direct assistant that keeps answers tight',
  },
] as const

export type ModelId = (typeof MODELS)[number]['id']
export const MODEL_BY_ID = Object.fromEntries(MODELS.map((m) => [m.id, m])) as Record<
  string,
  (typeof MODELS)[number]
>
