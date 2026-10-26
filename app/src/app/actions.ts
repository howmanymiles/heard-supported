'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMe } from '@/lib/auth';
import { createCase, addDocument, readAndReview, setEvidenceStatus, setGapStatus, saveDecision, DOC_KINDS, type DocKind } from '@/lib/cases';
import { readAssessment, setAssessorChoice, confirmAllChoices, saveMrDates, saveMrDraft, getMr, buildComparison, buildMrDraft } from '@/lib/mr';
import { activityList, parseBenefit } from '@hs/core';
import { getAppeal, issuesFor, locate, buildGrounds, readMrNotice, readBundle, saveAppealDates, saveAppealDraft } from '@/lib/appeal';
import { putDocument } from '@/lib/storage';
import { asAgency, audit } from '@/lib/db';
import synthetic from '@/data/synthetic.json';
import { randomUUID } from 'node:crypto';
import type { Benefit } from '@hs/core';

export type ActionState = { error?: string; ok?: string };
type Synthetic = { id: string; benefit: Benefit; title: string; docs: Array<{ name: string; text: string }>; mrDocs: Array<{ name: string; kind: DocKind; text: string }>; appealDocs: Array<{ name: string; kind: DocKind; text: string }> };

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');

export async function loadSyntheticAction(form: FormData) {
  const me = await requireMe();
  const sc = (synthetic as Synthetic[]).find(s => s.id === form.get('id'));
  if (!sc) return;
  const ref = `TEST-${sc.id}`;   // kept as the agency reference; the case number is allocated
  const { fictionalClaimant } = await import('@/lib/claimants');
  const caseId = await createCase(me, ref, sc.benefit, await fictionalClaimant(me, sc.id));
  for (const d of sc.docs) {
    const docId = randomUUID();
    const path = `${me.agencyId}/${caseId}/${docId}`;
    const bytes = new TextEncoder().encode(d.text);
    await putDocument(path, bytes, 'text/markdown');
    const kind = / notes\.md$/.test(d.name) ? 'notes' : 'evidence'; // the fictional adviser interview notes
    await asAgency(me.agencyId, c => c.query('insert into documents (id, agency_id, case_id, name, kind, content_type, size_bytes, blob_path, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [docId, me.agencyId, caseId, d.name, kind, 'text/markdown', bytes.length, path, me.userId]));
  }
  await asAgency(me.agencyId, c => audit(c, me.agencyId, me.userId, caseId, `Loaded synthetic test case ${sc.id}`));
  redirect(`/cases/${caseId}`);
}

export async function uploadAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  if (process.env.DATA_MODE === 'synthetic-only' && form.get('fictional') !== 'yes') {
    return { error: 'This environment is for fictional test documents only. Confirm the document is fictional to upload it.' };
  }
  const files = form.getAll('file').filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: 'Choose a file to upload.' };
  // The adviser picks what the document is (src/lib/doctypes.ts); its kind follows from that.
  const { docType } = await import('@/lib/doctypes');
  const t = docType(String(form.get('docType') ?? ''));
  const allowed = String(form.get('kinds') ?? '').split(',');
  if (!t || !allowed.includes(t.kind)) return { error: 'Choose what the document is from the list.' };
  const kind = t.kind as DocKind;
  if (!DOC_KINDS.includes(kind)) return { error: 'Choose what kind of document this is.' };
  try {
    for (const f of files) await addDocument(me, caseId, f, kind, t.id);
  } catch (e) {
    return { error: msg(e) };
  }
  revalidatePath(`/cases/${caseId}`);
  revalidatePath(`/cases/${caseId}/mr`);
  return { ok: `${files.length} ${files.length === 1 ? 'document' : 'documents'} added.` };
}

export async function reviewAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  try {
    await readAndReview(me, caseId);
  } catch (e) {
    return { error: msg(e) };
  }
  revalidatePath(`/cases/${caseId}`);
  return { ok: 'Documents read and evidence reviewed.' };
}

export async function evidenceAction(form: FormData) {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  const status = String(form.get('status'));
  if (!['accepted', 'rejected', 'suggested'].includes(status)) return;
  await setEvidenceStatus(me, caseId, String(form.get('evidenceId')), status as 'accepted' | 'rejected' | 'suggested');
  revalidatePath(`/cases/${caseId}`);
}

export async function gapAction(form: FormData) {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  const status = String(form.get('status'));
  if (!['open', 'closed', 'dismissed'].includes(status)) return;
  await setGapStatus(me, caseId, String(form.get('gapId')), status as 'open' | 'closed' | 'dismissed');
  revalidatePath(`/cases/${caseId}`);
}

