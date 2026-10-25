// The audit record: append-only, chained so tampering shows, and recording who opened
// a client's information.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL not set';
let db: typeof import('../src/lib/db.ts');
let cl: typeof import('../src/lib/claimants.ts');
let cases: typeof import('../src/lib/cases.ts');
let log: typeof import('../src/lib/auditlog.ts');
let admin: any, adviser: any;
const consent = { method: 'in_person', givenOn: '2026-10-20', storeData: true, aiProcessing: false, actOnBehalf: true, confirmed: true };

before(async () => {
  if (!url) return;
  process.env.DATABASE_URL = url;
  db = await import('../src/lib/db.ts'); cl = await import('../src/lib/claimants.ts'); cases = await import('../src/lib/cases.ts'); log = await import('../src/lib/auditlog.ts');
  const { migrate } = await import('../src/lib/migrate.ts');
  process.chdir(new URL('..', import.meta.url).pathname);
  await migrate();
  const ag = (await db.pool().query("insert into agencies (name) values ('Audit agency') returning id")).rows[0].id;
  const mk = async (role: string) => ({ agencyId: ag, role, name: role, userId: (await db.pool().query("insert into users (agency_id, entra_oid, name, role) values ($1, $2, $3, $3) returning id", [ag, `au-${role}-${Date.now()}`, role])).rows[0].id });
  admin = await mk('admin'); adviser = await mk('adviser');
});
after(async () => { if (url) await db.pool().end(); });

test('views of a client record, case and document are recorded, once per 10 minutes', { skip }, async () => {
  const k = await cl.createClaimant(adviser, { name: 'Morgan Example' }, consent, '2026-10-25');
  const caseId = await cases.createCase(adviser, null, 'pip', k);
  await cl.getClaimant(adviser, k); await cl.getClaimant(adviser, k);
  await cases.getCase(adviser, caseId);
  const h = await log.clientHistory(admin, k);
  const actions = h.map(e => `${e.kind}:${e.action}`);
  assert.equal(actions.filter(a => a === 'access:Opened the client record').length, 1);
  assert.ok(actions.includes('access:Opened the case'));
  assert.ok(actions.includes('change:Client record created'));
  assert.ok(h.every(e => e.who), 'every entry says who');
  // The case's own history shows changes only.
  const c = await cases.getCase(adviser, caseId);
  assert.ok(c!.log.every((e: any) => !/^Opened/.test(e.action)));
  await assert.rejects(log.clientHistory(adviser, k), /Only admins and supervisors/);
});

test('the audit record cannot be changed or deleted by the app', { skip }, async () => {
  await assert.rejects(db.asAgency(admin.agencyId, c => c.query("update audit set action = 'nothing happened' where agency_id = $1", [admin.agencyId])), /cannot be changed/);
  await assert.rejects(db.asAgency(admin.agencyId, c => c.query('delete from audit where agency_id = $1', [admin.agencyId])), /cannot be changed/);
});

test('the chain is intact, and shows tampering by someone who gets round the guards', { skip }, async () => {
  const ok = await log.checkAudit(admin);
  assert.equal(ok.intact, true); assert.ok(ok.checked >= 3); assert.match(ok.lastHash!, /^[0-9a-f]{64}$/);
  await assert.rejects(log.checkAudit(adviser), /Only admins/);
  // Simulate an attacker with control of the table: switch the guard off, edit an entry, check, then undo.
  const c = await db.pool().connect();
  try {
    await c.query('begin');
    await c.query("select set_config('app.agency_id', $1, true)", [admin.agencyId]);
    await c.query('alter table audit disable trigger audit_no_update');
    const first = (await c.query('select id from audit where agency_id = $1 order by id limit 1', [admin.agencyId])).rows[0].id;
    await c.query("update audit set action = 'Something else' where id = $1", [first]);
    const r = (await c.query('select bad_id, problem from verify_audit($1)', [admin.agencyId])).rows[0];
    assert.equal(Number(r.bad_id), Number(first)); assert.match(r.problem, /changed/);
    // Removing an entry breaks the link from the next one.
    await c.query("update audit set action = (select action from audit where id = $1) where id = $1", [first]);
    await c.query('delete from audit where id = $1', [first]);
    const r2 = (await c.query('select bad_id, problem from verify_audit($1)', [admin.agencyId])).rows[0];
    assert.ok(r2.bad_id !== null); assert.match(r2.problem, /missing|changed/);
  } finally { await c.query('rollback'); c.release(); }
  assert.equal((await log.checkAudit(admin)).intact, true);
});
