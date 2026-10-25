-- What happened to each point the adviser disputed: for overturn data by activity.
create table issue_results (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id),
  case_id uuid not null references cases(id) on delete cascade,
  issue_key text not null,
  label text not null,
  result text not null check (result in ('won', 'part', 'lost')),
  stage text check (stage in ('mr', 'appeal')),
  recorded_by uuid references users(id),
  recorded_at timestamptz not null default now(),
  unique (case_id, issue_key)
);
alter table issue_results enable row level security;
alter table issue_results force row level security;
create policy agency_isolation on issue_results
  using (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid)
  with check (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid);