export async function decisionAction(form: FormData) {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  const days = String(form.get('days') ?? '').trim();
  await saveDecision(me, caseId, parseBenefit(form.get('benefit')), String(form.get('activity')), String(form.get('letter') ?? ''), days === '' ? null : Number(days));
  revalidatePath(`/cases/${caseId}`);
}

// ---------- mandatory reconsideration ----------

export async function loadSyntheticMrAction(form: FormData) {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  const id = String(form.get('syntheticId'));
  const stage = form.get('stage') === 'appeal' ? 'appeal' : 'mr';
  const sc = (synthetic as Synthetic[]).find(s => s.id === id);
  const papers = stage === 'appeal' ? sc?.appealDocs : sc?.mrDocs;
  if (!sc || !papers?.length) return;
  for (const d of papers) {
    const docId = randomUUID();
    const path = `${me.agencyId}/${caseId}/${docId}`;
    const bytes = new TextEncoder().encode(d.text);
    await putDocument(path, bytes, 'text/markdown');
    await asAgency(me.agencyId, c => c.query('insert into documents (id, agency_id, case_id, name, kind, content_type, size_bytes, blob_path, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [docId, me.agencyId, caseId, d.name, d.kind, 'text/markdown', bytes.length, path, me.userId]));
  }
  await asAgency(me.agencyId, c => audit(c, me.agencyId, me.userId, caseId, `Loaded fictional ${stage === 'appeal' ? 'appeal' : 'decision'} papers for ${sc.id}`));
  revalidatePath(`/cases/${caseId}/${stage}`);
}

export async function assessAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  try {
    const r = await readAssessment(me, caseId);
    revalidatePath(`/cases/${caseId}/mr`);
    return { ok: `DWP finding found for ${r.found} of ${r.of} ${r.of === 12 ? 'activities' : 'items'}. Check each one against the papers and confirm.` };
  } catch (e) {
    return { error: msg(e) };
  }
}

export async function choiceAction(form: FormData) {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  await setAssessorChoice(me, caseId, String(form.get('activity')), String(form.get('letter') ?? ''));
  revalidatePath(`/cases/${caseId}/mr`);
}

export async function confirmAllAction(form: FormData) {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  await confirmAllChoices(me, caseId);
  revalidatePath(`/cases/${caseId}/mr`);
}

export async function mrDatesAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  const d = (k: string) => { const v = String(form.get(k) ?? '').trim(); return v === '' ? null : v; };
  try {
    const outcome = form.has('outcome') ? (d('outcome') as string | null) : undefined;
    await saveMrDates(me, caseId, d('decisionDate'), d('requestDate'), String(form.get('lateReason') ?? ''), outcome);
  } catch (e) {
    return { error: msg(e) };
  }
  revalidatePath(`/cases/${caseId}/mr`);
  return { ok: 'Dates saved.' };
}

export async function draftAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  const mr = await getMr(me, caseId);
  if (!mr) return { error: 'Case not found.' };
  if (mr.case.benefit === 'uc-wca') {
    const { buildWcaComparison, buildWcaDraft } = await import('@/lib/mr-wca');
    const w = buildWcaComparison(mr.choices, mr.decisions, mr.evidence, mr.case.decision_outcome, mr.docs.some(d => d.kind === 'uc85' || d.kind === 'uc85a'), mr.case.decision_date);
    if (!w.comparison) return { error: `The DWP finding is still missing for ${w.missing.join(', ')}.` };
    if (w.unconfirmed.length) return { error: `Confirm the DWP finding for ${w.unconfirmed.join(', ')} first.` };
    const report = mr.docs.find(d => d.kind === 'uc85a') ? 'UC85A report' : 'UC85 report';
    await saveMrDraft(me, caseId, buildWcaDraft({ ref: mr.case.ref, decisionDate: mr.decisionDate, timing: mr.timing, lateReason: mr.case.late_reason, noticeOutcome: mr.case.decision_outcome, reportName: report, comparison: w.comparison }));
    revalidatePath(`/cases/${caseId}/mr`);
    return { ok: 'Draft created from the comparison. Edit it below and save.' };
  }
  const b = mr.case.benefit === 'adp' ? 'adp' : 'pip';
  const who = b === 'adp' ? 'Social Security Scotland' : 'DWP';
  const { comparison, missing, unconfirmed } = buildComparison(mr.choices, mr.decisions, mr.evidence, b, mr.case.decision_date);
  if (!comparison || missing.length) return { error: `The ${who} descriptor is still missing for activity ${missing.join(', ')}.` };
  if (unconfirmed.length) return { error: `Confirm the ${who} descriptor for activity ${unconfirmed.join(', ')} first.` };
  const labels = Object.fromEntries(activityList(b).map(a => [Number(a.key.split(':')[1]), a.label]));
  const text = buildMrDraft({
    ref: mr.case.ref, decisionDate: mr.decisionDate, timing: mr.timing, lateReason: mr.case.late_reason,
    comparison, decisions: mr.decisions, labels, benefit: b,
  });
  await saveMrDraft(me, caseId, text);
  revalidatePath(`/cases/${caseId}/mr`);
  return { ok: 'Draft created from the comparison. Edit it below and save.' };
}

