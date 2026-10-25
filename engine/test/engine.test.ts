import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessPip, assessWca, InputError, type Dataset } from '../src/engine.ts';

const data: Dataset = JSON.parse(readFileSync(new URL('../data/descriptors.json', import.meta.url), 'utf8'));
const full = { safely: true, acceptableStandard: true, repeatedly: true, reasonableTime: true };
const codes = (flags: { code: string }[]) => flags.map(f => f.code);

// ---------- Dataset sanity ----------

test('dataset has 12 PIP activities and thresholds of 8 and 12', () => {
  const pip = data.benefits.find(b => b.id === 'pip')!;
  assert.equal(pip.activities.length, 12);
  assert.deepEqual(pip.thresholds!.daily_living, { ...pip.thresholds!.daily_living, standard: 8, enhanced: 12 });
});

// ---------- PIP reg 7 ----------

test('reg 7(1)(a): one descriptor over 50% of days applies', () => {
  const r = assessPip(data, [{ activity: 1, satisfied: [{ letter: 'e', daysPercent: 70 }], reliability: full }]);
  assert.equal(r.activities[0].descriptor?.letter, 'e');
  assert.equal(r.activities[0].points, 4);
  assert.deepEqual(r.activities[0].flags, []);
});

test('reg 7(1)(b): two descriptors over 50% — the higher scoring applies', () => {
  const r = assessPip(data, [{ activity: 1, satisfied: [{ letter: 'b', daysPercent: 90 }, { letter: 'e', daysPercent: 60 }], reliability: full }]);
  assert.equal(r.activities[0].descriptor?.letter, 'e');
});

test('reg 7(1)(c): none over 50% but scoring descriptors combine — the most frequent applies', () => {
  const r = assessPip(data, [{ activity: 1, satisfied: [{ letter: 'e', daysPercent: 30 }, { letter: 'b', daysPercent: 40 }], reliability: full }]);
  assert.equal(r.activities[0].descriptor?.letter, 'b');
  assert.equal(r.activities[0].points, 2);
});

test('reg 7(1)(c)(ii): equal proportions — the higher scoring applies', () => {
  const r = assessPip(data, [{ activity: 1, satisfied: [{ letter: 'b', daysPercent: 30 }, { letter: 'e', daysPercent: 30 }], reliability: full }]);
  assert.equal(r.activities[0].descriptor?.letter, 'e');
});

test('reg 7(1)(c): a 0-point descriptor does not count towards the combined 50%', () => {
  const r = assessPip(data, [{ activity: 1, satisfied: [{ letter: 'a', daysPercent: 40 }, { letter: 'e', daysPercent: 30 }], reliability: full }]);
  assert.equal(r.activities[0].descriptor, null);
  assert.equal(r.activities[0].points, 0);
  assert.ok(codes(r.activities[0].flags).includes('under_50_percent'));
});

test('missing frequency is treated as over 50% and flagged', () => {
  const r = assessPip(data, [{ activity: 1, satisfied: [{ letter: 'f' }], reliability: full }]);
  assert.equal(r.activities[0].points, 8);
  assert.ok(codes(r.activities[0].flags).includes('frequency_not_recorded'));
});

test('reg 4(2A): unaddressed reliability criteria are flagged by name', () => {
  const r = assessPip(data, [{ activity: 12, satisfied: [{ letter: 'b', daysPercent: 80 }], reliability: { safely: true } }]);
  const f = r.activities[0].flags.find(x => x.code === 'reliability_not_addressed')!;
  assert.match(f.message, /acceptable standard/);
  assert.match(f.message, /repeatedly/);
  assert.match(f.message, /reasonable time/);
  assert.doesNotMatch(f.message, /safely/);
});

// ---------- PIP thresholds ----------

