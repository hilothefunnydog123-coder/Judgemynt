-- ═══════════════════════════════════════════════════════════════════════
-- Judgemynt schema. Run once in the Supabase SQL editor.
--
-- Both tables have RLS enabled with NO policies, on purpose. Every read and
-- write goes through the server with the service role, which bypasses RLS.
-- That way a candidate holding the anon key cannot enumerate other people's
-- results, and a company cannot read another company's roles, even if a
-- client-side query is ever written by mistake.
--
-- Safe to re-run: everything is `if not exists` / `add column if not exists`.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Roles: a company's configured assessment ──────────────────────────────
create table if not exists judgemynt_roles (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,               -- the employer's auth user id
  name text not null,
  kind text not null default 'preset',    -- 'preset' | 'custom'
  task_id text,                           -- catalog task when kind = 'preset'

  brief text,                             -- overrides, or authors, the brief
  deliverable text,
  docs jsonb not null default '[]'::jsonb,          -- company context pack
  requirements jsonb not null default '[]'::jsonb,

  budget_tokens int not null default 10000,
  budget_seconds int not null default 1200,
  rubric jsonb not null default '{}'::jsonb,        -- dimensions, weights, passMark

  active boolean not null default true,
  created_at timestamptz default now()
);

create index if not exists idx_jm_roles_company
  on judgemynt_roles (company_id, created_at desc);

alter table judgemynt_roles enable row level security;

-- ── Results: one completed assessment ─────────────────────────────────────
create table if not exists judgemynt_results (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,               -- the employer's auth user id
  company_name text,
  candidate_name text,
  candidate_email text,
  score int,
  creativity int,                         -- legacy dimension columns, kept so
  efficiency int,                         -- existing rows and the embeddable
  quality int,                            -- widget keep working post-rubric
  verdict text,
  created_at timestamptz default now()
);

create index if not exists idx_jm_results_company
  on judgemynt_results (company_id, created_at desc);

alter table judgemynt_results enable row level security;

-- ── Additive columns for the configurable-rubric era ──────────────────────
alter table judgemynt_results
  add column if not exists role_id uuid,
  add column if not exists role_name text,
  add column if not exists task_id text,
  add column if not exists passed boolean,
  add column if not exists pass_mark int,
  -- Every rubric dimension's score, keyed by dimension id. Arbitrary keys,
  -- because the rubric is company-defined and columns are not.
  add column if not exists dimensions jsonb default '{}'::jsonb,
  -- Which hidden traps they resolved. The most-read part of the report.
  add column if not exists traps jsonb default '[]'::jsonb,
  -- Working-style portrait: docs read, think time, paste share.
  add column if not exists signals jsonb default '{}'::jsonb,
  add column if not exists tokens_used int,
  add column if not exists tokens_budget int,
  add column if not exists seconds_used int,
  add column if not exists model text,
  add column if not exists ended_by text,          -- 'submit' | 'tokens' | 'time'
  add column if not exists analysis text,
  add column if not exists hire text,
  -- The full session. Employers ask for it constantly, and it is the only way
  -- to audit a score a candidate disputes.
  add column if not exists transcript jsonb;

create index if not exists idx_jm_results_role
  on judgemynt_results (role_id, created_at desc);

-- ── Percentile benchmarking (task-scope + role-scope pooling) ──────────────
-- The benchmark engine ranks every finished session against its pool. The raw
-- score and the per-dimension `dimensions` above ARE the pool, so history stays
-- comparable; these two columns cache the rank computed at grading time.
--   percentile_overall — the primary-scope overall rank, 1-99 (higher is
--                        better; the shareable "top N%" is 100 minus this).
--   percentiles        — the full benchmark snapshot: task and role scope,
--                        overall and per-dimension ranks, sample sizes, and the
--                        `confident` flag a surface uses to decide whether to
--                        show the rank or say "not enough data yet".
alter table judgemynt_results
  add column if not exists percentile_overall int,
  add column if not exists percentiles jsonb;

-- Task-scope pooling reads every company's rows (plus practice runs) for one
-- catalog task; role-scope pooling already rides idx_jm_results_role above.
create index if not exists idx_jm_results_task
  on judgemynt_results (task_id, created_at desc);

-- ── Profiles: who a signed-in user is ─────────────────────────────────────
-- Everyone who takes or gives a test has an account. A profile says which
-- side of the marketplace they are on and what to call them.
create table if not exists judgemynt_profiles (
  user_id text primary key,               -- Supabase auth user id
  kind text not null,                     -- 'candidate' | 'employer'
  email text,
  first_name text,                        -- legal name, candidate side
  last_name text,
  company_name text,                      -- employer side
  company_url text,
  created_at timestamptz default now()
);

alter table judgemynt_profiles enable row level security;

-- ── Jobs: a posting in the marketplace ────────────────────────────────────
-- Every job is backed by one of the company's assessment roles: applying
-- means taking that assessment.
create table if not exists judgemynt_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  company_name text,
  company_url text,
  role_id uuid not null,                  -- judgemynt_roles.id
  title text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz default now()
);

create index if not exists idx_jm_jobs_company
  on judgemynt_jobs (company_id, created_at desc);
create index if not exists idx_jm_jobs_active
  on judgemynt_jobs (active, created_at desc);

alter table judgemynt_jobs enable row level security;

