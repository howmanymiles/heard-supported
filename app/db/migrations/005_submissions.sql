-- The agency's own interview notes are evidence, written in the adviser's voice in letters.
alter table documents drop constraint documents_kind_check;
alter table documents add constraint documents_kind_check
  check (kind in ('evidence', 'notes', 'pa4', 'uc85', 'uc85a', 'decision', 'mr_notice', 'dwp_bundle', 'other'));

alter table extraction_runs drop constraint extraction_runs_kind_check;
alter table extraction_runs add constraint extraction_runs_kind_check check (kind in ('evidence', 'assessment', 'submission'));

-- What the last AI-drafted letter needs the adviser to check: argument sentences
-- and anything dropped by the checks. {stage, kept, argument: [text], dropped: [{key, text, reason}]}
alter table cases add column submission_review jsonb;
