'use client';

import { useActionState } from 'react';
import { Submit } from '../forms';
import { signUpAction } from './actions';

export function SignUpForm({ terms }: { terms: string }) {
  const [state, action] = useActionState(signUpAction, {});
  if (state.done) return <p className="msg msg-ok" role="status">Thank you. We’ll check your organisation’s details and email you an invitation to set up your account, usually within two working days.</p>;
  return (
    <form action={action} className="panel stack">
      <label className="field">Organisation name<input name="name" required maxLength={120} /></label>
      <label className="field small-field">Charity or company number (optional)<input name="number" maxLength={40} /></label>
      <div className="row">
        <label className="field">Your name<input name="contactName" required maxLength={120} autoComplete="name" /></label>
        <label className="field">Your work email<input type="email" name="contactEmail" required maxLength={200} autoComplete="email" /><span className="hint">You’ll be your organisation’s first admin, and sign in with the Microsoft account for this email.</span></label>
      </div>
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px' }}><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <label><input type="checkbox" name="terms" value="yes" required /> I accept the data processing terms (version {terms}) on behalf of my organisation.</label>
      <div><Submit pending="Sending…">Ask to join</Submit></div>
      {state.error && <p className="msg msg-error" role="alert">{state.error}</p>}
    </form>
  );
}
