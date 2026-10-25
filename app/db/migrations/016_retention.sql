-- How long each agency keeps a closed case's content, and the record of content removed.
-- When the period ends, the case's documents, notes, drafts and letters are deleted and the
-- case is cut loose from the client. What remains (benefit, stages, dates, outcome, awards,
-- office) identifies nobody and keeps the agency's outcome reports correct.
alter table agencies add column retention_months int not null default 24 check (retention_months between 1 and 84);
alter table cases add column anonymised_at timestamptz;
alter table cases add column anonymised_reason text check (anonymised_reason in ('retention', 'erasure'));
create index cases_retention on cases (agency_id, closed_at) where anonymised_at is null and closed_at is not null;
