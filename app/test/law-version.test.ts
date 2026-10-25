import test from 'node:test';
import assert from 'node:assert/strict';
import { lawForCase, score } from '../src/lib/score.ts';

test('a case is worked under the law in force on its decision date', () => {
  assert.equal(lawForCase('pip', '2025-06-01').current, true);
  assert.equal(lawForCase('pip', new Date('2025-06-01')).covered, true);
  // ADP text we hold applies from 21 March 2022, when ADP began; anything earlier is flagged.
  assert.equal(lawForCase('adp', '2021-12-01').covered, false);
  assert.equal(lawForCase('adp', '2025-12-01').covered, true);
  assert.equal(lawForCase('adp', null).covered, true);
  const r = score('pip', [{ activity: 'pip:1', satisfied: [{ letter: 'e', daysPercent: 100 }], days_per_week: null }], '2025-06-01');
  assert.equal(r.kind, 'pip');
});
