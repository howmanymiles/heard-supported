-- An agency is tied to the Microsoft organisation its first person signs in from, and
-- later invitations must be accepted from the same one. Several agencies can share an
-- organisation (bureaux in a network on one Microsoft 365, say), so it isn't unique.
alter table agencies drop constraint if exists agencies_entra_tenant_id_key;
create index if not exists agencies_tenant on agencies (entra_tenant_id);
