// Team casework: who holds a case, finding cases, outcomes, closing, and reports.

import { asAgency, audit, pool } from './db.ts';
import type { Me } from './auth.ts';
import type { CaseRow } from './cases.ts';

export const canManage = (me: Me) => me.role === 'supervisor' || me.role === 'admin';

export type UserRow = { id: string; name: string | null; role: string };

/** The agency's people. The users table has no row-level security, so the agency is filtered here. */
export async function listUsers(me: Me): Promise<UserRow[]> {
  return (await pool().query('select id, name, role from users where agency_id = $1 order by name', [me.agencyId])).rows;
}

/** Supervisors and admins can give a case to anyone in the agency; an adviser can take a case themselves. */
export async function assignCase(me: Me, caseId: string, userId: string) {
  if (!canManage(me) && userId !== me.userId) throw new Error('Only a supervisor or admin can give a case to someone else. You can take it yourself.');
  const u = (await pool().query('select id, name from users where id = $1 and agency_id = $2', [userId, me.agencyId])).rows[0];
  if (!u) throw new Error('That person is not in your agency.');
  await asAgency(me.agencyId, async c => {
    const r = await c.query('update cases set adviser_id = $2 where id = $1', [caseId, userId]);
    if (!r.rowCount) throw new Error('Case not found.');
    await audit(c, me.agencyId, me.userId, caseId, `Case assigned to ${u.name ?? 'an adviser'}`);
  });
}

export type CaseFilter = { mine?: boolean; stage?: string; benefit?: string; adviser?: string; q?: string; closed?: boolean };

export async function findCases(me: Me, f: CaseFilter): Promise<CaseRow[]> {
  const where: string[] = [], args: unknown[] = [];
  const add = (sql: string, v: unknown) => { args.push(v); where.push(sql.replace('?', `$${args.length}`)); };
  where.push(f.closed ? 'c.closed_at is not null' : 'c.closed_at is null');
  if (f.mine) add('c.adviser_id = ?', me.userId);
  else if (f.adviser) add('c.adviser_id = ?', f.adviser);
  if (f.stage) add('c.stage = ?', f.stage);
  if (f.benefit === 'pip' || f.benefit === 'uc-wca') add('c.benefit = ?', f.benefit);
  if (f.q) add("c.ref ilike '%' || ? || '%'", f.q.replace(/[%_\\]/g, m => `\\${m}`).slice(0, 40));
  return asAgency(me.agencyId, async c => (await c.query(`
    select c.id, c.ref, c.benefit, c.stage, c.status, u.name as adviser_name, c.adviser_id, c.created_at,
      to_char(c.decision_date, 'YYYY-MM-DD') as decision_date, to_char(c.mr_request_date, 'YYYY-MM-DD') as mr_request_date,
      to_char(c.mr_notice_date, 'YYYY-MM-DD') as mr_notice_date, to_char(c.appeal_sent_date, 'YYYY-MM-DD') as appeal_sent_date,
      to_char(c.closed_at, 'YYYY-MM-DD') as closed_on, c.closed_reason,
      (select count(*)::int from documents d where d.case_id = c.id) as documents,
      (select count(*)::int from evidence e where e.case_id = c.id and e.status = 'suggested') as suggested
    from cases c left join users u on u.id = c.adviser_id
    where ${where.join(' and ')}
    order by c.created_at desc limit 500`, args)).rows);
}

// ---------- outcomes and closing ----------

export const PIP_RATES = ['none', 'standard', 'enhanced'] as const;
export const WCA_OUTCOMES = ['none', 'lcw', 'lcwra'] as const;
export const MR_OUTCOMES = { revised: 'Revised in full', revised_in_part: 'Revised in part', unchanged: 'Not changed' } as const;
export const APPEAL_OUTCOMES = { allowed: 'Allowed', allowed_in_part: 'Allowed in part', dismissed: 'Dismissed', lapsed_revised: 'Lapsed: DWP revised before the hearing', withdrawn: 'Withdrawn', struck_out: 'Struck out' } as const;
export const CLOSE_REASONS = { outcome: 'Outcome reached', client_withdrew: 'Client withdrew', no_contact: 'Lost contact', referred: 'Referred elsewhere', other: 'Other' } as const;

