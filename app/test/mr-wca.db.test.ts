// WCA reconsideration end to end: a UC85A read through a stub AI, the
// adviser's position including substantial risk, comparison and draft.
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
let wca: typeof import('../src/lib/mr-wca.ts');
let server: http.Server;
let answer: unknown;
let me: any;
const ids: Record<string, string> = {};

function faithful(sc: any) {
  const label = (kind: string) => `D${sc.mrDocs.findIndex((d: any) => d.kind === kind) + 1}`;
  const repDoc = sc.mrDocs.find((d: any) => d.kind !== 'decision');
  const R = label(repDoc.kind), N = label('decision');
  const rep = splitTextPages(repDoc.text), dec = splitTextPages(sc.mrDocs.find((d: any) => d.kind === 'decision').text);
  const find = (ps: Array<{ page: number; text: string }>, re: RegExp) => { for (const p of ps) { const m = p.text.match(re); if (m) return { page: p.page, m }; } throw new Error(`not found: ${re}`); };
  const sch6 = Array.from({ length: 17 }, (_, i) => i + 1).map(n => {
    const c = find(rep, new RegExp(`Activity ${n}:[^\\n]*\\n(Descriptor[^\\n]*)\\n(?:Justification|Reasoning): ([^.]+\\.)`));
    return { activity: n, chosen: { doc: R, page: c.page, quote: c.m[1] }, justification: { doc: R, page: c.page, quote: c.m[2] } };
  });
  const s7 = find(rep, /^(No(?:ne of the)? Schedule 7 descriptors? appl[^\n]*)$/m);
  const r8 = find(rep, /^(Schedule 8 paragraph 4[^\n]*)\n(?:Justification|Reasoning): ([^.]+\.)/m);
  const r9 = find(rep, /^(Schedule 9 paragraph 4[^\n]*)\n(?:Justification|Reasoning): ([^.]+\.)/m);
  const dd = find(dec, /^(Date of this notice: [^\n]+)$/m), oc = find(dec, /(We have decided that you[^.]+\.)/);
  return {
    decision_date: { doc: N, page: dd.page, quote: dd.m[1] }, outcome: { doc: N, page: oc.page, quote: oc.m[1] }, sch6,
    sch7: [{ doc: R, page: s7.page, quote: s7.m[1] }],
    sch8_4: { applies: false, finding: { doc: R, page: r8.page, quote: r8.m[1] }, justification: { doc: R, page: r8.page, quote: r8.m[2] } },
    sch9_4: { applies: false, finding: { doc: R, page: r9.page, quote: r9.m[1] }, justification: { doc: R, page: r9.page, quote: r9.m[2] } },
  };
}

async function setupCase(id: string) {
  const sc = (synthetic as any[]).find(s => s.id === id);
  const caseId = await cases.createCase(me, `TEST-${id}-${Date.now().toString(36).toUpperCase()}`, 'uc-wca');
  for (const d of [...sc.mrDocs, ...sc.docs.map((x: any) => ({ ...x, kind: 'evidence' }))]) {
    ids[`${id}:${d.name}`] = await db.asAgency(me.agencyId, async c => {
      const docId = (await c.query("insert into documents (agency_id, case_id, name, kind, content_type, size_bytes, blob_path, read_status, page_count) values ($1, $2, $3, $4, 'text/markdown', $5, 'none', 'read', 0) returning id", [me.agencyId, caseId, d.name, d.kind, d.text.length])).rows[0].id;
      for (const p of splitTextPages(d.text)) await c.query("insert into pages (document_id, agency_id, page_no, text, lines) values ($1, $2, $3, $4, '[]')", [docId, me.agencyId, p.page, p.text]);
      return docId;
    });
  }
  return { sc, caseId };
}

before(async () => {
  if (!url) return;
  process.env.DATABASE_URL = url;
  server = http.createServer((req, res) => { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ model: 'stub-model', choices: [{ message: { content: JSON.stringify(answer) } }] })); }); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  process.env.AI_ENDPOINT = `http://127.0.0.1:${(server.address() as any).port}`;
  process.env.AI_DEPLOYMENT = 'stub';
  setTokenProviderForTests(async () => 'test-token');
  db = await import('../src/lib/db.ts');
  cases = await import('../src/lib/cases.ts');
  mr = await import('../src/lib/mr.ts');
  wca = await import('../src/lib/mr-wca.ts');
  const { migrate } = await import('../src/lib/migrate.ts');
  process.chdir(new URL('..', import.meta.url).pathname);
  await migrate();
  const ag = (await db.pool().query("insert into agencies (name) values ('WCA MR agency') returning id")).rows[0].id;
  const u = (await db.pool().query("insert into users (agency_id, entra_oid, name, role) values ($1, $2, 'Adviser', 'adviser') returning id", [ag, `wca-oid-${Date.now()}`])).rows[0].id;
  me = { agencyId: ag, userId: u, role: 'adviser', name: 'Adviser' };
});
after(async () => { if (url) { await db.pool().end(); server.close(); } });

