'use server';

import { signUpAgency, AccessError } from '@/lib/access';

export type SignUpState = { error?: string; done?: boolean };

export async function signUpAction(_: SignUpState, form: FormData): Promise<SignUpState> {
  if (String(form.get('website') ?? '')) return { done: true };   // a field people can't see: filled in only by bots
  const t = (k: string) => String(form.get(k) ?? '');
  try {
    await signUpAgency({ name: t('name'), registeredNumber: t('number'), contactName: t('contactName'), contactEmail: t('contactEmail'), acceptTerms: form.get('terms') === 'yes' });
  } catch (e) { return { error: e instanceof AccessError ? e.message : 'Something went wrong. Try again.' }; }
  return { done: true };
}
