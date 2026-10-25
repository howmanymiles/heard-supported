// Reading the audit record: who did what with a client's information, and whether the
// record is intact.

import { asAgency } from './db.ts';
import type { Me } from './auth.ts';

const canReview = (me: Me) => me.role === 'admin' || me.role === 'supervisor';

export type AuditEntry = { at: Date; kind: 'change' | 'access'; action: string; who: string | null; case_ref: string | null };

/** Everything recorded about one client and their cases, newest first. Admins and supervisors. */
export async function clientHistory(me: Me, claimantId: string, limit = 200): Promise<AuditEntry[]> {
  if (!canReview(me)) throw new Error('Only admins and supervisors can see who has used a client’s record.');
  return asAgency(me.agencyId, async c => (await c.query(`
    select a.at, a.kind, a.action, u.name as who, x.ref as case_ref
    from audit a left join users u on u.id = a.user_id left join cases x on x.id = a.case_id
    where a.claimant_id = $1 or a.case_id in (select id from cases where claimant_id = $1)
    order by a.id desc limit $2`, [claimantId, limit])).rows);
}

export type ChainCheck = { intact: boolean; checked: number; badId: number | null; problem: string | null; lastHash: string | null; lastAt: Date | null };

/** Recompute the agency's chain of audit entries. Admins only. */
export async function checkAudit(me: Me): Promise<ChainCheck> {
  if (me.role !== 'admin') throw new Error('Only admins can check the audit record.');
  return asAgency(me.agencyId, async c => {
    const r = (await c.query('select bad_id, problem, checked from verify_audit($1)', [me.agencyId])).rows[0];
    const last = (await c.query('select hash, at from audit where agency_id = $1 order by id desc limit 1', [me.agencyId])).rows[0];
    return { intact: r.bad_id === null, checked: Number(r.checked), badId: r.bad_id === null ? null : Number(r.bad_id), problem: r.problem, lastHash: last?.hash ?? null, lastAt: last?.at ?? null };
  });
}
