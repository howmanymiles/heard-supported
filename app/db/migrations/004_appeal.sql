-- Appeal to the First-tier Tribunal.
alter table documents drop constraint documents_kind_check;
alter table documents add constraint documents_kind_check
  check (kind in ('evidence', 'pa4', 'uc85', 'uc85a', 'decision', 'mr_notice', 'dwp_bundle', 'other'));

alter table cases
  add column mr_notice_date date,
  add column appeal_sent_date date,
  add column appeal_late_reason text,
  add column appeal_draft text,
  -- The decision maker's reasoning on each disputed item, as quoted from the response: {key: {docId, page, quote}}.
  add column response_reasoning jsonb;

alter table assessor_choices drop constraint assessor_choices_source_check;
alter table assessor_choices add constraint assessor_choices_source_check
  check (source in ('decision_letter', 'pa4', 'report', 'mr_notice', 'adviser'));
