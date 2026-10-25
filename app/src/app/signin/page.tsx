import { SignInButton } from './button';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in · Heard & Supported' };

const REASONS: Record<string, string> = {
  expired: 'You were signed out to keep your clients’ information safe: after 30 minutes without activity, or 8 hours after signing in. Sign in again to carry on where you left off.',
  signedout: 'You’ve signed out.',
};

/** Only paths on this site, so the link can't be used to send someone elsewhere. */
const safePath = (p?: string) => (p && p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/signin') ? p : '/');

export default async function SignIn({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const reason = sp.reason && REASONS[sp.reason];
  return (
    <div className="stack-lg" style={{ maxWidth: 560 }}>
      <div className="head"><h1>Sign in</h1></div>
      {reason && <p className={sp.reason === 'expired' ? 'msg msg-warn' : 'msg msg-ok'} role="status">{reason}</p>}
      <p>Use the Microsoft account you use for work at your agency: the one your invitation was sent to.</p>
      <div><SignInButton callbackUrl={safePath(sp.callbackUrl)} auto={sp.auto === '1'} /></div>
      <ul className="soft small stack" style={{ paddingLeft: 18 }}>
        <li>Microsoft will ask you to choose the account if you have more than one.</li>
        <li>Microsoft may ask for your second sign-in step, such as the Authenticator app or a code.</li>
        <li>For your clients’ safety you’re signed out after 30 minutes without activity.</li>
      </ul>
      <p className="soft small">First time? You need an invitation from your agency’s admin. Is your organisation new to Heard &amp; Supported? <a href="/signup">Ask to join</a>.</p>
    </div>
  );
}
