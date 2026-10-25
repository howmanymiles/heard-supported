// Scores one extraction run against a synthetic case's answer file.
// Pure: no network, so it is unit-tested and reused by the runner.
import { normalise, type VerifiedEvidence, type Gap } from '@hs/core';

export type MustFind = { doc: string; page: number; quote: string };
export type CaseActivity = { key: string; evidence_status: string; must_find: MustFind[]; gaps: string[] };
export type CaseFile = { id: string; benefit: 'pip' | 'uc-wca'; activities: CaseActivity[]; must_not_claim?: string[] };

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