export async function saveDraftAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  await saveMrDraft(me, caseId, String(form.get('draft') ?? ''));
  revalidatePath(`/cases/${caseId}/mr`);
  return { ok: 'Draft saved.' };
}

// ---------- appeal ----------

export async function mrNoticeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  try {
    const r = await readMrNotice(me, caseId);
    revalidatePath(`/cases/${caseId}/appeal`);
    return { ok: `MR notice read${r.date ? `, dated ${r.date}` : ' (no date found: add it below)'}. ${r.revised.length ? `Revised: ${r.revised.join(', ')}. Confirm these on the reconsideration tab.` : 'No descriptor changes found.'}` };
  } catch (e) { return { error: msg(e) }; }
}

export async function bundleAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  try {
    const r = await readBundle(me, caseId);
    revalidatePath(`/cases/${caseId}/appeal`);
    return { ok: `Bundle read. Decision maker’s reasoning found for ${r.found} of ${r.of} disputed items.` };
  } catch (e) { return { error: msg(e) }; }
}

export async function appealDatesAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  const d = (k: string) => { const v = String(form.get(k) ?? '').trim(); return v === '' ? null : v; };
  try { await saveAppealDates(me, caseId, d('mrNoticeDate'), d('sentDate'), String(form.get('lateReason') ?? '')); }
  catch (e) { return { error: msg(e) }; }
  revalidatePath(`/cases/${caseId}/appeal`);
  revalidatePath('/');
  return { ok: 'Dates saved.' };
}

export async function groundsAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  const a = await getAppeal(me, caseId);
  if (!a) return { error: 'Case not found.' };
  const { issues, summary, blocked } = issuesFor(a);
  if (blocked) return { error: blocked };
  const text = buildGrounds({ benefit: a.case.benefit, ref: a.case.ref, decisionDate: a.decisionDate, mrNoticeDate: a.mrNoticeDate, timing: a.appealTimingNow, lateReason: a.case.appeal_late_reason,
    summary: summary!, issues, located: locate(issues, a.bundle, a.responseReasoning), hasBundle: !!a.bundle });
  await saveAppealDraft(me, caseId, text);
  revalidatePath(`/cases/${caseId}/appeal`);
  return { ok: 'Grounds drafted. Edit them below and save.' };
}

export async function saveGroundsAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  await saveAppealDraft(me, caseId, String(form.get('draft') ?? ''));
  revalidatePath(`/cases/${caseId}/appeal`);
  return { ok: 'Draft saved.' };
}

export async function aiSubmissionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  const stage = form.get('stage') === 'appeal' ? 'appeal' : 'mr';
  try {
    const { writeSubmission } = await import('@/lib/submission');
    const r = await writeSubmission(me, caseId, stage);
    revalidatePath(`/cases/${caseId}/${stage}`);
    return { ok: `Letter drafted: ${r.kept} sentences${r.dropped.length ? `; ${r.dropped.length} dropped because they failed the checks` : ''}. ${r.argument.length ? `${r.argument.length} sentences of argument have no citation: check them below.` : ''}` };
  } catch (e) { return { error: msg(e) }; }
}

export async function letterAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  const kind = form.get('kind') === 'request_report' ? 'request_report' : 'raise_mr';
  const { buildLetter, addLetter } = await import('@/lib/letters');
  const mr = await getMr(me, caseId);
  if (!mr) return { error: 'Case not found.' };
  const text = buildLetter(kind, { benefit: mr.case.benefit, ref: mr.case.ref, decisionDate: mr.decisionDate, timing: mr.timing, lateReason: mr.case.late_reason, today: new Date().toISOString().slice(0, 10), hasPaperBased: mr.docs.some(d => d.kind === 'uc85a') },
    { requestReport: form.get('requestReport') === 'yes', holdForEvidence: form.get('hold') === 'yes', authorityEnclosed: form.get('authority') === 'yes', disputes: String(form.get('disputes') ?? '').slice(0, 300) });
  await addLetter(me, caseId, kind, text);
  revalidatePath(`/cases/${caseId}/mr`);
  return { ok: mr.decisionDate ? 'Letter drafted below. Edit it and save.' : 'Letter drafted below. Add the decision date above so the letter and the time limit are right.' };
}

