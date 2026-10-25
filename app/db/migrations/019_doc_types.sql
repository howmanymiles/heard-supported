-- What a document is, in the adviser's terms (a form number or everyday name from
-- src/lib/doctypes.ts), alongside the kind the platform's logic uses.
alter table documents add column doc_type text;