export type Award = { daily_living?: string; mobility?: string; wca?: string };

export function checkAward(benefit: string, a: Award | null): Award | null {
  if (!a) return null;
  if (benefit === 'pip') {
    const ok = (v?: string) => !v || (PIP_RATES as readonly string[]).includes(v);
    if (!ok(a.daily_living) || !ok(a.mobility)) throw new Error('Choose a rate for each component.');
    return a.daily_living || a.mobility ? { daily_living: a.daily_living, mobility: a.mobility } : null;
  }
  if (a.wca && !(WCA_OUTCOMES as readonly string[]).includes(a.wca)) throw new Error('Choose the WCA outcome.');
  return a.wca ? { wca: a.wca } : null;
}

export async function saveOutcome(me: Me, caseId: string, o: {
  mrOutcome: string | null; mrOutcomeDate: string | null; appealOutcome: string | null; appealOutcomeDate: string | null; before: Award | null; after: Award | null;
}) {
  if (o.mrOutcome && !(o.mrOutcome in MR_OUTCOMES)) throw new Error('Choose the reconsideration result.');
  if (o.appealOutcome && !(o.appealOutcome in APPEAL_OUTCOMES)) throw new Error('Choose the appeal result.');
  const date = (d: string | null) => { if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('Enter dates as day, month and year.'); return d; };
  await asAgency(me.agencyId, async c => {
    const cs = (await c.query('select benefit from cases where id = $1', [caseId])).rows[0];
    if (!cs) throw new Error('Case not found.');
    await c.query('update cases set mr_outcome = $2, mr_outcome_date = $3, appeal_outcome = $4, appeal_outcome_date = $5, award_before = $6, award_after = $7 where id = $1',
      [caseId, o.mrOutcome, date(o.mrOutcomeDate), o.appealOutcome, date(o.appealOutcomeDate), checkAward(cs.benefit, o.before), checkAward(cs.benefit, o.after)]);
    await audit(c, me.agencyId, me.userId, caseId, 'Outcome recorded');
  });
}

export async function closeCase(me: Me, caseId: string, reason: string, note: string) {
  if (!(reason in CLOSE_REASONS)) throw new Error('Choose why the case is closing.');
  await asAgency(me.agencyId, async c => {
    const r = await c.query("update cases set closed_at = now(), closed_reason = $2, closed_note = $3, stage = 'closed' where id = $1 and closed_at is null", [caseId, reason, note.trim().slice(0, 500) || null]);
    if (!r.rowCount) throw new Error('Case not found, or already closed.');
    await audit(c, me.agencyId, me.userId, caseId, `Case closed: ${CLOSE_REASONS[reason as keyof typeof CLOSE_REASONS]}`);
  });
}

export async function reopenCase(me: Me, caseId: string) {
  await asAgency(me.agencyId, async c => {
    const cs = (await c.query('select mr_notice_date, decision_date from cases where id = $1', [caseId])).rows[0];
    if (!cs) throw new Error('Case not found.');
    const stage = cs.mr_notice_date ? 'appeal' : cs.decision_date ? 'mr' : 'claim';
    await c.query('update cases set closed_at = null, closed_reason = null, closed_note = null, stage = $2 where id = $1', [caseId, stage]);
    await audit(c, me.agencyId, me.userId, caseId, 'Case reopened');
  });
}

// ---------- reporting ----------

const RANK: Record<string, number> = { none: 0, standard: 1, enhanced: 2, lcw: 1, lcwra: 2 };

