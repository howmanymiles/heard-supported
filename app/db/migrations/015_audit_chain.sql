-- A tamper-evident audit record.
--
-- 1. Append-only: rows cannot be changed or deleted through the app's connection.
-- 2. Each agency's entries form a chain: every row carries a hash of its own content and
--    the previous row's hash, so changing or removing any earlier row breaks every hash
--    after it. verify_audit() recomputes the chain.
-- 3. Views of client records and documents are recorded too (kind = 'access'), so an
--    agency can answer "who looked at this person's information".
--
-- Someone with full control of the database (the table's owner or a superuser) could
-- still rewrite the whole chain. Copying each day's last hash somewhere they cannot
-- change (immutable blob storage) closes that; see SECURITY.md.

-- Cases may later be deleted under retention rules; the audit keeps the reference.
alter table audit drop constraint if exists audit_case_id_fkey;
alter table audit add column kind text not null default 'change' check (kind in ('change', 'access'));
alter table audit add column claimant_id uuid;
alter table audit add column prev_hash text;
alter table audit add column hash text;

create index audit_agency_chain on audit (agency_id, id desc);
create index audit_claimant on audit (claimant_id, at desc) where claimant_id is not null;

create or replace function audit_row_text(a audit) returns text language sql immutable as $$
  select concat_ws('|', a.id::text, a.agency_id::text, coalesce(a.case_id::text, ''), coalesce(a.user_id::text, ''),
    coalesce(a.claimant_id::text, ''), a.kind, a.action, to_char(a.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), coalesce(a.prev_hash, ''))
$$;

-- Existing rows are chained in order now, before the guards go on. Row-level security is
-- lifted for this step only, so every agency's rows are seen.
alter table audit no force row level security;
alter table audit disable row level security;
do $$
declare r audit; prev text; last_agency uuid;
begin
  for r in select * from audit order by agency_id, id loop
    if last_agency is distinct from r.agency_id then prev := null; last_agency := r.agency_id; end if;
    r.prev_hash := prev;
    r.hash := encode(sha256(convert_to(audit_row_text(r), 'UTF8')), 'hex');
    update audit set prev_hash = r.prev_hash, hash = r.hash where id = r.id;
    prev := r.hash;
  end loop;
end $$;
alter table audit enable row level security;
alter table audit force row level security;

create or replace function audit_chain() returns trigger language plpgsql as $$
begin
  -- One writer at a time per agency, so the chain has no forks.
  perform pg_advisory_xact_lock(hashtext('audit:' || new.agency_id::text));
  new.at := clock_timestamp();
  select hash into new.prev_hash from audit where agency_id = new.agency_id order by id desc limit 1;
  new.hash := encode(sha256(convert_to(audit_row_text(new), 'UTF8')), 'hex');
  return new;
end $$;

create or replace function audit_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'The audit record cannot be changed or deleted.' using errcode = 'insufficient_privilege';
end $$;

create trigger audit_chain before insert on audit for each row execute function audit_chain();
create trigger audit_no_update before update or delete on audit for each row execute function audit_append_only();
create trigger audit_no_truncate before truncate on audit for each statement execute function audit_append_only();

-- Recompute one agency's chain. Returns the first row that does not match, or nothing if intact.
create or replace function verify_audit(agency uuid) returns table (bad_id bigint, problem text, checked bigint) language sql stable as $$
  with r as (
    select a.*, lag(a.hash) over (order by a.id) as expected_prev,
      encode(sha256(convert_to(audit_row_text(a), 'UTF8')), 'hex') as recomputed
    from audit a where a.agency_id = agency
  ), bad as (
    select id, case when hash is distinct from recomputed then 'This entry has been changed.'
                    else 'An entry before this one is missing or has been changed.' end as problem
    from r where hash is distinct from recomputed or prev_hash is distinct from expected_prev
    order by id limit 1
  )
  select bad.id, bad.problem, (select count(*) from r) from bad
  union all
  select null, null, (select count(*) from r) where not exists (select 1 from bad)
$$;
