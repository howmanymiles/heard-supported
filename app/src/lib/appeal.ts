// Appeal to the First-tier Tribunal: time limits from the MR notice, the DWP's
// position after reconsideration, where each piece of evidence sits in the DWP
// response bundle (and what is missing from it), and draft grounds of appeal.

import { appealTiming, extractAssessor, extractResponseReasoning, locateInBundle, parseUkDate, activityList, type MrTiming, type BundleHit } from '@hs/core';
import { asAgency, audit } from './db.ts';
import { readUnread, readPages, type EvidenceRow, type DocRow } from './cases.ts';
import { getMr, buildComparison, docTitle, type ChoiceRow, type Quote } from './mr.ts';
import { buildWcaComparison, OUTCOME_LABEL } from './mr-wca.ts';
import type { Me } from './auth.ts';

const today = () => new Date().toISOString().slice(0, 10);
const isoDate = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : typeof d === 'string' && d ? d.slice(0, 10) : null);
const RATE: Record<string, string> = { none: 'no award', standard: 'the standard rate', enhanced: 'the enhanced rate' };

/** A disputed item, the same shape for PIP and WCA. */
export type Issue = {
  key: string; label: string;
  dwp: string; ours: string;                    // one line each, for the grounds
  refs: string[];                               // descriptor references on either side, e.g. "12b", "13(c)"
  assessorReason: Quote | null;                 // from the PA4 / UC85 / UC85A
  evidence: Array<{ doc: string; page: number; quote: string }>;
};

export async function getAppeal(me: Me, caseId: string) {
  const mr = await getMr(me, caseId);
  if (!mr) return null;
  const mrNoticeDate = isoDate(mr.case.mr_notice_date);
  const appealSentDate = isoDate(mr.case.appeal_sent_date);
  const timing: MrTiming | null = mrNoticeDate ? appealTiming(mrNoticeDate, appealSentDate ?? today()) : null;
  const bundleDoc = mr.docs.find(d => d.kind === 'dwp_bundle' && d.read_status === 'read') ?? null;
  const bundle = bundleDoc ? (await readPages(me, caseId, ['dwp_bundle'])).find(d => d.id === bundleDoc.id)! : null;
  return { ...mr, mrNoticeDate, appealSentDate, appealTimingNow: timing, bundleDoc, bundle, responseReasoning: (mr.case.response_reasoning ?? {}) as Record<string, Quote> };
}

