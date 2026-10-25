// The documents advisers upload, by their everyday names and form numbers, so the
// adviser can type "PA4", "UC50" or "GP letter" and pick it. Each maps to one of the
// kinds the platform's logic uses (DWP papers are read as the DWP's position; everything
// else as the client's evidence). Only form numbers checked against DWP, HMCTS or
// Social Security Scotland sources are given as codes.

import type { DocKind } from './cases.ts';

export type Benefit = 'pip' | 'adp' | 'uc-wca';
export type DocType = { id: string; label: string; code?: string; also?: string[]; benefits: Benefit[]; kind: DocKind; group: string };

const ALL: Benefit[] = ['pip', 'adp', 'uc-wca'];
const PIP: Benefit[] = ['pip'], ADP: Benefit[] = ['adp'], WCA: Benefit[] = ['uc-wca'], DWP: Benefit[] = ['pip', 'uc-wca'];

export const DOC_TYPES: DocType[] = [
  // ---- The claim ----
  { id: 'pip2', code: 'PIP2', label: 'How your disability affects you (PIP2)', also: ['questionnaire', 'claim form'], benefits: PIP, kind: 'evidence', group: 'The claim' },
  { id: 'pip-review', label: 'PIP award review form', also: ['review', 'renewal'], benefits: PIP, kind: 'evidence', group: 'The claim' },
  { id: 'adp-application', label: 'ADP application form', also: ['application', 'part 2'], benefits: ADP, kind: 'evidence', group: 'The claim' },
  { id: 'adp-review', label: 'ADP review form', also: ['review'], benefits: ADP, kind: 'evidence', group: 'The claim' },
  { id: 'uc50', code: 'UC50', label: 'Capability for work questionnaire (UC50)', also: ['questionnaire', 'wca form'], benefits: WCA, kind: 'evidence', group: 'The claim' },
  { id: 'sr1', code: 'SR1', label: 'Special rules for end of life (SR1)', also: ['terminal', 'DS1500'], benefits: DWP, kind: 'evidence', group: 'The claim' },
  { id: 'fit-note', label: 'Fit note', also: ['med3', 'sick note'], benefits: WCA, kind: 'evidence', group: 'The claim' },

  // ---- The assessment and decision ----
  { id: 'pa4', code: 'PA4', label: 'PIP assessment report (PA4)', also: ['consultation report', 'health assessment'], benefits: PIP, kind: 'pa4', group: 'Assessment and decision' },
  { id: 'uc85', code: 'UC85', label: 'WCA assessment report (UC85)', also: ['health assessment', 'medical report'], benefits: WCA, kind: 'uc85', group: 'Assessment and decision' },
  { id: 'uc85a', code: 'UC85A', label: 'WCA paper-based assessment (UC85A)', also: ['paper review'], benefits: WCA, kind: 'uc85a', group: 'Assessment and decision' },
  { id: 'adp-consultation', label: 'ADP consultation report', also: ['assessment'], benefits: ADP, kind: 'pa4', group: 'Assessment and decision' },
  { id: 'pip-decision', label: 'PIP decision letter', also: ['award letter', 'decision notice'], benefits: PIP, kind: 'decision', group: 'Assessment and decision' },
  { id: 'wca-decision', label: 'WCA decision (letter or journal message)', also: ['lcw', 'lcwra', 'journal'], benefits: WCA, kind: 'decision', group: 'Assessment and decision' },
  { id: 'adp-determination', label: 'Notice of determination', also: ['decision letter', 'award'], benefits: ADP, kind: 'decision', group: 'Assessment and decision' },

  // ---- Challenging the decision ----
  { id: 'crmr1', code: 'CRMR1', label: 'Mandatory reconsideration request (CRMR1)', also: ['mr request', 'challenge'], benefits: DWP, kind: 'other', group: 'Challenging the decision' },
  { id: 'mrn', label: 'Mandatory reconsideration notice', also: ['mrn', 'mr notice'], benefits: DWP, kind: 'mr_notice', group: 'Challenging the decision' },
  { id: 'adp-redet-request', label: 'Re-determination request form', also: ['redetermination'], benefits: ADP, kind: 'other', group: 'Challenging the decision' },
  { id: 'adp-redet-notice', label: 'Notice of re-determination', also: ['redetermination decision'], benefits: ADP, kind: 'mr_notice', group: 'Challenging the decision' },

  // ---- Appeal ----
  { id: 'sscs1', code: 'SSCS1', label: 'Tribunal appeal form (SSCS1)', also: ['appeal form', 'notice of appeal'], benefits: DWP, kind: 'other', group: 'Appeal' },
  { id: 'dwp-response', label: 'DWP response bundle', also: ['appeal bundle', 'response', 'tribunal papers'], benefits: DWP, kind: 'dwp_bundle', group: 'Appeal' },
  { id: 'adp-appeal-request', label: 'Appeal request form', also: ['appeal'], benefits: ADP, kind: 'other', group: 'Appeal' },
  { id: 'adp-appeal-papers', label: 'Social Security Scotland’s appeal papers', also: ['bundle', 'submission', 'tribunal papers'], benefits: ADP, kind: 'dwp_bundle', group: 'Appeal' },
  { id: 'tribunal-notice', label: 'Tribunal decision notice', also: ['outcome', 'hearing'], benefits: ALL, kind: 'other', group: 'Appeal' },
  { id: 'statement-of-reasons', label: 'Statement of reasons', also: ['tribunal reasons'], benefits: ALL, kind: 'other', group: 'Appeal' },
  { id: 'directions', label: 'Tribunal directions or hearing letter', also: ['adjournment', 'hearing date'], benefits: ALL, kind: 'other', group: 'Appeal' },

  // ---- Evidence ----
  { id: 'gp-letter', label: 'GP letter or report', also: ['doctor', 'medical'], benefits: ALL, kind: 'evidence', group: 'Evidence' },
  { id: 'gp-records', label: 'GP medical records', also: ['notes', 'summary', 'patient record'], benefits: ALL, kind: 'evidence', group: 'Evidence' },
  { id: 'consultant', label: 'Hospital or consultant letter', also: ['specialist', 'clinic letter', 'discharge'], benefits: ALL, kind: 'evidence', group: 'Evidence' },
  { id: 'mental-health', label: 'Mental health team letter', also: ['cpn', 'psychiatrist', 'psychologist', 'cmht'], benefits: ALL, kind: 'evidence', group: 'Evidence' },
  { id: 'nurse', label: 'Specialist nurse letter', also: ['district nurse', 'macmillan'], benefits: ALL, kind: 'evidence', group: 'Evidence' },
  { id: 'ot', label: 'Occupational therapist report', also: ['ot', 'adaptations'], benefits: ALL, kind: 'evidence', group: 'Evidence' },
  { id: 'physio', label: 'Physiotherapist report', also: ['physio'], benefits: ALL, kind: 'evidence', group: 'Evidence' },
  { id: 'social-care', label: 'Social work or care plan', also: ['care package', 'carer', 'support plan'], benefits: ALL, kind: 'evidence', group: 'Evidence' },
  { id: 'prescriptions', label: 'Prescription list', also: ['medication', 'repeat prescription'], benefits: ALL, kind: 'evidence', group: 'Evidence' },
  { id: 'diary', label: 'Daily living diary', also: ['diary', 'log'], benefits: ALL, kind: 'evidence', group: 'Evidence' },
  { id: 'statement', label: 'Statement from family, carer or friend', also: ['supporting letter', 'witness'], benefits: ALL, kind: 'evidence', group: 'Evidence' },
  { id: 'supporting-info', label: 'Supporting information from a professional', also: ['supporting information'], benefits: ADP, kind: 'evidence', group: 'Evidence' },
  { id: 'other-evidence', label: 'Other evidence', benefits: ALL, kind: 'evidence', group: 'Evidence' },

  // ---- Your agency ----
  { id: 'notes', label: 'Your agency’s interview notes', also: ['notes', 'case notes'], benefits: ALL, kind: 'notes', group: 'Your agency' },
  { id: 'other', label: 'Something else', benefits: ALL, kind: 'other', group: 'Your agency' },
];

const byId = Object.fromEntries(DOC_TYPES.map(t => [t.id, t]));
export const docType = (id: string | null | undefined) => (id ? byId[id] : undefined);

/** The documents that fit a step of the case: its benefit and the kinds that step accepts. */
export function docTypesFor(benefit: string, kinds: readonly string[]): DocType[] {
  const b = (benefit === 'adp' || benefit === 'uc-wca' ? benefit : 'pip') as Benefit;
  return DOC_TYPES.filter(t => t.benefits.includes(b) && kinds.includes(t.kind));
}

/** Search as the adviser types: label, form number or other names, any word. */
export function matchDocTypes(types: DocType[], q: string): DocType[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return types;
  const hay = (t: DocType) => [t.label, t.code ?? '', ...(t.also ?? [])].join(' ').toLowerCase();
  const hits = types.filter(t => words.every(w => hay(t).includes(w)));
  // Form numbers and label starts first.
  const rank = (t: DocType) => (t.code?.toLowerCase().startsWith(words[0]) ? 0 : t.label.toLowerCase().startsWith(words[0]) ? 1 : 2);
  return hits.sort((a, b) => rank(a) - rank(b));
}
