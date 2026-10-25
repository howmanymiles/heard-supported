// Adult Disability Payment end to end: the notice of determination read through a stub
// AI, ADP wording and time limits, the comparison, the request, letters and grounds.
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
let me: any;
const sc = (synthetic as any[]).find(s => s.id === 'ADP-01');

/** What a faithful model returns: each table row's descriptor wording, and the notice's date line. */
function faithful() {
  const dec = splitTextPages(sc.mrDocs.find((d: any) => d.kind === 'decision').text);
  const rows = dec.flatMap(p => [...p.text.matchAll(/^\| (?:Mobility )?(\d{1,2}) [^|]+\| ([^|]+?) \| \d+ \|$/gm)].map(m => ({ n: Number(m[1]), quote: m[2].trim(), page: p.page, mob: m[0].startsWith('| Mobility') })));
  const dateLine = dec[0].text.split('\n').find(l => l.startsWith('Date of this notice'))!;
  return {
    decision_date: { date: '2026-11-10', doc: 'D1', page: 1, quote: dateLine },
    activities: rows.map(r => ({ activity: r.mob ? 10 + r.n : r.n, decision: { doc: 'D1', page: r.page, quote: r.quote } })),
  };
}

before(async () => {
  if (!url) return;
  process.env.DATABASE_URL = url;
  server = http.createServer((req, res) => { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ model: 'stub-model', choices: [{ message: { content: JSON.stringify(answer) } }] })); }); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  process.env.AI_ENDPOINT = `http://127.0.0.1:${(server.address() as any).port}`;
  process.env.AI_DEPLOYMENT = 'stub';
  setTokenProviderForTests(async () => 'test-token');
  db = await import('../src/lib/db.ts'); cases = await import('../src/lib/cases.ts'); mr = await import('../src/lib/mr.ts');
  const { migrate } = await import('../src/lib/migrate.ts');
  process.chdir(new URL('..', import.meta.url).pathname);
  await migrate();
  const ag = (await db.pool().query("insert into agencies (name) values ('ADP agency') returning id")).rows[0].id;
  const u = (await db.pool().query("insert into users (agency_id, entra_oid, name, role) values ($1, $2, 'Adviser', 'adviser') returning id", [ag, `adp-${Date.now()}`])).rows[0].id;
  me = { agencyId: ag, userId: u, role: 'adviser', name: 'Adviser' };
});
after(async () => { if (url) { await db.pool().end(); server.close(); } });

