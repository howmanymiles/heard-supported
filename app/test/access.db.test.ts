// Who gets in: agency sign-up and approval, invitations, sign-in, removing access.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL not set';
let db: typeof import('../src/lib/db.ts');
let ac: typeof import('../src/lib/access.ts');
let of: typeof import('../src/lib/offices.ts');
const T = Date.now().toString(36);
const who = (n: string, email: string, tid = 'tenant-a') => ({ oid: `oid-${n}-${T}`, tid, name: n, email });
const code = (re: string) => (e: unknown) => e instanceof ac.AccessError && e.code === re;

before(async () => {
  if (!url) return;
  process.env.DATABASE_URL = url;
  db = await import('../src/lib/db.ts'); ac = await import('../src/lib/access.ts'); of = await import('../src/lib/offices.ts');
  const { migrate } = await import('../src/lib/migrate.ts');
  process.chdir(new URL('..', import.meta.url).pathname);
  await migrate();
});
after(async () => { if (url) await db.pool().end(); });

test('an agency signs up, is approved, and its first admin gets in only with the invitation and the right account', { skip }, async () => {
  await assert.rejects(ac.signUpAgency({ name: 'Govan Advice', registeredNumber: '', contactName: 'Ann', contactEmail: `ann-${T}@govan.example`, acceptTerms: false }), /data processing terms/);
  const id = await ac.signUpAgency({ name: 'Govan Advice', registeredNumber: 'SC000000', contactName: 'Ann', contactEmail: `Ann-${T}@Govan.example`, acceptTerms: true });
  assert.equal((await db.pool().query('select status, terms_version from agencies where id = $1', [id])).rows[0].status, 'pending');

  const ann = who('Ann', `ann-${T}@govan.example`);
  await assert.rejects(ac.resolveSignIn(ann, null), code('no_invite'));             // belonging to a tenant is not enough
  const { token, email } = await ac.approveAgency(id, 'Stephen');
  assert.equal(email, `ann-${T}@govan.example`);
  await assert.rejects(ac.approveAgency(id, 'Stephen'), /No agency waiting/);
  assert.equal((await db.pool().query('select count(*)::int n from invites where token_hash = $1', [token])).rows[0].n, 0);   // only a hash is kept
  assert.equal((await ac.peekInvite(token))!.agency, 'Govan Advice');

  await assert.rejects(ac.resolveSignIn(who('Mallory', `mallory-${T}@elsewhere.example`), token), code('wrong_account'));
  const me = await ac.resolveSignIn({ ...ann, email: 'ann_govan.example#EXT#@x.onmicrosoft.com', emails: [ann.email.toUpperCase()] }, token);   // any reported address, any case
  assert.equal(me.role, 'admin');
  await assert.rejects(ac.resolveSignIn(who('Mallory', ann.email), token), code('used'));  // single use, even with the right email
  assert.deepEqual(await ac.resolveSignIn(ann, null), me);                          // later sign-ins need no invitation
});

