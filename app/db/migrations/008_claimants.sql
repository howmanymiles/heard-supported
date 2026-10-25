-- The client, and the consent they gave with the adviser before anything was recorded.
-- A claimant record is created only alongside a consent to store their information.
create table claimants (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id),
  name text not null,
  preferred_name text,
  date_of_birth date,
  agency_ref text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
alter table claimants enable row level security;
alter table claimants force row level security;
create policy agency_isolation on claimants
  using (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid)
  with check (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid);

create table consents (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id),
  claimant_id uuid not null references claimants(id) on delete cascade,
  statement_version text not null,
  method text not null check (method in ('in_person', 'phone', 'video', 'written')),
  given_on date not null,
  store_data boolean not null check (store_data),
  ai_processing boolean not null,
  act_on_behalf boolean not null,
  recorded_by uuid references users(id),
  recorded_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  withdrawn_by uuid references users(id),
  withdrawn_note text
);
alter table consents enable row level security;
alter table consents force row level security;
create policy agency_isolation on consents
  using (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid)
  with check (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid);
create index consents_claimant on consents (claimant_id, recorded_at desc);

alter table cases add column claimant_id uuid references claimants(id);
create index cases_claimant on cases (claimant_id);

-- For the value of a UC WCA outcome: which LCWRA amount applies, and whether the
-- legacy LCW element is in payment (new claims since April 2017 have no LCW element).
alter table cases add column uc_lcwra_rate text check (uc_lcwra_rate in ('standard', 'protected'));
alter table cases add column lcw_legacy boolean not null default false;
