-- Who gets in. An agency signs up, we check and approve it, and its first admin is
-- invited. After that, advisers get in only by an invitation from their own agency's
-- admin or supervisor, and access can be removed at once.

alter table agencies add column status text not null default 'active' check (status in ('pending', 'active', 'suspended'));
alter table agencies add column registered_number text;      -- charity or company number
alter table agencies add column contact_name text;
alter table agencies add column contact_email text;
alter table agencies add column terms_version text;          -- the data processing terms accepted at sign-up
alter table agencies add column terms_accepted_at timestamptz;
alter table agencies add column approved_at timestamptz;
alter table agencies add column approved_by text;

alter table users add column active boolean not null default true;
alter table users add column deactivated_at timestamptz;
alter table users add column deactivated_by uuid references users(id);
alter table users add column entra_tenant_id text;
alter table users add column last_sign_in_at timestamptz;

-- Looked up by token before anyone is signed in, so, like users, it is filtered by
-- agency in code rather than by row-level security. Only a hash of the token is kept.
create table invites (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id),
  email text not null,
  role text not null check (role in ('adviser', 'supervisor', 'admin')),
  office_id uuid references offices(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_user_id uuid references users(id),
  revoked_at timestamptz
);
create index invites_agency on invites (agency_id, created_at desc);
