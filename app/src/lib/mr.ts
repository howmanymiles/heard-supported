// PIP mandatory reconsideration: the DWP's position, the comparison with the
// adviser's, time limits, and a draft request built only from confirmed facts.

import { extractAssessor, mrTiming, activityList, type MrTiming } from '@hs/core';
import { comparePip, type PipComparison, type EvidenceRef } from '@hs/engine';
import { asAgency, audit } from './db.ts';
import { getCase, readUnread, readPages, type DecisionRow, type EvidenceRow } from './cases.ts';
import { data, pipInputs } from './score.ts';
import type { Me } from './auth.ts';

export type Quote = { docId: string; page: number; quote: string };
export type ChoiceRow = {
  activity: string; letter: string | null; source: 'decision_letter' | 'pa4' | 'adviser' | null;
  decision_quote: Quote | null; pa4_quote: Quote | null; justification: Quote | null;
  departs: { pa4Letter: string; decisionLetter: string } | null; confirmed: boolean;
};

const today = () => new Date().toISOString().slice(0, 10);
const isoDate = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : typeof d === 'string' && d ? d.slice(0, 10) : null);

export async function getMr(me: Me, caseId: string) {
  const base = await getCase(me, caseId);
  if (!base) return null;
  const extra = await asAgency(me.agencyId, async c => ({
    choices: (await c.query('select activity, letter, source, decision_quote, pa4_quote, justification, departs, confirmed from assessor_choices where case_id = $1', [caseId])).rows as ChoiceRow[],
    run: (await c.query("select model, verified, rejected, identifiers_removed, created_at from extraction_runs where case_id = $1 and kind = 'assessment' order by created_at desc limit 1", [caseId])).rows[0] ?? null,
  }));
  const decisionDate = isoDate(base.case.decision_date);
  const requestDate = isoDate(base.case.mr_request_date);
  const timing: MrTiming | null = decisionDate ? mrTiming(decisionDate, requestDate ?? today()) : null;
  return { ...base, ...extra, decisionDate, requestDate, timing };
}

/** Read the PA4 and decision letter and record the DWP's position. Confirmed rows are never overwritten. */
export async function readAssessment(me: Me, caseId: string) {
  const base = await getCase(me, caseId);
  if (!base) throw new Error('Case not found.');
  if (base.case.benefit !== 'pip') throw new Error('Reconsideration support is for PIP cases at the moment.');
  const papers = base.docs.filter(d => d.kind === 'pa4' || d.kind === 'decision');
  if (!papers.length) throw new Error('Upload the decision letter and the PA4 assessment report first, marked as such.');
  await readUnread(me, caseId, papers);
  const docs = (await readPages(me, caseId, ['pa4', 'decision'])).map(d => ({ ...d, kind: d.kind as 'pa4' | 'decision' }));
  const r = await extractAssessor(docs);
  const strip = (q?: { docId: string; page: number; quote: string }) => (q ? { docId: q.docId, page: q.page, quote: q.quote } : null);

  await asAgency(me.agencyId, async c => {
    const confirmed = new Set((await c.query('select activity from assessor_choices where case_id = $1 and confirmed', [caseId])).rows.map(x => x.activity));
    for (const a of r.activities) {
      const key = `pip:${a.activity}`;
      if (confirmed.has(key)) continue;
      await c.query(`insert into assessor_choices (case_id, agency_id, activity, letter, source, decision_quote, pa4_quote, justification, departs, confirmed, updated_by)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10)
        on conflict (case_id, activity) do update set letter = excluded.letter, source = excluded.source, decision_quote = excluded.decision_quote,
          pa4_quote = excluded.pa4_quote, justification = excluded.justification, departs = excluded.departs, updated_by = excluded.updated_by, updated_at = now()`,
        [caseId, me.agencyId, key, a.letter, a.source, strip(a.decisionQuote), strip(a.pa4Quote), strip(a.justification), a.departs ?? null, me.userId]);
    }
    if (r.decisionDate) await c.query('update cases set decision_date = coalesce(decision_date, $2) where id = $1', [caseId, r.decisionDate.date]);
    await c.query("update cases set stage = 'mr' where id = $1 and stage in ('claim', 'assessment', 'decision')", [caseId]);
    const resolved = r.activities.filter(a => a.letter).length;
    await c.query("insert into extraction_runs (agency_id, case_id, model, dataset_version, verified, rejected, identifiers_removed, created_by, kind) values ($1, $2, $3, $4, $5, $6, $7, $8, 'assessment')",
      [me.agencyId, caseId, r.model, base.case.dataset_version, resolved, r.dropped.length, r.identifiersRemoved, me.userId]);
    await audit(c, me.agencyId, me.userId, caseId, `Decision papers read: DWP descriptor found for ${resolved} of 12 activities; ${r.dropped.length} quotes dropped for failing checks`);
  });
  return r;
}

