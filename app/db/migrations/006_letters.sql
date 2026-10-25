-- Letters sent on the client's behalf (acting-on-behalf MR request, request for the report, ...).
create table letters (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id),
  case_id uuid not null references cases(id) on delete cascade,
  kind text not null check (kind in ('raise_mr', 'request_report')),
  text text not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table letters enable row level security;
alter table letters force row level security;
create policy agency_isolation on letters
  using (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid)
  with check (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid);

-- When the decision letter gives only points, the descriptors those points could mean.
alter table assessor_choices add column candidates text[];
