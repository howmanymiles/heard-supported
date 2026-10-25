// Scores one extraction run against a synthetic case's answer file.
// Pure: no network, so it is unit-tested and reused by the runner.
import { normalise, type VerifiedEvidence, type Gap, type AssessorResult, type WcaAssessorResult } from '@hs/core';

export type MustFind = { doc: string; page: number; quote: string };
export type CaseActivity = { key: string; evidence_status: string; must_find: MustFind[]; gaps: string[] };
export type CaseFile = { id: string; benefit: 'pip' | 'adp' | 'uc-wca'; activities: CaseActivity[]; must_not_claim?: string[] };

export type Miss = { activity: string; doc: string; page: number; quote: string; foundUnder?: string[] };
export type CaseScore = {
  id: string;
  mustFind: number;
  found: number;            // right passage, right activity
  foundWrongActivity: number; // right passage, filed under another activity
  recall: number;
  suggested: number;
  dropped: number;
  dropRate: number;
  noise: number;            // verified suggestions on activities the case marks nodiff
  gapActivities: { expected: number; raised: number };
  misses: Miss[];
};

const words = (s: string) => normalise(s).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

// Two quotes cover the same passage if one contains the other, or they share
// at least 60% of the shorter one's words in order-insensitive terms.
export function samePassage(a: string, b: string): boolean {
  const na = normalise(a), nb = normalise(b);
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = words(a), wb = new Set(words(b));
  const shorter = Math.min(wa.length, wb.size);
  if (shorter === 0) return false;
  const shared = new Set(wa.filter(w => wb.has(w))).size;
  return shared / shorter >= 0.6;
}

export function scoreCase(c: CaseFile, docIdFor: (doc: string) => string, verified: VerifiedEvidence[], droppedCount: number, gaps: Gap[]): CaseScore {
  let mustFind = 0, found = 0, wrong = 0;
  const misses: Miss[] = [];
  for (const a of c.activities) {
    for (const m of a.must_find) {
      mustFind++;
      const docId = docIdFor(m.doc);
      const hits = verified.filter(v => v.docId === docId && v.page === m.page && samePassage(v.quote, m.quote));
      if (hits.some(h => h.activities.includes(a.key))) found++;
      else if (hits.length) { wrong++; misses.push({ activity: a.key, ...m, foundUnder: [...new Set(hits.flatMap(h => h.activities))] }); }
      else misses.push({ activity: a.key, ...m });
    }
  }
  const nodiff = new Set(c.activities.filter(a => a.evidence_status === 'nodiff').map(a => a.key));
  const noise = verified.filter(v => v.activities.every(k => nodiff.has(k))).length;
  const expectedGaps = new Set(c.activities.filter(a => a.gaps.length).map(a => a.key));
  const raised = new Set(gaps.map(g => g.activity).filter(k => expectedGaps.has(k)));
  const total = verified.length + droppedCount;
  return {
    id: c.id, mustFind, found, foundWrongActivity: wrong,
    recall: mustFind ? found / mustFind : 1,
    suggested: verified.length, dropped: droppedCount, dropRate: total ? droppedCount / total : 0,
    noise, gapActivities: { expected: expectedGaps.size, raised: raised.size }, misses,
  };
}

// ---------- MR stage: reading the DWP's position ----------

type MrActs = { activities: Array<{ activity: number; letter: string; justification_quote?: { page: number; quote: string } }> };
export type MrAnswer = { pa4?: MrActs; determination?: MrActs };

export function scoreAssessor(mr: MrAnswer, r: Pick<AssessorResult, 'activities' | 'decisionDate' | 'dropped'>, letterDate: string | null, pa4DocId: string) {
  let lettersCorrect = 0, lettersWrong = 0, lettersMissing = 0, justificationsFound = 0;
  const wrong: Array<{ activity: number; got: string; want: string }> = [];
  // ADP answer files give the determination's descriptors (often no consultation report).
  for (const want of (mr.pa4 ?? mr.determination!).activities) {
    const got = r.activities.find(a => a.activity === want.activity);
    if (!got?.letter) lettersMissing++;
    else if (got.letter === want.letter) lettersCorrect++;
    else { lettersWrong++; wrong.push({ activity: want.activity, got: got.letter, want: want.letter }); }
    const j = want.justification_quote;
    if (j && got?.justification && got.justification.docId === pa4DocId && got.justification.page === j.page && samePassage(got.justification.quote, j.quote)) justificationsFound++;
  }
  return { lettersCorrect, lettersWrong, lettersMissing, wrong, justificationsFound, dateCorrect: !!letterDate && r.decisionDate?.date === letterDate, dropped: r.dropped.length };
}

export type WcaMrAnswer = { report: { sch6: Array<{ activity: number; letter: string }>; sch7: string[]; sch8_4: string; sch9_4: string }; decision: { date: string; outcome: string } };

/** WCA: 17 Schedule 6 findings, Schedule 7, and both substantial-risk findings (20 items). */
export function scoreWcaAssessor(mr: WcaMrAnswer, r: Pick<WcaAssessorResult, 'sch6' | 'sch7' | 'sch8_4' | 'sch9_4' | 'decisionDate' | 'outcome' | 'dropped'>) {
  let lettersCorrect = 0, lettersWrong = 0, lettersMissing = 0;
  const wrong: Array<{ item: string; got: string; want: string }> = [];
  const tally = (item: string, got: string | null, want: string) => {
    if (got === null) lettersMissing++;
    else if (got === want) lettersCorrect++;
    else { lettersWrong++; wrong.push({ item, got, want }); }
  };
  for (const w of mr.report.sch6) tally(`sch6:${w.activity}`, r.sch6.find(a => a.activity === w.activity)?.letter ?? null, w.letter);
  tally('sch7', r.sch7.ids === null ? null : [...r.sch7.ids].sort().join(','), [...mr.report.sch7].sort().join(','));
  tally('sch8:4', r.sch8_4.value, mr.report.sch8_4);
  tally('sch9:4', r.sch9_4.value, mr.report.sch9_4);
  return { of: 20, lettersCorrect, lettersWrong, lettersMissing, wrong, justificationsFound: 0, dateCorrect: r.decisionDate?.date === mr.decision.date, outcomeCorrect: r.outcome.value === mr.decision.outcome, dropped: r.dropped.length };
}