/** The disputed items and the position on each side, from the current (post-MR) DWP position. */
export function issuesFor(a: NonNullable<Awaited<ReturnType<typeof getAppeal>>>): { issues: Issue[]; summary: string | null; blocked: string | null } {
  if (a.case.benefit === 'pip') {
    const { comparison: c, missing, unconfirmed } = buildComparison(a.choices, a.decisions, a.evidence);
    if (!c) return { issues: [], summary: null, blocked: `The DWP descriptor is missing for activity ${missing.join(', ')}. Complete the reconsideration tab first.` };
    if (unconfirmed.length) return { issues: [], summary: null, blocked: `Confirm the DWP descriptor for activity ${unconfirmed.join(', ')} on the reconsideration tab.` };
    const labels = Object.fromEntries(activityList('pip').map(x => [x.key, x.label]));
    return {
      issues: c.challenges.map(ch => ({
        key: `pip:${ch.activity}`, label: labels[`pip:${ch.activity}`],
        dwp: `The decision maker applied descriptor ${ch.activity}${ch.assessor.letter} (${ch.assessor.points} points).`,
        ours: `The appellant says descriptor ${ch.activity}${ch.adviser!.letter} applies (${ch.adviser!.points} points): "${ch.adviser!.text}"`,
        refs: [`${ch.activity}${ch.assessor.letter}`, `${ch.activity}${ch.adviser!.letter}`],
        assessorReason: ch.justification ? { docId: ch.justification.doc, page: ch.justification.page, quote: ch.justification.quote } : null,
        evidence: ch.evidence,
      })),
      summary: `The decision gave ${c.dailyLiving.assessor.points} points for daily living (${RATE[c.dailyLiving.assessor.rate]}) and ${c.mobility.assessor.points} points for mobility (${RATE[c.mobility.assessor.rate]}). The appellant says they score ${c.dailyLiving.adviser.points} points for daily living (${RATE[c.dailyLiving.adviser.rate]}) and ${c.mobility.adviser.points} points for mobility (${RATE[c.mobility.adviser.rate]}).`,
      blocked: null,
    };
  }
  const { comparison: c, missing, unconfirmed } = buildWcaComparison(a.choices, a.decisions, a.evidence, a.case.decision_outcome);
  if (!c) return { issues: [], summary: null, blocked: `The DWP finding is missing for ${missing.join(', ')}. Complete the reconsideration tab first.` };
  if (unconfirmed.length) return { issues: [], summary: null, blocked: `Confirm the DWP finding for ${unconfirmed.join(', ')} on the reconsideration tab.` };
  return {
    issues: c.challenges.map(r => ({
      key: r.key, label: r.key === 'sch7' ? 'Schedule 7' : r.label,
      dwp: r.key.startsWith('sch6:') ? `The decision maker applied descriptor ${r.key.split(':')[1]}(${r.dwp}) (${r.dwpPoints} points).`
        : r.key === 'sch7' ? `The decision maker found ${r.dwp === 'none' ? 'that no Schedule 7 descriptor applies' : `descriptor ${r.dwp}`}.`
          : 'The decision maker found that it does not apply.',
      ours: r.key.startsWith('sch6:') ? `The appellant says descriptor ${r.key.split(':')[1]}(${r.adviser}) applies (${r.adviserPoints} points): "${r.adviserText}"`
        : r.key === 'sch7' ? `The appellant says ${r.adviserText}`
          : `The appellant says there would be a substantial risk to the physical or mental health of any person if the appellant were found not to have ${r.key === 'sch8:4' ? 'limited capability for work' : 'limited capability for work-related activity'}.`,
      refs: r.key.startsWith('sch6:') ? [`${r.key.split(':')[1]}(${r.dwp})`, `${r.key.split(':')[1]}(${r.adviser})`] : r.key === 'sch7' ? [r.dwp, ...(r.adviser ?? '').split(/,\s*/)].filter(x => x && x !== 'none') : [],
      assessorReason: r.justification, evidence: r.evidence,
    })),
    summary: `The decision maker found ${OUTCOME_LABEL[c.dwpOutcome]} (${c.dwp.lcw.totalPoints} points). The appellant says they score ${c.adviser.lcw.totalPoints} points and has ${OUTCOME_LABEL[c.adviserOutcome]}.`,
    blocked: null,
  };
}

/** Where each quote on an issue sits in the bundle; null means it is not in the bundle. */
export function locate(issues: Issue[], bundle: { pages: Array<{ page: number; text: string }> } | null, reasoning: Record<string, Quote>) {
  return issues.map(i => ({
    key: i.key,
    reasoning: reasoning[i.key] ? { quote: reasoning[i.key], at: bundle ? locateInBundle(reasoning[i.key].quote, bundle.pages) : null } : null,
    assessorReason: i.assessorReason ? { quote: i.assessorReason, at: bundle ? locateInBundle(i.assessorReason.quote, bundle.pages) : null } : null,
    evidence: i.evidence.map(e => ({ ...e, at: bundle ? locateInBundle(e.quote, bundle.pages) : null as BundleHit | null })),
  }));
}

