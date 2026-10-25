import { cookies } from 'next/headers';
import { INVITE_COOKIE } from '@/lib/auth';

// Keeps the invitation for the sign-in that follows: it is checked, and used up, when the person signs in.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return new Response('Not a valid invitation.', { status: 400 });
  (await cookies()).set(INVITE_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 });
  return Response.redirect(new URL('/api/auth/signin?callbackUrl=%2F', req.url), 303);
}
