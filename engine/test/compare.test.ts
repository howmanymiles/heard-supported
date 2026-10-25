import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { comparePip } from '../src/compare.ts';
import { InputError, type Dataset } from '../src/engine.ts';

const data: Dataset = JSON.parse(readFileSync(new URL('../data/descriptors.json', import.meta.url), 'utf8'));
const allA = (over: Record<number, string> = {}) =>
  Array.from({ length: 12 }, (_, i) => ({ activity: i + 1, letter: over[i + 1] ?? 'a' }));
const full = { safely: true, acceptableStandard: true, repeatedly: true, reasonableTime: true };
const pos = (n: number, letter: string, daysPercent = 100) => ({ activity: n, satisfied: [{ letter, daysPercent }], reliability: full });
const ev = { doc: 'physio', page: 2, quote: 'Stopped at 18 metres.' };

test('a challenge that lifts mobility from no award to enhanced', () => {
  const r = comparePip(data, allA({ 12: 'b' }), [pos(12, 'e')], { 12: [ev] });
  const m = r.activities.find(a => a.activity === 12)!;
  assert.equal(m.status, 'challenge');
  assert.equal(m.difference, 8);
  assert.deepEqual(r.mobility.assessor, { points: 4, rate: 'none' });
  assert.deepEqual(r.mobility.adviser, { points: 12, rate: 'enhanced' });
  assert.equal(r.mobility.rateChanges, true);
  assert.equal(r.challenges[0].activity, 12);
  assert.deepEqual(r.challenges[0].evidence, [ev]);
});

test('challenges are ordered by points gained', () => {
  const r = comparePip(data, allA(), [pos(1, 'b'), pos(4, 'f'), pos(9, 'c')]);
  assert.deepEqual(r.challenges.map(c => c.activity), [4, 9, 1]);
});

test('undecided activities keep the assessor points and are warned about', () => {
  const r = comparePip(data, allA({ 1: 'e' }), [pos(4, 'f')]);
  const one = r.activities.find(a => a.activity === 1)!;
  assert.equal(one.status, 'adviser_undecided');
  assert.equal(one.adviserPoints, 4);
  assert.equal(r.dailyLiving.adviser.points, 8);
  assert.ok(r.warnings.some(w => w.code === 'adviser_position_incomplete'));
});

test('agreeing with a 0-point descriptor is agreement, not undecided', () => {
  const r = comparePip(data, allA(), [pos(7, 'a')]);
  assert.equal(r.activities.find(a => a.activity === 7)!.status, 'agree');
});

test('an adviser position below the assessor warns that the award could go down', () => {
  const r = comparePip(data, allA({ 1: 'e' }), [pos(1, 'b')]);
  assert.equal(r.activities.find(a => a.activity === 1)!.status, 'adviser_lower');
  assert.ok(r.warnings.some(w => w.code === 'award_could_go_down'));
});

test('reg 7: an adviser descriptor under 50% of days scores 0', () => {
  const r = comparePip(data, allA({ 1: 'b' }), [pos(1, 'e', 30)]);
  const one = r.activities.find(a => a.activity === 1)!;
  assert.equal(one.adviserPoints, 0);
  assert.equal(one.status, 'adviser_lower');
});

test('challenges with no evidence attached are flagged', () => {
  const r = comparePip(data, allA(), [pos(12, 'd')]);
  assert.ok(r.warnings.some(w => w.code === 'challenge_without_evidence'));
});

test('points to the next rate are reported for the adviser position', () => {
  const r = comparePip(data, allA(), [pos(1, 'f')]);
  assert.equal(r.dailyLiving.adviser.points, 8);
  assert.equal(r.dailyLiving.pointsToNextRate, 4);
  assert.equal(r.mobility.pointsToNextRate, 8);
});

test('the assessor position must cover all 12 activities once', () => {
  assert.throws(() => comparePip(data, allA().slice(0, 11), []), InputError);
  assert.throws(() => comparePip(data, allA({ 3: 'z' }), []), /no descriptor "z"/);
});
