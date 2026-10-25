-- WCA reconsideration: UC85 / UC85A reports, and the award stated in the notice.
alter table documents drop constraint documents_kind_check;
alter table documents add constraint documents_kind_check check (kind in ('evidence', 'pa4', 'uc85', 'uc85a', 'decision', 'other'));

-- The quote from the assessment report (PA4, UC85 or UC85A).
alter table assessor_choices rename column pa4_quote to report_quote;

-- For UC the notice states only the award.
alter table cases
  add column decision_outcome text check (decision_outcome in ('none', 'lcw', 'lcwra')),
  add column decision_outcome_quote jsonb;

alter table assessor_choices drop constraint assessor_choices_source_check;
alter table assessor_choices add constraint assessor_choices_source_check check (source in ('decision_letter', 'pa4', 'report', 'adviser'));
