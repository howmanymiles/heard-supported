// The appeal stage end to end on PIP-03: decision papers, MR notice (which
// revised dressing 6a to 6b), the DWP bundle, bundle pages, and grounds.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { splitTextPages, setTokenProviderForTests } from '@hs/core';
import synthetic from '../src/data/synthetic.json' with { type: 'json' };

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL not set';
const appeal = JSON.parse(fs.readFileSync(new URL('../../evals/cases/PIP-03/appeal.json', import.meta.url), 'utf8'));
const sc = (synthetic as any[]).find(s => s.id === 'PIP-03');

let db: typeof import('../src/lib/db.ts');
let cases: typeof import('../src/lib/cases.ts');
let mr: typeof import('../src/lib/mr.ts');
let ap: typeof import('../src/lib/appeal.ts');
let server: http.Server;
const answers: unknown[] = [];
let me: any, caseId = '';
const docId: Record<string, string> = {};

const rowsOf = (text: string) => splitTextPages(text).flatMap(p => [...p.text.matchAll(/^\| (\d{1,2})\.? [^|]+\| ([^|]+?) \| \d+ \|$/gm)].map(m => ({ activity: Number(m[1]), quote: m[2].trim(), page: p.page })));

before(async () => {
  if (!url) return;
  process.env.DATABASE_URL = url;
  server = http.createServer((req, res) => { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ model: 'stub-model', choices: [{ message: { content: JSON.stringify(answers.shift() ?? {}) } }] })); }); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  process.env.AI_ENDPOINT = `http://127.0.0.1:${(server.address() as any).port}`;
  process.env.AI_DEPLOYMENT = 'stub';
  setTokenProviderForTests(async () => 'test-token');
  db = await import('../src/lib/db.ts'); cases = await import('../src/lib/cases.ts'); mr = await import('../src/lib/mr.ts'); ap = await import('../src/lib/appeal.ts');
  const { migrate } = await import('../src/lib/migrate.ts');
  process.chdir(new URL('..', import.meta.url).pathname);
  await migrate();
  const ag = (await db.pool().query("insert into agencies (name) values ('Appeal agency') returning id")).rows[0].id;
  const u = (await db.pool().query("insert into users (agency_id, entra_oid, name, role) values ($1, $2, 'Adviser', 'adviser') returning id", [ag, `ap-oid-${Date.now()}`])).rows[0].id;
  me = { agencyId: ag, userId: u, role: 'adviser', name: 'Adviser' };
  caseId = await cases.createCase(me, `TEST-PIP-03-${Date.now().toString(36).toUpperCase()}`, 'pip');
  const all = [...sc.docs.map((d: any) => ({ ...d, kind: 'evidence', key: d.name.split(' ')[1].replace('.md', '') })), ...sc.mrDocs.map((d: any) => ({ ...d, key: d.kind })), ...sc.appealDocs.map((d: any) => ({ ...d, key: d.kind }))];
  for (const d of all) {
    docId[d.key] = await db.asAgency(me.agencyId, async c => {
      const id = (await c.query("insert into documents (agency_id, case_id, name, kind, content_type, size_bytes, blob_path, read_status, page_count) values ($1, $2, $3, $4, 'text/markdown', $5, 'none', 'read', 0) returning id", [me.agencyId, caseId, d.name, d.kind, d.text.length])).rows[0].id;
      for (const p of splitTextPages(d.text)) await c.query("insert into pages (document_id, agency_id, page_no, text, lines) values ($1, $2, $3, $4, '[]')", [id, me.agencyId, p.page, p.text]);
      return id;
    });
  }
});
after(async () => { if (url) { await db.pool().end(); server.close(); } });

test('MR notice: date read, the revised descriptor goes back to check', { skip }, async () => {
  // Original decision, read from the decision letter (D1 in upload order: pa4 then decision).
  const D = `D${sc.mrDocs.findIndex((d: any) => d.kind === 'decision') + 1}`;
  const decText = sc.mrDocs.find((d: any) => d.kind === 'decision').text as string;
  const dateLine = splitTextPages(decText)[0].text.split('\n').find(l => l.startsWith('Date of this letter'))!;
  answers.push({ decision_date: { doc: D, page: 1, quote: dateLine }, activities: rowsOf(decText).map(r => ({ activity: r.activity, decision: { doc: D, page: r.page, quote: r.quote } })) });
  await mr.readAssessment(me, caseId);
  await mr.confirmAllChoices(me, caseId);
  let m = (await mr.getMr(me, caseId))!;
  assert.equal(m.choices.find(c => c.activity === 'pip:6')!.letter, 'a');

  answers.push({ activities: rowsOf(sc.appealDocs.find((d: any) => d.kind === 'mr_notice').text).map(r => ({ activity: r.activity, decision: { doc: 'D1', page: r.page, quote: r.quote } })) });
  const r = await ap.readMrNotice(me, caseId);
  assert.equal(r.date, '2026-09-09');
  assert.deepEqual(r.revised, ['activity 6: a to b']);
  m = (await mr.getMr(me, caseId))!;
  const six = m.choices.find(c => c.activity === 'pip:6')!;
  assert.deepEqual([six.letter, six.source, six.confirmed], ['b', 'mr_notice', false]);
  assert.equal(m.case.stage, 'appeal');
});

