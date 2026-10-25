import type { NextAuthOptions } from 'next-auth';
import AzureADProvider from 'next-auth/providers/azure-ad';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { resolveSignIn, currentUser, AccessError, type Identity } from './access.ts';

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
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  callbacks: {
    async signIn({ profile }) {
      const id = identity(profile);
      if (!id) return '/access?problem=denied';
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
        Object.assign(token, await resolveSignIn(id, null));   // the invitation, if any, was used in signIn
        try { (await cookies()).delete(INVITE_COOKIE); } catch { /* not in a route that can set cookies */ }
      }
      return token;
    },
    async session({ session, token }) {
      Object.assign(session, { me: { userId: token.userId, agencyId: token.agencyId, role: token.role, name: token.name ?? '' } });
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
  return { userId: u.id, agencyId: u.agency_id, role: u.role, name: u.name ?? s.me.name };
}

export const INVITE_COOKIE = 'hs_invite';

async function inviteToken(): Promise<string | null> {
  try { return (await cookies()).get(INVITE_COOKIE)?.value ?? null; } catch { return null; }
}

function identity(profile: unknown): Identity | null {
  const p = (profile ?? {}) as { oid?: string; tid?: string; name?: string; email?: string; preferred_username?: string };
  if (!p.oid || !p.tid) return null;
  return { oid: p.oid, tid: p.tid, name: p.name ?? '', email: p.email ?? p.preferred_username ?? '' };
}