export async function saveLetterAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  const { saveLetter } = await import('@/lib/letters');
  await saveLetter(me, caseId, String(form.get('id')), String(form.get('text') ?? ''));
  revalidatePath(`/cases/${caseId}/mr`);
  return { ok: 'Saved.' };
}

// ---------- casework ----------

export async function assignAction(form: FormData) {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  const { assignCase } = await import('@/lib/casework');
  await assignCase(me, caseId, String(form.get('userId') || me.userId));
  revalidatePath(`/cases/${caseId}`);
  revalidatePath('/');
}

export async function outcomeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  const v = (k: string) => { const x = String(form.get(k) ?? '').trim(); return x === '' ? null : x; };
  const award = (p: string) => ({ daily_living: v(`${p}_dl`) ?? undefined, mobility: v(`${p}_mob`) ?? undefined, wca: v(`${p}_wca`) ?? undefined });
  try {
    const { saveOutcome } = await import('@/lib/casework');
    await saveOutcome(me, caseId, { mrOutcome: v('mrOutcome'), mrOutcomeDate: v('mrOutcomeDate'), appealOutcome: v('appealOutcome'), appealOutcomeDate: v('appealOutcomeDate'), before: award('before'), after: award('after'), ucLcwraRate: v('ucLcwraRate'), lcwLegacy: form.get('lcwLegacy') === 'yes' });
  } catch (e) { return { error: msg(e) }; }
  revalidatePath(`/cases/${caseId}/outcome`);
  return { ok: 'Outcome saved.' };
}

export async function closeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  try {
    const { closeCase } = await import('@/lib/casework');
    await closeCase(me, caseId, String(form.get('reason') ?? ''), String(form.get('note') ?? ''));
  } catch (e) { return { error: msg(e) }; }
  revalidatePath(`/cases/${caseId}/outcome`);
  revalidatePath('/');
  return { ok: 'Case closed. It no longer appears in the open caseload.' };
}

export async function reopenAction(form: FormData) {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  const { reopenCase } = await import('@/lib/casework');
  await reopenCase(me, caseId);
  revalidatePath(`/cases/${caseId}/outcome`);
  revalidatePath('/');
}

export async function issueResultsAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  const keys = form.getAll('key').map(String);
  const items = keys.map(k => ({ key: k, label: String(form.get(`label:${k}`) ?? k), result: String(form.get(`result:${k}`) ?? '') || null, stage: String(form.get(`stage:${k}`) ?? '') || null }));
  try {
    const { saveIssueResults } = await import('@/lib/outcomes');
    await saveIssueResults(me, caseId, items);
  } catch (e) { return { error: msg(e) }; }
  revalidatePath(`/cases/${caseId}/outcome`);
  return { ok: 'Results saved.' };
}

export async function decisionsAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  const entries: Array<{ activity: string; letter: string; days: number | null }> = [];
  for (const [k, v] of form.entries()) if (k.startsWith('letter:')) {
    const activity = k.slice(7);
    const d = String(form.get(`days:${activity}`) ?? '').trim();
    entries.push({ activity, letter: String(v), days: d === '' ? null : Number(d) });
  }
  try {
    const { saveDecisions } = await import('@/lib/cases');
    const n = await saveDecisions(me, caseId, parseBenefit(form.get('benefit')), entries);
    revalidatePath(`/cases/${caseId}`);
    return { ok: n ? `Saved your view for ${n} activit${n === 1 ? 'y' : 'ies'}.` : 'Nothing had changed.' };
  } catch (e) { return { error: msg(e) }; }
}

export async function claimedAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  const caseId = String(form.get('caseId'));
  const entries: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (k.startsWith('claim:')) entries[k.slice(6)] = String(v);
  try {
    const { saveClaimed } = await import('@/lib/cases');
    const n = await saveClaimed(me, caseId, parseBenefit(form.get('benefit')), entries);
    revalidatePath(`/cases/${caseId}`);
    return { ok: `Saved: what the claimant is claiming, for ${n} activit${n === 1 ? 'y' : 'ies'}.` };
  } catch (e) { return { error: msg(e) }; }
}
