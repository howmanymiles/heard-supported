import type { NextAuthOptions } from 'next-auth';
import AzureADProvider from 'next-auth/providers/azure-ad';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { resolveSignIn, currentUser, AccessError, type Identity } from './access.ts';
import { pool } from './db.ts';
import { SESSION_MAX_SECONDS, sessionState, mfaRequired, usedMfa } from './session.ts';
export { SESSION_MAX_SECONDS, IDLE_SECONDS } from './session.ts';

export type Me = { userId: string; agencyId: string; role: 'adviser' | 'supervisor' | 'admin'; name: string };

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID ?? '',
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? '',
      // 'organizations' lets advisers from any agency's Microsoft 365 sign in; the invitation decides who gets in.
      tenantId: process.env.AZURE_AD_TENANT_ID ?? 'organizations',
    }),
  ],
  pages: { error: '/access' },
  session: { strategy: 'jwt', maxAge: SESSION_MAX_SECONDS },
  callbacks: {
    async signIn({ profile }) {
      const id = identity(profile);
      if (!id) return '/access?problem=denied';
      if (mfaRequired() && !usedMfa(profile)) return '/access?problem=mfa_required';
      try {
        await resolveSignIn(id, await inviteToken());
        return true;
      } catch (e) {
        if (e instanceof AccessError) return `/access?problem=${e.code}`;
        throw e;
      }
    },
    async jwt({ token, profile }) {
      if (profile) {
        const id = identity(profile);
        if (!id) throw new Error('Sign-in did not return a Microsoft work account.');
        Object.assign(token, await resolveSignIn(id, null), { signedInAt: Math.floor(Date.now() / 1000), mfa: usedMfa(profile) });   // the invitation, if any, was used in signIn
        await pool().query('update users set last_active_at = now(), last_sign_in_mfa = $2 where id = $1', [String(token.userId), token.mfa]);
        try { (await cookies()).delete(INVITE_COOKIE); } catch { /* not in a route that can set cookies */ }
      }
      return token;
    },
    async session({ session, token }) {
      Object.assign(session, { me: { userId: token.userId, agencyId: token.agencyId, role: token.role, name: token.name ?? '', signedInAt: token.signedInAt } });
      return session;
    },
  },
};

export async function requireMe(): Promise<Me> {
  const s = (await getServerSession(authOptions)) as { me?: Me } | null;
  if (!s?.me?.userId) redirect('/api/auth/signin');
  // Checked on every request, so removed access and role changes take effect at once.
  const u = await currentUser(s.me.userId);
  if (!u) redirect('/access?problem=removed');
  const st = sessionState(Number((s.me as Me & { signedInAt?: number }).signedInAt ?? 0), u.last_active_at ?? null);
  if (st === 'expired') redirect('/access?problem=expired_session');
  await touch(u.id, st === 'touch');
  return { userId: u.id, agencyId: u.agency_id, role: u.role, name: u.name ?? s.me.name };
}

export const INVITE_COOKIE = 'hs_invite';

async function inviteToken(): Promise<string | null> {
  try { return (await cookies()).get(INVITE_COOKIE)?.value ?? null; } catch { return null; }
}

function identity(profile: unknown): Identity | null {
  const p = (profile ?? {}) as { oid?: string; tid?: string; name?: string; email?: string; preferred_username?: string; upn?: string };
  if (!p.oid || !p.tid) return null;
  // Microsoft can report the address in several claims; a personal account added to a
  // directory has a user name like "name_hotmail.co.uk#EXT#@x.onmicrosoft.com".
  const all = [p.email, p.preferred_username, p.upn].filter((x): x is string => !!x);
  const ext = all.map(a => a.match(/^(.+)#EXT#@/i)?.[1]).filter((x): x is string => !!x).map(x => x.replace(/_([^_]+)$/, '@$1'));
  return { oid: p.oid, tid: p.tid, name: p.name ?? '', email: all[0] ?? '', emails: [...new Set([...all, ...ext].map(e => e.trim().toLowerCase()))] };
}

/** Record activity, at most once a minute, for the idle timeout. */
async function touch(userId: string, due: boolean) {
  if (!due) return;
  await pool().query('update users set last_active_at = now() where id = $1', [userId]);
}
