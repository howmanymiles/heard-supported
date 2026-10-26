// The claimant's claim, read off the form by the adviser and saved in one go.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL not set';
let db: typeof import('../src/lib/db.ts');
let cases: typeof import('../src/lib/cases.ts');
let me: any, other: any;

before(async () => {
  if (!url) return;
  process.env.DATABASE_URL = url;
  db = await import('../src/lib/db.ts'); cases = await import('../src/lib/cases.ts');
  const { migrate } = await import('../src/lib/migrate.ts');
  process.chdir(new URL('..', import.meta.url).pathname);
  await migrate();
  for (const k of ['me', 'other']) {
    const ag = (await db.pool().query("insert into agencies (name) values ('Claim agency') returning id")).rows[0].id;
    const u = (await db.pool().query("insert into users (agency_id, entra_oid, name, role) values ($1, $2, 'A', 'adviser') returning id", [ag, `cl-${k}-${Date.now()}`])).rows[0].id;
    const who = { agencyId: ag, userId: u, role: 'adviser', name: 'A' };
    if (k === 'me') me = who; else other = who;
  }
});
after(async () => { if (url) await db.pool().end(); });

test('all activities are saved together, replacing what was there, in one audit entry', { skip }, async () => {
  const id = await cases.createCase(me, null, 'pip', null);
  assert.equal(await cases.saveClaimed(me, id, 'pip', { 'pip:1': 'e', 'pip:4': 'd', 'pip:11': 'f', 'pip:2': '' }), 3);
  let c = await cases.getCase(me, id);
  assert.deepEqual(c!.claimed, { 'pip:1': 'e', 'pip:4': 'd', 'pip:11': 'f' });
  await cases.saveClaimed(me, id, 'pip', { 'pip:1': 'f' });
  c = await cases.getCase(me, id);
  assert.deepEqual(c!.claimed, { 'pip:1': 'f' });
  assert.equal(c!.log.filter((l: any) => /claim recorded/.test(l.action)).length, 2);
});

test('only real descriptors are accepted, and only for your own agency', { skip }, async () => {
  const id = await cases.createCase(me, null, 'pip', null);
  await assert.rejects(cases.saveClaimed(me, id, 'pip', { 'pip:1': 'z' }), /Choose one of the descriptors/);
  await assert.rejects(cases.saveClaimed(other, id, 'pip', { 'pip:1': 'a' }), /Case not found/);
  const w = await cases.createCase(me, null, 'uc-wca', null);
  assert.equal(await cases.saveClaimed(me, w, 'uc-wca', { 'sch6:1': 'a' }), 1);
});
