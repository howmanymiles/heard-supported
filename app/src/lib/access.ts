// Access: agency sign-up and approval, invitations, sign-in, and removing access.
// Nobody gets in by belonging to a Microsoft tenant: every person needs an
// invitation from their agency, and the email they sign in with must match it.

import { createHash, randomBytes } from 'node:crypto';
import { pool, audit, asAgency } from './db.ts';
import type { Me } from './auth.ts';

export const TERMS_VERSION = 'draft-2026-10';
export const INVITE_DAYS = 7;
export const ROLES = { adviser: 'Adviser', supervisor: 'Supervisor', admin: 'Admin' } as const;
type Role = keyof typeof ROLES;

const asIn = (c: import('pg').PoolClient, agencyId: string) => c.query("select set_config('app.agency_id', $1, true)", [agencyId]);
const log = (agencyId: string, userId: string | null, action: string) => asAgency(agencyId, c => audit(c, agencyId, userId, null, action));
const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const normEmail = (e: string) => e.trim().toLowerCase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class AccessError extends Error {
  code: string;
  constructor(message: string, code = 'denied') { super(message); this.code = code; }
}

/** Shown on the sign-in problem page, by code, so the page never displays text from the address bar. */
export const SIGN_IN_PROBLEMS: Record<string, string> = {
  removed: 'Your access has been removed. Ask your agency’s admin if you think this is wrong.',
  agency_inactive: 'Your agency’s account is not active. Ask your agency’s admin.',
  no_invite: 'You need an invitation from your agency’s admin to use Heard & Supported. Open the link in your invitation, then sign in.',
  invalid: 'This invitation is not valid. Ask your agency’s admin for a new one.',
  used: 'This invitation has already been used. Ask your agency’s admin for a new one.',
  expired: 'This invitation has expired. Ask your agency’s admin for a new one.',
  agency_pending: 'Your agency’s account is not active yet.',
  wrong_account: 'You signed in with a different account from the one the invitation was sent to. Sign out of Microsoft, then open the invitation again and sign in with the invited account.',
  denied: 'You can’t sign in to Heard & Supported with this account.',
};
const deny = (code: keyof typeof SIGN_IN_PROBLEMS) => new AccessError(SIGN_IN_PROBLEMS[code], code);

// ---------- agency sign-up and approval ----------

export type SignUp = { name: string; registeredNumber: string; contactName: string; contactEmail: string; acceptTerms: boolean };

/** Public: an agency asks to join. Nothing works for it until we approve it. */
export async function signUpAgency(s: SignUp): Promise<string> {
  const name = s.name.trim().replace(/\s+/g, ' ').slice(0, 120), email = normEmail(s.contactEmail);
  if (name.length < 2) throw new AccessError('Enter your organisation’s name.');
  if (!s.contactName.trim()) throw new AccessError('Enter your name.');
  if (!EMAIL.test(email)) throw new AccessError('Enter your work email address.');
  if (!s.acceptTerms) throw new AccessError('Accept the data processing terms to sign up.');
  const r = await pool().query(`insert into agencies (name, status, registered_number, contact_name, contact_email, terms_version, terms_accepted_at)
    values ($1, 'pending', $2, $3, $4, $5, now()) returning id`, [name, s.registeredNumber.trim().slice(0, 40) || null, s.contactName.trim().slice(0, 120), email, TERMS_VERSION]);
  return r.rows[0].id;
}

/** Ours, not the agency's: after checking the organisation, approve it and invite its first admin. Returns the invitation link token. */
export async function approveAgency(agencyId: string, approvedBy: string): Promise<{ token: string; email: string }> {
  const c = await pool().connect();
  try {
    await c.query('begin');
    const a = (await c.query("update agencies set status = 'active', approved_at = now(), approved_by = $2 where id = $1 and status = 'pending' returning contact_email", [agencyId, approvedBy])).rows[0];
    if (!a) throw new AccessError('No agency waiting for approval with that id.');
    const token = await insertInvite(c, agencyId, a.contact_email, 'admin', null, null);
    await asIn(c, agencyId);
    await audit(c, agencyId, null, null, `Agency approved by ${approvedBy}; first admin invited`);
    await c.query('commit');
    return { token, email: a.contact_email };
  } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
}

export async function setAgencyStatus(agencyId: string, status: 'active' | 'suspended', by: string) {
  const r = await pool().query("update agencies set status = $2 where id = $1 and status <> 'pending'", [agencyId, status]);
  if (!r.rowCount) throw new AccessError('Agency not found, or not yet approved.');
  await log(agencyId, null, `Agency ${status === 'suspended' ? 'suspended' : 'reinstated'} by ${by}`);
}

// ---------- invitations ----------