test('daily living 8 points is standard rate, 12 is enhanced', () => {
  const eight = assessPip(data, [{ activity: 1, satisfied: [{ letter: 'f', daysPercent: 100 }], reliability: full }]);
  assert.deepEqual(eight.dailyLiving, { points: 8, rate: 'standard' });
  const twelve = assessPip(data, [
    { activity: 1, satisfied: [{ letter: 'f', daysPercent: 100 }], reliability: full },
    { activity: 4, satisfied: [{ letter: 'f', daysPercent: 100 }], reliability: full },
  ]);
  assert.deepEqual(twelve.dailyLiving, { points: 12, rate: 'enhanced' });
  const eleven = assessPip(data, [
    { activity: 1, satisfied: [{ letter: 'f', daysPercent: 100 }], reliability: full },
    { activity: 4, satisfied: [{ letter: 'e', daysPercent: 100 }], reliability: full },
  ]);
  assert.deepEqual(eleven.dailyLiving, { points: 11, rate: 'standard' });
});

test('6 points is below the standard rate', () => {
  const r = assessPip(data, [
    { activity: 1, satisfied: [{ letter: 'e', daysPercent: 100 }], reliability: full },
    { activity: 6, satisfied: [{ letter: 'b', daysPercent: 100 }], reliability: full },
  ]);
  assert.deepEqual(r.dailyLiving, { points: 6, rate: 'none' });
});

test('mobility 12 points (moving around 12e) is enhanced and kept separate from daily living', () => {
  const r = assessPip(data, [{ activity: 12, satisfied: [{ letter: 'e', daysPercent: 100 }], reliability: full }]);
  assert.deepEqual(r.mobility, { points: 12, rate: 'enhanced' });
  assert.deepEqual(r.dailyLiving, { points: 0, rate: 'none' });
});

test('undecided activities are listed', () => {
  const r = assessPip(data, [{ activity: 1, satisfied: [], reliability: full }]);
  assert.equal(r.undecided.length, 11);
  assert.ok(!r.undecided.includes(1));
});

test('PIP input errors are clear', () => {
  assert.throws(() => assessPip(data, [{ activity: 13, satisfied: [] }]), InputError);
  assert.throws(() => assessPip(data, [{ activity: 1, satisfied: [{ letter: 'z' }] }]), /no descriptor "z"/);
  assert.throws(() => assessPip(data, [{ activity: 1, satisfied: [{ letter: 'a', daysPercent: 120 }] }]), /between 0 and 100/);
  assert.throws(() => assessPip(data, [{ activity: 1, satisfied: [] }, { activity: 1, satisfied: [] }]), /twice/);
});

// ---------- WCA ----------

test('reg 39(5): only the highest descriptor per Schedule 6 activity counts', () => {
  const r = assessWca(data, { lcw: [{ activity: 1, letters: ['e', 'a'] }], lcwra: [] });
  assert.equal(r.lcw.activities[0].descriptor?.letter, 'a');
  assert.equal(r.lcw.totalPoints, 15);
});

test('reg 39(3): 15 points gives LCW; physical and mental combine', () => {
  const mobilising15 = assessWca(data, { lcw: [{ activity: 1, letters: ['a'] }], lcwra: [] });
  assert.equal(mobilising15.lcw.byAssessment, true);

  const sch6 = data.benefits.find(b => b.id === 'uc-wca')!.activities as Array<{ number: number; part: string; descriptors: { letter?: string; points?: number }[] }>;
  const pick = (part: string, pts: number) => {
    for (const a of sch6.filter(x => x.part === part)) {
      const d = a.descriptors.find(x => x.points === pts);
      if (d) return { activity: a.number, letters: [d.letter!] };
    }
    throw new Error(`no ${part} descriptor worth ${pts}`);
  };
  const combined = assessWca(data, { lcw: [pick('physical', 9), pick('mental', 6)], lcwra: [] });
  assert.equal(combined.lcw.physicalPoints, 9);
  assert.equal(combined.lcw.mentalPoints, 6);
  assert.equal(combined.lcw.byAssessment, true);

  const short = assessWca(data, { lcw: [pick('physical', 9)], lcwra: [] });
  assert.equal(short.lcw.byAssessment, false);
  assert.equal(short.lcw.result, false);
});

test('reg 40(2)(a): one Schedule 7 descriptor gives LCWRA, which includes LCW', () => {
  const r = assessWca(data, { lcw: [{ activity: 1, letters: ['a'] }], lcwra: ['1'] });
  assert.equal(r.lcwra.result, true);
  assert.equal(r.lcw.result, true);
  assert.ok(codes(r.flags).includes('majority_of_time'));
});

