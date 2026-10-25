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

export type InviteState = ActionState & { link?: string; email?: string };

export async function inviteAction(_: InviteState, form: FormData): Promise<InviteState> {
  const me = await requireMe();
  const { invite } = await import('@/lib/access');
  const email = String(form.get('email') ?? '');
  try {
    const token = await invite(me, email, String(form.get('role') ?? 'adviser'), String(form.get('officeId') ?? '') || null);
    const base = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
    revalidatePath('/team');
    return { ok: 'Invitation created.', link: `${base.replace(/\/$/, '')}/invite/${token}`, email: email.trim().toLowerCase() };
  } catch (e) { return { error: msg(e) }; }
}

async function personAction(form: FormData, fn: (me: Awaited<ReturnType<typeof requireMe>>, a: typeof import('@/lib/access')) => Promise<void>, ok: string): Promise<ActionState> {
  const me = await requireMe();
  try { await fn(me, await import('@/lib/access')); } catch (e) { return { error: msg(e) }; }
  revalidatePath('/team');
  return { ok };
}
export async function roleAction(_: ActionState, form: FormData) { return personAction(form, (me, a) => a.setRole(me, String(form.get('userId')), String(form.get('role'))), 'Role changed.'); }
export async function deactivateAction(_: ActionState, form: FormData) { return personAction(form, (me, a) => a.deactivate(me, String(form.get('userId'))), 'Access removed. They are signed out on their next click.'); }
export async function reactivateAction(_: ActionState, form: FormData) { return personAction(form, (me, a) => a.reactivate(me, String(form.get('userId'))), 'Access restored.'); }
export async function revokeInviteAction(_: ActionState, form: FormData) { return personAction(form, (me, a) => a.revokeInvite(me, String(form.get('inviteId'))), 'Invitation cancelled.'); }

export async function retentionAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireMe();
  try { await (await import('@/lib/retention')).setRetention(me, Number(form.get('months'))); } catch (e) { return { error: msg(e) }; }
  revalidatePath('/team');
  return { ok: 'Saved.' };
}
