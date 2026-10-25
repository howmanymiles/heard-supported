import { headers } from 'next/headers';
import { peekInvite } from '@/lib/access';
import { hit, clientIp, LIMITS } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const allowed = hit(`invite:${clientIp(await headers())}`, LIMITS.invitePerIp.max, LIMITS.invitePerIp.window).ok;
  const i = allowed && /^[A-Za-z0-9_-]{20,100}$/.test(token) ? await peekInvite(token) : null;
  const problem = !allowed ? 'Too many invitation links have been opened from this connection. Wait an hour and try again.' : !i ? 'This invitation link is not valid.' : i.revoked ? 'This invitation has been cancelled.' : i.used ? 'This invitation has already been used.' : i.expired ? 'This invitation has expired.' : i.status !== 'active' ? 'Your agency’s account is not active yet.' : null;
  return (
    <div className="stack-lg" style={{ maxWidth: 640 }}>
      <div className="head"><h1>Your invitation</h1></div>
      {problem ? <p className="msg msg-error" role="alert">{problem} Ask your agency’s admin for a new one.</p> : (
        <>
          <p>You’ve been invited to join <b>{i!.agency}</b> on Heard &amp; Supported as {i!.role === 'admin' ? 'an admin' : i!.role === 'supervisor' ? 'a supervisor' : 'an adviser'}.</p>
          <p>Sign in with your Microsoft work account for <b>{i!.email}</b>. A different account won’t be let in.</p>
          <form action={`/invite/${token}/accept`} method="post"><button className="btn btn-primary" type="submit">Accept and sign in</button></form>
        </>
      )}
    </div>
  );
}
