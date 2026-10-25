'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireMe } from '@/lib/auth';
import { createClaimant, updateClaimant, recordConsent, withdrawConsent, type ConsentInput } from '@/lib/claimants';
import { createCase } from '@/lib/cases';
import type { ActionState } from '../actions';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');
const text = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const consentFrom = (f: FormData): ConsentInput => ({
  method: text(f, 'method'), givenOn: text(f, 'givenOn'), confirmed: f.get('confirmed') === 'yes',
  storeData: f.get('store_data') === 'yes', aiProcessing: f.get('ai_processing') === 'yes', actOnBehalf: f.get('act_on_behalf') === 'yes',
});
const personFrom = (f: FormData) => ({ name: text(f, 'name'), preferredName: text(f, 'preferredName') || null, dateOfBirth: text(f, 'dateOfBirth') || null, agencyRef: text(f, 'agencyRef') || null, postcode: text(f, 'postcode') || null });

export async function createClientAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  let id: string;
  try { id = await createClaimant(me, personFrom(form), consentFrom(form)); } catch (e) { return { error: msg(e) }; }
  redirect(`/clients/${id}`);
}

export async function updateClientAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  const id = text(form, 'claimantId');
  try { await updateClaimant(me, id, personFrom(form)); } catch (e) { return { error: msg(e) }; }
  revalidatePath(`/clients/${id}`);
  return { ok: 'Details saved.' };
}

export async function consentAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  const id = text(form, 'claimantId');
  try { await recordConsent(me, id, consentFrom(form)); } catch (e) { return { error: msg(e) }; }
  revalidatePath(`/clients/${id}`);
  return { ok: 'New consent recorded. It replaces the previous one.' };
}

export async function withdrawAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  const id = text(form, 'claimantId');
  try { await withdrawConsent(me, id, text(form, 'note')); } catch (e) { return { error: msg(e) }; }
  revalidatePath(`/clients/${id}`);
  return { ok: 'Consent withdrawn. The AI is off for this client and nothing more can be added.' };
}

export async function clientCaseAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  let id: string;
  try {
    id = await createCase(me, text(form, 'ref'), form.get('benefit') === 'uc-wca' ? 'uc-wca' : 'pip', text(form, 'claimantId'));
  } catch (e) {
    const m = msg(e);
    return { error: m.includes('duplicate key') ? 'A case with that reference already exists.' : m };
  }
  redirect(`/cases/${id}`);
}