test('LCWRA without any LCW selection is flagged as incomplete', () => {
  const r = assessWca(data, { lcw: [], lcwra: ['15(a)'] });
  assert.equal(r.lcwra.result, true);
  assert.ok(codes(r.flags).includes('lcwra_without_lcw'));
});

test('reg 39(7): Schedule 8 para 4 (substantial risk) applies only if LCW is not met by assessment', () => {
  const notAssessed = assessWca(data, { lcw: [], lcwra: [], treatedAsLcw: [4] });
  assert.equal(notAssessed.lcw.treatedAs[0].applies, true);
  assert.equal(notAssessed.lcw.result, true);

  const assessed = assessWca(data, { lcw: [{ activity: 1, letters: ['a'] }], lcwra: [], treatedAsLcw: [4] });
  assert.equal(assessed.lcw.treatedAs[0].applies, false);
  assert.match(assessed.lcw.treatedAs[0].reason!, /39\(7\)/);
});

test('reg 40(6): Schedule 9 para 4 applies only if LCWRA is not met by assessment', () => {
  const r = assessWca(data, { lcw: [], lcwra: ['1'], treatedAsLcwra: [4] });
  assert.equal(r.lcwra.treatedAs[0].applies, false);
  const t = assessWca(data, { lcw: [], lcwra: [], treatedAsLcwra: [4] });
  assert.equal(t.lcwra.treatedAs[0].applies, true);
  assert.equal(t.lcwra.result, true);
});

test('Schedule 9 para 1 (terminal illness) is not limited by reg 40(6)', () => {
  const r = assessWca(data, { lcw: [], lcwra: ['1'], treatedAsLcwra: [1] });
  assert.equal(r.lcwra.treatedAs[0].applies, true);
});

test('WCA input errors are clear', () => {
  assert.throws(() => assessWca(data, { lcw: [{ activity: 18, letters: ['a'] }], lcwra: [] }), /no activity 18/);
  assert.throws(() => assessWca(data, { lcw: [{ activity: 1, letters: ['z'] }], lcwra: [] }), /no descriptor "z"/);
  assert.throws(() => assessWca(data, { lcw: [], lcwra: ['99'] }), /Schedule 7 has no descriptor/);
  assert.throws(() => assessWca(data, { lcw: [], lcwra: [], treatedAsLcw: [9] }), /no paragraph 9/);
});

test('results carry the dataset version they were worked from', () => {
  assert.match(assessPip(data, []).datasetVersion, /^pip-/);
  assert.match(assessWca(data, { lcw: [], lcwra: [] }).datasetVersion, /^uc-wca-/);
});

test('ADP: scored from its own descriptors, with ADP regulation references', () => {
  const adp = (data as any).benefits.find((b: any) => b.id === 'adp');
  assert.ok(adp, 'ADP is in the dataset');
  assert.equal(adp.activities.length, 12);
  assert.match(adp.activities.find((a: any) => a.number === 9).name, /Engaging socially/);
  assert.match(adp.activities.find((a: any) => a.number === 4).descriptors.find((d: any) => d.letter === 'e').text, /unadapted bath/);
  const r = assessPip(data as any, [{ activity: 1, satisfied: [{ letter: 'f' }] }, { activity: 4, satisfied: [{ letter: 'e', daysPercent: 40 }] }, { activity: 12, satisfied: [{ letter: 'e', daysPercent: 80 }] }], 'adp');
  assert.equal(r.datasetVersion, adp.version);
  assert.equal(r.dailyLiving.points, 8);
  assert.equal(r.dailyLiving.rate, 'standard');
  assert.equal(r.mobility.rate, 'enhanced');
  const flags = r.activities.flatMap(a => a.flags);
  assert.ok(flags.some(f => f.code === 'frequency_not_recorded' && f.ref === 'reg 10(1)'));
  assert.ok(flags.some(f => f.code === 'under_50_percent' && f.ref === 'reg 10(1)'));
  assert.ok(flags.every(f => f.code !== 'reliability_not_addressed' || f.ref === 'reg 7(2)(b)'));
});
