// UC Work Capability Assessment reconsideration. The DWP's descriptors come
// from the UC85 or UC85A; the notice gives only the date and the award.

import { extractWcaAssessor, type WcaAssessorDoc } from '@hs/core';
import { assessWca, type EvidenceRef, type WcaResult } from '@hs/engine';
import { asAgency, audit } from './db.ts';
import { readUnread, readPages, RISK_KEYS, type DecisionRow, type EvidenceRow, type getCase } from './cases.ts';
import { data, wcaInputs } from './score.ts';
import { storeChoices, type ChoiceRow, type Quote } from './mr.ts';
import type { MrTiming } from '@hs/core';
import type { Me } from './auth.ts';

type Base = NonNullable<Awaited<ReturnType<typeof getCase>>>;
const wca = data.benefits.find(b => b.id === 'uc-wca')!;
const sch6 = wca.activities;
const sch7 = wca.lcwra_activities ?? [];
/** The usual short names for the Schedule 6 activities; the dataset holds the full statutory headings. */
const SHORT: Record<number, string> = {
  1: 'Mobilising', 2: 'Standing and sitting', 3: 'Reaching', 4: 'Picking up and moving or transferring', 5: 'Manual dexterity',
  6: 'Making self understood', 7: 'Understanding communication', 8: 'Navigation and maintaining safety', 9: 'Absence or loss of control of bladder or bowel',
  10: 'Consciousness during waking moments', 11: 'Learning tasks', 12: 'Awareness of everyday hazards', 13: 'Initiating and completing personal action',
  14: 'Coping with change', 15: 'Getting about', 16: 'Coping with social engagement', 17: 'Appropriateness of behaviour with other people',
};
export const shortName = (n: number, name: string) => SHORT[n] ?? name.split(/\s*[(:]/)[0].trim();
const sch7Text = (id: string) => sch7.flatMap(a => a.descriptors).find(d => d.number === id)?.text ?? '';
export const OUTCOME_LABEL: Record<string, string> = { none: 'no limited capability for work', lcw: 'limited capability for work, not for work-related activity', lcwra: 'limited capability for work-related activity' };

export async function readWcaAssessment(me: Me, caseId: string, base: Base) {
  const reportKinds = ['uc85', 'uc85a'];
  const papers = base.docs.filter(d => d.kind === 'decision' || reportKinds.includes(d.kind));
  if (!papers.some(d => reportKinds.includes(d.kind))) throw new Error('Upload the UC85 or UC85A report first, marked as such. The decision notice alone does not give the descriptors.');
  await readUnread(me, caseId, papers);
  const docs = (await readPages(me, caseId, ['decision', 'uc85', 'uc85a'])).map(d => ({ ...d, kind: d.kind as WcaAssessorDoc['kind'] }));
  const r = await extractWcaAssessor(docs);

  await asAgency(me.agencyId, async c => {
    await storeChoices(c, me, caseId, [
      ...r.sch6.map(a => ({ key: `sch6:${a.activity}`, letter: a.letter, source: 'report' as const, report: a.chosen, justification: a.justification })),
      { key: 'sch7', letter: r.sch7.ids === null ? null : r.sch7.ids.length ? r.sch7.ids.join(',') : 'none', source: 'report', report: r.sch7.quotes[0] },
      { key: 'sch8:4', letter: r.sch8_4.value, source: 'report', report: r.sch8_4.quote, justification: r.sch8_4.justification },
      { key: 'sch9:4', letter: r.sch9_4.value, source: 'report', report: r.sch9_4.quote, justification: r.sch9_4.justification },
    ]);
    if (r.decisionDate) await c.query('update cases set decision_date = coalesce(decision_date, $2) where id = $1', [caseId, r.decisionDate.date]);
    if (r.outcome.value) await c.query('update cases set decision_outcome = coalesce(decision_outcome, $2), decision_outcome_quote = coalesce(decision_outcome_quote, $3) where id = $1',
      [caseId, r.outcome.value, { docId: r.outcome.cite!.docId, page: r.outcome.cite!.page, quote: r.outcome.cite!.quote }]);
    await c.query("update cases set stage = 'mr' where id = $1 and stage in ('claim', 'assessment', 'decision')", [caseId]);
    const resolved = r.sch6.filter(a => a.letter).length + (r.sch7.ids ? 1 : 0) + (r.sch8_4.value ? 1 : 0) + (r.sch9_4.value ? 1 : 0);
    await c.query("insert into extraction_runs (agency_id, case_id, model, dataset_version, verified, rejected, identifiers_removed, created_by, kind) values ($1, $2, $3, $4, $5, $6, $7, $8, 'assessment')",
      [me.agencyId, caseId, r.model, base.case.dataset_version, resolved, r.dropped.length, r.identifiersRemoved, me.userId]);
    await audit(c, me.agencyId, me.userId, caseId, `Decision papers read: DWP finding found for ${resolved} of 20 items; ${r.dropped.length} quotes dropped for failing checks`);
  });
  return { found: r.sch6.filter(a => a.letter).length + (r.sch7.ids ? 1 : 0) + (r.sch8_4.value ? 1 : 0) + (r.sch9_4.value ? 1 : 0), of: 20, dropped: r.dropped };
}

/** Validates an adviser's entry of the DWP's finding for a WCA item. */
export function checkWcaChoice(activity: string, letter: string): { label: string; letter: string } {
  if (activity.startsWith('sch6:')) {
    const act = sch6.find(a => a.number === Number(activity.split(':')[1]));
    if (!act || !act.descriptors.some(d => d.letter === letter)) throw new Error('Choose one of the descriptors for this activity.');
    return { label: `Schedule 6 activity ${act.number}: ${act.name}`, letter };
  }
  if (activity === 'sch7') {
    const ids = letter.split(',').map(s => s.trim()).filter(Boolean);
    if (letter === 'none') return { label: 'Schedule 7', letter };
    if (!ids.length || ids.some(id => !sch7Text(id))) throw new Error('Choose the Schedule 7 descriptors that the report applied, or none.');
    return { label: 'Schedule 7', letter: [...new Set(ids)].join(',') };
  }
  if (RISK_KEYS[activity]) {
    if (letter !== 'applies' && letter !== 'not_applies') throw new Error('Choose whether the report found it applies.');
    return { label: RISK_KEYS[activity], letter };
  }
  throw new Error('Unknown item.');
}

// ---------- comparison and draft (pure) ----------

export type WcaRow = {
  key: string; label: string; group: 'lcwra' | 'lcw';
  dwp: string; adviser: string | null;        // letters, ids or applies/not_applies
  dwpPoints: number; adviserPoints: number;   // Schedule 6 only
  status: 'agree' | 'challenge' | 'adviser_lower' | 'adviser_undecided';
  gain: number; justification: Quote | null; evidence: EvidenceRef[];
  dwpText: string; adviserText: string | null;
};
export type WcaComparison = {
  rows: WcaRow[]; challenges: WcaRow[]; agreed: WcaRow[];
  dwp: WcaResult; adviser: WcaResult; dwpOutcome: string; adviserOutcome: string;
  warnings: Array<{ code: string; message: string }>;
};

const outcomeOf = (r: WcaResult) => (r.lcwra.result ? 'lcwra' : r.lcw.result ? 'lcw' : 'none');

export function buildWcaComparison(choices: ChoiceRow[], decisions: DecisionRow[], evidence: EvidenceRow[], noticeOutcome: string | null):
  { comparison: WcaComparison | null; missing: string[]; unconfirmed: string[] } {
  const get = (k: string) => choices.find(c => c.activity === k);
  const keys = [...sch6.map(a => `sch6:${a.number}`), 'sch7', 'sch8:4', 'sch9:4'];
  const missing = keys.filter(k => !get(k)?.letter);
  const unconfirmed = keys.filter(k => get(k)?.letter && !get(k)!.confirmed);
  if (missing.length) return { comparison: null, missing, unconfirmed };

  const refs = (key: string) => evidence.filter(e => e.status === 'accepted' && e.activities.includes(key)).map(e => ({ doc: e.doc_name, page: e.page_no, quote: e.quote }));
  const dec = (k: string) => decisions.find(d => d.activity === k);
  const decLetter = (k: string) => { const s = dec(k)?.satisfied as Array<{ letter: string } | string> | undefined; const v = s?.[0]; return v === undefined ? null : typeof v === 'string' ? v : v.letter; };

  // The DWP's position, from the report.
  const dwpSch7 = get('sch7')!.letter === 'none' ? [] : get('sch7')!.letter!.split(',');
  const dwpIn = {
    lcw: sch6.map(a => ({ activity: a.number, letters: [get(`sch6:${a.number}`)!.letter!] })),
    lcwra: dwpSch7,
    treatedAsLcw: get('sch8:4')!.letter === 'applies' ? [4] : [],
    treatedAsLcwra: get('sch9:4')!.letter === 'applies' ? [4] : [],
  };
  // The adviser's position; anything undecided keeps the DWP's finding.
  const adv = wcaInputs(decisions);
  const advIn = {
    lcw: sch6.map(a => adv.lcw.find(x => x.activity === a.number) ?? { activity: a.number, letters: [get(`sch6:${a.number}`)!.letter!] }),
    lcwra: adv.lcwra,
    treatedAsLcw: dec('sch8:4') ? adv.treatedAsLcw : dwpIn.treatedAsLcw,
    treatedAsLcwra: dec('sch9:4') ? adv.treatedAsLcwra : dwpIn.treatedAsLcwra,
  };
  const dwpR = assessWca(data, dwpIn);
  const advR = assessWca(data, advIn);

  const rows: WcaRow[] = [];
  for (const a of sch6) {
    const key = `sch6:${a.number}`;
    const d = dwpR.lcw.activities.find(x => x.activity === a.number)!;
    const v = advR.lcw.activities.find(x => x.activity === a.number)!;
    const decided = !!decLetter(key);
    const gain = v.points - d.points;
    rows.push({
      key, label: `Activity ${a.number}: ${shortName(a.number, a.name)}`, group: 'lcw',
      dwp: d.descriptor!.letter, adviser: decided ? v.descriptor!.letter : null, dwpPoints: d.points, adviserPoints: v.points,
      status: !decided ? 'adviser_undecided' : gain > 0 ? 'challenge' : gain < 0 ? 'adviser_lower' : 'agree',
      gain, justification: get(key)!.justification, evidence: refs(key), dwpText: d.descriptor!.text, adviserText: decided ? v.descriptor!.text : null,
    });
  }
  const added = adv.lcwra.filter(id => !dwpSch7.includes(id));
  const dropped = dwpSch7.filter(id => !adv.lcwra.includes(id));
  rows.push({
    key: 'sch7', label: 'Schedule 7 descriptors', group: 'lcwra',
    dwp: dwpSch7.join(', ') || 'none', adviser: adv.lcwra.join(', ') || 'none', dwpPoints: 0, adviserPoints: 0,
    status: added.length ? 'challenge' : dropped.length ? 'adviser_lower' : 'agree', gain: 0,
    justification: get('sch7')!.justification ?? null,
    evidence: added.flatMap(id => refs(`sch7:${id.split('(')[0]}`)),
    dwpText: dwpSch7.map(id => `${id} ${sch7Text(id)}`).join(' '), adviserText: added.map(id => `${id} ${sch7Text(id)}`).join(' ') || null,
  });
  for (const [key, group] of [['sch9:4', 'lcwra'], ['sch8:4', 'lcw']] as const) {
    const d = get(key)!.letter!;
    const v = decLetter(key);
    rows.push({
      key, label: RISK_KEYS[key], group, dwp: d, adviser: v, dwpPoints: 0, adviserPoints: 0,
      status: !v ? 'adviser_undecided' : v === d ? 'agree' : v === 'applies' ? 'challenge' : 'adviser_lower', gain: 0,
      justification: get(key)!.justification, evidence: refs(key), dwpText: d === 'applies' ? 'Applies' : 'Does not apply', adviserText: v ? (v === 'applies' ? 'Applies' : 'Does not apply') : null,
    });
  }

  const warnings: WcaComparison['warnings'] = [];
  const dwpOutcome = outcomeOf(dwpR), adviserOutcome = outcomeOf(advR);
  if (noticeOutcome && noticeOutcome !== dwpOutcome) {
    warnings.push({ code: 'notice_differs', message: `The notice’s award (${OUTCOME_LABEL[noticeOutcome]}) does not match the report’s findings (${OUTCOME_LABEL[dwpOutcome]}). The decision maker may have departed from the report: check before relying on the report’s descriptors.` });
  }
  const lower = rows.filter(r => r.status === 'adviser_lower');
  if (lower.length) warnings.push({ code: 'award_could_go_down', message: `Your position is lower than the report on ${lower.map(r => r.key.replace('sch6:', 'activity ')).join(', ')}. Check these before asking for a reconsideration.` });
  const undecided = rows.filter(r => r.status === 'adviser_undecided' && r.group === 'lcw' && r.key.startsWith('sch6:'));
  if (undecided.length) warnings.push({ code: 'adviser_position_incomplete', message: `No position yet on Schedule 6 activity ${undecided.map(r => r.key.split(':')[1]).join(', ')}. Your totals keep the report’s points for these.` });
  const noEv = rows.filter(r => r.status === 'challenge' && r.evidence.length === 0);
  if (noEv.length) warnings.push({ code: 'challenge_without_evidence', message: `${noEv.map(r => r.key === 'sch7' ? 'Schedule 7' : r.key.startsWith('sch6:') ? `Activity ${r.key.split(':')[1]}` : r.label.split(' (')[0]).join(', ')}: challenged with no accepted evidence yet.` });
  const sch8 = rows.find(r => r.key === 'sch8:4')!;
  if (sch8.status === 'challenge' && advR.lcw.byAssessment) warnings.push({ code: 'sch8_not_needed', message: 'Your Schedule 6 points already reach 15, so Schedule 8 paragraph 4 is not needed (reg 39(7)); it is left out of the request.' });

  const rank = (r: WcaRow) => (r.group === 'lcwra' ? 0 : r.key === 'sch8:4' ? 2 : 1);
  const challenges = rows.filter(r => r.status === 'challenge' && !(r.key === 'sch8:4' && advR.lcw.byAssessment))
    .sort((a, b) => rank(a) - rank(b) || b.gain - a.gain || a.key.localeCompare(b.key, undefined, { numeric: true }));
  const agreed = rows.filter(r => r.status === 'agree');
  return { comparison: { rows, challenges, agreed, dwp: dwpR, adviser: advR, dwpOutcome, adviserOutcome, warnings }, missing, unconfirmed };
}

const long = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const docTitle = (name: string) => name.replace(/\.(pdf|docx?|md|txt|jpe?g|png|tiff?)$/i, '').replace(/_+/g, ' ').trim();
const NOTICE: Record<string, string> = {
  none: 'that the claimant does not have limited capability for work',
  lcw: 'that the claimant has limited capability for work but not limited capability for work-related activity',
  lcwra: 'on the claimant’s Work Capability Assessment',
};

/** A plain draft for the adviser to edit, from confirmed findings, decisions and accepted evidence only. */
export function buildWcaDraft(input: { ref: string; decisionDate: string | null; timing: MrTiming | null; lateReason: string | null; noticeOutcome: string | null; reportName: string; comparison: WcaComparison }): string {
  const { comparison: cmp } = input;
  const out: string[] = [];
  out.push('Mandatory reconsideration request: Universal Credit, Work Capability Assessment', `Reference: ${input.ref}`, '');
  out.push(`I am asking for a mandatory reconsideration of the decision${input.decisionDate ? ` dated ${long(input.decisionDate)}` : ''} ${NOTICE[input.noticeOutcome ?? cmp.dwpOutcome] ?? NOTICE.lcwra}.`);
  if (input.timing?.status === 'late') out.push('', `This request is made more than one month after the decision. ${input.lateReason ? `It is late because ${input.lateReason.replace(/\.?$/, '.')}` : '[Explain why the request is late.]'}`);
  const pts = (r: WcaResult) => `${r.lcw.totalPoints} points (${r.lcw.physicalPoints} physical, ${r.lcw.mentalPoints} mental)`;
  out.push('', `The ${input.reportName} gave ${pts(cmp.dwp)}. On the evidence, the claimant scores ${pts(cmp.adviser)} against the threshold of 15, and has ${OUTCOME_LABEL[cmp.adviserOutcome]}.`);

  const section = (title: string, rows: WcaRow[]) => {
    if (!rows.length) return;
    out.push('', title);
    for (const r of rows) {
      out.push('');
      if (r.key.startsWith('sch6:')) {
        const n = r.key.split(':')[1];
        out.push(r.label);
        out.push(`The report applied descriptor ${n}(${r.dwp}) (${r.dwpPoints} points): "${r.dwpText}"`);
        out.push(`We say descriptor ${n}(${r.adviser}) applies (${r.adviserPoints} points): "${r.adviserText}"`);
      } else if (r.key === 'sch7') {
        out.push('Schedule 7');
        out.push(`The report found ${r.dwp === 'none' ? 'that no Schedule 7 descriptor applies' : `descriptor ${r.dwp}`}. We say ${r.adviserText}`);
      } else {
        out.push(r.label);
        out.push(`The report found that it does not apply. We say there would be a substantial risk to the physical or mental health of any person if the claimant were found not to have ${r.key === 'sch8:4' ? 'limited capability for work' : 'limited capability for work-related activity'}.`);
      }
      if (r.justification) out.push(`The report said: "${r.justification.quote}" (${input.reportName}, page ${r.justification.page}).`);
      if (r.evidence.length) { out.push('The evidence shows:'); for (const e of r.evidence) out.push(`- "${e.quote}" (${docTitle(e.doc)}, page ${e.page})`); }
      else out.push('[Add the evidence for this.]');
    }
  };
  section('Limited capability for work-related activity', cmp.challenges.filter(r => r.group === 'lcwra'));
  section('Limited capability for work', cmp.challenges.filter(r => r.group === 'lcw'));
  const agreedActs = cmp.agreed.filter(r => r.key.startsWith('sch6:')).map(r => r.key.split(':')[1]);
  if (agreedActs.length) out.push('', `We do not dispute the report’s descriptors for Schedule 6 activity ${agreedActs.join(', ')}.`);
  out.push('', 'Please consider all of the evidence listed above, including anything enclosed with this request, and send a written mandatory reconsideration notice with reasons.');
  return out.join('\n');
}
