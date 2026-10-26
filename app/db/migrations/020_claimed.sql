-- What the claimant is claiming, activity by activity, as the adviser reads it off the
-- claim form (PIP2, UC50, ADP application). Saved together in one go.
create table claimed (
  case_id uuid not null references cases(id) on delete cascade,
  agency_id uuid not null references agencies(id),
  activity text not null,
  letter text not null,
  source text not null default 'claim_form',
  updated_by uuid references users(id),
  updated_at timestamptz not null default now(),
  primary key (case_id, activity)
);
alter table claimed enable row level security;
alter table claimed force row level security;
create policy agency_isolation on claimed
  using (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid)
  with check (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid);
