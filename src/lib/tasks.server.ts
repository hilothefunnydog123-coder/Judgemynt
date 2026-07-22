/* ════════════════════════════════════════════════════════════════════════
   Judgemynt, the answer key. SERVER ONLY.

   Never import this from a client component. It is the half of every task the
   candidate must not see: the checkable requirements, and the traps, the
   judgment calls that separate someone who read the context pack from someone
   who forwarded the brief to a chatbot and shipped the first answer.

   A trap is scored on whether the candidate RESOLVED it, not on whether they
   used particular words. `tell` is guidance for the examiner about what
   resolving it actually looks like, including the specific wrong answer that
   an undirected AI produces, because that wrong answer is the signal.
   ════════════════════════════════════════════════════════════════════════ */
import 'server-only'

export interface Trap {
  id: string
  /** Short label shown back to the candidate and the employer after grading. */
  name: string
  /** What the naive, undirected answer does. */
  naive: string
  /** What resolving it looks like. */
  tell: string
  /** Traps are weighted, some are judgment, some are catastrophic. */
  weight: 1 | 2 | 3
}

export interface TaskKey {
  requirements: string[]
  traps: Trap[]
  ideal: string
}

export const TASK_KEYS: Record<string, TaskKey> = {
  slugify: {
    requirements: [
      'lowercases all input',
      'spaces and underscores become a single hyphen',
      'strips everything except a-z, 0-9, hyphen',
      'collapses repeated hyphens',
      'trims leading and trailing hyphens',
      'returns "" for empty or whitespace-only input',
      'caps output at 60 characters',
    ],
    traps: [
      {
        id: 'transliterate',
        name: 'Accented characters must transliterate, not vanish',
        naive:
          'Strips non-ascii with a regex, so "Café" becomes "caf" and "Björk" becomes "bjrk", the exact bug the #eng-cms thread says was rolled back.',
        tell:
          'Normalizes (NFD + combining-mark strip, or an explicit map) BEFORE the strip step, so "Café culture in Montréal" produces "cafe-culture-in-montreal" and matches the live URL sample.',
        weight: 3,
      },
      {
        id: 'wordboundary',
        name: 'The 60-char cap trims to a whole word',
        naive: 'Uses slice(0, 60), cutting mid-word and producing a slug that does not match production.',
        tell:
          'Trims back to the last hyphen inside the cap, so the long restaurants title ends "...ranked-by-our" exactly as the live sample shows, with no trailing hyphen.',
        weight: 2,
      },
      {
        id: 'order',
        name: 'Operation order is deliberate',
        naive: 'Strips before replacing spaces, so "a b" loses the separator, or trims before collapsing and leaves a trailing hyphen after the cap.',
        tell:
          'Transliterate, lowercase, replace separators, strip, collapse, cap-to-word, then trim, and the trim happens after the cap so no slug ends in a hyphen.',
        weight: 2,
      },
      {
        id: 'stability',
        name: 'Noticed that changing a slug is a 404',
        naive: 'Never mentions the existing URLs; treats this as a greenfield function.',
        tell:
          'Says out loud, to the AI or in their note, that the output has to reproduce the live slug sample because indexed URLs break otherwise, and ideally checks their function against those exact rows.',
        weight: 2,
      },
    ],
    ideal:
      'A function that reproduces all four production slugs exactly, transliterating rather than stripping accents, capping at 60 on a word boundary, with a note acknowledging the live-URL constraint.',
  },

  refund: {
    requirements: [
      'reaches the correct decision: issue the full refund',
      'the reply is send-ready, not a draft with placeholders',
      'does not quote or advertise the internal exception list',
      'tone is warm and takes responsibility without grovelling',
    ],
    traps: [
      {
        id: 'exception',
        name: 'The customer qualifies for exception (a)',
        naive:
          'Politely declines because 45 days is past the 30-day window, or escalates to a manager. This is the answer an AI gives with the ticket alone.',
        tell:
          'Cross-references the incident log with the account: northlinedesign.com is EU, created 2026-05-30, and the 2026-06-02 Sev-1 EU auth outage ran 6h20m, inside their first 14 days and over the 4-hour bar. Exception (a) applies, so the refund is issued without escalation.',
        weight: 3,
      },
      {
        id: 'noescalate',
        name: 'Did not escalate something they were authorised to do',
        naive: 'Says "let me check with my manager" or "I have escalated this", adding a day for no reason.',
        tell: 'Recognises the policy says an agent may issue this refund without escalation, and simply does it.',
        weight: 2,
      },
      {
        id: 'nopolicyleak',
        name: 'Did not read the internal exception list to the customer',
        naive:
          'Explains the exception criteria in the email, "because you had a Sev-1 in your first 14 days", which the policy explicitly says not to advertise.',
        tell:
          'Acknowledges the outage and their experience specifically, issues the refund, and never recites the criteria or implies a general policy that others could claim.',
        weight: 2,
      },
      {
        id: 'timing',
        name: 'Set a concrete expectation',
        naive: 'Says "a refund has been processed" with no amount, method, or timing.',
        tell: 'States what is being refunded and roughly when it lands, so the customer does not have to write again.',
        weight: 1,
      },
    ],
    ideal:
      'A short, human email that apologises for the specific outage, confirms the full annual refund with timing, and leaves the door open, with an internal note showing the exception was found by cross-referencing the incident log with the account region and creation date.',
  },

  launch: {
    requirements: [
      'delivers exactly one headline, one subhead, and three bullets',
      'no banned brand words and no exclamation marks',
      'ingredients and dosages are stated factually',
      'copy is specific rather than generic supplement filler',
    ],
    traps: [
      {
        id: 'diseaseclaim',
        name: 'No treat/cure/prevent claim',
        naive:
          'Writes something like "beat insomnia" or "ends restless nights", a disease claim, which is the single fastest way to an FDA warning letter.',
        tell:
          'Describes sleep quality or the ingredients without claiming to treat, cure, or prevent insomnia, anxiety, or any condition.',
        weight: 3,
      },
      {
        id: 'clinical',
        name: 'Did not launder the internal trial as clinical evidence',
        naive:
          'Writes "clinically proven" or "studies show", or cites "41 of 60" as if it were a controlled trial. Legal has killed two drafts over exactly this.',
        tell:
          'Either omits the trial or attributes and qualifies it honestly, self-reported, our own 60-person internal trial, not peer reviewed, and does not use the phrase "clinically proven".',
        weight: 3,
      },
      {
        id: 'superlative',
        name: 'No unsubstantiated superlatives',
        naive: 'Reaches for "the best sleep supplement", "#1", or "most effective".',
        tell: 'Sells on specifics, dosage, third-party COA, price, shipping, instead of unprovable ranking claims.',
        weight: 2,
      },
      {
        id: 'voice',
        name: 'Held the brand voice under pressure',
        naive:
          'Slips in "unlock", "transform", "elevate", or an exclamation mark, because that is the default register of AI marketing copy.',
        tell: 'Short, calm, plain sentences with none of the banned words and no exclamation marks.',
        weight: 2,
      },
    ],
    ideal:
      'Quiet, concrete copy that sells on dosage, third-party testing, and price, references the internal trial only if properly qualified, and would pass legal review unchanged.',
  },

  churn: {
    requirements: [
      'commits to a single number',
      'states the definition in one defensible sentence',
      'produces the one-line slide copy asked for',
      'the arithmetic is consistent with the definition given',
    ],
    traps: [
      {
        id: 'annuallag',
        name: 'Annual plans distort the status field',
        naive:
          'Uses the 13 status flips over 1,240 accounts (≈1.0%) and reports it as flat, which looks fine and is wrong, because annual cancellations have not flipped status yet.',
        tell:
          'Recognises that status lags for annual plans, so the 13 flips understate reality. Uses churn_intents, or explicitly separates logo churn by plan type, rather than reporting the comfortable number.',
        weight: 3,
      },
      {
        id: 'wrongdenominator',
        name: 'Did not mix the two definitions of active',
        naive:
          'Divides by 1,006 (the account_activity 30-day figure) or blends it with the subscription count, mixing "logged in recently" with "paying".',
        tell:
          'Keeps subscription status as the churn denominator (1,240) and treats account_activity as engagement, not billing, or says explicitly which one it used and why.',
        weight: 2,
      },
      {
        id: 'futuredated',
        name: 'Handled the 21 future-effective annual intents',
        naive:
          'Counts all 34 intents in this month, inflating the number, or drops them entirely and undercounts.',
        tell:
          'Makes a stated choice, count intents in the month they are requested, or the month they take effect, and applies it consistently, flagging that 21 of 34 land in a future month.',
        weight: 2,
      },
      {
        id: 'defensible',
        name: 'Gave the CEO what they actually asked for',
        naive: 'Returns three numbers with caveats, or a lecture on methodology, after the CEO said not to.',
        tell:
          'One number, one sentence of definition that survives a follow-up question, and slide copy that does not hide the movement.',
        weight: 2,
      },
    ],
    ideal:
      'A single stated churn figure with an explicit definition, an acknowledgement that annual intents are the reason it moved from last quarter, and one clean slide line the CEO can defend on the call.',
  },

  triage: {
    requirements: [
      'names exactly what ships and what does not',
      'gives a reason tied to the documents, not to gut feel',
      'writes the actual message to the loudest stakeholder',
      'fits roughly two issues of capacity',
    ],
    traps: [
      {
        id: 'sla',
        name: '#2 is a contractual emergency, not a small ticket',
        naive:
          'Ranks #2 low because one calm email from one customer looks minor next to six angry ones. This is the answer you get from the issue list alone.',
        tell:
          'Connects the SLA (10 business days, reported 7 days ago) to Vantage Rail at $310k renewing in six weeks. #2 ships first, there are three business days left before termination rights and a 15% credit trigger.',
        weight: 3,
      },
      {
        id: 'loudness',
        name: 'Did not let volume set priority',
        naive: 'Ships #1 first because Halcyon CC\'d the CEO, spending the sprint on $14k while $310k is on the clock.',
        tell:
          'Explicitly separates how loud a stakeholder is from what the issue costs, and says so without being dismissive of Halcyon.',
        weight: 3,
      },
      {
        id: 'blast',
        name: 'Weighed the webhook bug by blast radius',
        naive: 'Dismisses #5 as "only 2 accounts" without noticing both are integrators reselling to 65 downstream customers, and that double-firing webhooks means duplicate downstream writes.',
        tell:
          'Counts the downstream exposure rather than the account count, and either ships it second or explains why it waits.',
        weight: 2,
      },
      {
        id: 'message',
        name: 'The message to Halcyon is honest and specific',
        naive: 'Vague reassurance, "we hear you, it is in the backlog", or an invented promise date.',
        tell:
          'Tells Halcyon plainly that #1 is not in this sprint, gives a real next checkpoint, and does not pretend it is coming sooner than it is.',
        weight: 2,
      },
    ],
    ideal:
      'Ships #2 immediately on SLA and renewal exposure, then #5 or #3 on blast radius, defers #1 with a direct and specific note to Halcyon, and explains the ranking in terms of contract and revenue rather than volume.',
  },

  pricing: {
    requirements: [
      'states the new pricing model concretely',
      'gives migration rules that cover existing customers',
      'gives support a line to use when a bill goes up',
      'fits on one page and is specific enough to build from',
    ],
    traps: [
      {
        id: 'eunotice',
        name: 'EU accounts have a contractual 30-day notice right',
        naive:
          'Writes a single global migration date. For the 143 EUR-billed accounts whose bill rises more than 10%, that is a breach of their own terms and hands them a penalty-free exit.',
        tell:
          'Carves out EUR-billed accounts with at least 30 days written notice, and recognises the 10% threshold is assessed per-account on the actual bill, not on list price.',
        weight: 3,
      },
      {
        id: 'bigaccounts',
        name: 'Six of the ten largest accounts pay 3x more',
        naive:
          'Reports the cheerful average (409 accounts pay less) and moves on, quietly proposing a change that triples the bill for the top of the book.',
        tell:
          'Names the 45-account >3x cohort as the central risk, and proposes something concrete, grandfathering, a cap, a phase-in, or a negotiated migration, rather than hoping.',
        weight: 3,
      },
      {
        id: 'predictability',
        name: 'Answered the actual objection',
        naive:
          'Ships pure usage pricing, which directly worsens the #1 finance-buyer objection in the ticket log: "I can\'t predict my bill."',
        tell:
          'Addresses predictability, a cap, a committed tier, a monthly estimate, or a bill-shock alert, because the ticket log says that is what loses deals.',
        weight: 2,
      },
      {
        id: 'supportline',
        name: 'Support gets something usable',
        naive: 'Leaves support with "explain the value" or omits the line entirely.',
        tell: 'Provides concrete words for the bill-goes-up conversation, including what support is authorised to offer.',
        weight: 2,
      },
    ],
    ideal:
      'A spec that keeps the usage model, grandfathers or phases in the >3x cohort, gives EUR-billed accounts their contractual notice, adds a predictability mechanism, and hands support a real script.',
  },
}

export function keyFor(taskId: string): TaskKey | undefined {
  return TASK_KEYS[taskId]
}
