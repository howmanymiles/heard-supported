import { test } from 'node:test';
import assert from 'node:assert/strict';
import { score, descriptorsFor } from '../src/lib/score.ts';

test('PIP decisions are worked through reg 7 and the 8/12 thresholds', () => {
  const r = score('pip', [
    { activity: 'pip:12', satisfied: [{ letter: 'd', daysPercent: 71 }], days_per_week: '5' },   // 10 points
    { activity: 'pip:11', satisfied: [{ letter: 'b', daysPercent: 43 }], days_per_week: '3' },   // under half the days
    { activity: 'pip:1', satisfied: [], days_per_week: null },
  ]);
  assert.equal(r.kind, 'pip');
  const res = r.result as any;
  assert.equal(res.mobility.points, 10);
  assert.equal(res.mobility.rate, 'standard');
  assert.equal(res.dailyLiving.points, 0);
});

test('WCA decisions give LCW from Schedule 6 points and LCWRA from Schedule 7', () => {
  const r = score('uc-wca', [
    { activity: 'sch6:1', satisfied: [{ letter: 'a' }], days_per_week: null },
    { activity: 'sch7:1', satisfied: ['1'], days_per_week: null },
  ]);
  assert.equal(r.kind, 'wca');
  const res = r.result as any;
  assert.equal(res.lcw.totalPoints, 15);
  assert.equal(res.lcw.result, true);
  assert.equal(res.lcwra.result, true);
});

test('descriptor options come from the dataset for each scheme', () => {
  assert.equal(descriptorsFor('pip:12').length, 6);
  assert.equal(descriptorsFor('pip:12')[5].points, 12);
  assert.ok(descriptorsFor('sch6:1').length >= 5);
  assert.ok(descriptorsFor('sch7:1').length >= 1);
});