test('ADP-01: determination read, ADP limits, comparison, request, letters and grounds', { skip }, async () => {
  const caseId = await cases.createCase(me, 'TEST-ADP-01', 'adp');
  const d = sc.mrDocs.find((x: any) => x.kind === 'decision');
  await db.asAgency(me.agencyId, async c => {
    const docId = (await c.query("insert into documents (agency_id, case_id, name, kind, content_type, size_bytes, blob_path, read_status, page_count) values ($1, $2, $3, 'decision', 'text/markdown', 1, 'none', 'read', 3) returning id", [me.agencyId, caseId, d.name])).rows[0].id;
    for (const p of splitTextPages(d.text)) await c.query("insert into pages (document_id, agency_id, page_no, text, lines) values ($1, $2, $3, $4, '[]')", [docId, me.agencyId, p.page, p.text]);
  });

  answer = faithful();
  const r = await mr.readAssessment(me, caseId);
  assert.equal(r.found, 12);                                       // every ADP wording matched, including 7a and 9a
  let m = (await mr.getMr(me, caseId))!;
  assert.equal(m.decisionDate, '2026-11-10');
  assert.deepEqual(['pip:4', 'pip:9', 'pip:11', 'pip:12'].map(k => m.choices.find(c => c.activity === k)!.letter), ['b', 'a', 'a', 'b']);
  // Told on 12 November (the notice arrived then): 42 days, counting that day, runs to 23 December.
  await mr.saveMrDates(me, caseId, '2026-11-12', null, '');
  m = (await mr.getMr(me, caseId))!;
  assert.equal(m.timing!.deadline, '2026-12-23');

  await mr.confirmAllChoices(me, caseId);
  for (const [k, l] of [['pip:1', 'b'], ['pip:4', 'e'], ['pip:6', 'b'], ['pip:9', 'c'], ['pip:11', 'b'], ['pip:12', 'b']]) await cases.saveDecision(me, caseId, 'adp', k, l, 7);
  m = (await mr.getMr(me, caseId))!;
  const { comparison: cmp } = mr.buildComparison(m.choices, m.decisions, m.evidence, 'adp');
  assert.deepEqual([cmp!.dailyLiving.assessor.points, cmp!.dailyLiving.adviser.points, cmp!.dailyLiving.adviser.rate], [6, 11, 'standard']);
  assert.deepEqual([cmp!.mobility.assessor.points, cmp!.mobility.adviser.points, cmp!.mobility.adviser.rate], [4, 8, 'standard']);
  assert.deepEqual(cmp!.challenges.map(c => c.activity).sort((a, b) => a - b), [4, 9, 11]);
  assert.match(cmp!.challenges.find(c => c.activity === 4)!.adviser!.text, /unadapted bath/);

  const { activityList } = await import('@hs/core');
  const draft = mr.buildMrDraft({ ref: m.case.ref, decisionDate: m.decisionDate, timing: m.timing, lateReason: null, comparison: cmp!, decisions: m.decisions, labels: Object.fromEntries(activityList('adp').map(a => [Number(a.key.split(':')[1]), a.label])), benefit: 'adp' });
  assert.match(draft, /^Request for a re-determination: Adult Disability Payment/);
  assert.match(draft, /Social Security Scotland/);
  assert.match(draft, /\(regulation 10\)/);
  assert.match(draft, /notice of re-determination with reasons/);
  assert.doesNotMatch(draft, /mandatory reconsideration|PIP|DWP/);

  const { buildLetter } = await import('../src/lib/letters.ts');
  const letter = buildLetter('raise_mr', { benefit: 'adp', ref: m.case.ref, decisionDate: '2026-11-12', timing: m.timing, lateReason: null, today: '2026-11-20', hasPaperBased: false }, { requestReport: true, holdForEvidence: true, authorityEnclosed: false, disputes: '' });
  assert.match(letter, /re-determination of my client’s entitlement to Adult Disability Payment/);
  assert.match(letter, /consultation report and the other supporting information/);
  assert.doesNotMatch(letter, /mandatory reconsideration|PA4/);

  const { buildGrounds, issuesFor, getAppeal, locate } = await import('../src/lib/appeal.ts');
  await db.asAgency(me.agencyId, c => c.query("update cases set mr_notice_date = '2027-01-05' where id = $1", [caseId]));
  const a = (await getAppeal(me, caseId))!;
  assert.equal(a.appealTimingNow!.deadline, '2027-02-04');         // 31 days beginning with the day told
  const { issues, summary } = issuesFor(a);
  const grounds = buildGrounds({ benefit: 'adp', ref: a.case.ref, decisionDate: a.decisionDate, mrNoticeDate: a.mrNoticeDate, timing: a.appealTimingNow, lateReason: null, summary: summary!, issues, located: locate(issues, null, {}), hasBundle: false });
  assert.match(grounds, /^Grounds of appeal: Adult Disability Payment/);
  assert.match(grounds, /against the re-determination notified on 5 January 2027/);

  const { checkAward, caseGain } = await import('../src/lib/casework.ts');
  assert.deepEqual(checkAward('adp', { daily_living: 'standard', mobility: 'standard' }), { daily_living: 'standard', mobility: 'standard' });
  assert.equal(caseGain({ benefit: 'adp', award_before: { daily_living: 'none', mobility: 'none' }, award_after: { daily_living: 'standard', mobility: 'standard' }, on: '2027-01-20' })!.gain, Math.round((76.70 + 30.30) * 52 * 100) / 100);
});
