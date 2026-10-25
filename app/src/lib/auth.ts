import type { NextAuthOptions } from 'next-auth';
import AzureADProvider from 'next-auth/providers/azure-ad';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { pool } from './db.ts';

export type Me = { userId: string; agencyId: string; role: 'adviser' | 'supervisor' | 'admin'; name: string };

/**
 * Development sign-in: one Entra tenant maps to one agency. The first person to
 * sign in from a tenant creates the agency and becomes its admin; later users
 * join as advisers. Multi-agency onboarding replaces this before the pilot.
 */
async function ensureUser(oid: string, tid: string, name: string, email: string): Promise<Omit<Me, 'name'>> {
  const c = await pool().connect();
  try {
    await c.query('begin');
    const existing = await c.query('select id, agency_id, role from users where entra_oid = $1', [oid]);
    if (existing.rowCount) {
      await c.query('commit');
      const r = existing.rows[0];
      return { userId: r.id, agencyId: r.agency_id, role: r.role };
    }
    let agency = await c.query('select id from agencies where entra_tenant_id = $1', [tid]);
    let role: Me['role'] = 'adviser';
    if (!agency.rowCount) {
      agency = await c.query("insert into agencies (name, entra_tenant_id) values ('Development agency', $1) returning id", [tid]);
      role = 'admin';
    }
    const u = await c.query('insert into users (agency_id, entra_oid, name, email, role) values ($1, $2, $3, $4, $5) returning id', [agency.rows[0].id, oid, name, email, role]);
    await c.query('commit');
    return { userId: u.rows[0].id, agencyId: agency.rows[0].id, role };
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID ?? '',
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? '',
      tenantId: process.env.AZURE_AD_TENANT_ID,
    }),
  ],
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },
  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        const p = profile as { oid?: string; tid?: string; name?: string; email?: string; preferred_username?: string };
        if (!p.oid || !p.tid) throw new Error('Sign-in did not return an Entra user.');
        Object.assign(token, await ensureUser(p.oid, p.tid, p.name ?? '', p.email ?? p.preferred_username ?? ''));
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
  if (!s?.me?.agencyId) redirect('/api/auth/signin');
  return s.me;
}
