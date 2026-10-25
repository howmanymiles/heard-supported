import pg, { Pool, type PoolClient } from 'pg';

// Keep DATE columns as 'YYYY-MM-DD' strings. By default pg turns them into
// local-midnight Date objects, which shift by a day when converted to UTC on a
// machine ahead of UTC (a UK machine in summer) and silently move deadlines.
pg.types.setTypeParser(1082, (v: string) => v);

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

/** Record a change. The database chains each entry to the one before (see 015_audit_chain.sql). */
export async function audit(c: PoolClient, agencyId: string, userId: string | null, caseId: string | null, action: string, claimantId: string | null = null) {
  await c.query('insert into audit (agency_id, case_id, user_id, action, claimant_id) values ($1, $2, $3, $4, $5)', [agencyId, caseId, userId, action, claimantId]);
}

/**
 * Record that someone looked at a client's information. Repeat views of the same thing by
 * the same person within 10 minutes are recorded once, so moving between tabs isn't noise.
 */
export async function viewed(c: PoolClient, agencyId: string, userId: string, what: { caseId?: string | null; claimantId?: string | null; action: string }) {
  const recent = await c.query(`select 1 from audit where agency_id = $1 and user_id = $2 and kind = 'access' and action = $3
    and case_id is not distinct from $4 and claimant_id is not distinct from $5 and at > now() - interval '10 minutes' limit 1`,
    [agencyId, userId, what.action, what.caseId ?? null, what.claimantId ?? null]);
  if (recent.rowCount) return;
  await c.query(`insert into audit (agency_id, case_id, user_id, claimant_id, kind, action) values ($1, $2, $3, $4, 'access', $5)`,
    [agencyId, what.caseId ?? null, userId, what.claimantId ?? null, what.action]);
}