async function insertInvite(c: import('pg').PoolClient, agencyId: string, email: string, role: Role, officeId: string | null, by: string | null) {
  const token = randomBytes(32).toString('base64url');
  await c.query('update invites set revoked_at = now() where agency_id = $1 and email = $2 and accepted_at is null and revoked_at is null', [agencyId, email]);
  await c.query(`insert into invites (agency_id, email, role, office_id, token_hash, expires_at, created_by) values ($1, $2, $3, $4, $5, now() + ($6 || ' days')::interval, $7)`,
    [agencyId, email, role, officeId, hash(token), String(INVITE_DAYS), by]);
  return token;
}

const canInvite = (me: Me, role: Role) => me.role === 'admin' || (me.role === 'supervisor' && role === 'adviser');

/** An admin invites anyone; a supervisor invites advisers. Returns the token for the link, which is shown once. */
export async function invite(me: Me, emailIn: string, role: string, officeId: string | null): Promise<string> {
  if (!(role in ROLES)) throw new AccessError('Choose a role.');
  if (!canInvite(me, role as Role)) throw new AccessError(me.role === 'supervisor' ? 'Supervisors can invite advisers. Ask an admin to invite a supervisor or admin.' : 'Only an admin or supervisor can invite people.');
  const email = normEmail(emailIn);
  if (!EMAIL.test(email)) throw new AccessError('Enter their work email address.');
  const c = await pool().connect();
  try {
    await c.query('begin');
    if ((await c.query('select 1 from users where agency_id = $1 and lower(email) = $2 and active', [me.agencyId, email])).rowCount) throw new AccessError('That person already has access.');
    await asIn(c, me.agencyId);
    if (officeId) {
      if (!(await c.query('select 1 from offices where id = $1', [officeId])).rowCount) throw new AccessError('Office not found.');
    }
    const token = await insertInvite(c, me.agencyId, email, role as Role, officeId, me.userId);
    await audit(c, me.agencyId, me.userId, null, `Invited ${email} as ${ROLES[role as Role].toLowerCase()}`);
    await c.query('commit');
    return token;
  } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
}

export async function revokeInvite(me: Me, inviteId: string) {
  if (me.role !== 'admin' && me.role !== 'supervisor') throw new AccessError('Only an admin or supervisor can cancel invitations.');
  const r = await pool().query('update invites set revoked_at = now() where id = $1 and agency_id = $2 and accepted_at is null and revoked_at is null', [inviteId, me.agencyId]);
  if (!r.rowCount) throw new AccessError('Invitation not found, or already used or cancelled.');
  await log(me.agencyId, me.userId, 'Invitation cancelled');
}

export async function listInvites(me: Me) {
  return (await pool().query(`select i.id, i.email, i.role, o.name as office, i.created_at, i.expires_at, i.accepted_at, i.revoked_at, (i.expires_at < now()) as expired
    from invites i left join offices o on o.id = i.office_id where i.agency_id = $1 and i.accepted_at is null and i.revoked_at is null order by i.created_at desc`, [me.agencyId])).rows;
}

/** What an invitation link shows before sign-in: the agency and the email it is for, nothing else. */
export async function peekInvite(token: string) {
  const r = (await pool().query(`select i.email, i.role, i.expires_at < now() as expired, i.accepted_at is not null as used, i.revoked_at is not null as revoked, a.name as agency, a.status
    from invites i join agencies a on a.id = i.agency_id where i.token_hash = $1`, [hash(token)])).rows[0];
  return r ?? null;
}

// ---------- sign-in ----------

export type Identity = { oid: string; tid: string; name: string; email: string };

/**
 * Who this person is in the app, or why they can't come in. An existing user must be
 * active, in an active agency. Anyone else needs a live invitation whose email matches
 * the account they signed in with.
 */
