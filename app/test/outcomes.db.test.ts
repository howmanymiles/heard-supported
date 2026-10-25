// Successes and overturns: rates by stage, benefit and adviser, gains, time, disputed points, export.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL not set';
let db: typeof import('../src/lib/db.ts');
let cases: typeof import('../src/lib/cases.ts');
let cw: typeof import('../src/lib/casework.ts');
let oc: typeof import('../src/lib/outcomes.ts');
let of: typeof import('../src/lib/offices.ts');
let me: any, other: any;

before(async () => {
  if (!url) return;
  process.env.DATABASE_URL = url;
  db = await import('../src/lib/db.ts'); cases = await import('../src/lib/cases.ts'); cw = await import('../src/lib/casework.ts'); oc = await import('../src/lib/outcomes.ts'); of = await import('../src/lib/offices.ts');
  const { migrate } = await import('../src/lib/migrate.ts');
  process.chdir(new URL('..', import.meta.url).pathname);
  await migrate();
  for (const k of ['me', 'other']) {
    const ag = (await db.pool().query('insert into agencies (name) values ($1) returning id', [`Outcomes ${k}`])).rows[0].id;
    const u = (await db.pool().query("insert into users (agency_id, entra_oid, name, role) values ($1, $2, $3, 'adviser') returning id", [ag, `oc-${k}-${Date.now()}`, `Adviser ${k}`])).rows[0].id;
    const who = { agencyId: ag, userId: u, role: 'adviser', name: `Adviser ${k}` };
    if (k === 'me') me = who; else other = who;
  }
});
after(async () => { if (url) await db.pool().end(); });

const none = { mrOutcome: null, mrOutcomeDate: null, appealOutcome: null, appealOutcomeDate: null, before: null, after: null };

test('overturn rates, gains, time taken and disputed points', { skip }, async () => {
  const t = Date.now();
  const a = await cases.createCase(me, `OC-${t}-A`, 'pip');     // MR unchanged, appeal allowed
  const b = await cases.createCase(me, `OC-${t}-B`, 'uc-wca');  // MR revised to LCWRA
  const c = await cases.createCase(me, `OC-${t}-C`, 'pip');     // MR unchanged, appeal dismissed
  const d = await cases.createCase(me, `OC-${t}-D`, 'pip');     // appeal withdrawn: listed, not decided
  await db.asAgency(me.agencyId, x => x.query("update cases set mr_request_date = '2026-05-01', appeal_sent_date = '2026-06-15' where id = $1", [a]));
  await db.asAgency(me.agencyId, x => x.query("update cases set mr_request_date = '2026-06-01' where id = $1", [b]));
  await cw.saveOutcome(me, a, { ...none, mrOutcome: 'unchanged', mrOutcomeDate: '2026-06-01', appealOutcome: 'allowed', appealOutcomeDate: '2026-10-01',
    before: { daily_living: 'standard', mobility: 'none' }, after: { daily_living: 'enhanced', mobility: 'standard' } });
  await cw.saveOutcome(me, b, { ...none, mrOutcome: 'revised', mrOutcomeDate: '2026-07-11', before: { wca: 'none' }, after: { wca: 'lcwra' }, ucLcwraRate: 'standard' });
  await cw.saveOutcome(me, c, { ...none, mrOutcome: 'unchanged', mrOutcomeDate: '2026-06-20', appealOutcome: 'dismissed', appealOutcomeDate: '2026-09-01' });
  await cw.saveOutcome(me, d, { ...none, appealOutcome: 'withdrawn', appealOutcomeDate: '2026-09-02' });

  await oc.saveIssueResults(me, a, [{ key: 'pip:1', label: 'Preparing food', result: 'won', stage: 'appeal' }, { key: 'pip:4', label: 'Washing and bathing', result: 'lost', stage: 'appeal' }]);
  await oc.saveIssueResults(me, c, [{ key: 'pip:1', label: 'Preparing food', result: 'part', stage: 'appeal' }]);
  await assert.rejects(oc.saveIssueResults(me, c, [{ key: 'pip:1', label: 'x', result: 'maybe', stage: null }]), /won, won in part/);
  await assert.rejects(oc.saveIssueResults(other, c, []), /Case not found/);

  const { rows, issues } = await oc.outcomeData(me, '2026-04-01', '2027-03-31');
  const s = oc.summariseOutcomes(rows, issues, '2026-04-01', '2027-03-31');
  assert.deepEqual([s.mr.decided, s.mr.overturned, s.mr.rate], [3, 1, 33.3]);
  assert.deepEqual([s.appeal.decided, s.appeal.overturned, s.appeal.rate], [2, 1, 50]);
  assert.deepEqual([s.overall.decided, s.overall.overturned], [3, 2]);          // d is not decided
  assert.deepEqual(s.appealOther, { withdrawn: 1 });
  assert.deepEqual(s.byBenefit.pip.appeal, { decided: 2, overturned: 1, rate: 50 });
  assert.equal(s.byAdviser['Adviser me'].mr.decided, 3);
  assert.deepEqual([s.components.dailyLivingUp, s.components.dailyLivingToEnhanced, s.components.mobilityUp, s.components.toLcwra], [1, 1, 1, 1]);
  assert.equal(s.money.total, Math.round(((114.60 - 76.70 + 30.30) * 52 + 217.26 * 12) * 100) / 100);
  assert.deepEqual([s.days.mrMedian, s.days.appealMedian], [36, 108]);           // 31 and 40 days; 15 June to 1 October
  assert.deepEqual(s.byIssue['pip:1'], { label: 'Preparing food', benefit: 'pip', won: 1, part: 1, lost: 0, wonAtMr: 0, wonAtAppeal: 2 });
  assert.equal(s.byIssue['pip:4'].lost, 1);
  assert.equal(s.cases.find(x => x.id === a)!.stageWon, 'appeal');
  assert.equal(s.cases.find(x => x.id === b)!.stageWon, 'mr');

  const csv = oc.outcomesCsv(s.cases);
  assert.ok(csv.startsWith('Reference,Benefit,Office,Adviser'));
  assert.ok(csv.includes(`OC-${t}-B,UC WCA,,Adviser me,2026-06-01,Revised in full,2026-07-11,40,`));
  assert.ok(!csv.includes('Client'));
  assert.ok(oc.outcomesCsv(s.cases, true).startsWith('Reference,Client,'));
  assert.equal((await oc.outcomeData(other, '2026-04-01', '2027-03-31')).rows.length, 0);
});