/** The adviser confirms or corrects the DWP's descriptor for an activity. */
export async function setAssessorChoice(me: Me, caseId: string, activity: string, letter: string) {
  const act = activityList('pip').find(a => a.key === activity);
  if (!act) throw new Error('Unknown activity.');
  const n = Number(activity.split(':')[1]);
  const valid = data.benefits.find(b => b.id === 'pip')!.activities.find(a => a.number === n)!.descriptors.map(d => d.letter);
  if (!valid.includes(letter)) throw new Error('Choose one of the descriptors for this activity.');
  await asAgency(me.agencyId, async c => {
    const prev = (await c.query('select letter from assessor_choices where case_id = $1 and activity = $2', [caseId, activity])).rows[0];
    const changed = !prev || prev.letter !== letter;
    await c.query(`insert into assessor_choices (case_id, agency_id, activity, letter, source, confirmed, updated_by) values ($1, $2, $3, $4, 'adviser', true, $5)
      on conflict (case_id, activity) do update set letter = excluded.letter, confirmed = true, updated_by = excluded.updated_by, updated_at = now(),
        source = case when assessor_choices.letter = excluded.letter then assessor_choices.source else 'adviser' end`,
      [caseId, me.agencyId, activity, letter, me.userId]);
    await audit(c, me.agencyId, me.userId, caseId, changed ? `DWP descriptor for ${act.label} set to ${letter}` : `DWP descriptor for ${act.label} confirmed`);
  });
}

/** Confirm every activity where the papers gave a descriptor. */
export async function confirmAllChoices(me: Me, caseId: string) {
  await asAgency(me.agencyId, async c => {
    const r = await c.query('update assessor_choices set confirmed = true, updated_by = $2, updated_at = now() where case_id = $1 and letter is not null and not confirmed', [caseId, me.userId]);
    await audit(c, me.agencyId, me.userId, caseId, `DWP descriptors confirmed for ${r.rowCount} activities`);
  });
}

export async function saveMrDates(me: Me, caseId: string, decisionDate: string | null, requestDate: string | null, lateReason: string) {
  const ok = (d: string | null) => d === null || /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (!ok(decisionDate) || !ok(requestDate)) throw new Error('Enter dates as day, month and year.');
  if (decisionDate && requestDate && requestDate < decisionDate) throw new Error('The request date cannot be before the decision date.');
  await asAgency(me.agencyId, async c => {
    await c.query('update cases set decision_date = $2, mr_request_date = $3, late_reason = $4 where id = $1', [caseId, decisionDate, requestDate, lateReason.trim().slice(0, 2000) || null]);
    await audit(c, me.agencyId, me.userId, caseId, 'Reconsideration dates updated');
  });
}

export async function saveMrDraft(me: Me, caseId: string, text: string) {
  await asAgency(me.agencyId, async c => {
    await c.query('update cases set mr_draft = $2 where id = $1', [caseId, text.slice(0, 50_000)]);
    await audit(c, me.agencyId, me.userId, caseId, 'Reconsideration request draft saved');
  });
}

// ---------- pure: comparison and draft ----------

