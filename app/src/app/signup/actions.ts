'use server';

import { headers } from 'next/headers';
import { signUpAgency, AccessError } from '@/lib/access';
import { hit, clientIp, LIMITS } from '@/lib/ratelimit';

export type SignUpState = { error?: string; done?: boolean };

export async function signUpAction(_: SignUpState, form: FormData): Promise<SignUpState> {
  if (String(form.get('website') ?? '')) return { done: true };   // a field people can't see: filled in only by bots
  if (!hit(`signup:${clientIp(await headers())}`, LIMITS.signupPerIp.max, LIMITS.signupPerIp.window).ok) return { error: 'Too many sign-ups from this connection. Wait an hour and try again, or contact us.' };
  const t = (k: string) => String(form.get(k) ?? '');
  try {
    await signUpAgency({ name: t('name'), registeredNumber: t('number'), contactName: t('contactName'), contactEmail: t('contactEmail'), acceptTerms: form.get('terms') === 'yes', noClaimantFees: form.get('noFees') === 'yes' });
  } catch (e) { return { error: e instanceof AccessError ? e.message : 'Something went wrong. Try again.' }; }
  return { done: true };
}
