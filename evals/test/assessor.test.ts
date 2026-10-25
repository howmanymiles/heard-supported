// The MR stage's guarantee, tested on every fictional PIP case: the
// decision maker's descriptors are worked out from the letter's own wording,
// and a model answer that misquotes or invents is caught.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { matchDescriptor, letterFromQuote, parseUkDate, resolveAssessor, splitTextPages, type RawAssessor } from '@hs/core';

const root = path.join(import.meta.dirname, '..', 'cases');
const pipCases = fs.readdirSync(root).filter(id => id.startsWith('PIP-') && fs.existsSync(path.join(root, id, 'mr.json')));

function load(id: string) {
  const dir = path.join(root, id);
  const mr = JSON.parse(fs.readFileSync(path.join(dir, 'mr.json'), 'utf8'));
  const pages = (doc: string) => splitTextPages(fs.readFileSync(path.join(dir, 'documents', `${doc}.md`), 'utf8'));
  const decision = pages('decision'), pa4 = pages('pa4');
  const pageOf = (ps: Array<{ page: number; text: string }>, q: string) => ps.find(p => p.text.includes(q))!.page;
  const rows = decision.flatMap(p => [...p.text.matchAll(/^\| (\d{1,2})\.? [^|]+\| ([^|]+?) \| \d+ \|$/gm)].map(m => ({ activity: Number(m[1]), wording: m[2].trim(), page: p.page })));
  const chosen = pa4.flatMap(p => [...p.text.matchAll(/Activity (\d+):[^\n]*\n+(Descriptor chosen: [a-h])/g)].map(m => ({ activity: Number(m[1]), quote: m[2], page: p.page })));
  const letterLine = decision.flatMap(p => p.text.split('\n').map(l => ({ l, page: p.page }))).find(x => parseUkDate(x.l))!;
  return { mr, decision, pa4, pageOf, rows, chosen, letterLine };
}

test('every fictional case has PA4 and decision papers to test against', () => {
  assert.ok(pipCases.length >= 4);
});

for (const id of pipCases) {
  test(`${id}: decision letter wording maps to the DWP's descriptor letters`, () => {
    const { mr, rows } = load(id);
    assert.equal(rows.length, 12);
    for (const r of rows) {
      const want = mr.pa4.activities.find((a: { activity: number }) => a.activity === r.activity).letter;
      assert.equal(matchDescriptor(r.activity, r.wording)?.letter, want, `activity ${r.activity}: "${r.wording}"`);
    }
  });

  test(`${id}: a faithful model answer resolves all 12 activities and the letter date`, () => {
    const { mr, rows, chosen, pa4, pageOf, letterLine } = load(id);
    const raw: RawAssessor = {
      decision_date: { doc: 'D1', page: letterLine.page, quote: letterLine.l.trim(), date: 'ignored' },
      activities: rows.map(r => {
        const j = mr.pa4.activities.find((a: { activity: number }) => a.activity === r.activity).justification_quote;
        const c = chosen.find(x => x.activity === r.activity)!;
        return { activity: r.activity, decision: { doc: 'D1', page: r.page, quote: r.wording }, pa4: { doc: 'D2', page: c.page, quote: c.quote }, justification: j ? { doc: 'D2', page: pageOf(pa4, j.quote), quote: j.quote } : null };
      }),
    };
    const pages = [...load(id).decision.map(p => ({ docId: 'dec', ...p })), ...pa4.map(p => ({ docId: 'pa4', ...p }))];
    const r = resolveAssessor(raw, pages, { D1: 'dec', D2: 'pa4' });
    assert.deepEqual(r.dropped, []);
    for (const a of r.activities) {
      const want = mr.pa4.activities.find((x: { activity: number }) => x.activity === a.activity).letter;
      assert.equal(a.letter, want, `activity ${a.activity}`);
      assert.equal(a.source, 'decision_letter');
      assert.equal(a.departs, undefined);
    }
    assert.equal(r.decisionDate?.date, parseUkDate(letterLine.l));
  });
}

test('misquotes are dropped, and the letter comes from the wording, not from what the model claims', () => {
  const { decision, pa4, rows, chosen } = load(pipCases[0]);
  const pages = [...decision.map(p => ({ docId: 'dec', ...p })), ...pa4.map(p => ({ docId: 'pa4', ...p }))];
  const r12 = rows.find(r => r.activity === 12)!;
  const c12 = chosen.find(c => c.activity === 12)!;
  const r = resolveAssessor({
    activities: [
      { activity: 12, decision: { doc: 'D1', page: r12.page, quote: 'Can stand and then move over 200 metres' }, pa4: { doc: 'D2', page: c12.page, quote: c12.quote, letter: 'f' } },
      { activity: 1, decision: { doc: 'D9', page: 1, quote: 'Can prepare and cook a simple meal unaided.' } },
    ],
  }, pages, { D1: 'dec', D2: 'pa4' });
  const a12 = r.activities.find(a => a.activity === 12)!;
  assert.equal(a12.decisionQuote, undefined);                 // paraphrase dropped
  assert.equal(a12.letter, letterFromQuote(12, c12.quote));    // from the PA4's words, not the model's "f"
  assert.notEqual(a12.letter, 'f');
  assert.equal(a12.source, 'pa4');
  assert.equal(r.activities.find(a => a.activity === 1)!.letter, null); // unknown document: left for the adviser
  assert.deepEqual(r.dropped.map(d => d.reason).sort(), ['not_verbatim', 'unknown_page']);
});

test('a decision maker departing from the PA4 is flagged', () => {
  const pages = [{ docId: 'dec', page: 1, text: 'Moving around: Can stand and then move more than 50 metres but no more than 200 metres, either aided or unaided.' }, { docId: 'pa4', page: 1, text: 'Activity 12: Moving around\nDescriptor chosen: a' }];
  const r = resolveAssessor({ activities: [{ activity: 12, decision: { doc: 'D1', page: 1, quote: 'Can stand and then move more than 50 metres but no more than 200 metres, either aided or unaided.' }, pa4: { doc: 'D2', page: 1, quote: 'Descriptor chosen: a' } }] }, pages, { D1: 'dec', D2: 'pa4' });
  const a = r.activities.find(x => x.activity === 12)!;
  assert.equal(a.letter, 'b');
  assert.deepEqual(a.departs, { pa4Letter: 'a', decisionLetter: 'b' });
});

test('dates are read in UK formats and impossible dates refused', () => {
  assert.equal(parseUkDate('Date of this letter: 7 December 2026'), '2026-12-07');
  assert.equal(parseUkDate('Dated 07/12/2026'), '2026-12-07');
  assert.equal(parseUkDate('3rd Sept 2026'), '2026-09-03');
  assert.equal(parseUkDate('31/02/2026'), null);
});
