import test from 'node:test';
import assert from 'node:assert/strict';
import { lawFor, assessPip, type Dataset } from '../src/index.ts';
import current from '../data/descriptors.json' with { type: 'json' };

const cur = current as unknown as Dataset;
// A made-up earlier PIP version in which daily living activity 1 descriptor (e) scores 2 points, not 4.
const oldPip = structuredClone(cur.benefits.find(b => b.id === 'pip')!);
oldPip.version = 'pip-test-old'; oldPip.in_force_from = '2013-04-08'; oldPip.in_force_to = '2017-03-15';
const d1e = (oldPip.activities.find((a: any) => a.number === 1) as any).descriptors.find((d: any) => d.letter === 'e');
d1e.points = 2;
const sources = { current: cur, history: { benefits: [oldPip] } };

test('every benefit says when its current text came into force', () => {
  for (const b of cur.benefits) assert.match(b.in_force_from ?? '', /^\d{4}-\d{2}-\d{2}$/, b.id);
});

test('a case is worked under the law in force on its decision date', () => {
  const before = lawFor('pip', '2016-06-01', sources), after = lawFor('pip', '2018-01-10', sources), none = lawFor('pip', null, sources);
  assert.equal(before.version, 'pip-test-old'); assert.equal(before.current, false); assert.equal(before.covered, true);
  assert.equal(after.current, true); assert.equal(none.current, true);
  const inputs = [{ activity: 1, satisfied: [{ letter: 'e', daysPercent: 100 }], reliability: { safely: true, acceptableStandard: true, repeatedly: true, reasonableTime: true } }];
  const pts = (law: ReturnType<typeof lawFor>) => assessPip(law.data, inputs, 'pip').dailyLiving.points;
  assert.equal(pts(before), 2); assert.equal(pts(after), 4);
  // Other benefits are untouched.
  assert.equal(before.data.benefits.find(b => b.id === 'uc-wca'), cur.benefits.find(b => b.id === 'uc-wca'));
});

test('a date before the earliest text held is flagged, not silently treated as covered', () => {
  const law = lawFor('adp', '2021-06-01');
  assert.equal(law.covered, false);
  assert.equal(law.current, true);
  assert.equal(lawFor('adp', '2026-05-01').covered, true);
});
