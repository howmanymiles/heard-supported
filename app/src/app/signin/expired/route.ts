import { cookies } from 'next/headers';

// The session ended: clear its cookie so the page stops showing someone as signed in,
// then offer sign-in again, coming back to where they were.
export async function GET(req: Request) {
  const jar = await cookies();
  for (const c of jar.getAll()) if (/next-auth\.(session-token|csrf-token|callback-url)/.test(c.name)) jar.delete(c.name);
  const from = new URL(req.url).searchParams.get('from') ?? '/';
  const back = from.startsWith('/') && !from.startsWith('//') ? from : '/';
  return Response.redirect(new URL(`/signin?reason=expired&callbackUrl=${encodeURIComponent(back)}`, req.url), 303);
}
