// The reconsideration stage end to end, against a real database and a stub
// AI service that answers like a faithful model would (and once like a bad one).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { splitTextPages, setTokenProviderForTests } from '@hs/core';
import synthetic from '../src/data/synthetic.json' with { type: 'json' };

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL not set';

let db: typeof import('../src/lib/db.ts');
let cases: typeof import('../src/lib/cases.ts');
let mr: typeof import('../src/lib/mr.ts');
let server: http.Server;
let answer: unknown;
const me = { a: null as any, b: null as any };
const sc = (synthetic as any[]).find(s => s.id === 'PIP-01');
const docIds: Record<string, string> = {};
let caseId = '';

function faithfulAnswer() {
  const dec = splitTextPages(sc.mrDocs.find((d: any) => d.kind === 'decision').text);
  const pa4 = splitTextPages(sc.mrDocs.find((d: any) => d.kind === 'pa4').text);
  const rows = dec.flatMap(p => [...p.text.matchAll(/^\| (\d{1,2})\.? [^|]+\| ([^|]+?) \| \d+ \|$/gm)].map(m => ({ activity: Number(m[1]), quote: m[2].trim(), page: p.page })));
  const chosen = pa4.flatMap(p => [...p.text.matchAll(/Activity (\d+):[^\n]*\n+(Descriptor chosen: [a-h])\nJustification: ([^.]+\.)/g)].map(m => ({ activity: Number(m[1]), quote: m[2], just: m[3], page: p.page })));
  const dateLine = dec[0].text.split('\n').find(l => l.startsWith('Date of this letter'))!;
  // Documents are labelled D1, D2… in upload order.
  const label = (kind: string) => `D${sc.mrDocs.findIndex((d: any) => d.kind === kind) + 1}`;
  const D = label('decision'), P = label('pa4');
  return {
    decision_date: { date: '2026-12-07', doc: D, page: 1, quote: dateLine },
    activities: rows.map(r => {
      const c = chosen.find(x => x.activity === r.activity)!;
      return { activity: r.activity, decision: { doc: D, page: r.page, quote: r.quote }, pa4: { doc: P, page: c.page, quote: c.quote }, justification: { doc: P, page: c.page, quote: c.just } };
    }),
  };
}

before(async () => {
  if (!url) return;
  process.env.DATABASE_URL = url;
  server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ model: 'stub-model', choices: [{ message: { content: JSON.stringify(answer) } }] }));
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  process.env.AI_ENDPOINT = `http://127.0.0.1:${(server.address() as any).port}`;
  process.env.AI_DEPLOYMENT = 'stub';
  setTokenProviderForTests(async () => 'test-token');

  db = await import('../src/lib/db.ts');
  const { migrate } = await import('../src/lib/migrate.ts');
  cases = await import('../src/lib/cases.ts');
  mr = await import('../src/lib/mr.ts');
  process.chdir(new URL('..', import.meta.url).pathname);
  await migrate();
  for (const k of ['a', 'b'] as const) {
    const ag = (await db.pool().query("insert into agencies (name) values ($1) returning id", [`MR agency ${k}`])).rows[0].id;
    const u = (await db.pool().query("insert into users (agency_id, entra_oid, name, role) values ($1, $2, $3, 'adviser') returning id", [ag, `mr-oid-${k}-${Date.now()}`, `Adviser ${k}`])).rows[0].id;
    me[k] = { agencyId: ag, userId: u, role: 'adviser', name: `Adviser ${k}` };
  }
  caseId = await cases.createCase(me.a, `TEST-PIP-01-${Date.now().toString(36).toUpperCase()}`, 'pip');
  // Decision papers and one evidence document, already read (pages stored), so no storage is needed.
  const put = async (name: string, kind: string, text: string) => db.asAgency(me.a.agencyId, async c => {
    const id = (await c.query("insert into documents (agency_id, case_id, name, kind, content_type, size_bytes, blob_path, read_status, page_count) values ($1, $2, $3, $4, 'text/markdown', $5, 'none', 'read', 0) returning id", [me.a.agencyId, caseId, name, kind, text.length])).rows[0].id;
    for (const p of splitTextPages(text)) await c.query("insert into pages (document_id, agency_id, page_no, text, lines) values ($1, $2, $3, $4, '[]')", [id, me.a.agencyId, p.page, p.text]);
    return id as string;
  });
  for (const d of sc.mrDocs) docIds[d.kind] = await put(d.name, d.kind, d.text);
  const notes = sc.docs.find((d: any) => / notes\.md$/.test(d.name));
  docIds.notes = await put(notes.name, 'evidence', notes.text);
});

after(async () => { if (url) { await db.pool().end(); server.close(); } });

test('reading the decision papers records the DWP position, the letter date and the stage', { skip }, async () => {
  answer = faithfulAnswer();
  const r = await mr.readAssessment(me.a, caseId);
  assert.equal(r.activities.filter(a => a.letter).length, 12);
  assert.deepEqual(r.dropped, []);
  const m = (await mr.getMr(me.a, caseId))!;
  assert.equal(m.decisionDate, '2026-12-07');
  assert.equal(m.case.stage, 'mr');
  assert.equal(m.choices.length, 12);
  assert.ok(m.choices.every(c => c.source === 'decision_letter' && !c.confirmed));
  assert.equal(m.choices.find(c => c.activity === 'pip:4')!.letter, 'b');
  assert.equal(m.choices.find(c => c.activity === 'pip:4')!.decision_quote!.docId, docIds.decision);
});

