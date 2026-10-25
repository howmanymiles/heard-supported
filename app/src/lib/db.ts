import { Pool, type PoolClient } from 'pg';

const g = globalThis as unknown as { __hsPool?: Pool };

export function pool(): Pool {
  if (!g.__hsPool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');
    g.__hsPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, ssl: process.env.DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: true } : undefined });
  }
  return g.__hsPool;
}

/** Run queries as one agency: row-level security only shows that agency's rows. */
export async function asAgency<T>(agencyId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query('begin');
    await c.query("select set_config('app.agency_id', $1, true)", [agencyId]);
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export async function audit(c: PoolClient, agencyId: string, userId: string | null, caseId: string | null, action: string) {
  await c.query('insert into audit (agency_id, case_id, user_id, action) values ($1, $2, $3, $4)', [agencyId, caseId, userId, action]);
}
