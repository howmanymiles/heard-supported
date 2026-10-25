// Database tests: migrations, and that row-level security keeps agencies apart.
// Runs only when TEST_DATABASE_URL points at a disposable database, connected
// as a non-superuser (superusers bypass row-level security).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL not set';

let db: typeof import('../src/lib/db.ts');
let cases: typeof import('../src/lib/cases.ts');
const me = { a: null as any, b: null as any };

before(async () => {
  if (!url) return;
  process.env.DATABASE_URL = url;
  db = await import('../src/lib/db.ts');
  const { migrate } = await import('../src/lib/migrate.ts');
  cases = await import('../src/lib/cases.ts');
  process.chdir(new URL('..', import.meta.url).pathname);
  await migrate();
  await migrate(); // second run is a no-op
  for (const k of ['a', 'b'] as const) {
    const ag = (await db.pool().query("insert into agencies (name) values ($1) returning id", [`Agency ${k}`])).rows[0].id;
    const u = (await db.pool().query("insert into users (agency_id, entra_oid, name, role) values ($1, $2, $3, 'adviser') returning id", [ag, `oid-${k}-${Date.now()}`, `Adviser ${k}`])).rows[0].id;
    me[k] = { agencyId: ag, userId: u, role: 'adviser', name: `Adviser ${k}` };
  }
});

after(async () => { if (url) await db.pool().end(); });

test('each agency sees only its own cases', { skip }, async () => {
  const id = await cases.createCase(me.a, `RLS-${Date.now()}`, 'pip');
  assert.ok((await cases.listCases(me.a)).some(c => c.id === id));
  assert.ok(!(await cases.listCases(me.b)).some(c => c.id === id));
  assert.equal(await cases.getCase(me.b, id), null);
});

test('with no agency set, case tables return nothing', { skip }, async () => {
  const r = await db.pool().query('select count(*)::int as n from cases');
  assert.equal(r.rows[0].n, 0);
});

test("an agency cannot write a row into another agency's data", { skip }, async () => {
  await assert.rejects(db.asAgency(me.a.agencyId, c =>
    c.query("insert into cases (agency_id, ref, benefit, dataset_version) values ($1, 'X-1', 'pip', 'v')", [me.b.agencyId])), /row-level security/);
});

test('case references that look like names are refused', { skip }, async () => {
  await assert.rejects(cases.createCase(me.a, "O'Neill, Mary", 'pip'));
});

test('a reference already in use says where, and another agency can use the same one', { skip }, async () => {
  const ref = `DUP-${Date.now()}`;
  await cases.createCase(me.a, ref, 'pip');
  await assert.rejects(cases.createCase(me.a, ref, 'uc-wca'), new RegExp(`already has a case ${ref}.*different reference`));
  await cases.createCase(me.b, ref, 'pip');
});

test('decisions store days as a share of the week, for the engine', { skip }, async () => {
  const id = await cases.createCase(me.a, `DEC-${Date.now()}`, 'pip');
  await cases.saveDecision(me.a, id, 'pip', 'pip:12', 'd', 4);
  const c = await cases.getCase(me.a, id);
  const d = c!.decisions.find((x: any) => x.activity === 'pip:12');
  assert.deepEqual(d.satisfied, [{ letter: 'd', daysPercent: 57 }]);
  await assert.rejects(cases.saveDecision(me.a, id, 'pip', 'pip:12', 'd', 9), /between 0 and 7/);
});

test('dates come back exactly as stored, whatever the machine time zone', { skip }, async () => {
  const id = await cases.createCase(me.a, `TZ-${Date.now()}`, 'pip');
  await db.asAgency(me.a.agencyId, c => c.query("update cases set decision_date = '2026-09-09' where id = $1", [id]));
  const c = await cases.getCase(me.a, id);
  assert.equal(c!.case.decision_date, '2026-09-09');
});
