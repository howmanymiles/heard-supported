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

test('case numbers are allocated, unique across agencies, and the agency reference is kept', { skip }, async () => {
  const { formatRef, normaliseRefSearch, CAPACITY } = await import('../src/lib/refs.ts');
  assert.equal(formatRef(1), 'AAA-00-0001');
  assert.equal(formatRef(999_999), 'AAA-99-9999');
  assert.equal(formatRef(1_000_000), 'AAB-00-0000');
  assert.equal(formatRef(CAPACITY - 1), 'ZZZ-99-9999');
  for (const n of [8_000_000, 14_000_000, 336_000_000, 7_000_123_456]) assert.ok(!/[IO]/.test(formatRef(n)));   // no I or O, ever
  assert.equal(normaliseRefSearch('abc 12 1234'), 'ABC-12-1234');
  const yours = `CMS-${Date.now()}`;
  const a = await cases.createCase(me.a, yours, 'pip'), b = await cases.createCase(me.a, yours, 'uc-wca'), x = await cases.createCase(me.b, yours, 'pip');
  const rows = await Promise.all([[me.a, a], [me.a, b], [me.b, x]].map(async ([who, id]: any) => (await cases.getCase(who, id))!.case));
  assert.ok(rows.every(r => /^[A-HJ-NP-Z]{3}-\d{2}-\d{4}$/.test(r.ref) && r.external_ref === yours));   // the same agency reference twice is fine
  assert.equal(new Set(rows.map(r => r.ref)).size, 3);
  await assert.rejects(cases.createCase(me.a, "O'Neill, Mary", 'pip'), /Don’t use the client’s name/);
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
