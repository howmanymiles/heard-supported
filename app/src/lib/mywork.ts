// The signed-in adviser's own figures for the Cases page: their open caseload, what's due,
// what's waiting for them, their results over the last 12 months and the claim checks
// they've run this month.

import { nextDeadline } from '@hs/core';
import { asAgency } from './db.ts';
import type { Me } from './auth.ts';
import { findCases } from './casework.ts';
import { outcomeData, summariseOutcomes } from './outcomes.ts';

export async function myWork(me: Me, today: string, soonDays = 7) {
  const open = (await findCases(me, { mine: true })).map(c => ({ ...c,
    next: nextDeadline({ benefit: c.benefit, decisionDate: c.decision_date, mrRequestDate: c.mr_request_date, mrNoticeDate: c.mr_notice_date, appealSentDate: c.appeal_sent_date }, today) }));
  const from = new Date(`${today}T00:00:00Z`); from.setUTCFullYear(from.getUTCFullYear() - 1);
  const { rows, issues } = await outcomeData(me, from.toISOString().slice(0, 10), today, null, me.userId);
  const s = summariseOutcomes(rows, issues, from.toISOString().slice(0, 10), today);
  const monthStart = `${today.slice(0, 7)}-01`;
  const checks = await asAgency(me.agencyId, async c => (await c.query<{ n: number }>(
    'select count(*)::int as n from extraction_runs where created_by = $1 and created_at >= $2', [me.userId, monthStart])).rows[0].n);
  return {
    open: open.length,
    byStage: open.reduce<Record<string, number>>((m, c) => ({ ...m, [c.stage]: (m[c.stage] ?? 0) + 1 }), {}),
    dueSoon: open.filter(c => c.next?.status === 'in_time' && c.next.daysLeft <= soonDays).length,
    late: open.filter(c => c.next && c.next.status !== 'in_time').length,
    toCheck: open.reduce((n, c) => n + Number(c.suggested ?? 0), 0),
    casesToCheck: open.filter(c => Number(c.suggested ?? 0) > 0).length,
    results: { decided: s.overall.decided, overturned: s.overall.overturned, rate: s.overall.rate },
    money: s.money,
    checksThisMonth: checks,
  };
}
