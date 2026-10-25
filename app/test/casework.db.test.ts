// Team casework: assigning, finding, outcomes, closing, and the agency report.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'TEST_DATABASE_URL not set';
let db: typeof import('../src/lib/db.ts');
let cases: typeof import('../src/lib/cases.ts');
let cw: typeof import('../src/lib/casework.ts');
const people: Record<string, any> = {};
let other: any;

before(async () => {
  if (!url) return;
  process.env.DATABASE_URL = url;
  db = await import('../src/lib/db.ts'); cases = await import('../src/lib/cases.ts'); cw = await import('../src/lib/casework.ts');
  const { migrate } = await import('../src/lib/migrate.ts');
  process.chdir(new URL('..', import.meta.url).pathname);
  await migrate();
  const ag = (await db.pool().query("insert into agencies (name) values ('Casework agency') returning id")).rows[0].id;
  for (const [k, role] of [['amy', 'adviser'], ['ben', 'adviser'], ['sue', 'supervisor']] as const) {
    const id = (await db.pool().query('insert into users (agency_id, entra_oid, name, role) values ($1, $2, $3, $4) returning id', [ag, `cw-${k}-${Date.now()}`, k, role])).rows[0].id;
    people[k] = { agencyId: ag, userId: id, role, name: k };
  }
  const ag2 = (await db.pool().query("insert into agencies (name) values ('Elsewhere') returning id")).rows[0].id;
  const id2 = (await db.pool().query("insert into users (agency_id, entra_oid, name, role) values ($1, $2, 'zed', 'admin') returning id", [ag2, `cw-zed-${Date.now()}`])).rows[0].id;
  other = { agencyId: ag2, userId: id2, role: 'admin', name: 'zed' };
});
after(async () => { if (url) await db.pool().end(); });

test('assigning: supervisors give cases to anyone in the agency; advisers can only take them', { skip }, async () => {
  const { amy, ben, sue } = people;
  const id = await cases.createCase(amy, `CW-A-${Date.now()}`, 'pip');
  await assert.rejects(cw.assignCase(amy, id, ben.userId), /Only a supervisor or admin/);
  await cw.assignCase(sue, id, ben.userId);
  assert.ok((await cw.findCases(ben, { mine: true })).some(c => c.id === id));
  assert.ok(!(await cw.findCases(amy, { mine: true })).some(c => c.id === id));
  await cw.assignCase(amy, id, amy.userId);                                       // taking it back
  assert.ok((await cw.findCases(amy, { mine: true })).some(c => c.id === id));
  await assert.rejects(cw.assignCase(sue, id, other.userId), /not in your agency/);
  await assert.rejects(cw.assignCase(other, id, other.userId), /Case not found/);  // another agency cannot reach it
});

test('finding cases by stage, benefit, adviser and reference', { skip }, async () => {
  const { amy, ben } = people;
  const tag = Date.now().toString(36).toUpperCase();
  const p = await cases.createCase(amy, `F-${tag}-PIP`, 'pip');
  const w = await cases.createCase(ben, `F-${tag}-WCA`, 'uc-wca');
  await db.asAgency(amy.agencyId, c => c.query("update cases set stage = 'appeal' where id = $1", [w]));
  const ids = (xs: Array<{ id: string }>) => xs.map(x => x.id).filter(x => x === p || x === w).sort();
  assert.deepEqual(ids(await cw.findCases(amy, { q: tag })), [p, w].sort());
  assert.deepEqual(ids(await cw.findCases(amy, { q: tag, benefit: 'uc-wca' })), [w]);
  assert.deepEqual(ids(await cw.findCases(amy, { q: tag, stage: 'appeal' })), [w]);
  assert.deepEqual(ids(await cw.findCases(amy, { q: tag, adviser: amy.userId })), [p]);
  assert.deepEqual(ids(await cw.findCases(amy, { q: '%' })), []);              // wildcards are literal
});

