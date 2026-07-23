# Judgemynt

**Use any AI you want. That's the point.**

Every screening test broke the day candidates got ChatGPT. The industry's answer was proctoring — lockdown browsers, webcams, plagiarism detectors — an arms race it loses.

Judgemynt takes the other side of that bet. It *hands* the candidate an AI, then hands them the documents the AI doesn't have, and measures whether they read them.

## Why this can't be defeated by pasting it into a chatbot

The old version of this product showed you flawed AI text and asked you to find the flaw. That test dies the moment someone thinks to paste it into Claude, which will find every problem instantly.

So the traps moved. They no longer live in the prose — they live in the **context pack**:

- A refund is 45 days old and policy says 30. Buried in the incident log: their region had a 6-hour outage in their first week, which triggers an exception the policy says not to advertise.
- Five bugs, one sprint. The loudest is a $14k account. The quiet one is $310k, three days from an SLA breach that voids the renewal.
- Churn for the board deck. Annual plans stay `status = 'active'` for months after the customer quits, so the comfortable number is wrong.

An outside chatbot without those documents cannot help. With them, it's still a judgment call rather than a lookup. And the AI *inside* the workspace is deliberately instructed not to volunteer warnings — ask it to write the refund denial and it will write you a good one.

## What a session looks like

1. **Brief** — the task, the deliverable, the context pack, and a choice of assistant. Claude costs ×1.25 per message, Gemini ×0.8. Choosing well is part of the assessment.
2. **Run** — a live chat with the AI, a token budget draining in the corner, and a clock. Reading documents is free. Talking to the AI is not. `/check`, `/docs`, `/model`, `/submit`.
3. **Result** — a weighted score against the company's rubric, every hidden trap marked caught or missed, the key moves judged one by one, and a working-style portrait.

## Process telemetry

Because the AI lives inside the workspace, the whole session is observable without a webcam:

- did they open the context pack **before** typing, or after, or never
- median think time between an AI reply and their next instruction
- share of input pasted versus typed
- which commands they reached for

None of it is a cheating detector and none of it is scored on its own. It's the part of the report hiring managers read twice.

## For employers: put your own documents in the exam

This is the product. A role is one configured assessment:

| | |
|---|---|
| **Task** | a built-in one, or write your own brief and deliverable |
| **Your documents** | paste in your real refund policy, SLA, brand rules, pricing table |
| **Requirements** | objective things the deliverable must do |
| **Budget** | tokens and minutes — tight tests prioritisation, loose tests depth |
| **Rubric** | pick dimensions, drag the weights, set the pass mark |
| **House rules** | free text handed to the examiner: *"we hire for bluntness, don't reward hedging"* |

Send the link. Get back a scored session with the full transcript, what they missed, and how they worked. Embed a scoreboard on your careers page with `/widget`.

The generic tasks are a good demo. A candidate who finds the exception in *your* returns policy has demonstrated something no generic assessment can.

## Running it

```bash
npm install
cp .env.example .env.local     # GEMINI_API_KEY at minimum
npm run dev
```

Only `GEMINI_API_KEY` is required — without it the workspace renders but cannot grade. Supabase (accounts, roles, results) and Resend (the employer contact form) are optional and degrade to disabled rather than erroring, so the app builds and runs for anyone who clones it.

Google sign-in runs through Supabase Auth (PKCE flow). One-time setup: create an
OAuth 2.0 Web client in Google Cloud Console with the redirect URI
`https://<project-ref>.supabase.co/auth/v1/callback`, enable the Google provider
in the Supabase dashboard with that client's ID and secret, and set your Site URL
(plus `http://localhost:3000` for dev) under Authentication, URL Configuration.
No extra env vars are needed beyond the Supabase keys.

For the employer side, run `supabase-judgemynt.sql` in the Supabase SQL editor. Both tables have RLS on with no policies on purpose: every read and write goes through the server with the service role, so a candidate holding the anon key can't enumerate results and a company can't read another company's roles.

## Layout

```
src/lib/tasks.ts          task catalog — PUBLIC half (brief, deliverable, context docs)
src/lib/tasks.server.ts   the answer key — requirements and hidden traps, server only
src/lib/roles.ts          a company's configured assessment, and how it resolves
src/lib/rubric.ts         dimensions, weights, pass marks
src/lib/telemetry.ts      process signals derived from workspace events
src/lib/db.ts             service-role access + invite token encoding

src/app/page.tsx          landing + task picker (sign-in gated)
src/app/Workspace.tsx     the assessment: brief → run → result
src/app/employers/        role builder, candidate results, transcripts
src/app/marketplace/      job board, applications, decisions, DM threads
src/app/credential/       public verifiable credential pages
src/app/widget/           embeddable scoreboard
src/app/api/assess/       task resolution, the AI, and grading
src/app/api/company/      role CRUD, invites, results
src/app/api/marketplace/  jobs, applications, accept/reject emails, messages
src/app/api/profile/      candidate/employer onboarding profiles
```

Next.js App Router, React 19, Tailwind 4, TypeScript. Six runtime dependencies.

## History

Judgemynt was built inside the Nexus Finance repository and was never related to it. This repository is that code extracted to stand on its own, then rebuilt around the work-sample model described above.