test('WCA-02 (UC85A): substantial risk on both schedules, comparison and draft', { skip }, async () => {
  const { sc, caseId } = await setupCase('WCA-02');
  answer = faithful(sc);
  const r = await mr.readAssessment(me, caseId);
  assert.deepEqual([r.found, r.of, r.dropped.length], [20, 20, 0]);
  let m = (await mr.getMr(me, caseId))!;
  assert.equal(m.decisionDate, '2026-11-17');
  assert.equal(m.case.decision_outcome, 'none');
  assert.equal(m.choices.find(c => c.activity === 'sch6:16')!.letter, 'c');
  assert.equal(m.choices.find(c => c.activity === 'sch7')!.letter, 'none');
  assert.equal(m.choices.find(c => c.activity === 'sch8:4')!.letter, 'not_applies');

  await cases.saveDecision(me, caseId, 'uc-wca', 'sch6:13', 'c', null);
  await cases.saveDecision(me, caseId, 'uc-wca', 'sch6:16', 'c', null);
  await cases.saveDecision(me, caseId, 'uc-wca', 'sch8:4', 'applies', null);
  await cases.saveDecision(me, caseId, 'uc-wca', 'sch9:4', 'applies', null);
  await mr.confirmAllChoices(me, caseId);
  m = (await mr.getMr(me, caseId))!;
  const { comparison: c, missing, unconfirmed } = wca.buildWcaComparison(m.choices, m.decisions, m.evidence, m.case.decision_outcome);
  assert.deepEqual([missing, unconfirmed], [[], []]);
  assert.equal(c!.dwp.lcw.totalPoints, 6);
  assert.equal(c!.dwpOutcome, 'none');
  assert.equal(c!.adviser.lcw.totalPoints, 12);
  assert.equal(c!.adviserOutcome, 'lcwra');
  assert.deepEqual(c!.challenges.map(x => x.key), ['sch9:4', 'sch6:13', 'sch8:4']);
  assert.ok(!c!.warnings.some(w => w.code === 'notice_differs'));

  const draft = wca.buildWcaDraft({ ref: m.case.ref, decisionDate: m.decisionDate, timing: m.timing, lateReason: null, noticeOutcome: m.case.decision_outcome, reportName: 'UC85A report', comparison: c! });
  assert.match(draft, /decision dated 17 November 2026 that the claimant does not have limited capability for work\./);
  assert.match(draft, /The UC85A report gave 6 points \(0 physical, 6 mental\)\. On the evidence, the claimant scores 12 points \(0 physical, 12 mental\) against the threshold of 15, and has limited capability for work-related activity\./);
  assert.ok(draft.indexOf('Limited capability for work-related activity\n') < draft.indexOf('Limited capability for work\n'));
  assert.match(draft, /The report applied descriptor 13\(d\) \(0 points\)/);
  assert.match(draft, /We say descriptor 13\(c\) applies \(6 points\)/);
  assert.match(draft, /The report said: "The GP reports mood is improving and the claimant is compliant with medication\." \(UC85A report, page 3\)/);
  assert.match(draft, /^Activity 13: Initiating and completing personal action$/m);
  assert.match(draft, /We do not dispute the report’s descriptors for Schedule 6 activity 16\./); // only what the adviser has decided
  assert.doesNotMatch(draft, /not seen/i);
});

test('WCA-01 (UC85): points reach 15, so Schedule 8 paragraph 4 is not argued', { skip }, async () => {
  const { sc, caseId } = await setupCase('WCA-01');
  answer = faithful(sc);
  await mr.readAssessment(me, caseId);
  for (const [k, l] of [['sch6:1', 'd'], ['sch6:2', 'c'], ['sch6:14', 'c'], ['sch8:4', 'applies']]) await cases.saveDecision(me, caseId, 'uc-wca', k, l, null);
  await mr.confirmAllChoices(me, caseId);
  const m = (await mr.getMr(me, caseId))!;
  const { comparison: c } = wca.buildWcaComparison(m.choices, m.decisions, m.evidence, m.case.decision_outcome);
  assert.equal(c!.adviser.lcw.totalPoints, 18);
  assert.equal(c!.adviserOutcome, 'lcw');
  assert.deepEqual(c!.challenges.map(x => x.key), ['sch6:1', 'sch6:2', 'sch6:14']);
  assert.ok(c!.warnings.some(w => w.code === 'sch8_not_needed'));
});

test('a notice award that does not match the report is flagged', { skip }, async () => {
  const { sc, caseId } = await setupCase('WCA-02');
  answer = faithful(sc);
  await mr.readAssessment(me, caseId);
  await mr.confirmAllChoices(me, caseId);
  await mr.saveMrDates(me, caseId, '2026-11-17', null, '', 'lcw');
  const m = (await mr.getMr(me, caseId))!;
  const { comparison: c } = wca.buildWcaComparison(m.choices, m.decisions, m.evidence, m.case.decision_outcome);
  assert.ok(c!.warnings.some(w => w.code === 'notice_differs'));
  await assert.rejects(mr.setAssessorChoice(me, caseId, 'sch7', '99(z)'), /Schedule 7/);
  await assert.rejects(mr.setAssessorChoice(me, caseId, 'sch8:4', 'maybe'), /applies/);
  await mr.setAssessorChoice(me, caseId, 'sch7', '15(b)');
  assert.equal((await mr.getMr(me, caseId))!.choices.find(x => x.activity === 'sch7')!.letter, '15(b)');
});
