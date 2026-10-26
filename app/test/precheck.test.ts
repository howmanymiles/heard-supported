// The "is everything in?" step before the AI checks a claim: no AI, worked from the case.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { precheck } from '../src/lib/precheck.ts';

const doc = (doc_type: string | null, at: string, read = true, pages = 2, kind = 'evidence') =>
  ({ id: doc_type ?? 'x', name: 'n', kind, doc_type, content_type: 'application/pdf', size_bytes: 1, read_status: read ? 'read' : 'new', page_count: read ? pages : null, low_confidence_lines: 0, created_at: new Date(at) }) as any;

test('suggests what usually helps for what is claimed, and drops what is already uploaded', () => {
  const pc = precheck('pip', [doc('pip2', '2026-10-01'), doc('gp-letter', '2026-10-01')], { 'pip:12': 'e', 'pip:4': 'd' }, null);
  assert.equal(pc.claimForm.present, true);
  assert.ok(!pc.suggestions.some(s => s.docs.includes('GP letter or report')));    // a medical letter is in
  const mob = pc.suggestions.find(s => s.docs.includes('Physiotherapist report'))!;
  assert.match(mob.for.join(), /Moving around/);
  assert.ok(pc.suggestions.some(s => s.docs.includes('Occupational therapist report') && s.for.some(f => /Washing/.test(f))));
  assert.equal(pc.newDocs, 2); assert.equal(pc.pages, 4); assert.equal(pc.checkedBefore, false);
});

test('counts what is new since the last check, and says when nothing is', () => {
  const docs = [doc('pip2', '2026-10-01'), doc('physio', '2026-10-20', false), doc(null, '2026-10-02'), doc(null, '2026-10-02', true, 3, 'pa4')];
  const pc = precheck('pip', docs, {}, '2026-10-10');
  assert.equal(pc.newDocs, 1); assert.equal(pc.unread, 1); assert.equal(pc.untyped, 1); assert.equal(pc.pages, 4);  // DWP papers not counted
  assert.equal(pc.claimedCount, 0); assert.equal(pc.suggestions.length, 0);
  assert.equal(precheck('pip', docs.slice(0, 1), {}, '2026-10-10').nothingNew, true);
});

test('WCA: the UC50 and a fit note are looked for; mental health activities ask for mental health evidence', () => {
  const pc = precheck('uc-wca', [doc('gp-records', '2026-10-01')], { 'sch6:15': 'a' }, null);
  assert.equal(pc.claimForm.present, false);
  assert.ok(pc.suggestions.some(s => s.docs.includes('Fit note')));
  assert.ok(pc.suggestions.some(s => s.docs.includes('Daily living diary')));
  assert.ok(!pc.suggestions.some(s => s.docs.includes('Mental health team letter')));   // GP records satisfy that one
});
