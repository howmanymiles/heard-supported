'use client';

import { useEffect, useState } from 'react';
import { signIn, signOut } from 'next-auth/react';

/** One click to Microsoft; with `auto`, straight there (after accepting an invitation). */
export function SignInButton({ callbackUrl, auto }: { callbackUrl: string; auto?: boolean }) {
  const [busy, setBusy] = useState(false);
  const go = () => { setBusy(true); void signIn('azure-ad', { callbackUrl }); };
  useEffect(() => { if (auto) go(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button className="btn btn-primary" type="button" onClick={go} disabled={busy}>
      {busy ? 'Opening Microsoft sign-in…' : 'Sign in with your work Microsoft account'}
    </button>
  );
}

export function SignOutButton() {
  return <button type="button" className="linklike" onClick={() => signOut({ callbackUrl: '/signin?reason=signedout' })}>Sign out</button>;
}
