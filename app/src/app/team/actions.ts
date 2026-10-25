'use server';

import { revalidatePath } from 'next/cache';
import { requireMe } from '@/lib/auth';
import { addOffice, renameOffice, setUserOffice } from '@/lib/offices';
import type { ActionState } from '../actions';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');

export async function addOfficeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  try { await addOffice(me, String(form.get('name') ?? '')); } catch (e) { return { error: msg(e) }; }
  revalidatePath('/team');
  return { ok: 'Office added.' };
}

export async function renameOfficeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  try { await renameOffice(me, String(form.get('officeId')), String(form.get('name') ?? '')); } catch (e) { return { error: msg(e) }; }
  revalidatePath('/team');
  return { ok: 'Renamed.' };
}

export async function userOfficeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  try { await setUserOffice(me, String(form.get('userId')), String(form.get('officeId') ?? '') || null); } catch (e) { return { error: msg(e) }; }
  revalidatePath('/team');
  return { ok: 'Saved. Their open cases moved with them.' };
}
