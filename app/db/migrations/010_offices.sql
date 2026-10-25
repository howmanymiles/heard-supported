-- The agency's offices. Each adviser works from one; each case belongs to the office
-- of the adviser who holds it, so figures can be reported by office.
create table offices (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id),
  name text not null,
  created_at timestamptz not null default now(),
  unique (agency_id, name)
);
alter table offices enable row level security;
alter table offices force row level security;
create policy agency_isolation on offices
  using (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid)
  with check (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid);

alter table users add column office_id uuid references offices(id);
alter table cases add column office_id uuid references offices(id);
create index cases_office on cases (agency_id, office_id);