test('outcomes, closing and reopening, and the agency report', { skip }, async () => {
  const { amy, sue } = people;
  const a = await cases.createCase(amy, `R-${Date.now()}-1`, 'pip');
  const b = await cases.createCase(amy, `R-${Date.now()}-2`, 'uc-wca');
  await cw.saveOutcome(amy, a, { mrOutcome: 'unchanged', mrOutcomeDate: '2026-06-01', appealOutcome: 'allowed', appealOutcomeDate: '2026-09-01',
    before: { daily_living: 'none', mobility: 'none' }, after: { daily_living: 'standard', mobility: 'enhanced' } });
  await cw.saveOutcome(amy, b, { mrOutcome: 'revised', mrOutcomeDate: '2026-07-01', appealOutcome: null, appealOutcomeDate: null, before: { wca: 'none' }, after: { wca: 'lcwra' } });
  await assert.rejects(cw.saveOutcome(amy, a, { mrOutcome: 'won', mrOutcomeDate: null, appealOutcome: null, appealOutcomeDate: null, before: null, after: null }), /reconsideration result/);
  await assert.rejects(cw.saveOutcome(amy, a, { mrOutcome: null, mrOutcomeDate: null, appealOutcome: null, appealOutcomeDate: null, before: { daily_living: 'gold' }, after: null }), /rate/);
  await cw.closeCase(amy, a, 'outcome', '');
  await cw.closeCase(amy, b, 'outcome', 'LCWRA on MR');
  await assert.rejects(cw.closeCase(amy, a, 'outcome', ''), /already closed/);
  assert.ok(!(await cw.findCases(amy, { mine: true })).some(c => c.id === a));
  assert.ok((await cw.findCases(amy, { closed: true })).some(c => c.id === a));

  const today = new Date().toISOString().slice(0, 10);
  const r = await cw.agencyReport(sue, '2026-01-01', '2027-12-31', today);
  assert.ok(r.closed >= 2);
  assert.ok((r.appeal.allowed ?? 0) >= 1);
  assert.ok((r.mr.revised ?? 0) >= 1 && (r.mr.unchanged ?? 0) >= 1);
  assert.ok(r.awards.better >= 2);
  assert.ok(r.awards.pip.mobilityUp >= 1 && r.awards.wca.toLcwra >= 1);
  assert.equal(r.money.pip, Math.round((76.70 + 80.00) * 52 * 100) / 100);       // 2026-27 rates, from the appeal result date
  assert.equal(r.money.uc, 0);
  assert.equal(r.money.notValued, 1);                                               // LCWRA amount not recorded
  assert.deepEqual(r.money.years, ['2026-27']);
  const elsewhere = await cw.agencyReport(other, '2026-01-01', '2027-12-31', today);
  assert.equal(elsewhere.closed, 0);                                               // another agency's figures are its own

  await cw.reopenCase(amy, b);
  const back = (await cw.findCases(amy, { mine: true })).find(c => c.id === b)!;
  assert.equal(back.stage, 'claim');
});

test('award change: better, worse, mixed and unknown', { skip }, () => {
  assert.equal(cw.awardChange('pip', { daily_living: 'none', mobility: 'standard' }, { daily_living: 'standard', mobility: 'standard' }), 'better');
  assert.equal(cw.awardChange('pip', { daily_living: 'standard', mobility: 'none' }, { daily_living: 'none', mobility: 'enhanced' }), 'same');
  assert.equal(cw.awardChange('uc-wca', { wca: 'lcw' }, { wca: 'none' }), 'worse');
  assert.equal(cw.awardChange('uc-wca', null, { wca: 'lcw' }), null);
});

test('money: yearly value of one case at the rates for the year of its result', { skip }, () => {
  assert.deepEqual(cw.caseGain({ benefit: 'uc-wca', award_before: { wca: 'none' }, award_after: { wca: 'lcwra' }, uc_lcwra_rate: 'protected', on: '2026-07-01' }), { gain: 429.80 * 12, year: '2026-27' });
  assert.deepEqual(cw.caseGain({ benefit: 'uc-wca', award_before: { wca: 'none' }, award_after: { wca: 'lcwra' }, uc_lcwra_rate: 'standard', on: '2026-03-01' }), { gain: Math.round(423.27 * 12 * 100) / 100, year: '2025-26' });
  assert.deepEqual(cw.caseGain({ benefit: 'pip', award_before: { daily_living: 'enhanced', mobility: 'enhanced' }, award_after: { daily_living: 'standard', mobility: 'enhanced' }, on: '2026-07-01' }), { gain: Math.round((76.70 - 114.60) * 52 * 100) / 100, year: '2026-27' });
  assert.equal(cw.caseGain({ benefit: 'pip', award_before: null, award_after: { daily_living: 'standard' }, on: '2026-07-01' }), null);
});