test('CSV cells that look like formulas are made safe', { skip }, () => {
  const csv = oc.outcomesCsv([{ id: 'x', ref: '=HYPERLINK("x")', client: null, benefit: 'pip', adviser: '+bad', mr_request_date: null, mr_outcome: null, mr_outcome_date: null,
    appeal_sent_date: null, appeal_outcome: null, appeal_outcome_date: null, award_before: null, award_after: null, uc_lcwra_rate: null, lcw_legacy: false,
    stageWon: null, change: null, gain: null, gainYear: null, mrDays: null, appealDays: null }]);
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`) && csv.includes(`"'+bad"`));
});

test('offices: cases take the adviser’s office, move with open cases, and filter the figures', { skip }, async () => {
  const t = Date.now();
  const boss = { ...me, role: 'supervisor' };
  await assert.rejects(of.addOffice(me, 'Govan'), /supervisor or admin/);
  const govan = await of.addOffice(boss, `Govan ${t}`), pais = await of.addOffice(boss, `Paisley ${t}`);
  await assert.rejects(of.addOffice(boss, `Govan ${t}`), /already an office/);
  await of.setUserOffice(boss, me.userId, govan);
  const open = await cases.createCase(me, `OF-${t}-1`, 'pip'), done = await cases.createCase(me, `OF-${t}-2`, 'pip');
  await cw.saveOutcome(me, done, { ...none, mrOutcome: 'revised', mrOutcomeDate: '2026-08-01' });
  await cw.closeCase(me, done, 'outcome', '');
  const officeOf = async (id: string) => (await db.asAgency(me.agencyId, c => c.query('select office_id from cases where id = $1', [id]))).rows[0].office_id;
  assert.equal(await officeOf(open), govan);
  await of.setUserOffice(boss, me.userId, pais);                                 // the adviser moves
  assert.equal(await officeOf(open), pais);                                       // their open case goes with them
  assert.equal(await officeOf(done), govan);                                      // the closed result stays where it was won
  const g = (await oc.outcomeData(me, '2026-04-01', '2027-03-31', govan)).rows;
  assert.deepEqual(g.map(r => r.ref), [`OF-${t}-2`]);
  assert.equal(g[0].office, `Govan ${t}`);
  const { rows } = await oc.outcomeData(me, '2026-04-01', '2027-03-31');
  const { open: byOpen } = await oc.trendAndOfficeData(me, '2026-04-01', '2027-03-31');
  const figs = oc.byOffice(rows, byOpen, '2026-04-01', '2027-03-31');
  assert.deepEqual(figs.find(f => f.key === `Govan ${t}`)!.mr, { decided: 1, overturned: 1, rate: null });   // too few to give a rate
  assert.equal(figs.find(f => f.key === `Paisley ${t}`)!.open, 5);                    // all this adviser’s open cases, from the earlier test too
  await assert.rejects(of.setUserOffice({ ...other, role: 'admin' }, me.userId, null), /not in your agency/);
  assert.equal((await of.listOffices(other)).length, 0);
  await of.setUserOffice(boss, me.userId, null);
});
