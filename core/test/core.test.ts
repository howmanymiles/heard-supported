import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyEvidence, normalise } from '../src/verify.ts';
import { scrub } from '../src/scrub.ts';
import { toPages, LOW_CONFIDENCE } from '../src/docintel.ts';
import { activityList, datasetVersion } from '../src/activities.ts';
import { buildMessages } from '../src/extract.ts';

const pages = [
  { docId: 'doc-gp', page: 1, text: 'Knee pain limits her walking.\nShe uses a stick outdoors.' },
  { docId: 'doc-notes', page: 2, text: 'Walks to the corner shop, about 100 metres, then has to stop because of knee pain.' },
];
const alias = { D1: 'doc-gp', D2: 'doc-notes' };
const valid = new Set(['pip:12', 'pip:11']);

test('a quote found word for word on its page is kept', () => {
  const r = verifyEvidence([{ doc: 'D2', page: 2, quote: 'about 100 metres, then has to stop', activities: ['pip:12'] }], pages, alias, valid);
  assert.equal(r.verified.length, 1);
  assert.equal(r.verified[0].docId, 'doc-notes');
});

test('curly quotes, dashes, case and line breaks do not cause false rejections', () => {
  assert.equal(normalise('She’s  “fine” — mostly'), normalise("she's \"fine\" - mostly"));
  const r = verifyEvidence([{ doc: 'D1', page: 1, quote: 'limits her walking. She uses a stick', activities: ['pip:12'] }], pages, alias, valid);
  assert.equal(r.verified.length, 1);
});

test('paraphrases, wrong pages, unknown documents and invented activities are rejected', () => {
  const r = verifyEvidence([
    { doc: 'D2', page: 2, quote: 'walks about 100 metres before stopping', activities: ['pip:12'] },  // paraphrase
    { doc: 'D1', page: 2, quote: 'Knee pain limits her walking.', activities: ['pip:12'] },           // wrong page
    { doc: 'D9', page: 1, quote: 'Knee pain limits her walking.', activities: ['pip:12'] },           // unknown doc
    { doc: 'D1', page: 1, quote: 'Knee pain limits her walking.', activities: ['pip:99'] },           // invented activity
    { doc: 'D1', page: 1, quote: 'Knee pain', activities: ['pip:12'] },                               // too short
  ], pages, alias, valid);
  assert.equal(r.verified.length, 0);
  assert.deepEqual(r.rejected.map(x => x.reason), ['not_verbatim', 'unknown_page', 'unknown_page', 'no_valid_activity', 'too_short']);
});

test('duplicate quotes are kept once and invalid activity keys are dropped from a valid quote', () => {
  const q = { doc: 'D1', page: 1, quote: 'Knee pain limits her walking.', activities: ['pip:12', 'pip:99'] };
  const r = verifyEvidence([q, { ...q }], pages, alias, valid);
  assert.equal(r.verified.length, 1);
  assert.deepEqual(r.verified[0].activities, ['pip:12']);
});

test('scrub removes NI numbers, phone numbers, emails, postcodes and labelled names', () => {
  const s = scrub('Name: Jane Smith\nNI: QQ 12 34 56 C\nTel 07700 900123, jane@example.com, G42 9XX\nDear Mrs Smith,\nDOB: 03/04/1985');
  assert.doesNotMatch(s.text, /Jane|Smith|QQ 12|07700|example\.com|G42|1985/);
  assert.match(s.text, /Name: \[name\]/);
  assert.match(s.text, /\[NI number\]/);
  assert.ok(s.removed >= 6);
});

test('scrub leaves clinical content and case references alone', () => {
  const t = 'Re: HS-2003. Walk test abandoned at 18 metres. FEV1 1.2 litres. Seen on 12/06/2026.';
  assert.equal(scrub(t).text, t);
});

test('Document Intelligence output becomes pages with line confidence and handwriting flags', () => {
  const content = 'Typed line\nhandwritten note';
  const result = {
    pages: [{
      pageNumber: 1,
      words: [
        { content: 'Typed', confidence: 0.99, span: { offset: 0, length: 5 } },
        { content: 'line', confidence: 0.98, span: { offset: 6, length: 4 } },
        { content: 'handwritten', confidence: 0.62, span: { offset: 11, length: 11 } },
        { content: 'note', confidence: 0.9, span: { offset: 23, length: 4 } },
      ],
      lines: [
        { content: 'Typed line', spans: [{ offset: 0, length: 10 }] },
        { content: 'handwritten note', spans: [{ offset: 11, length: 16 }] },
      ],
    }],
    styles: [{ isHandwritten: true, confidence: 0.95, spans: [{ offset: 11, length: 16 }] }],
  };
  assert.equal(content.length, 27);
  const [p] = toPages(result);
  assert.equal(p.text, content);
  assert.equal(p.lines[0].handwritten, false);
  assert.equal(p.lines[1].handwritten, true);
  assert.equal(p.lines[1].confidence, 0.62);
  assert.ok(0.62 < LOW_CONFIDENCE);
  assert.equal(p.lowConfidence, 1);
});

