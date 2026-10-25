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
