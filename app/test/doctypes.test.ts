import test from 'node:test';
import assert from 'node:assert/strict';
import { DOC_TYPES, docTypesFor, matchDocTypes } from '../src/lib/doctypes.ts';
import { DOC_KINDS } from '../src/lib/cases.ts';

test('every document type maps to a kind the platform knows, with unique ids', () => {
  assert.equal(new Set(DOC_TYPES.map(t => t.id)).size, DOC_TYPES.length);
  for (const t of DOC_TYPES) assert.ok(DOC_KINDS.includes(t.kind), t.id);
});

test('each step offers the forms for its benefit', () => {
  const pipPapers = docTypesFor('pip', ['pa4', 'decision', 'other']).map(t => t.id);
  assert.ok(pipPapers.includes('pa4') && pipPapers.includes('pip-decision'));
  assert.ok(!pipPapers.includes('uc85') && !pipPapers.includes('adp-consultation'));
  const adpPapers = docTypesFor('adp', ['pa4', 'decision']).map(t => t.id);
  assert.deepEqual(adpPapers.sort(), ['adp-consultation', 'adp-determination']);
  const wcaEvidence = docTypesFor('uc-wca', ['evidence', 'notes', 'other']).map(t => t.id);
  assert.ok(wcaEvidence.includes('uc50') && wcaEvidence.includes('gp-letter') && !wcaEvidence.includes('pip2'));
});

test('typing finds forms by number, name or other words', () => {
  const all = docTypesFor('pip', ['evidence', 'notes', 'pa4', 'decision', 'mr_notice', 'dwp_bundle', 'other']);
  assert.equal(matchDocTypes(all, 'pa4')[0].id, 'pa4');
  assert.equal(matchDocTypes(all, 'PIP2')[0].id, 'pip2');
  assert.ok(matchDocTypes(all, 'gp').some(t => t.id === 'gp-letter'));
  assert.ok(matchDocTypes(all, 'cpn').some(t => t.id === 'mental-health'));
  assert.ok(matchDocTypes(all, 'response bundle').some(t => t.id === 'dwp-response'));
  assert.equal(matchDocTypes(all, 'zzzz').length, 0);
});
