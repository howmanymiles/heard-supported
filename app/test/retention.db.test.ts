// Retention, erasure and subject access export.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL not set';
let db: typeof import('../src/lib/db.ts');
let cl: typeof import('../src/lib/claimants.ts');
let cases: typeof import('../src/lib/cases.ts');
let ret: typeof import('../src/lib/retention.ts');
let sar: typeof import('../src/lib/sar.ts');
let admin: any, adviser: any;
const deleted: string[] = [];
const consent = { method: 'in_person', givenOn: '2026-01-10', storeData: true, aiProcessing: false, actOnBehalf: true, confirmed: true };

before(async () => {
  if (!url) return;
  process.env.DATABASE_URL = url;
  db = await import('../src/lib/db.ts'); cl = await import('../src/lib/claimants.ts'); cases = await import('../src/lib/cases.ts');
  ret = await import('../src/lib/retention.ts'); sar = await import('../src/lib/sar.ts');
  ret.setBlobDeleterForTests(async p => { deleted.push(p); });
  sar.setBlobReaderForTests(async p => Buffer.from(`%PDF-1.7 original of ${p}`));
  const { migrate } = await import('../src/lib/migrate.ts');
  process.chdir(new URL('..', import.meta.url).pathname);
  await migrate();
  const ag = (await db.pool().query("insert into agencies (name) values ('Retention agency') returning id")).rows[0].id;
  const mk = async (role: string) => ({ agencyId: ag, role, name: role, userId: (await db.pool().query("insert into users (agency_id, entra_oid, name, role) values ($1, $2, $3, $3) returning id", [ag, `rt-${role}-${Date.now()}`, role])).rows[0].id });
  admin = await mk('admin'); adviser = await mk('adviser');
});
after(async () => { if (url) await db.pool().end(); });

async function clientWithCase(name: string) {
  const k = await cl.createClaimant(adviser, { name }, consent, '2026-10-25');
  const caseId = await cases.createCase(adviser, 'OUR-REF-1', 'pip', k);
  await db.asAgency(adviser.agencyId, async c => {
    const doc = (await c.query("insert into documents (agency_id, case_id, name, kind, content_type, size_bytes, blob_path, read_status, page_count) values ($1, $2, 'GP letter.pdf', 'evidence', 'application/pdf', 10, $3, 'read', 1) returning id", [adviser.agencyId, caseId, `${adviser.agencyId}/${caseId}/blob1`])).rows[0].id;
    await c.query("insert into pages (document_id, agency_id, page_no, text, lines) values ($1, $2, 1, 'She cannot cook a meal.', '[]')", [doc, adviser.agencyId]);
    await c.query("insert into evidence (agency_id, case_id, document_id, page_no, quote, activities, status, source) values ($1, $2, $3, 1, 'She cannot cook a meal.', '{pip:1}', 'accepted', 'adviser')", [adviser.agencyId, caseId, doc]);
    await c.query("update cases set mr_draft = 'Dear DWP, about my client', decision_outcome = 'none', award_before = '{\"daily_living\":\"none\"}' where id = $1", [caseId]);
  });
  return { k, caseId };
}

test('subject access export has the report, the data and the original files', { skip }, async () => {
  const { k } = await clientWithCase('Jordan Example');
  await assert.rejects(sar.exportClient(adviser, k), /Only admins and supervisors/);
  const out = (await sar.exportClient(admin, k))!;
  const z = out.data;
  assert.equal(z.readUInt32LE(0), 0x04034b50);
  const text = z.toString('latin1');
  assert.ok(text.includes('report.html') && text.includes('data.json') && text.includes('files/'));
  assert.ok(text.includes('Information held about Jordan Example'));
  assert.ok(text.includes('She cannot cook a meal.'));
  assert.ok(text.includes('Dear DWP, about my client'));
  assert.ok(text.includes('Opened the client record') || text.includes('Client record created'));
  assert.ok(!text.includes('blob_path'), 'storage paths are not given out');
  void inflateRawSync;
});

test('erasing a client removes everything that identifies them, and keeps the outcome', { skip }, async () => {
  const { k, caseId } = await clientWithCase('Sam Example');
  await assert.rejects(ret.eraseClient(adviser, k, 'Sam Example'), /Only admins/);
  await assert.rejects(ret.eraseClient(admin, k, 'Sam'), /Type the client’s full name/);
  deleted.length = 0;
  const r = await ret.eraseClient(admin, k, '  sam   example ');
  assert.deepEqual(r, { cases: 1, files: 1 });
  assert.equal(deleted.length, 1);
  const left = await db.asAgency(admin.agencyId, async c => ({
    client: (await c.query('select 1 from claimants where id = $1', [k])).rowCount,
    consents: (await c.query('select 1 from consents where claimant_id = $1', [k])).rowCount,
    docs: (await c.query('select 1 from documents where case_id = $1', [caseId])).rowCount,
    evidence: (await c.query('select 1 from evidence where case_id = $1', [caseId])).rowCount,
    cs: (await c.query('select claimant_id, external_ref, mr_draft, decision_outcome, award_before, anonymised_reason, closed_at from cases where id = $1', [caseId])).rows[0],
  }));
  assert.equal(left.client, 0); assert.equal(left.consents, 0); assert.equal(left.docs, 0); assert.equal(left.evidence, 0);
  assert.equal(left.cs.claimant_id, null); assert.equal(left.cs.external_ref, null); assert.equal(left.cs.mr_draft, null);
  assert.equal(left.cs.decision_outcome, 'none'); assert.deepEqual(left.cs.award_before, { daily_living: 'none' });
  assert.equal(left.cs.anonymised_reason, 'erasure'); assert.ok(left.cs.closed_at);
  // Nothing more can be added to it.
  await assert.rejects(db.asAgency(admin.agencyId, c => cl.storeGate(c, caseId)), /content has been deleted/);
  // The audit record is still intact.
  assert.equal((await (await import('../src/lib/auditlog.ts')).checkAudit(admin)).intact, true);
});

test('closed cases lose their content when the retention period ends', { skip }, async () => {
  await assert.rejects(ret.setRetention(adviser, 12), /Only admins/);
  await assert.rejects(ret.setRetention(admin, 5), /Choose one/);
  await ret.setRetention(admin, 12);
  const { caseId: old } = await clientWithCase('Alex Old');
  const { caseId: recent } = await clientWithCase('Alex Recent');
  const { caseId: open } = await clientWithCase('Alex Open');
  await db.asAgency(admin.agencyId, async c => {
    await c.query("update cases set closed_at = now() - interval '13 months', closed_reason = 'outcome' where id = $1", [old]);
    await c.query("update cases set closed_at = now() - interval '11 months', closed_reason = 'outcome' where id = $1", [recent]);
  });
  assert.ok((await ret.getRetention(admin)).dueWithin30Days >= 1);
  await ret.sweepRetention();
  const state = async (id: string) => db.asAgency(admin.agencyId, async c => (await c.query('select anonymised_reason, claimant_id from cases where id = $1', [id])).rows[0]);
  assert.equal((await state(old)).anonymised_reason, 'retention');
  assert.equal((await state(old)).claimant_id, null);
  assert.equal((await state(recent)).anonymised_reason, null);
  assert.equal((await state(open)).anonymised_reason, null);
  const page = await cases.getCase(admin, old);
  assert.ok(page!.case.anonymised_at); assert.equal(page!.docs.length, 0);
});
