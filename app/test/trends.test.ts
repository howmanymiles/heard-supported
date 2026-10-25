// Trends by month and figures by area: pure functions, no database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthlyTrends, byOffice, officesCsv, SMALL, NO_OFFICE } from '../src/lib/outcomes.ts';

const row = (o: any) => ({ id: Math.random().toString(36), ref: 'R', client: null, office: null, benefit: 'pip', adviser: 'A', mr_request_date: null, mr_outcome: null, mr_outcome_date: null,
  appeal_sent_date: null, appeal_outcome: null, appeal_outcome_date: null, award_before: null, award_after: null, uc_lcwra_rate: null, lcw_legacy: false, ...o });

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

test('offices: rates hidden below the small-number floor; cases with no office kept', () => {
  const many = Array.from({ length: SMALL }, (_, i) => row({ office: 'Govan', mr_outcome: i < 3 ? 'revised' : 'unchanged', mr_outcome_date: '2026-06-01' }));
  const rows = [...many, row({ office: 'Paisley', mr_outcome: 'revised', mr_outcome_date: '2026-06-01' }), row({ mr_outcome: 'unchanged', mr_outcome_date: '2026-06-01' })];
  const f = byOffice(rows, { Govan: 3, '': 1 }, '2026-04-01', '2027-03-31');
  assert.deepEqual(f.map(x => x.key), ['Govan', 'Paisley', NO_OFFICE]);
  assert.deepEqual([f[0].open, f[0].overall.decided, f[0].overall.overturned, f[0].overall.rate], [3, SMALL, 3, 60]);
  assert.equal(f[1].overall.rate, null);
  assert.equal(f[2].open, 1);
  assert.ok(officesCsv(f).includes(`Paisley,0,1,1,1,0,0,1,fewer than ${SMALL} results,0`));
});
