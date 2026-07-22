# Judgemynt

**AI can write anything. It cannot tell you when it is wrong.**

Judgemynt is an exam for the one skill that survives: judgment. You are handed real AI output with real problems buried in it — a fabricated statistic, a famous myth stated as fact, editorial framing sold as neutral — and you have to catch what is wrong and fix it. A model grades you against a hidden answer key you never see.

Three levels, in order of how hard they are to fake:

| Level | Degree | What it tests |
|---|---|---|
| 1 | **AI Detection** | Catch what AI gets wrong — fakes, false facts, hidden bias |
| 2 | **AI Correction** | Fix flawed AI work to a genuinely high standard |
| 3 | **AI Direction** | Judge and direct AI toward an excellent result |

Pass mark is 70. Challenges are grouped into career fields, so the credential means something specific rather than "took an AI course."

## Two sides

**Candidates** (`/`) pick a field, work through its curriculum, and earn degrees they can show.

**Employers** (`/employers`) send a candidate an invite link, get back a scored assessment — creativity, efficiency, quality, and a verdict — and can embed a live scoreboard of results on their careers page (`/widget`, framable from anywhere by design).

## How grading works

The catalogue in `src/lib/fields.ts` is the **public** half of every challenge: the brief and the flawed output the browser is allowed to see. The hidden half — the known flaws and the answer key — lives server-side in `src/app/api/grade/route.ts` and never leaves the server. Challenge ids are globally unique and double as the grade key, so adding a field is: append a `JmField` to the catalogue, add its answer keys to the route.

Two independent brakes on the AI bill:

- `src/lib/ratelimit.ts` — per-IP, caps one abuser (15 grades/min, 30 assessments/min).
- `src/lib/gemini.ts` — a daily budget with response caching and stale-serving, caps the bill itself. Past budget, callers get a cached answer if one exists, else a clean 429 the UI already handles.

## Running it

```bash
npm install
cp .env.example .env.local     # fill in GEMINI_API_KEY at minimum
npm run dev
```

Only `GEMINI_API_KEY` is required — without it the exam renders but cannot score. Supabase (accounts, employer results) and Resend (the employer contact form) are optional; both degrade to disabled rather than erroring, so the site builds and runs for anyone who clones it.

For the employer side, run `supabase-judgemynt.sql` in the Supabase SQL editor once. That table has RLS enabled and no policies on purpose — every read and write goes through the server with the service role, so candidates cannot read each other's results.

## Layout

```
src/app/page.tsx              the exam — fields, curriculum, challenge, result
src/app/Assessment.tsx        the employer-invited assessment flow
src/app/employers/page.tsx    employer dashboard, invites, embed snippet
src/app/widget/page.tsx       embeddable results scoreboard
src/app/api/grade/            challenge grading + the hidden answer keys
src/app/api/assess/           employer assessment grading
src/app/api/enterprise/       invite tokens, result storage, widget feed
src/app/api/contact/          employer inquiry email
src/lib/fields.ts             field + challenge catalogue (public copy only)
```

Next.js App Router, React 19, Tailwind 4, TypeScript.

## History

Judgemynt was built inside the Nexus Finance repository and was never related to it. This repository is that code extracted to stand on its own: routes moved from `/judgemynt/*` to the root, shared helpers (`useAuth`, `supabase`, `ratelimit`, `gemini`) copied in and trimmed to what Judgemynt actually uses, and a layout and theme of its own.
