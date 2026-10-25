import { SIGN_IN_PROBLEMS } from '@/lib/access';

export const dynamic = 'force-dynamic';

export default async function Access({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const code = sp.problem && sp.problem in SIGN_IN_PROBLEMS ? sp.problem : sp.error ? 'denied' : 'denied';
  return (
    <div className="stack-lg" style={{ maxWidth: 640 }}>
      <div className="head"><h1>{code === 'removed' ? 'Your access has ended' : code === 'expired_session' ? 'Signed out' : 'You can’t sign in yet'}</h1></div>
      <p className="msg msg-error" role="alert">{SIGN_IN_PROBLEMS[code]}</p>
      <p><a className="btn btn-primary" href="/signin">Try again</a> <a className="btn btn-quiet" href="/signin/expired?from=%2F">Use a different account</a></p>
      <p className="soft small">Is your organisation new to Heard &amp; Supported? <a href="/signup">Ask to join</a>.</p>
    </div>
  );
}
