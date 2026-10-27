// The adviser's own figures on the Cases page.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL not set';
let db: typeof import('../src/lib/db.ts');
let cases: typeof import('../src/lib/cases.ts');
let mywork: typeof import('../src/lib/mywork.ts');
let me: any, colleague: any;

before(async () => {
  if (!url) return;
  process.env.DATABASE_URL = url;
  db = await import('../src/lib/db.ts'); cases = await import('../src/lib/cases.ts'); mywork = await import('../src/lib/mywork.ts');
  const { migrate } = await import('../src/lib/migrate.ts');
  process.chdir(new URL('..', import.meta.url).pathname);
  await migrate();
  const ag = (await db.pool().query("insert into agencies (name) values ('Work agency') returning id")).rows[0].id;
  for (const k of ['me', 'colleague']) {
    const u = (await db.pool().query("insert into users (agency_id, entra_oid, name, role) values ($1, $2, $3, 'adviser') returning id", [ag, `mw-${k}-${Date.now()}`, k])).rows[0].id;
    const who = { agencyId: ag, userId: u, role: 'adviser', name: k };
    if (k === 'me') me = who; else colleague = who;
  }
});
after(async () => { if (url) await db.pool().end(); });

test('counts only my own open cases and my own claim checks this month', { skip }, async () => {
  await cases.createCase(me, null, 'pip', null);
  await cases.createCase(me, null, 'uc-wca', null);
  await cases.createCase(colleague, null, 'pip', null);
  await db.asAgency(me.agencyId, c => c.query("insert into extraction_runs (agency_id, case_id, model, dataset_version, verified, rejected, identifiers_removed, created_by) select agency_id, id, 'm', 'v', 0, 0, 0, adviser_id from cases where agency_id = $1", [me.agencyId]));
  const w = await mywork.myWork(me, new Date().toISOString().slice(0, 10));
  assert.equal(w.open, 2);
  assert.equal(w.checksThisMonth, 2);
  assert.equal(w.results.decided, 0);
  assert.equal(w.late + w.dueSoon, 0);
});
