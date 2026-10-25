-- Team casework: outcomes, closing cases.

alter table cases
  -- Reconsideration result.
  add column mr_outcome text check (mr_outcome in ('revised', 'revised_in_part', 'unchanged')),
  add column mr_outcome_date date,
  -- Appeal result.
  add column appeal_outcome text check (appeal_outcome in ('allowed', 'allowed_in_part', 'dismissed', 'lapsed_revised', 'withdrawn', 'struck_out')),
  add column appeal_outcome_date date,
  -- The award at the start and at the end, for reporting.
  -- PIP: {"daily_living": "none|standard|enhanced", "mobility": "none|standard|enhanced"}; WCA: {"wca": "none|lcw|lcwra"}.
  add column award_before jsonb,
  add column award_after jsonb,
  add column closed_at timestamptz,
  add column closed_reason text check (closed_reason in ('outcome', 'client_withdrew', 'no_contact', 'referred', 'other')),
  add column closed_note text;

create index cases_open on cases (agency_id) where closed_at is null;