-- ── Applications: one candidate, one job ──────────────────────────────────
create table if not exists judgemynt_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  company_id text not null,
  candidate_id text not null,
  candidate_name text,
  candidate_email text,
  status text not null default 'applied', -- applied | assessed | accepted | rejected
  score int,
  result_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_jm_apps_once
  on judgemynt_applications (job_id, candidate_id);
create index if not exists idx_jm_apps_company
  on judgemynt_applications (company_id, created_at desc);
create index if not exists idx_jm_apps_candidate
  on judgemynt_applications (candidate_id, created_at desc);

alter table judgemynt_applications enable row level security;

-- ── Messages: the DM thread on an accepted application ────────────────────
create table if not exists judgemynt_messages (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  sender_id text not null,
  sender_kind text not null,              -- 'employer' | 'candidate'
  body text not null,
  created_at timestamptz default now()
);

create index if not exists idx_jm_messages_app
  on judgemynt_messages (application_id, created_at asc);

alter table judgemynt_messages enable row level security;

-- ── Credentials: a shareable pass on a catalog task ───────────────────────
-- The row id is the credential id a holder puts on LinkedIn; /credential/<id>
-- renders it publicly.
create table if not exists judgemynt_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  holder_name text,
  task_id text,
  task_title text,
  score int,
  pass_mark int,
  verdict text,
  created_at timestamptz default now()
);

create index if not exists idx_jm_credentials_user
  on judgemynt_credentials (user_id, created_at desc);

alter table judgemynt_credentials enable row level security;

-- ── A credential is a performance credential, not a bare score ─────────────
-- These widen a credential from "passed, scored 82" into the viral artifact:
-- a benchmarked PERCENTILE (overall and top dimension), the conditions it was
-- earned under, and the full per-dimension rubric breakdown. Everything the
-- benchmark engine computes is frozen onto the row at issue time, so the
-- public /credential/<id> page can never drift from what was awarded.
-- Additive and idempotent; safe to re-run. Percentile columns are RANKS
-- (0-100, "scored at or above this share of the field"); the page renders the
-- shareable "top N%" as 100 minus the rank.
alter table judgemynt_credentials
  add column if not exists category text,               -- role family, e.g. 'Software Engineering'
  add column if not exists difficulty text,             -- 'core' | 'senior' | 'staff'
  add column if not exists model text,                  -- the AI the candidate directed
  add column if not exists time_limit int,              -- seconds allowed
  add column if not exists tokens_budget int,           -- token budget for the session
  -- The full rubric breakdown, so the credential shows how the score was made.
  add column if not exists dimensions jsonb default '{}'::jsonb,        -- { dimId: score }
  add column if not exists dimension_labels jsonb default '[]'::jsonb,  -- [{ id, label }]
  add column if not exists dimension_percentiles jsonb default '{}'::jsonb, -- { dimId: rank }
  -- The hero: benchmarked percentile rank overall and on the top dimension.
  add column if not exists percentile_overall int,      -- overall percentile rank, 0-100
  add column if not exists top_dimension text,          -- highest-ranked dimension id
  add column if not exists top_dimension_label text,    -- its human label, e.g. 'Judgment'
  add column if not exists top_dimension_skill text,    -- LinkedIn phrase, 'catching hidden operational risk'
  add column if not exists top_dimension_percentile int,-- its percentile rank, 0-100
  add column if not exists sample_size int,             -- verified holders of this credential (cohort)
  add column if not exists issuer text default 'Judgemynt';

create index if not exists idx_jm_credentials_task
  on judgemynt_credentials (task_id, created_at desc);

-- One credential per person per task: the mint looks up (user_id, task_id) and
-- returns the credential they already hold instead of issuing a second. A plain
-- index (not unique) so re-running this file never fails on rows that predate
-- the rule; the application enforces the single-credential invariant.
create index if not exists idx_jm_credentials_user_task
  on judgemynt_credentials (user_id, task_id);

-- ── Grading integrity: server-owned sessions ──────────────────────────────
-- The score cannot be graded from a transcript the browser sends, or a
-- candidate could POST a fabricated perfect session. The AI `respond` calls
-- already run on the server, so the real turns are accumulated HERE, keyed by
-- an unguessable session id, and the examiner grades only this row. tokens_used
-- and started_at are server-authoritative too, so Efficiency and the clock
-- cannot be faked. The graded result is cached on the row so a network retry
-- returns the same score instead of paying for a second examiner call.
create table if not exists judgemynt_sessions (
  id uuid primary key default gen_random_uuid(),
  candidate_id text,                      -- auth user id, bound on first authed call
  token text,                             -- invite token, for role + budget resolution
  task_id text,
  model text,
  turns jsonb not null default '[]'::jsonb,   -- [{ role, content, cost }], server truth
  tokens_used int not null default 0,     -- server-tracked spend, the real budget meter
  started_at timestamptz default now(),
  graded boolean not null default false,  -- one grade per session
  result jsonb,                           -- the cached graded result, for idempotent retries
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table judgemynt_sessions enable row level security;

-- Retake lock for invited role assessments (no marketplace application): the
-- evaluate path checks for an existing graded result by this candidate on this
-- role before grading again. Needs the candidate on the row and an index to
-- find it. Practice runs also carry the candidate so a person is pooled and
-- credentialed on their FIRST attempt at a task only.
alter table judgemynt_results
  add column if not exists candidate_id text;

create index if not exists idx_jm_results_role_candidate
  on judgemynt_results (role_id, candidate_id);
create index if not exists idx_jm_results_task_candidate
  on judgemynt_results (task_id, candidate_id);
