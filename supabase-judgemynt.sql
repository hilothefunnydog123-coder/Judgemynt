-- Judgemynt for Employers — candidate assessment results
-- Run this in the Supabase SQL editor once.

create table if not exists judgemynt_results (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,          -- the employer's auth user id
  company_name text,
  candidate_name text,
  candidate_email text,
  score int,
  creativity int,
  efficiency int,
  quality int,
  verdict text,
  created_at timestamptz default now()
);

create index if not exists idx_jm_results_company on judgemynt_results (company_id, created_at desc);

-- Lock the table down: all access goes through the server (service role), which bypasses RLS.
alter table judgemynt_results enable row level security;
