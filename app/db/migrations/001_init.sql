-- Heard & Supported: first schema.
-- Every table holding case data carries agency_id and is protected by row-level
-- security, forced even for the table owner, so one agency can never read
-- another's cases even if the application has a bug.


create table agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  entra_tenant_id text unique,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id),
  entra_oid text not null unique,
  name text,
  email text,
  role text not null default 'adviser' check (role in ('adviser', 'supervisor', 'admin')),
  created_at timestamptz not null default now()
);

-- Cases hold no client names or contact details: the agency's own case
-- management system keeps those. A case is identified by the agency's reference.
create table cases (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id),
  ref text not null,
  benefit text not null check (benefit in ('pip', 'uc-wca')),
  stage text not null default 'claim' check (stage in ('claim', 'assessment', 'decision', 'mr', 'appeal', 'closed')),
  status text not null default 'draft' check (status in ('draft', 'check', 'changes', 'signed')),
  adviser_id uuid references users(id),
  dataset_version text not null,
  created_at timestamptz not null default now(),
  unique (agency_id, ref)
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id),
  case_id uuid not null references cases(id) on delete cascade,
  name text not null,
  content_type text not null,
  size_bytes integer not null,
  blob_path text not null,
  read_status text not null default 'uploaded' check (read_status in ('uploaded', 'reading', 'read', 'failed')),
  page_count integer,
  low_confidence_lines integer,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table pages (
  document_id uuid not null references documents(id) on delete cascade,
  agency_id uuid not null references agencies(id),
  page_no integer not null,
  text text not null,
  lines jsonb not null,
  primary key (document_id, page_no)
);

create table evidence (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id),
  case_id uuid not null references cases(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  page_no integer not null,
  quote text not null,
  activities text[] not null,
  note text,
  source text not null default 'ai' check (source in ('ai', 'adviser')),
  status text not null default 'suggested' check (status in ('suggested', 'accepted', 'rejected')),
  decided_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index evidence_case on evidence (case_id);

create table gaps (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id),
  case_id uuid not null references cases(id) on delete cascade,
  activity text not null,
  gap text not null,
  status text not null default 'open' check (status in ('open', 'closed', 'dismissed')),
  created_at timestamptz not null default now()
);

-- The adviser's descriptor decision per activity. satisfied holds
-- [{letter, daysPercent}] for PIP (reg 7) or [{letter}] / ["15(a)"] for WCA.
create table decisions (
  case_id uuid not null references cases(id) on delete cascade,
  agency_id uuid not null references agencies(id),
  activity text not null,
  satisfied jsonb not null default '[]',
  days_per_week numeric(3, 1),
  updated_by uuid references users(id),
  updated_at timestamptz not null default now(),
  primary key (case_id, activity)
);

create table extraction_runs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id),
  case_id uuid not null references cases(id) on delete cascade,
  model text not null,
  dataset_version text not null,
  verified integer not null,
  rejected integer not null,
  identifiers_removed integer not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

-- What happened, by whom, when. Never the content of documents or evidence.
create table audit (
  id bigserial primary key,
  agency_id uuid not null references agencies(id),
  case_id uuid references cases(id) on delete set null,
  user_id uuid references users(id),
  action text not null,
  at timestamptz not null default now()
);
create index audit_case on audit (case_id, at desc);

do $$
declare t text;
begin
  foreach t in array array['cases', 'documents', 'pages', 'evidence', 'gaps', 'decisions', 'extraction_runs', 'audit'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format($p$create policy agency_isolation on %I
      using (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid)
      with check (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid)$p$, t);
  end loop;
end $$;
