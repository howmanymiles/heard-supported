// Consent first, then the client record; the AI only while consent to it stands,
// with the client's names removed from what it is sent.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { setTokenProviderForTests } from '@hs/core';

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL not set';
let db: typeof import('../src/lib/db.ts');
let cases: typeof import('../src/lib/cases.ts');
let cl: typeof import('../src/lib/claimants.ts');
let server: http.Server;
const sent: string[] = [];
let me: any, other: any;
const today = '2026-10-25';
const consent = { method: 'in_person', givenOn: '2026-10-20', storeData: true, aiProcessing: true, actOnBehalf: true, confirmed: true };

before(async () => {
  if (!url) return;
  process.env.DATABASE_URL = url;
  server = http.createServer((req, res) => { let b = ''; req.on('data', d => (b += d)); req.on('end', () => { sent.push(b); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ model: 'stub-model', choices: [{ message: { content: JSON.stringify({ evidence: [], gaps: [] }) } }] })); }); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  process.env.AI_ENDPOINT = `http://127.0.0.1:${(server.address() as any).port}`;
  process.env.AI_DEPLOYMENT = 'stub';
  setTokenProviderForTests(async () => 'test-token');
  db = await import('../src/lib/db.ts'); cases = await import('../src/lib/cases.ts'); cl = await import('../src/lib/claimants.ts');
  const { migrate } = await import('../src/lib/migrate.ts');
  process.chdir(new URL('..', import.meta.url).pathname);
  await migrate();
  for (const [k, n] of [['me', 'Consent agency'], ['other', 'Other agency']] as const) {
    const ag = (await db.pool().query('insert into agencies (name) values ($1) returning id', [n])).rows[0].id;
    const u = (await db.pool().query("insert into users (agency_id, entra_oid, name, role) values ($1, $2, 'Adviser', 'adviser') returning id", [ag, `cl-${k}-${Date.now()}`])).rows[0].id;
    const who = { agencyId: ag, userId: u, role: 'adviser', name: 'Adviser' };
    if (k === 'me') me = who; else other = who;
  }
});
after(async () => { if (url) { await db.pool().end(); server.close(); } });

async function addPage(caseId: string, text: string) {
  await db.asAgency(me.agencyId, async c => {
    const docId = (await c.query("insert into documents (agency_id, case_id, name, kind, content_type, size_bytes, blob_path, read_status, page_count) values ($1, $2, 'gp letter.md', 'evidence', 'text/markdown', 1, 'none', 'read', 1) returning id", [me.agencyId, caseId])).rows[0].id;
    await c.query("insert into pages (document_id, agency_id, page_no, text, lines) values ($1, $2, 1, $3, '[]')", [docId, me.agencyId, text]);
  });
}

test('no record without consent to keep the client’s information', { skip }, async () => {
  const person = { name: 'Morwenna Quillfeather' };
  await assert.rejects(cl.createClaimant(me, person, { ...consent, confirmed: false }, today), /went through the consent statement/);
  await assert.rejects(cl.createClaimant(me, person, { ...consent, storeData: false }, today), /don’t create a record/);
  await assert.rejects(cl.createClaimant(me, person, { ...consent, givenOn: '2026-11-01' }, today), /future/);
  await assert.rejects(cl.createClaimant(me, person, { ...consent, method: 'telepathy' }, today), /how consent was given/);
  await assert.rejects(cl.createClaimant(me, { name: ' ' }, consent, today), /client’s name/);
  assert.equal((await cl.listClaimants(me, 'Quillfeather')).length, 0);           // nothing half-saved
});

test('consent, then the record, then cases; the AI sees no names; withdrawing stops it', { skip }, async () => {
  const id = await cl.createClaimant(me, { name: 'Morwenna Quillfeather', preferredName: 'Wenna', agencyRef: 'C-77' }, consent, today);
  const k = (await cl.getClaimant(me, id))!;
  assert.equal(k.current!.ai_processing, true);
  assert.equal(k.current!.statement_version, cl.CONSENT_STATEMENT.version);
  const caseId = await cases.createCase(me, `CL-${Date.now()}`, 'pip', id);
  assert.deepEqual((await cl.caseClient(me, caseId))!.consent, { ai: true, act: true });
  assert.ok((await cl.listClaimants(me, 'wenna')).some(x => x.id === id));      // found by the name they go by

  await addPage(caseId, 'Morwenna Quillfeather needs prompting to wash. Wenna’s daughter helps. Ms Quillfeather cannot cook.');
  await cases.readAndReview(me, caseId);
  const body = sent.at(-1)!;
  assert.ok(!/Morwenna|Quillfeather|Wenna/i.test(body), 'a client name reached the AI');
  assert.ok(body.includes('[name] needs prompting to wash'));

  // The client says no to AI help: a new consent replaces the old one, and the AI steps stop.
  await cl.recordConsent(me, id, { ...consent, aiProcessing: false }, today);
  const n = sent.length;
  await assert.rejects(cases.readAndReview(me, caseId), /did not agree to AI help/);
  assert.equal(sent.length, n);
  assert.equal((await cl.getClaimant(me, id))!.consents.length, 2);

  // Withdrawn: nothing more is added, and no new case can be opened.
  await cl.withdrawConsent(me, id, 'Client asked us to stop');
  await assert.rejects(cl.withdrawConsent(me, id, ''), /no current consent/);
  await assert.rejects(cases.readAndReview(me, caseId), /withdrawn consent/);
  await assert.rejects(cases.addDocument(me, caseId, new File(['x'], 'a.md', { type: 'text/markdown' })), /withdrawn consent/);
  await assert.rejects(cases.createCase(me, `CL-${Date.now()}-2`, 'pip', id), /withdrawn consent/);
  assert.equal((await cl.caseClient(me, caseId))!.consent, null);
});

test('outside the fictional environment, a case with no client cannot use the AI', { skip }, async () => {
  const caseId = await cases.createCase(me, `NC-${Date.now()}`, 'pip');
  await addPage(caseId, 'Some fictional evidence.');
  const was = process.env.DATA_MODE;
  process.env.DATA_MODE = 'live';
  try { await assert.rejects(cases.readAndReview(me, caseId), /Link this case to a client/); }
  finally { process.env.DATA_MODE = was; }
  await cases.readAndReview(me, caseId);                                            // fictional test cases are allowed
});

test('another agency cannot see or use a client', { skip }, async () => {
  const id = await cl.createClaimant(me, { name: 'Tamsin Oddway' }, consent, today);
  assert.equal(await cl.getClaimant(other, id), null);
  assert.ok(!(await cl.listClaimants(other)).some(x => x.id === id));
  await assert.rejects(cases.createCase(other, `X-${Date.now()}`, 'pip', id), /Client not found/);
  await assert.rejects(cl.withdrawConsent(other, id, ''), /no current consent/);
  await assert.rejects(cl.updateClaimant(other, id, { name: 'Changed' }, today), /Client not found/);
  const rows = await db.asAgency(other.agencyId, c => c.query('select count(*)::int as n from consents where claimant_id = $1', [id]));
  assert.equal(rows.rows[0].n, 0);
});
