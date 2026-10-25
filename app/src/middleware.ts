import { NextResponse, type NextRequest } from 'next/server';
import { withAuth, type NextRequestWithAuth } from 'next-auth/middleware';
import { hit, clientIp, LIMITS } from './lib/ratelimit';
import { csp } from './lib/csp';

// Every response gets a Content Security Policy with a fresh nonce, so only the scripts
// Next.js itself adds can run: injected script in a document or a client's name can't.
// Every page needs sign-in, except sign-in itself, the sign-in problem page, invitation
// links and agency sign-up. Sign-in attempts are limited per connection.

const PUBLIC = /^\/(api\/auth|access|invite|signup|terms)(\/|$)/;

function secure(req: NextRequest, run: (headers: Headers) => NextResponse | Response | Promise<NextResponse | Response>) {
  const nonce = btoa(crypto.randomUUID());
  const policy = csp(nonce);
  const headers = new Headers(req.headers);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', policy);   // Next.js reads the nonce from this
  return Promise.resolve(run(headers)).then(res => { res.headers.set('Content-Security-Policy', policy); return res; });
}

const auth = withAuth({ pages: { signIn: '/api/auth/signin' } });

export default async function middleware(req: NextRequest, ev: Parameters<typeof auth>[1]) {
  const path = req.nextUrl.pathname;
  if (path.startsWith('/api/auth/signin') || path.startsWith('/api/auth/callback')) {
    if (!hit(`signin:${clientIp(req.headers)}`, LIMITS.signInPerIp.max, LIMITS.signInPerIp.window).ok)
      return new NextResponse('Too many sign-in attempts from this connection. Wait ten minutes and try again.', { status: 429, headers: { 'Retry-After': '600' } });
  }
  return secure(req, async headers => {
    if (!PUBLIC.test(path)) {
      const res = await auth(req as NextRequestWithAuth, ev);
      if (res) return res as NextResponse;           // a redirect to sign in
    }
    return NextResponse.next({ request: { headers } });
  });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