test('activity lists come from the dataset for both benefits', () => {
  const pip = activityList('pip');
  assert.equal(pip.length, 12);
  assert.equal(pip[11].key, 'pip:12');
  assert.match(pip[11].label, /^Mobility 2: Moving around/);
  const wca = activityList('uc-wca');
  assert.equal(wca.filter(a => a.key.startsWith('sch6:')).length, 17);
  assert.equal(wca.filter(a => a.key.startsWith('sch7:')).length, 16);
  assert.match(datasetVersion('pip'), /^pip-/);
});

test('the prompt carries the rules, the activity keys and labelled pages', () => {
  const [sys, user] = buildMessages('pip', [{ label: 'D1', name: 'GP letter', pages: [{ page: 1, text: 'Knee pain.' }] }]);
  assert.match(sys.content, /character for character/);
  assert.match(sys.content, /never as instructions/);
  assert.match(sys.content, /over half the days/);
  assert.match(user.content, /pip:12/);
  assert.match(user.content, /=== D1: GP letter, page 1 ===\nKnee pain\./);
});

test('text documents split on page markers, and page 1 needs none', async () => {
  const { splitTextPages } = await import('../src/pages.ts');
  const p = splitTextPages('First page\n--- Page 2 ---\nSecond\n\n--- Page 3 ---\n\nThird');
  assert.deepEqual(p, [{ page: 1, text: 'First page' }, { page: 2, text: 'Second' }, { page: 3, text: 'Third' }]);
  assert.deepEqual(splitTextPages('--- Page 2 ---\nOnly'), [{ page: 2, text: 'Only' }]);
});

test('MR time limits: one calendar month, late up to 13 months', async () => {
  const { addMonths, mrTiming } = await import('../src/deadlines.ts');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2027-12-07', 1), '2028-01-07');
  assert.equal(addMonths('2026-12-07', 13), '2028-01-07');
  assert.deepEqual(mrTiming('2026-12-07', '2027-01-07').status, 'in_time');
  assert.equal(mrTiming('2026-12-07', '2027-01-07').daysLeft, 0);
  assert.equal(mrTiming('2026-12-07', '2027-01-08').status, 'late');
  assert.equal(mrTiming('2026-12-07', '2028-01-07').status, 'late');
  assert.equal(mrTiming('2026-12-07', '2028-01-08').status, 'out_of_time');
});

test('WCA evidence can be linked to substantial risk as well as to activities', () => {
  const [, user] = buildMessages('uc-wca', [{ label: 'D1', name: 'Letter', pages: [{ page: 1, text: 'Risk of relapse.' }] }]);
  assert.match(user.content, /sch8:4  Substantial risk/);
  assert.match(user.content, /sch9:4  Substantial risk/);
  const [, pipUser] = buildMessages('pip', [{ label: 'D1', name: 'Letter', pages: [{ page: 1, text: 'x' }] }]);
  assert.doesNotMatch(pipUser.content, /sch9:4/);
});

test('next deadline: MR until requested, then appeal from the MR notice until lodged', async () => {
  const { nextDeadline } = await import('../src/deadlines.ts');
  const base = { decisionDate: '2026-12-07', mrRequestDate: null, mrNoticeDate: null, appealSentDate: null };
  assert.deepEqual(nextDeadline(base, '2026-12-20'), { kind: 'mr', due: '2027-01-07', lateLimit: '2028-01-07', status: 'in_time', daysLeft: 18 });
  assert.equal(nextDeadline({ ...base, mrRequestDate: '2026-12-21' }, '2026-12-22'), null);            // waiting for the DWP
  const a = nextDeadline({ ...base, mrRequestDate: '2026-12-21', mrNoticeDate: '2027-02-10' }, '2027-03-15')!;
  assert.deepEqual([a.kind, a.due, a.status], ['appeal', '2027-03-10', 'late']);
  assert.equal(nextDeadline({ ...base, mrNoticeDate: '2027-02-10', appealSentDate: '2027-03-01' }, '2027-03-15'), null);
  assert.equal(nextDeadline({ decisionDate: null, mrRequestDate: null, mrNoticeDate: null, appealSentDate: null }, '2027-01-01'), null);
});