/** Whether the award at the end is better than at the start, by component. Pure, for reports and tests. */
export function awardChange(benefit: string, before: Award | null, after: Award | null): 'better' | 'same' | 'worse' | null {
  if (!before || !after) return null;
  const keys = benefit === 'pip' ? (['daily_living', 'mobility'] as const) : (['wca'] as const);
  const d = keys.map(k => (RANK[after[k] ?? 'none'] ?? 0) - (RANK[before[k] ?? 'none'] ?? 0));
  if (d.some(x => x < 0) && !d.some(x => x > 0)) return 'worse';
  if (d.some(x => x > 0)) return d.some(x => x < 0) ? 'same' : 'better';
  return 'same';
}

export type Report = {
  from: string; to: string;
  open: { total: number; byStage: Record<string, number>; byBenefit: Record<string, number>; late: number };
  closed: number;
  mr: Record<string, number>;
  appeal: Record<string, number>;
  awards: { better: number; same: number; worse: number; unknown: number; pip: { dailyLivingUp: number; mobilityUp: number }; wca: { toLcw: number; toLcwra: number } };
  closedReasons: Record<string, number>;
};

/** Agency figures for a period: open caseload now; outcomes and closures dated in the period. */
export async function agencyReport(me: Me, from: string, to: string, today: string): Promise<Report> {
  return asAgency(me.agencyId, async c => {
    const open = (await c.query("select benefit, stage, to_char(decision_date, 'YYYY-MM-DD') d, to_char(mr_request_date, 'YYYY-MM-DD') r, to_char(mr_notice_date, 'YYYY-MM-DD') n, to_char(appeal_sent_date, 'YYYY-MM-DD') s from cases where closed_at is null")).rows;
    const { nextDeadline } = await import('@hs/core');
    const count = <T,>(xs: T[], key: (x: T) => string | null | undefined) => xs.reduce((m, x) => { const k = key(x); if (k) m[k] = (m[k] ?? 0) + 1; return m; }, {} as Record<string, number>);
    const late = open.filter(o => { const n = nextDeadline({ decisionDate: o.d, mrRequestDate: o.r, mrNoticeDate: o.n, appealSentDate: o.s }, today); return n && n.status !== 'in_time'; }).length;
    const mr = (await c.query('select mr_outcome from cases where mr_outcome is not null and mr_outcome_date between $1 and $2', [from, to])).rows;
    const ap = (await c.query('select appeal_outcome from cases where appeal_outcome is not null and appeal_outcome_date between $1 and $2', [from, to])).rows;
    const closed = (await c.query("select benefit, closed_reason, award_before, award_after from cases where closed_at::date between $1 and $2", [from, to])).rows;
    const awards = { better: 0, same: 0, worse: 0, unknown: 0, pip: { dailyLivingUp: 0, mobilityUp: 0 }, wca: { toLcw: 0, toLcwra: 0 } };
    for (const x of closed) {
      const ch = awardChange(x.benefit, x.award_before, x.award_after);
      if (ch) awards[ch]++; else awards.unknown++;
      if (x.award_before && x.award_after) {
        if (x.benefit === 'pip') {
          if ((RANK[x.award_after.daily_living] ?? 0) > (RANK[x.award_before.daily_living] ?? 0)) awards.pip.dailyLivingUp++;
          if ((RANK[x.award_after.mobility] ?? 0) > (RANK[x.award_before.mobility] ?? 0)) awards.pip.mobilityUp++;
        } else {
          if (x.award_after.wca === 'lcwra' && x.award_before.wca !== 'lcwra') awards.wca.toLcwra++;
          else if (x.award_after.wca === 'lcw' && x.award_before.wca === 'none') awards.wca.toLcw++;
        }
      }
    }
    return {
      from, to,
      open: { total: open.length, byStage: count(open, o => o.stage), byBenefit: count(open, o => o.benefit), late },
      closed: closed.length, mr: count(mr, x => x.mr_outcome), appeal: count(ap, x => x.appeal_outcome), awards,
      closedReasons: count(closed, x => x.closed_reason),
    };
  });
}
