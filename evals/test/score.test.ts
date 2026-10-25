import { test } from 'node:test';
import assert from 'node:assert/strict';
import { samePassage, scoreCase, type CaseFile } from '../score.ts';

test('overlapping or contained quotes count as the same passage', () => {
  assert.ok(samePassage('about 100 metres, then has to stop', 'Walks to the corner shop, about 100 metres, then has to stop because of knee pain.'));
  assert.ok(samePassage('then has to stop because of knee pain', 'about 100 metres then has to stop because of pain'));
  assert.ok(!samePassage('uses a stick outdoors', 'cannot prepare a hot meal'));
});

const c: CaseFile = {
  id: 'T', benefit: 'pip',
  activities: [
    { key: 'pip:12', evidence_status: 'good', must_find: [{ doc: 'notes', page: 1, quote: 'about 100 metres, then has to stop' }], gaps: ['Distance on bad days'] },
    { key: 'pip:1', evidence_status: 'partial', must_find: [{ doc: 'form', page: 2, quote: 'I cannot lift a pan' }], gaps: [] },
    { key: 'pip:3', evidence_status: 'nodiff', must_find: [], gaps: [] },
  ],
};

test('scores recall, wrong-activity hits, noise and gaps', () => {
  const s = scoreCase(c, d => d, [
    { doc: 'D1', docId: 'notes', page: 1, quote: 'Walks to the corner shop, about 100 metres, then has to stop', activities: ['pip:12'] },
    { doc: 'D2', docId: 'form', page: 2, quote: 'I cannot lift a pan of water', activities: ['pip:4'] },
    { doc: 'D2', docId: 'form', page: 1, quote: 'takes tablets with water', activities: ['pip:3'] },
  ], 1, [{ activity: 'pip:12', gap: 'bad days?' }]);
  assert.equal(s.mustFind, 2);
  assert.equal(s.found, 1);
  assert.equal(s.foundWrongActivity, 1);
  assert.deepEqual(s.misses[0].foundUnder, ['pip:4']);
  assert.equal(s.noise, 1);
  assert.equal(s.dropRate, 0.25);
  assert.deepEqual(s.gapActivities, { expected: 1, raised: 1 });
});

test('MR scoring: a wrong descriptor counts against, a missing one is left for the adviser', async () => {
  const { scoreAssessor } = await import('../score.ts');
  const mr = { pa4: { activities: [
    { activity: 1, letter: 'a', justification_quote: { page: 3, quote: 'cooks the evening meal most nights' } },
    { activity: 2, letter: 'a' }, { activity: 3, letter: 'b' },
  ] } };
  const s = scoreAssessor(mr, {
    activities: [
      { activity: 1, letter: 'a', source: 'decision_letter', justification: { doc: 'D2', page: 3, quote: 'The claimant cooks the evening meal most nights', docId: 'pa4' } },
      { activity: 2, letter: 'c', source: 'pa4' },
      { activity: 3, letter: null, source: null },
    ],
    decisionDate: { date: '2026-12-07', cite: { doc: 'D1', page: 1, quote: 'x', docId: 'dec' } },
    dropped: [],
  }, '2026-12-07', 'pa4');
  assert.deepEqual([s.lettersCorrect, s.lettersWrong, s.lettersMissing, s.justificationsFound, s.dateCorrect], [1, 1, 1, 1, true]);
});