test('admins and supervisors invite; roles, removal and the last admin are guarded', { skip }, async () => {
  const id = await ac.signUpAgency({ name: 'Paisley Rights', registeredNumber: '', contactName: 'Bo', contactEmail: `bo-${T}@p.example`, acceptTerms: true });
  const { token } = await ac.approveAgency(id, 'Stephen');
  const r = await ac.resolveSignIn(who('Bo', `bo-${T}@p.example`), token);
  const bo = { ...r, name: 'Bo' } as any;
  const office = await of.addOffice(bo, 'Paisley');

  const t1 = await ac.invite(bo, `sue-${T}@p.example`, 'supervisor', office);
  const sue = { ...(await ac.resolveSignIn(who('Sue', `sue-${T}@p.example`), t1)), name: 'Sue' } as any;
  assert.equal(sue.role, 'supervisor');
  assert.equal((await db.pool().query('select office_id from users where id = $1', [sue.userId])).rows[0].office_id, office);
  await assert.rejects(ac.invite(sue, `x-${T}@p.example`, 'admin', null), /Supervisors can invite advisers/);
  const t2 = await ac.invite(sue, `al-${T}@p.example`, 'adviser', null);
  const al = { ...(await ac.resolveSignIn(who('Al', `al-${T}@p.example`), t2)), name: 'Al' } as any;
  await assert.rejects(ac.invite(al, `y-${T}@p.example`, 'adviser', null), /Only an admin or supervisor/);
  await assert.rejects(ac.invite(bo, `al-${T}@p.example`, 'adviser', null), /already has access/);

  // A second invitation replaces the first; expired and cancelled ones don't work.
  const old = await ac.invite(bo, `cy-${T}@p.example`, 'adviser', null);
  const fresh = await ac.invite(bo, `cy-${T}@p.example`, 'adviser', null);
  await assert.rejects(ac.resolveSignIn(who('Cy', `cy-${T}@p.example`), old), code('invalid'));
  await db.pool().query("update invites set expires_at = now() - interval '1 minute' where agency_id = $1 and email = $2 and accepted_at is null and revoked_at is null", [id, `cy-${T}@p.example`]);
  await assert.rejects(ac.resolveSignIn(who('Cy', `cy-${T}@p.example`), fresh), code('expired'));
  const t3 = await ac.invite(bo, `di-${T}@p.example`, 'adviser', null);
  const inv = (await ac.listInvites(bo)).find(i => i.email === `di-${T}@p.example`)!;
  await ac.revokeInvite(bo, inv.id);
  await assert.rejects(ac.resolveSignIn(who('Di', `di-${T}@p.example`), t3), code('invalid'));

  // Roles and removal.
  await assert.rejects(ac.setRole(sue, al.userId, 'admin'), /Only an admin/);
  await assert.rejects(ac.setRole(bo, bo.userId, 'adviser'), /at least one admin/);
  await ac.setRole(bo, al.userId, 'supervisor');
  assert.equal((await ac.currentUser(al.userId)).role, 'supervisor');             // takes effect on the next request
  await assert.rejects(ac.deactivate(bo, bo.userId), /your own access/);
  const { createCase } = await import('../src/lib/cases.ts');
  await createCase(al, `AC-${T}`, 'pip');
  await ac.deactivate(bo, al.userId);
  assert.equal((await ac.listPeople(bo)).find(p => p.id === al.userId)!.open_cases, 1);   // their open case still needs someone
  assert.equal(await ac.currentUser(al.userId), null);
  await assert.rejects(ac.resolveSignIn(who('Al', `al-${T}@p.example`), null), code('removed'));
  await ac.reactivate(bo, al.userId);
  assert.ok(await ac.currentUser(al.userId));

  // Another agency's admin can't touch these people.
  const other = await ac.signUpAgency({ name: 'Other', registeredNumber: '', contactName: 'Zed', contactEmail: `zed-${T}@o.example`, acceptTerms: true });
  const zt = (await ac.approveAgency(other, 'Stephen')).token;
  const zed = { ...(await ac.resolveSignIn(who('Zed', `zed-${T}@o.example`), zt)), name: 'Zed' } as any;
  await assert.rejects(ac.deactivate(zed, al.userId), /not in your agency/);
  await assert.rejects(ac.setRole(zed, al.userId, 'adviser'), /not in your agency/);
  await assert.rejects(ac.revokeInvite(zed, inv.id), /not found/);
  assert.ok(!(await ac.listPeople(zed)).some(p => p.id === al.userId));

  // Suspending the agency stops everyone at once.
  await ac.setAgencyStatus(id, 'suspended', 'Stephen');
  assert.equal(await ac.currentUser(bo.userId), null);
  await assert.rejects(ac.resolveSignIn(who('Bo', `bo-${T}@p.example`), null), code('agency_inactive'));
  await ac.setAgencyStatus(id, 'active', 'Stephen');
});

test('the first admin of a brand-new installation needs no invitation; nobody else does', { skip }, async () => {
  const { rowCount } = await db.pool().query('select 1 from users limit 1');
  process.env.BOOTSTRAP_ADMIN_EMAIL = `first-${T}@example.org`;
  try {
    if (rowCount) await assert.rejects(ac.resolveSignIn(who('First', `first-${T}@example.org`), null), code('no_invite'));   // already set up: no back door
    await assert.rejects(ac.resolveSignIn(who('Else', `else-${T}@example.org`), null), code('no_invite'));
  } finally { delete process.env.BOOTSTRAP_ADMIN_EMAIL; }
});

test('an agency is tied to its Microsoft organisation: an account elsewhere claiming the invited email is refused', { skip }, async () => {
  const id = await ac.signUpAgency({ name: 'Leith Advice', registeredNumber: '', contactName: 'Cy', contactEmail: `cy-${T}@leith.example`, acceptTerms: true });
  const { token } = await ac.approveAgency(id, 'Stephen');
  const cy = { ...(await ac.resolveSignIn(who('Cy', `cy-${T}@leith.example`, 'tenant-leith'), token)), name: 'Cy' } as any;
  assert.equal((await db.pool().query('select entra_tenant_id from agencies where id = $1', [id])).rows[0].entra_tenant_id, 'tenant-leith');
  const t2 = await ac.invite(cy, `dee-${T}@leith.example`, 'adviser', null);
  // Someone with the link sets up their own organisation with an account reporting Dee's address.
  await assert.rejects(ac.resolveSignIn(who('Fake', `dee-${T}@leith.example`, 'tenant-attacker'), t2), code('wrong_tenant'));
  const dee = await ac.resolveSignIn(who('Dee', `dee-${T}@leith.example`, 'tenant-leith'), t2);
  assert.equal(dee.role, 'adviser');
  // The same object id in another organisation is a different account.
  await assert.rejects(ac.resolveSignIn({ ...who('Dee', `dee-${T}@leith.example`, 'tenant-other') }, null), code('no_invite'));
});
