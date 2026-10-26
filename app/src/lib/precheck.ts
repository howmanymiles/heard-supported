// Before the AI checks a claim: what's uploaded, what usually helps for what's claimed and
// isn't here yet, and what the check will send. Worked out from the case alone, no AI.

import { activityList, type Benefit } from '@hs/core';
import { docType } from './doctypes.ts';
import type { DocRow } from './cases.ts';

export type Precheck = {
  have: string[];                    // document types uploaded, by label
  untyped: number;                   // documents with no type chosen
  claimForm: { label: string; present: boolean };
  suggestions: Array<{ docs: string[]; for: string[] }>;
  claimedCount: number;
  newDocs: number;                   // added since the last check (all, if never checked)
  pages: number;                     // pages already read in the case
  unread: number;                    // documents not read yet (page count not known)
  checkedBefore: boolean;
  nothingNew: boolean;
};

const EVIDENCE_KINDS = ['evidence', 'notes', 'other'];
const MEDICAL = ['gp-letter', 'gp-records', 'consultant', 'mental-health', 'nurse'];

/** For each activity: document types that usually show how it affects the claimant. */
function needsFor(benefit: Benefit, key: string): string[][] {
  const [scheme, n] = key.split(':'); const num = Number(n);
  if (scheme === 'pip') {
    if (num === 1 || num === 2) return [['ot', 'statement', 'social-care']];
    if (num === 3) return [['prescriptions'], ['nurse', 'consultant', 'gp-letter']];
    if (num >= 4 && num <= 6) return [['ot', 'social-care'], ['statement', 'diary']];
    if (num === 7 || num === 8) return [['consultant', 'mental-health', 'gp-letter']];
    if (num >= 9 && num <= 11) return [['mental-health', 'gp-letter', 'gp-records'], ['statement', 'diary']];
    if (num === 12) return [['physio', 'consultant', 'ot']];
  }
  if (scheme === 'sch6') {
    if (num <= 10) return [['physio', 'consultant', 'ot']];
    return [['mental-health', 'gp-letter', 'gp-records'], ['statement', 'diary']];
  }
  return [];
}

export function precheck(benefit: Benefit, docs: DocRow[], claimed: Record<string, string>, lastRunAt: Date | string | null): Precheck {
  const ev = docs.filter(d => EVIDENCE_KINDS.includes(d.kind));
  const types = new Set(ev.map(d => d.doc_type).filter((t): t is string => !!t));
  const have = [...new Set(ev.map(d => docType(d.doc_type)?.label).filter((l): l is string => !!l))];
  const formIds = benefit === 'uc-wca' ? ['uc50'] : benefit === 'adp' ? ['adp-application', 'adp-review'] : ['pip2', 'pip-review'];
  const claimForm = { label: docType(formIds[0])!.label, present: formIds.some(t => types.has(t)) };

  const labelOf = new Map(activityList(benefit).map(a => [a.key, a.label]));
  const keys = Object.keys(claimed).filter(k => claimed[k]);
  const merged = new Map<string, { docs: string[]; for: string[] }>();
  const add = (alts: string[], why: string, label?: string) => {
    if (alts.some(t => types.has(t))) return;
    const k = alts.join('|');
    const m = merged.get(k) ?? { docs: label ? [label] : alts.map(t => docType(t)!.label), for: [] };
    if (!m.for.includes(why)) m.for.push(why);
    merged.set(k, m);
  };
  if (keys.length) add(MEDICAL, 'every activity claimed', 'Medical evidence: a GP letter or records, or a letter from a hospital, mental health team or specialist nurse');
  if (benefit === 'uc-wca' && keys.length) add(['fit-note'], 'the claim for limited capability for work');
  for (const k of keys) for (const alts of needsFor(benefit, k)) add(alts, `${labelOf.get(k) ?? k} (${claimed[k]})`);

  const since = lastRunAt ? new Date(lastRunAt).getTime() : null;
  const newDocs = ev.filter(d => since === null || new Date(d.created_at).getTime() > since).length;
  return {
    have, untyped: ev.filter(d => !docType(d.doc_type)).length, claimForm,
    suggestions: [...merged.values()], claimedCount: keys.length,
    newDocs, pages: ev.reduce((s, d) => s + (d.read_status === 'read' ? d.page_count ?? 0 : 0), 0),
    unread: ev.filter(d => d.read_status !== 'read').length,
    checkedBefore: since !== null, nothingNew: since !== null && newDocs === 0,
  };
}