export function buildComparison(choices: ChoiceRow[], decisions: DecisionRow[], evidence: EvidenceRow[]):
  { comparison: PipComparison | null; missing: number[]; unconfirmed: number[] } {
  const pip = choices.filter(c => c.activity.startsWith('pip:'));
  const has = (n: number) => pip.find(c => c.activity === `pip:${n}` && c.letter);
  const missing = Array.from({ length: 12 }, (_, i) => i + 1).filter(n => !has(n));
  const unconfirmed = pip.filter(c => c.letter && !c.confirmed).map(c => Number(c.activity.split(':')[1])).sort((a, b) => a - b);
  if (missing.length) return { comparison: null, missing, unconfirmed };
  const refs: Record<number, EvidenceRef[]> = {};
  for (const e of evidence.filter(e => e.status === 'accepted')) {
    for (const k of e.activities.filter(k => k.startsWith('pip:'))) {
      const n = Number(k.split(':')[1]);
      (refs[n] ??= []).push({ doc: e.doc_name, page: e.page_no, quote: e.quote });
    }
  }
  const assessor = pip.map(c => {
    const n = Number(c.activity.split(':')[1]);
    return { activity: n, letter: c.letter!, justification: c.justification ? { doc: c.justification.docId, page: c.justification.page, quote: c.justification.quote } : undefined };
  });
  return { comparison: comparePip(data, assessor, pipInputs(decisions), refs), missing, unconfirmed };
}

const RATE: Record<string, string> = { none: 'no award', standard: 'the standard rate', enhanced: 'the enhanced rate' };
/** A document's name as it reads in a letter: no file extension or underscores. */
export const docTitle = (name: string) => name.replace(/\.(pdf|docx?|md|txt|jpe?g|png|tiff?)$/i, '').replace(/[_]+/g, ' ').trim();
const long = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * A plain draft of the request, for the adviser to edit. Built only from the
 * confirmed DWP position, the adviser's decisions and accepted evidence: no AI.
 */
export function buildMrDraft(input: {
  ref: string; decisionDate: string | null; timing: MrTiming | null; lateReason: string | null;
  comparison: PipComparison; decisions: DecisionRow[]; labels: Record<number, string>;
}): string {
  const { comparison: cmp } = input;
  const out: string[] = [];
  const when = input.decisionDate ? ` dated ${long(input.decisionDate)}` : '';
  out.push('Mandatory reconsideration request: Personal Independence Payment', `Reference: ${input.ref}`, '');
  out.push(`I am asking for a mandatory reconsideration of the PIP decision${when}.`);
  if (input.timing?.status === 'late') {
    out.push('', `This request is made more than one month after the decision. ${input.lateReason ? `It is late because ${input.lateReason.replace(/\.?$/, '.')}` : '[Explain why the request is late.]'}`);
  }
  const comp = (name: string, c: PipComparison['dailyLiving']) =>
    `${name}: the decision gave ${c.assessor.points} points (${RATE[c.assessor.rate]}). On the evidence, the claimant scores ${c.adviser.points} points (${RATE[c.adviser.rate]}).`;
  out.push('', comp('Daily living', cmp.dailyLiving), comp('Mobility', cmp.mobility));

  if (cmp.challenges.length) out.push('', 'The activities we dispute are set out below, starting with the largest difference.');
  for (const ch of cmp.challenges) {
    const dec = input.decisions.find(d => d.activity === `pip:${ch.activity}`);
    const days = dec?.days_per_week != null ? Number(dec.days_per_week) : null;
    out.push('', input.labels[ch.activity] ?? `Activity ${ch.activity}: ${ch.name}`);
    out.push(`The decision applied descriptor ${ch.activity}${ch.assessor.letter} (${ch.assessor.points} points): "${ch.assessor.text}"`);
    out.push(`We say descriptor ${ch.activity}${ch.adviser!.letter} applies (${ch.adviser!.points} points): "${ch.adviser!.text}"`);
    if (days !== null) out.push(`This applies on about ${days} days a week, which is over half of the days (regulation 7).`);
    if (ch.justification) out.push(`The assessor said: "${ch.justification.quote}" (assessment report, page ${ch.justification.page}).`);
    if (ch.evidence.length) {
      out.push('The evidence shows:');
      for (const e of ch.evidence) out.push(`- "${e.quote}" (${docTitle(e.doc)}, page ${e.page})`);
    } else {
      out.push('[Add the evidence for this activity.]');
    }
  }
  const agreed = cmp.activities.filter(a => a.status === 'agree').map(a => a.activity);
  if (agreed.length) out.push('', `We do not dispute the descriptors for activity ${agreed.join(', ')}.`);
  out.push('', 'Please consider all of the evidence listed above, including anything enclosed with this request, and send a written mandatory reconsideration notice with reasons.');
  return out.join('\n');
}
