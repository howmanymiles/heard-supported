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

export type InviteState = ActionState & { link?: string; email?: string; emailed?: boolean };

export async function inviteAction(_: InviteState, form: FormData): Promise<InviteState> {
  const me = await requireMe();
  const { invite } = await import('@/lib/access');
  const email = String(form.get('email') ?? '');
  try {
    const role = String(form.get('role') ?? 'adviser');
    const token = await invite(me, email, role, String(form.get('officeId') ?? '') || null);
    const base = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
    const link = `${base.replace(/\/$/, '')}/invite/${token}`, to = email.trim().toLowerCase();
    revalidatePath('/team');
    const mail = await import('@/lib/email');
    if (mail.emailEnabled()) {
      try {
        const { agencyName, ROLES, INVITE_DAYS } = await import('@/lib/access');
        await mail.sendMail(mail.inviteMail({ to, agency: await agencyName(me), inviter: me.name || 'Your agency’s admin', role: (role === 'admin' ? 'an ' : 'a ') + ROLES[role as keyof typeof ROLES].toLowerCase(), link, days: INVITE_DAYS }));
        return { ok: `Invitation emailed to ${to}.`, email: to, emailed: true, link };
      } catch (e) {
        console.error('Invitation email failed:', e instanceof Error ? e.message : e);
        return { ok: 'The invitation was created, but the email couldn’t be sent. Send them this link instead.', link, email: to };
      }
    }
    return { ok: 'Invitation created.', link, email: to };
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