const long = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Draft grounds of appeal, from confirmed facts, decisions, accepted evidence and bundle pages: no AI-written text. */
export function buildGrounds(input: {
  benefit: 'pip' | 'uc-wca'; ref: string; decisionDate: string | null; mrNoticeDate: string | null; timing: MrTiming | null; lateReason: string | null;
  summary: string; issues: Issue[]; located: ReturnType<typeof locate>; hasBundle: boolean;
}): string {
  const out: string[] = [];
  out.push(`Grounds of appeal: ${input.benefit === 'pip' ? 'Personal Independence Payment' : 'Universal Credit, Work Capability Assessment'}`, `Reference: ${input.ref}`, '');
  out.push(`The decision under appeal is the decision${input.decisionDate ? ` dated ${long(input.decisionDate)}` : ''}${input.mrNoticeDate ? `, as reconsidered on ${long(input.mrNoticeDate)}` : ''}.`);
  if (input.timing?.status === 'late') out.push('', `This appeal is made more than one month after the mandatory reconsideration notice. ${input.lateReason ? `It is late because ${input.lateReason.replace(/\.?$/, '.')}` : '[Explain why the appeal is late.]'}`);
  out.push('', input.summary);
  const enclosed: string[] = [];
  const where = (at: BundleHit | null, fallback: string) => (at ? `bundle page ${at.bundlePage}` : fallback);
  for (const i of input.issues) {
    const l = input.located.find(x => x.key === i.key)!;
    out.push('', i.label, i.dwp, i.ours);
    if (l.reasoning) out.push(`The decision maker says: "${l.reasoning.quote.quote}" (${where(l.reasoning.at, 'response')}).`);
    else if (l.assessorReason) out.push(`The assessor said: "${l.assessorReason.quote.quote}" (${where(l.assessorReason.at, `assessment report, page ${l.assessorReason.quote.page}`)}).`);
    const inBundle = l.evidence.filter(e => e.at || !input.hasBundle);
    const outside = l.evidence.filter(e => !e.at && input.hasBundle);
    if (inBundle.length) { out.push('The evidence shows:'); for (const e of inBundle) out.push(`- "${e.quote}" (${e.at ? `${docTitle(e.doc)}, bundle page ${e.at.bundlePage}` : `${docTitle(e.doc)}, page ${e.page}`})`); }
    for (const e of outside) { out.push(`- "${e.quote}" (${docTitle(e.doc)}, page ${e.page}; not in the DWP bundle, enclosed)`); enclosed.push(docTitle(e.doc)); }
    if (!l.evidence.length) out.push('[Add the evidence for this.]');
  }
  if (enclosed.length) out.push('', `Enclosed, as they are not in the DWP bundle: ${[...new Set(enclosed)].join('; ')}.`);
  return out.join('\n');
}

// ---------- actions ----------

/** Read the MR notice: its date, and for PIP any descriptor it revised. Revised items go back to "to check". */
export async function readMrNotice(me: Me, caseId: string) {
  const a = await getAppeal(me, caseId);
  if (!a) throw new Error('Case not found.');
  const notices = a.docs.filter(d => d.kind === 'mr_notice');
  if (!notices.length) throw new Error('Upload the mandatory reconsideration notice first, marked as such.');
  await readUnread(me, caseId, notices);
  const docs = await readPages(me, caseId, ['mr_notice']);
  const lines = docs.flatMap(d => d.pages.flatMap(p => p.text.split('\n')));
  const dateLine = lines.find(l => /\bdate\b/i.test(l) && parseUkDate(l)) ?? null;
  const date = dateLine ? parseUkDate(dateLine) : null;
  const revised: string[] = [];
  if (a.case.benefit === 'pip') {
    const r = await extractAssessor(docs.map(d => ({ ...d, kind: 'decision' as const })));
    await asAgency(me.agencyId, async c => {
      for (const x of r.activities) {
        const key = `pip:${x.activity}`;
        const cur = a.choices.find(ch => ch.activity === key);
        if (!x.letter || !x.decisionQuote || cur?.letter === x.letter) continue;
        revised.push(`activity ${x.activity}: ${cur?.letter ?? '?'} to ${x.letter}`);
        await c.query(`insert into assessor_choices (case_id, agency_id, activity, letter, source, decision_quote, confirmed, updated_by) values ($1, $2, $3, $4, 'mr_notice', $5, false, $6)
          on conflict (case_id, activity) do update set letter = excluded.letter, source = 'mr_notice', decision_quote = excluded.decision_quote, confirmed = false, updated_by = excluded.updated_by, updated_at = now()`,
          [caseId, me.agencyId, key, x.letter, { docId: x.decisionQuote.docId, page: x.decisionQuote.page, quote: x.decisionQuote.quote }, me.userId]);
      }
    });
  }
  await asAgency(me.agencyId, async c => {
    if (date) await c.query('update cases set mr_notice_date = coalesce(mr_notice_date, $2) where id = $1', [caseId, date]);
    await c.query("update cases set stage = 'appeal' where id = $1 and stage <> 'closed'", [caseId]);
    await audit(c, me.agencyId, me.userId, caseId, `MR notice read${date ? ` (dated ${date})` : ''}${revised.length ? `; revised ${revised.join(', ')}` : '; no descriptor changes found'}`);
  });
  return { date, revised };
}

