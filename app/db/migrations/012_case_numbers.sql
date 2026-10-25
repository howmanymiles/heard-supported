-- Case references allocated by the system from one sequence for everyone, written as
-- AAA-12-1234: about 13.8 billion references, with no agency code or year to manage.
create sequence case_ref_seq start 1;
create unique index cases_ref_unique on cases (ref) where ref ~ '^[A-HJ-NP-Z]{3}-[0-9]{2}-[0-9]{4}$';

-- The agency's own reference, from its case management system. Optional, and not unique:
-- one client can have a PIP case and a UC case under the same reference.
alter table cases add column external_ref text;
create index cases_external_ref on cases (agency_id, external_ref);
