'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMe } from '@/lib/auth';
import { createCase, addDocument, readAndReview, setEvidenceStatus, setGapStatus, saveDecision } from '@/lib/cases';
import { putDocument } from '@/lib/storage';
import { asAgency, audit } from '@/lib/db';
import synthetic from '@/data/synthetic.json';
import { randomUUID } from 'node:crypto';
import type { Benefit } from '@hs/core';

export type ActionState = { error?: string; ok?: string };

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');

export async function createCaseAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  let id: string;
  try {
    const benefit = form.get('benefit') === 'uc-wca' ? 'uc-wca' : 'pip';
    id = await createCase(me, String(form.get('ref') ?? ''), benefit);
  } catch (e) {
    const m = msg(e);
    return { error: m.includes('duplicate key') ? 'A case with that reference already exists.' : m };
  }
  redirect(`/cases/${id}`);
}

export async function loadSyntheticAction(form: FormData) {
  const me = await requireMe();
  const sc = (synthetic as Array<{ id: string; benefit: Benefit; title: string; docs: Array<{ name: string; text: string }> }>).find(s => s.id === form.get('id'));
  if (!sc) return;
  const ref = `TEST-${sc.id}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const caseId = await createCase(me, ref, sc.benefit);
  for (const d of sc.docs) {
    const docId = randomUUID();
    const path = `${me.agencyId}/${caseId}/${docId}`;
    const bytes = new TextEncoder().encode(d.text);
    await putDocument(path, bytes, 'text/markdown');
    await asAgency(me.agencyId, c => c.query('insert into documents (id, agency_id, case_id, name, content_type, size_bytes, blob_path, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8)',
      [docId, me.agencyId, caseId, d.name, 'text/markdown', bytes.length, path, me.userId]));
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
  try {
    for (const f of files) await addDocument(me, caseId, f);
  } catch (e) {
    return { error: msg(e) };
  }
  revalidatePath(`/cases/${caseId}`);
  return { ok: `${files.length} ${files.length === 1 ? 'document' : 'documents'} added. Select “Read and review” to check them.` };
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
  await saveDecision(me, caseId, form.get('benefit') === 'uc-wca' ? 'uc-wca' : 'pip', String(form.get('activity')), String(form.get('letter') ?? ''), days === '' ? null : Number(days));
  revalidatePath(`/cases/${caseId}`);
}
