// Trends by month and figures by area: pure functions, no database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthlyTrends, byArea, postcodeArea, areasCsv, SMALL } from '../src/lib/outcomes.ts';
import { postcodeDistrict } from '../src/lib/claimants.ts';

const row = (o: any) => ({ id: Math.random().toString(36), ref: 'R', client: null, district: null, benefit: 'pip', adviser: 'A', mr_request_date: null, mr_outcome: null, mr_outcome_date: null,
  appeal_sent_date: null, appeal_outcome: null, appeal_outcome_date: null, award_before: null, award_after: null, uc_lcwra_rate: null, lcw_legacy: false, ...o });

test('postcode: only the district is kept', () => {
  assert.equal(postcodeDistrict('g41 2ab'), 'G41');
  assert.equal(postcodeDistrict('EH12 9XY'), 'EH12');
  assert.equal(postcodeDistrict('SW1A1AA'), 'SW1A');
  assert.equal(postcodeDistrict('pa1'), 'PA1');
  assert.equal(postcodeDistrict(''), null);
  assert.throws(() => postcodeDistrict('Glasgow'), /UK postcode/);
  assert.equal(postcodeArea('EH12'), 'EH');
});

test('trends: results fall in the month of their date, with gaps for empty months', () => {
  const rows = [
    row({ mr_outcome: 'revised', mr_outcome_date: '2026-05-03', award_before: { daily_living: 'none' }, award_after: { daily_living: 'standard' } }),
    row({ mr_outcome: 'unchanged', mr_outcome_date: '2026-05-20', appeal_outcome: 'allowed', appeal_outcome_date: '2026-07-09', award_before: { mobility: 'none' }, award_after: { mobility: 'enhanced' } }),
    row({ appeal_outcome: 'withdrawn', appeal_outcome_date: '2026-07-10' }),
  ];
  const m = monthlyTrends(rows, { '2026-04': 2, '2026-06': 1 }, '2026-04-01', '2026-07-31');
  assert.deepEqual(m.map(x => x.month), ['2026-04', '2026-05', '2026-06', '2026-07']);
  assert.deepEqual(m.map(x => x.opened), [2, 0, 1, 0]);
  assert.deepEqual(m[1].mr, { decided: 2, overturned: 1, rate: 50 });
  assert.deepEqual(m[3].appeal, { decided: 1, overturned: 1, rate: 100 });   // the withdrawn appeal is not decided
  assert.equal(m[2].overall.rate, null);
  assert.equal(m[1].money, Math.round(76.70 * 52 * 100) / 100);
  assert.equal(m[3].money, 80.00 * 52);                                      // counted when the appeal won it, not at the MR
});

test('areas: by district or area, with rates hidden below the small-number floor', () => {
  const many = Array.from({ length: SMALL }, (_, i) => row({ district: i % 2 ? 'G41' : 'G42', mr_outcome: i < 3 ? 'revised' : 'unchanged', mr_outcome_date: '2026-06-01' }));
  const rows = [...many, row({ district: 'EH12', mr_outcome: 'revised', mr_outcome_date: '2026-06-01' }), row({ mr_outcome: 'unchanged', mr_outcome_date: '2026-06-01' })];
  const byD = byArea(rows, { G41: 3, '': 1 }, '2026-04-01', '2027-03-31');
  const g41 = byD.find(a => a.key === 'G41')!;
  assert.deepEqual([g41.open, g41.overall.decided, g41.overall.rate, g41.small], [3, 2, null, true]);
  assert.equal(byD.at(-1)!.key, 'Not recorded');
  assert.equal(byD.at(-1)!.open, 1);
  const byA = byArea(rows, {}, '2026-04-01', '2027-03-31', 'area');
  const g = byA.find(a => a.key === 'G')!;
  assert.deepEqual([g.overall.decided, g.overall.overturned, g.overall.rate], [SMALL, 3, 60]);
  assert.ok(areasCsv(byA, 'area').includes(`EH,0,1,1,1,0,0,1,fewer than ${SMALL} results,0`));
});