export async function resolveSignIn(id: Identity, inviteToken: string | null): Promise<{ userId: string; agencyId: string; role: Role }> {
  const c = await pool().connect();
  try {
    await c.query('begin');
    const u = (await c.query('select u.id, u.agency_id, u.role, u.active, a.status from users u join agencies a on a.id = u.agency_id where u.entra_oid = $1', [id.oid])).rows[0];
    if (u) {
      if (!u.active) throw deny('removed');
      if (u.status !== 'active') throw deny('agency_inactive');
      await c.query('update users set last_sign_in_at = now(), name = coalesce(nullif($2, \'\'), name) where id = $1', [u.id, id.name]);
      await c.query('commit');
      return { userId: u.id, agencyId: u.agency_id, role: u.role };
    }
    if (!inviteToken) {
      // A brand-new installation only: the named first admin sets up the first agency.
      const first = process.env.BOOTSTRAP_ADMIN_EMAIL;
      if (first && normEmail(id.email) === normEmail(first) && !(await c.query('select 1 from users limit 1')).rowCount) {
        const ag = (await c.query("insert into agencies (name, status, contact_email, approved_at, approved_by) values ('Development agency', 'active', $1, now(), 'first sign-in') returning id", [normEmail(first)])).rows[0].id;
        const nu = (await c.query("insert into users (agency_id, entra_oid, entra_tenant_id, name, email, role, last_sign_in_at) values ($1, $2, $3, $4, $5, 'admin', now()) returning id", [ag, id.oid, id.tid, id.name || null, normEmail(first)])).rows[0].id;
        await asIn(c, ag);
        await audit(c, ag, nu, null, 'First admin set up the installation');
        await c.query('commit');
        return { userId: nu, agencyId: ag, role: 'admin' };
      }
      throw deny('no_invite');
    }
    const inv = (await c.query(`select i.*, a.status from invites i join agencies a on a.id = i.agency_id where i.token_hash = $1 for update of i`, [hash(inviteToken)])).rows[0];
    if (!inv || inv.revoked_at) throw deny('invalid');
    if (inv.accepted_at) throw deny('used');
    if (new Date(inv.expires_at) < new Date()) throw deny('expired');
    if (inv.status !== 'active') throw deny('agency_pending');
    if (normEmail(id.email) !== inv.email) throw deny('wrong_account');
    const nu = (await c.query(`insert into users (agency_id, entra_oid, entra_tenant_id, name, email, role, office_id, last_sign_in_at) values ($1, $2, $3, $4, $5, $6, $7, now()) returning id`,
      [inv.agency_id, id.oid, id.tid, id.name || null, inv.email, inv.role, inv.office_id])).rows[0].id;
    await c.query('update invites set accepted_at = now(), accepted_user_id = $2 where id = $1', [inv.id, nu]);
    await asIn(c, inv.agency_id);
    await audit(c, inv.agency_id, nu, null, `Invitation accepted: ${inv.email} joined as ${ROLES[inv.role as Role].toLowerCase()}`);
    await c.query('commit');
    return { userId: nu, agencyId: inv.agency_id, role: inv.role };
  } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
}

/** On every request: the person's current role and agency, so removing access or changing a role takes effect at once. */
export async function currentUser(userId: string) {
  return (await pool().query(`select u.id, u.agency_id, u.role, u.name from users u join agencies a on a.id = u.agency_id where u.id = $1 and u.active and a.status = 'active'`, [userId])).rows[0] ?? null;
}

// ---------- people ----------

async function admins(agencyId: string, except: string) {
  return (await pool().query("select count(*)::int n from users where agency_id = $1 and role = 'admin' and active and id <> $2", [agencyId, except])).rows[0].n as number;
}

export async function setRole(me: Me, userId: string, role: string) {
  if (me.role !== 'admin') throw new AccessError('Only an admin can change roles.');
  if (!(role in ROLES)) throw new AccessError('Choose a role.');
  const u = (await pool().query('select role from users where id = $1 and agency_id = $2', [userId, me.agencyId])).rows[0];
  if (!u) throw new AccessError('That person is not in your agency.');
  if (u.role === 'admin' && role !== 'admin' && !(await admins(me.agencyId, userId))) throw new AccessError('Your agency needs at least one admin. Make someone else an admin first.');
  await pool().query('update users set role = $2 where id = $1', [userId, role]);
  await log(me.agencyId, me.userId, `Role changed to ${ROLES[role as Role].toLowerCase()}`);
}

/** Removes access at once. Their cases stay, and still need someone: the Team page lists them. */
export async function deactivate(me: Me, userId: string) {
  if (me.role !== 'admin') throw new AccessError('Only an admin can remove access.');
  if (userId === me.userId) throw new AccessError('You can’t remove your own access. Ask another admin.');
  const u = (await pool().query('select role from users where id = $1 and agency_id = $2 and active', [userId, me.agencyId])).rows[0];
  if (!u) throw new AccessError('That person is not in your agency, or already has no access.');
  if (u.role === 'admin' && !(await admins(me.agencyId, userId))) throw new AccessError('Your agency needs at least one admin.');
  await pool().query('update users set active = false, deactivated_at = now(), deactivated_by = $2 where id = $1', [userId, me.userId]);
  await log(me.agencyId, me.userId, 'Access removed');
}

export async function reactivate(me: Me, userId: string) {
  if (me.role !== 'admin') throw new AccessError('Only an admin can restore access.');
  const r = await pool().query('update users set active = true, deactivated_at = null, deactivated_by = null where id = $1 and agency_id = $2 and not active', [userId, me.agencyId]);
  if (!r.rowCount) throw new AccessError('That person is not in your agency, or already has access.');
  await log(me.agencyId, me.userId, 'Access restored');
}

export async function listPeople(me: Me) {
  // In the agency's scope: the open-case counts come from cases, which row-level security guards.
  return asAgency(me.agencyId, async c => (await c.query(`select u.id, u.name, u.email, u.role, u.office_id, u.active, u.last_sign_in_at,
      (select count(*)::int from cases x where x.adviser_id = u.id and x.closed_at is null) as open_cases
    from users u where u.agency_id = $1 order by u.active desc, u.name`, [me.agencyId])).rows);
}