test('issues, bundle pages, evidence missing from the bundle, and grounds', { skip }, async () => {
  for (const i of appeal.issues) await cases.saveDecision(me, caseId, 'pip', `pip:${i.activity}`, i.adviser_letter, 5);
  await cases.saveDecision(me, caseId, 'pip', 'pip:6', 'b', 7);
  for (const i of appeal.issues) for (const e of [...i.evidence, ...i.not_in_bundle].filter((e: any) => docId[e.doc] && ['physio', 'gp', 'form', 'notes'].includes(e.doc))) {
    await db.asAgency(me.agencyId, c => c.query("insert into evidence (agency_id, case_id, document_id, page_no, quote, activities, status) values ($1, $2, $3, $4, $5, $6, 'accepted')", [me.agencyId, caseId, docId[e.doc], e.page, e.quote, [`pip:${i.activity}`]]));
  }
  let a = (await ap.getAppeal(me, caseId))!;
  assert.match(ap.issuesFor(a).blocked ?? '', /Confirm the DWP descriptor for activity 6/);   // revised by the notice, not yet confirmed
  await mr.confirmAllChoices(me, caseId);

  const bundle = splitTextPages(sc.appealDocs.find((d: any) => d.kind === 'dwp_bundle').text);
  answers.push({ items: appeal.issues.map((i: any) => ({ key: `pip:${i.activity}`, reasoning: { doc: 'D1', page: bundle.find(p => p.text.includes(i.dm_reasoning.quote))!.page, quote: i.dm_reasoning.quote } })) });
  const rb = await ap.readBundle(me, caseId);
  assert.deepEqual(rb, { found: 3, of: 3 });

  a = (await ap.getAppeal(me, caseId))!;
  const { issues, summary, blocked } = ap.issuesFor(a);
  assert.equal(blocked, null);
  assert.deepEqual(issues.map(i => i.key), ['pip:12', 'pip:1', 'pip:5']);
  const located = ap.locate(issues, a.bundle, a.responseReasoning);
  const walk = located[0].evidence.find(e => e.quote.startsWith('Walk abandoned at 18 metres'))!;
  assert.ok(walk.at && walk.at.bundlePage > 1);
  const notes = located.flatMap(l => l.evidence).filter(e => e.doc.endsWith('notes.md'));
  assert.ok(notes.length >= 5 && notes.every(e => e.at === null));         // the agency's own notes are never in the DWP bundle
  assert.ok(located.flatMap(l => l.evidence).filter(e => !e.doc.endsWith('notes.md')).every(e => e.at !== null));

  await ap.saveAppealDates(me, caseId, '2026-09-09', '2026-09-24', '');
  a = (await ap.getAppeal(me, caseId))!;
  assert.equal(a.appealTimingNow!.status, 'in_time');
  const g = ap.buildGrounds({ benefit: 'pip', ref: a.case.ref, decisionDate: a.decisionDate, mrNoticeDate: a.mrNoticeDate, timing: a.appealTimingNow, lateReason: null, summary: summary!, issues, located, hasBundle: true });
  assert.match(g, /decision dated 22 July 2026, as reconsidered on 9 September 2026\./);
  assert.match(g, /The decision maker says: "However, the walk test is a single snapshot[^"]+" \(bundle page \d+\)\./);
  assert.match(g, /"Walk abandoned at 18 metres[^"]*" \([^)]*physio, bundle page \d+\)/);
  assert.match(g, /not in the DWP bundle, enclosed\)/);
  assert.match(g, /Enclosed, as they are not in the DWP bundle: PIP-03 notes\./);
  assert.ok(g.indexOf('Mobility 2: Moving around') < g.indexOf('Daily living 1: Preparing food'));
});

test('the caseload shows the appeal deadline until the appeal is sent', { skip }, async () => {
  const { nextDeadline } = await import('@hs/core');
  await ap.saveAppealDates(me, caseId, '2026-09-09', null, '');
  const row = (await cases.listCases(me)).find(c => c.id === caseId)!;
  const d = nextDeadline({ decisionDate: row.decision_date, mrRequestDate: row.mr_request_date, mrNoticeDate: row.mr_notice_date, appealSentDate: row.appeal_sent_date }, '2026-09-20');
  assert.deepEqual([d!.kind, d!.due, d!.status, d!.daysLeft], ['appeal', '2026-10-09', 'in_time', 19]);
  await assert.rejects(ap.saveAppealDates(me, caseId, '2026-09-09', '2026-09-01', ''), /before the MR notice/);
});