test('a confirmed choice survives a second read, even a bad one', { skip }, async () => {
  await mr.setAssessorChoice(me.a, caseId, 'pip:7', 'a');
  const D = `D${sc.mrDocs.findIndex((d: any) => d.kind === 'decision') + 1}`;
  answer = { activities: [{ activity: 7, decision: { doc: D, page: 2, quote: 'Needs communication support to be able to express or understand complex verbal information.' } }, { activity: 9, decision: { doc: D, page: 2, quote: 'Cannot engage at all' } }] };
  await mr.readAssessment(me.a, caseId);
  const m = (await mr.getMr(me.a, caseId))!;
  assert.equal(m.choices.find(c => c.activity === 'pip:7')!.letter, 'a');          // confirmed: untouched
  assert.equal(m.choices.find(c => c.activity === 'pip:9')!.letter, null);         // invented quote: dropped, adviser chooses
  answer = faithfulAnswer();
  await mr.readAssessment(me.a, caseId);
});

test('comparison and draft: disputes come first, with the assessor’s words and accepted evidence', { skip }, async () => {
  await cases.saveDecision(me.a, caseId, 'pip', 'pip:1', 'e', 5);
  await cases.saveDecision(me.a, caseId, 'pip', 'pip:4', 'b', 7);
  await cases.saveDecision(me.a, caseId, 'pip', 'pip:12', 'b', 5);
  const notesPage = (await db.asAgency(me.a.agencyId, c => c.query('select text from pages where document_id = $1 and page_no = 2', [docIds.notes]))).rows[0].text as string;
  const quote = notesPage.split('\n').find(l => l.trim().split(/\s+/).length > 6)!.trim().split(/\s+/).slice(0, 10).join(' ');
  await db.asAgency(me.a.agencyId, c => c.query("insert into evidence (agency_id, case_id, document_id, page_no, quote, activities, status) values ($1, $2, $3, 2, $4, '{pip:12}', 'accepted')", [me.a.agencyId, caseId, docIds.notes, quote]));

  let m = (await mr.getMr(me.a, caseId))!;
  assert.ok(mr.buildComparison(m.choices, m.decisions, m.evidence).unconfirmed.length > 0);
  await mr.confirmAllChoices(me.a, caseId);
  m = (await mr.getMr(me.a, caseId))!;
  const { comparison, missing, unconfirmed } = mr.buildComparison(m.choices, m.decisions, m.evidence);
  assert.deepEqual(missing, []);
  assert.deepEqual(unconfirmed, []);
  assert.deepEqual(comparison!.challenges.map(c => c.activity), [1, 12]);
  assert.equal(comparison!.dailyLiving.adviser.points, 6);
  assert.equal(comparison!.mobility.adviser.points, 4);

  const draft = mr.buildMrDraft({ ref: m.case.ref, decisionDate: m.decisionDate, timing: m.timing, lateReason: null, comparison: comparison!, decisions: m.decisions,
    labels: { 1: 'Daily living 1: Preparing food', 12: 'Mobility 2: Moving around' } });
  assert.match(draft, /decision dated 7 December 2026/);
  assert.ok(draft.indexOf('Daily living 1: Preparing food') < draft.indexOf('Mobility 2: Moving around'));
  assert.match(draft, /descriptor 1a \(0 points\)/);
  assert.match(draft, /descriptor 1e applies \(4 points\)/);
  assert.match(draft, /about 5 days a week/);
  assert.match(draft, /The assessor said: "The claimant walks to the shop/);
  assert.ok(draft.includes(`"${quote}" (PIP-01 notes, page 2)`));
  assert.match(draft, /\(assessment report, page 4\)/);
  assert.match(draft, /\[Add the evidence for this activity\.\]/);   // activity 1 has none accepted yet
  assert.match(draft, /We do not dispute the descriptors for activity 4\b/);
});

test('late requests say why, and dates are validated', { skip }, async () => {
  await mr.saveMrDates(me.a, caseId, '2026-01-10', '2026-03-01', 'the letter went to an old address');
  const m = (await mr.getMr(me.a, caseId))!;
  assert.equal(m.timing!.status, 'late');
  assert.equal(m.timing!.lateLimit, '2027-02-10');
  const { comparison } = mr.buildComparison(m.choices, m.decisions, m.evidence);
  const draft = mr.buildMrDraft({ ref: m.case.ref, decisionDate: m.decisionDate, timing: m.timing, lateReason: m.case.late_reason, comparison: comparison!, decisions: m.decisions, labels: {} });
  assert.match(draft, /It is late because the letter went to an old address\./);
  await assert.rejects(mr.saveMrDates(me.a, caseId, '2026-03-01', '2026-01-01', ''), /cannot be before/);
  await assert.rejects(mr.setAssessorChoice(me.a, caseId, 'pip:12', 'z'), /Choose one of the descriptors/);
});

test("another agency cannot see this case's reconsideration", { skip }, async () => {
  assert.equal(await mr.getMr(me.b, caseId), null);
  const rows = await db.asAgency(me.b.agencyId, c => c.query('select count(*)::int as n from assessor_choices where case_id = $1', [caseId]));
  assert.equal(rows.rows[0].n, 0);
});