/** Read the DWP response bundle and find the decision maker's reasoning on each disputed item. */
export async function readBundle(me: Me, caseId: string) {
  const a = await getAppeal(me, caseId);
  if (!a) throw new Error('Case not found.');
  const docs = a.docs.filter(d => d.kind === 'dwp_bundle');
  if (!docs.length) throw new Error('Upload the DWP response bundle first, marked as such.');
  await readUnread(me, caseId, docs);
  const fresh = (await getAppeal(me, caseId))!;
  const { issues, blocked } = issuesFor(fresh);
  if (blocked) throw new Error(blocked);
  const r = await extractResponseReasoning(fresh.bundle!, issues.map(i => ({ key: i.key, label: i.label })));
  const reasoning = Object.fromEntries(Object.entries(r.reasoning).map(([k, q]) => [k, { docId: q.docId, page: q.page, quote: q.quote }]));
  await asAgency(me.agencyId, async c => {
    await c.query('update cases set response_reasoning = $2 where id = $1', [caseId, reasoning]);
    await c.query("insert into extraction_runs (agency_id, case_id, model, dataset_version, verified, rejected, identifiers_removed, created_by, kind) values ($1, $2, $3, $4, $5, $6, $7, $8, 'assessment')",
      [me.agencyId, caseId, r.model, fresh.case.dataset_version, Object.keys(reasoning).length, r.dropped.length, r.identifiersRemoved, me.userId]);
    await audit(c, me.agencyId, me.userId, caseId, `DWP response read: decision maker's reasoning found for ${Object.keys(reasoning).length} of ${issues.length} disputed items`);
  });
  return { found: Object.keys(reasoning).length, of: issues.length };
}

export async function saveAppealDates(me: Me, caseId: string, mrNoticeDate: string | null, sentDate: string | null, lateReason: string) {
  const ok = (d: string | null) => d === null || /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (!ok(mrNoticeDate) || !ok(sentDate)) throw new Error('Enter dates as day, month and year.');
  if (mrNoticeDate && sentDate && sentDate < mrNoticeDate) throw new Error('The appeal cannot be sent before the MR notice.');
  await asAgency(me.agencyId, async c => {
    await c.query("update cases set mr_notice_date = $2, appeal_sent_date = $3, appeal_late_reason = $4, stage = case when $2::date is not null and stage <> 'closed' then 'appeal' else stage end where id = $1",
      [caseId, mrNoticeDate, sentDate, lateReason.trim().slice(0, 2000) || null]);
    await audit(c, me.agencyId, me.userId, caseId, 'Appeal dates updated');
  });
}

export async function saveAppealDraft(me: Me, caseId: string, text: string) {
  await asAgency(me.agencyId, async c => {
    await c.query('update cases set appeal_draft = $2 where id = $1', [caseId, text.slice(0, 50_000)]);
    await audit(c, me.agencyId, me.userId, caseId, 'Grounds of appeal draft saved');
  });
}

export type { ChoiceRow, EvidenceRow, DocRow };