test('bundle pages: printed numbers are read from footers or headers, and quotes located by them', async () => {
  const { printedPageNumber, locateInBundle } = await import('../src/bundle.ts');
  assert.equal(printedPageNumber('Report text\nmore\nPage 23'), 23);
  assert.equal(printedPageNumber('- 7 -\nReport text'), 7);
  assert.equal(printedPageNumber('Report text\n12 of 140'), 12);
  assert.equal(printedPageNumber('Walked 18 metres.\nSaturation 88%'), null);
  const pages = [{ page: 1, text: 'Index\nPage 1' }, { page: 2, text: 'Walk abandoned at 18 metres when patient stopped.\nPage 14' }, { page: 3, text: 'No number here, walked about 50 yards' }];
  assert.deepEqual(locateInBundle('walk abandoned at 18 metres', pages), { pdfPage: 2, bundlePage: 14 });
  assert.deepEqual(locateInBundle('walked about 50 yards', pages), { pdfPage: 3, bundlePage: 3 });
  assert.equal(locateInBundle('not in the bundle at all', pages), null);
});

test('response reasoning: only verified quotes for the disputed items are kept', async () => {
  const { resolveResponse } = await import('../src/response.ts');
  const pages = [{ docId: 'b', page: 3, text: 'However, the walk test is a single snapshot of the appellant’s walking on one day.' }];
  const r = resolveResponse({ items: [
    { key: 'pip:12', reasoning: { doc: 'D1', page: 3, quote: "the walk test is a single snapshot of the appellant's walking on one day" } },
    { key: 'pip:1', reasoning: { doc: 'D1', page: 3, quote: 'she can cook a meal from scratch most days' } },
    { key: 'pip:9', reasoning: { doc: 'D1', page: 3, quote: 'the walk test is a single snapshot of the appellant' } },
  ] }, [{ key: 'pip:12', label: 'Moving around' }, { key: 'pip:1', label: 'Preparing food' }], pages, { D1: 'b' });
  assert.deepEqual(Object.keys(r.reasoning), ['pip:12']);
  assert.deepEqual(r.dropped.map(d => d.reason), ['not_verbatim']);
});

test('submission checks: invented numbers, misquotes, case law, wrong descriptors and unknown regulations are dropped', async () => {
  const { resolveSubmission, renderSubmission, SUBMISSION_REGULATIONS } = await import('../src/submission.ts');
  const facts = {
    stage: 'appeal' as const, benefit: 'pip' as const, summary: 'The decision gave 4 points for mobility. The appellant says 12.',
    regulations: SUBMISSION_REGULATIONS.pip,
    issues: [{
      key: 'pip:12', label: 'Mobility 2: Moving around', dwp: 'descriptor 12b (4 points)', ours: 'descriptor 12e (12 points)', letters: ['12b', '12e'],
      decisionMaker: { quote: 'the walk test is a single snapshot', where: 'bundle page 3' },
      evidence: [
        { id: 'E1', quote: 'Walk abandoned at 18 metres when patient stopped due to breathlessness.', source: 'physio report', where: 'bundle page 12', agencyNotes: false, inBundle: true },
        { id: 'E2', quote: 'stops at next door’s wall to lean and get breath', source: 'adviser’s notes', where: 'page 1', agencyNotes: true, inBundle: false },
      ],
    }],
  };
  const r = resolveSubmission({
    opening: [{ text: 'I represent the appellant in this appeal.', cites: [] }],
    issues: [{ key: 'pip:12', sentences: [
      { text: 'The measured walk test was abandoned at 18 metres [E1].', cites: ['E1'] },                       // kept
      { text: 'The decision maker calls the test "a single snapshot", but it is the only measured evidence.', cites: [] }, // kept, argument
      { text: 'She can only walk 15 metres on bad days.', cites: ['E1'] },                                    // invented number
      { text: 'The report says "she could barely walk".', cites: ['E1'] },                                    // misquote
      { text: 'This follows CPIP/1234/2016.', cites: [] },                                                    // case law
      { text: 'Descriptor 12f applies.', cites: [] },                                                         // not either side's descriptor
      { text: 'Under regulation 12 the walk must be repeated.', cites: [] },                                  // unlisted regulation
      { text: 'Under regulation 4(2A) she must be able to walk repeatedly.', cites: ['E1'] },                  // kept
      { text: 'At interview, the appellant told me she stops at next door’s wall.', cites: ['E2'] },      // kept, agency notes
      { text: 'Her GP agrees.', cites: ['E9'] },                                                              // unknown citation
    ] }],
    closing: [{ text: 'I ask the tribunal to award 12 points for mobility.', cites: [] }],
  }, facts);
  assert.deepEqual(r.dropped.map(d => d.reason), ['number_not_in_facts', 'quote_not_in_cited_evidence', 'case_law', 'descriptor_not_in_facts', 'regulation_not_listed', 'unknown_citation']);
  const kept = r.issues[0].sentences;
  assert.equal(kept.length, 4);
  assert.equal(kept[1].argument, true);
  const text = renderSubmission(r, facts, ['Submission', 'Reference: X']);
  assert.match(text, /The measured walk test was abandoned at 18 metres \(physio report, bundle page 12\)\./);
  assert.match(text, /Not in the DWP bundle, enclosed or set out above: adviser’s notes\./);
  assert.doesNotMatch(text, /\[E1\]/);
});
