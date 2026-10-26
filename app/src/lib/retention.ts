// Retention and erasure. Each agency sets how long a closed case's content is kept
// (1 to 84 months; 24 unless changed). After that, and whenever a client asks to be
// erased, the content goes: documents (and their stored files), the pages read from them,
// evidence, gaps, descriptor choices, letters, drafts and notes. The case keeps only what
// identifies nobody (benefit, stages, dates, outcomes, awards, office), so outcome reports
// stay right. Audit entries stay: they record who did what, never content.

import type { PoolClient } from 'pg';
import { asAgency, audit, pool } from './db.ts';
import type { Me } from './auth.ts';

export const RETENTION_CHOICES = [6, 12, 24, 36, 72] as const;

type BlobDeleter = (path: string) => Promise<void>;
let deleteBlob: BlobDeleter = async p => (await import('./storage.ts')).deleteDocument(p);
export function setBlobDeleterForTests(f: BlobDeleter) { deleteBlob = f; }

/** Remove one case's content. Files first: if one can't be deleted, nothing else changes and the next run tries again. */
async function anonymiseCase(c: PoolClient, caseId: string, reason: 'retention' | 'erasure') {
  const paths = (await c.query("select blob_path from documents where case_id = $1 and blob_path <> 'none'", [caseId])).rows.map(r => r.blob_path as string);
  for (const p of paths) await deleteBlob(p);
  for (const t of ['documents', 'evidence', 'gaps', 'decisions', 'claimed', 'assessor_choices', 'letters'])
    await c.query(`delete from ${t} where case_id = $1`, [caseId]);           // pages and evidence go with their documents too
  await c.query(`update cases set claimant_id = null, external_ref = null, late_reason = null, appeal_late_reason = null,
      mr_draft = null, appeal_draft = null, decision_outcome_quote = null, response_reasoning = null, submission_review = null,
      closed_note = null, closed_at = coalesce(closed_at, now()), closed_reason = coalesce(closed_reason, 'client_withdrew'),
      anonymised_at = now(), anonymised_reason = $2
    where id = $1`, [caseId, reason]);
  return paths.length;
}

export async function setRetention(me: Me, months: number) {
  if (me.role !== 'admin') throw new Error('Only admins can change how long information is kept.');
  if (!(RETENTION_CHOICES as readonly number[]).includes(months)) throw new Error('Choose one of the periods offered.');
  await asAgency(me.agencyId, async c => {
    await c.query('update agencies set retention_months = $2 where id = $1', [me.agencyId, months]);
    await audit(c, me.agencyId, me.userId, null, `Closed cases now kept for ${months} months`);
  });
}

export async function getRetention(me: Me) {
  return asAgency(me.agencyId, async c => {
    const months = (await c.query('select retention_months from agencies where id = $1', [me.agencyId])).rows[0].retention_months as number;
    const due = (await c.query(`select count(*)::int n from cases where anonymised_at is null and closed_at is not null
      and closed_at < now() - make_interval(months => $1) + interval '30 days'`, [months])).rows[0].n as number;
    return { months, dueWithin30Days: due };
  });
}

/** Erase a client at their request: every case's content, then the client and their consents. Admins only. */
export async function eraseClient(me: Me, claimantId: string, typedName: string) {
  if (me.role !== 'admin') throw new Error('Only admins can erase a client.');
  return asAgency(me.agencyId, async c => {
    const k = (await c.query('select name from claimants where id = $1', [claimantId])).rows[0];
    if (!k) throw new Error('Client not found.');
    if (typedName.trim().replace(/\s+/g, ' ').toLowerCase() !== String(k.name).toLowerCase()) throw new Error('Type the client’s full name exactly as it is recorded, to confirm.');
    const cases = (await c.query('select id from cases where claimant_id = $1', [claimantId])).rows.map(r => r.id as string);
    let files = 0;
    for (const id of cases) {
      files += await anonymiseCase(c, id, 'erasure');
      await audit(c, me.agencyId, me.userId, id, 'Case content erased at the client’s request');
    }
    await c.query('delete from claimants where id = $1', [claimantId]);   // consents go with it
    await audit(c, me.agencyId, me.userId, null, `Client erased at their request: ${cases.length} case${cases.length === 1 ? '' : 's'}, ${files} file${files === 1 ? '' : 's'} deleted`, claimantId);
    return { cases: cases.length, files };
  });
}

/** Remove content from cases past their agency's retention period. Runs at start-up and every 12 hours. */
export async function sweepRetention(now = new Date()): Promise<{ agency: string; cases: number }[]> {
  const agencies = (await pool().query('select id, retention_months from agencies')).rows;
  const done: { agency: string; cases: number }[] = [];
  for (const a of agencies) {
    const n = await asAgency(a.id, async c => {
      const due = (await c.query(`select id from cases where anonymised_at is null and closed_at is not null
        and closed_at < $1::timestamptz - make_interval(months => $2) order by closed_at limit 500`, [now.toISOString(), a.retention_months])).rows;
      for (const r of due) {
        await anonymiseCase(c, r.id, 'retention');
        await audit(c, a.id, null, r.id, `Case content deleted: ${a.retention_months}-month retention period ended`);
      }
      // A client with no cases left and no activity for the same period goes too.
      const idle = (await c.query(`select k.id from claimants k where not exists (select 1 from cases x where x.claimant_id = k.id)
        and k.created_at < $1::timestamptz - make_interval(months => $2)`, [now.toISOString(), a.retention_months])).rows;
      for (const r of idle) {
        await c.query('delete from claimants where id = $1', [r.id]);
        await audit(c, a.id, null, null, 'Client record deleted: no cases left and the retention period has ended', r.id);
      }
      return due.length + idle.length;
    });
    if (n) done.push({ agency: a.id, cases: n });
  }
  return done;
}
