// The WCA reconsideration reader, tested on the fictional UC85 (WCA-01) and
// UC85A (WCA-02): descriptors, Schedule 7, substantial risk and the award are
// read from the report's and notice's own words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveWcaAssessor, wcaLetterFromQuote, sch7FromQuote, classifyRisk, classifyOutcome, splitTextPages, type RawWcaAssessor } from '@hs/core';

const root = path.join(import.meta.dirname, '..', 'cases');
const wcaCases = ['WCA-01', 'WCA-02'];

function faithful(id: string) {
  const dir = path.join(root, id);
  const mr = JSON.parse(fs.readFileSync(path.join(dir, 'mr.json'), 'utf8'));
  const rep = splitTextPages(fs.readFileSync(path.join(dir, 'documents', `${mr.report.doc}.md`), 'utf8'));
  const dec = splitTextPages(fs.readFileSync(path.join(dir, 'documents', 'decision.md'), 'utf8'));
  const find = (ps: Array<{ page: number; text: string }>, re: RegExp) => { for (const p of ps) { const m = p.text.match(re); if (m) return { page: p.page, m }; } return null; };
  const sch6 = Array.from({ length: 17 }, (_, i) => i + 1).map(n => {
    const c = find(rep, new RegExp(`Activity ${n}:[^\\n]*\\n(Descriptor[^\\n]*)\\n(?:Justification|Reasoning): ([^.]+\\.)`))!;
    return { activity: n, chosen: { doc: 'D2', page: c.page, quote: c.m[1] }, justification: { doc: 'D2', page: c.page, quote: c.m[2] } };
  });
  const s7 = find(rep, /^(No(?:ne of the)? Schedule 7 descriptors? appl[^\n]*)$/m)!;
  const r8 = find(rep, /^(Schedule 8 paragraph 4[^\n]*)\n(?:Justification|Reasoning): ([^.]+\.)/m)!;
  const r9 = find(rep, /^(Schedule 9 paragraph 4[^\n]*)\n(?:Justification|Reasoning): ([^.]+\.)/m)!;
  const dd = find(dec, /^(Date of this notice: [^\n]+)$/m)!;
  const oc = find(dec, /(We have decided that you[^.]+\.)/)!;
  const raw: RawWcaAssessor = {
    decision_date: { doc: 'D1', page: dd.page, quote: dd.m[1] },
    outcome: { doc: 'D1', page: oc.page, quote: oc.m[1] },
    sch6,
    sch7: [{ doc: 'D2', page: s7.page, quote: s7.m[1] }],
    sch8_4: { applies: false, finding: { doc: 'D2', page: r8.page, quote: r8.m[1] }, justification: { doc: 'D2', page: r8.page, quote: r8.m[2] } },
    sch9_4: { applies: false, finding: { doc: 'D2', page: r9.page, quote: r9.m[1] }, justification: { doc: 'D2', page: r9.page, quote: r9.m[2] } },
  };
  const pages = [...dec.map(p => ({ docId: 'dec', ...p })), ...rep.map(p => ({ docId: 'rep', ...p }))];
  return { mr, raw, pages };
}

for (const id of wcaCases) {
  test(`${id}: a faithful answer resolves all 17 descriptors, Schedule 7, both risk findings, date and award`, () => {
    const { mr, raw, pages } = faithful(id);
    const r = resolveWcaAssessor(raw, pages, { D1: 'dec', D2: 'rep' });
    assert.deepEqual(r.dropped, []);
    for (const want of mr.report.sch6) assert.equal(r.sch6.find(a => a.activity === want.activity)!.letter, want.letter, `activity ${want.activity}`);
    assert.deepEqual(r.sch7.ids, mr.report.sch7);
    assert.equal(r.sch8_4.value, mr.report.sch8_4);
    assert.equal(r.sch9_4.value, mr.report.sch9_4);
    assert.equal(r.decisionDate?.date, mr.decision.date);
    assert.equal(r.outcome.value, mr.decision.outcome);
  });
}

test('the report’s descriptor references are read in UC85 and UC85A styles, and conflicts refused', () => {
  assert.equal(wcaLetterFromQuote(1, 'Descriptor chosen: 1(e) None of the above applies.'), 'e');
  assert.equal(wcaLetterFromQuote(13, 'Descriptor: 13(d). None of the above applies.'), 'd');
  assert.equal(wcaLetterFromQuote(10, 'Descriptor: 10(c). Neither of the above applies.'), 'c');
  assert.equal(wcaLetterFromQuote(1, 'Descriptor: 11(d). None of the above applies.'), null);       // another activity's reference
  assert.equal(wcaLetterFromQuote(16, 'Descriptor: 16(d). Engagement in social contact with someone unfamiliar to the claimant is not possible for the majority of the time due to difficulty relating to others or significant distress experienced by the claimant.'), null); // says d, words say c
});

test('Schedule 7, risk findings and the award are read from the words', () => {
  assert.deepEqual(sch7FromQuote('None of the Schedule 7 descriptors apply.'), []);
  assert.deepEqual(sch7FromQuote('Descriptor 15(b) applies.'), ['15(b)']);
  assert.equal(sch7FromQuote('See reasoning above.'), null);
  assert.equal(classifyRisk('Schedule 8 paragraph 4: Does not apply.'), 'not_applies');
  assert.equal(classifyRisk('Schedule 9 paragraph 4: Applies.'), 'applies');
  assert.equal(classifyRisk('Schedule 9 paragraph 4: see above'), null);
  assert.equal(classifyOutcome('We have decided that you do not have limited capability for work.'), 'none');
  assert.equal(classifyOutcome('We have decided that you have limited capability for work and work-related activity.'), 'lcwra');
  assert.equal(classifyOutcome('We have decided that you have limited capability for work-related activity.'), 'lcwra');
  assert.equal(classifyOutcome('You have limited capability for work but not for work-related activity.'), 'lcw');
});

test('a model claiming a risk finding the words do not say is caught', () => {
  const { raw, pages } = faithful('WCA-02');
  const r = resolveWcaAssessor({ ...raw, sch9_4: { ...raw.sch9_4!, applies: true } }, pages, { D1: 'dec', D2: 'rep' });
  assert.equal(r.sch9_4.value, null);
  assert.deepEqual(r.dropped.map(d => d.reason), ['not_readable']);
});
