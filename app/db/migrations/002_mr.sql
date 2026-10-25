-- Mandatory reconsideration stage (PIP).

-- What a document is. Evidence is read for the claim; the PA4 and decision
-- letter are read for the DWP's position and are not treated as evidence.
alter table documents add column kind text not null default 'evidence'
  check (kind in ('evidence', 'pa4', 'decision', 'other'));

alter table cases
  add column decision_date date,
  add column mr_request_date date,
  add column late_reason text,
  add column mr_draft text;

-- The DWP's descriptor for each activity, as read from the decision papers and
-- confirmed (or corrected) by the adviser. Quotes keep the document id and page.
create table assessor_choices (
  case_id uuid not null references cases(id) on delete cascade,
  agency_id uuid not null references agencies(id),
  activity text not null,
  letter text,
  source text check (source in ('decision_letter', 'pa4', 'adviser')),
  decision_quote jsonb,
  pa4_quote jsonb,
  justification jsonb,
  departs jsonb,
  confirmed boolean not null default false,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now(),
  primary key (case_id, activity)
);
alter table assessor_choices enable row level security;
alter table assessor_choices force row level security;
create policy agency_isolation on assessor_choices
  using (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid)
  with check (agency_id = nullif(current_setting('app.agency_id', true), '')::uuid);

alter table extraction_runs add column kind text not null default 'evidence' check (kind in ('evidence', 'assessment'));
