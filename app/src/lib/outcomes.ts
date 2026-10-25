// Successes and overturns: reconsiderations revised, appeals won (including the DWP
// revising before the hearing), awards gained, money, time taken, and which disputed
// activities were won.

import { asAgency, audit } from './db.ts';
import type { Me } from './auth.ts';
import { awardChange, caseGain, MR_OUTCOMES, APPEAL_OUTCOMES, type Award } from './casework.ts';

export const ISSUE_RESULTS = { won: 'Won', part: 'Won in part', lost: 'Not won' } as const;
const MR_OVERTURN = ['revised', 'revised_in_part'];
const APPEAL_DECIDED = ['allowed', 'allowed_in_part', 'dismissed', 'lapsed_revised'];
const APPEAL_OVERTURN = ['allowed', 'allowed_in_part', 'lapsed_revised'];

export type OutcomeRow = {
  id: string; ref: string; external_ref?: string | null; client: string | null; office?: string | null; benefit: 'pip' | 'adp' | 'uc-wca'; adviser: string | null;
  mr_request_date: string | null; mr_outcome: string | null; mr_outcome_date: string | null;
  appeal_sent_date: string | null; appeal_outcome: string | null; appeal_outcome_date: string | null;
  award_before: Award | null; award_after: Award | null; uc_lcwra_rate: string | null; lcw_legacy: boolean;
};
export type IssueRow = { case_id: string; issue_key: string; label: string; result: keyof typeof ISSUE_RESULTS; stage: 'mr' | 'appeal' | null };

export async function saveIssueResults(me: Me, caseId: string, items: Array<{ key: string; label: string; result: string | null; stage: string | null }>) {
  for (const i of items) {
    if (i.result && !(i.result in ISSUE_RESULTS)) throw new Error('Choose won, won in part or not won.');
    if (i.stage && i.stage !== 'mr' && i.stage !== 'appeal') throw new Error('Choose where it was won.');
  }
  await asAgency(me.agencyId, async c => {
    if (!(await c.query('select 1 from cases where id = $1', [caseId])).rowCount) throw new Error('Case not found.');
    for (const i of items) {
      if (!i.result) { await c.query('delete from issue_results where case_id = $1 and issue_key = $2', [caseId, i.key]); continue; }
      await c.query(`insert into issue_results (agency_id, case_id, issue_key, label, result, stage, recorded_by) values ($1, $2, $3, $4, $5, $6, $7)
        on conflict (case_id, issue_key) do update set result = excluded.result, stage = excluded.stage, label = excluded.label, recorded_by = excluded.recorded_by, recorded_at = now()`,
        [me.agencyId, caseId, i.key, i.label.slice(0, 120), i.result, i.result === 'lost' ? null : i.stage, me.userId]);
    }
    await audit(c, me.agencyId, me.userId, caseId, 'Results recorded for the disputed points');
  });
}

export async function issueResultsFor(me: Me, caseId: string): Promise<IssueRow[]> {
  return asAgency(me.agencyId, async c => (await c.query('select case_id, issue_key, label, result, stage from issue_results where case_id = $1', [caseId])).rows);
}

/** Cases with a reconsideration or appeal result dated in the period, and their issue results. */
export async function outcomeData(me: Me, from: string, to: string, officeId: string | null = null): Promise<{ rows: OutcomeRow[]; issues: IssueRow[] }> {
  return asAgency(me.agencyId, async c => {
    const rows = (await c.query(`
      select c.id, c.ref, c.external_ref, k.name as client, o.name as office, c.benefit, u.name as adviser,
        to_char(c.mr_request_date, 'YYYY-MM-DD') as mr_request_date, c.mr_outcome, to_char(c.mr_outcome_date, 'YYYY-MM-DD') as mr_outcome_date,
        to_char(c.appeal_sent_date, 'YYYY-MM-DD') as appeal_sent_date, c.appeal_outcome, to_char(c.appeal_outcome_date, 'YYYY-MM-DD') as appeal_outcome_date,
        c.award_before, c.award_after, c.uc_lcwra_rate, c.lcw_legacy
      from cases c left join users u on u.id = c.adviser_id left join claimants k on k.id = c.claimant_id left join offices o on o.id = c.office_id
      where ($3::uuid is null or c.office_id = $3) and ((c.mr_outcome is not null and c.mr_outcome_date between $1 and $2) or (c.appeal_outcome is not null and c.appeal_outcome_date between $1 and $2))
      order by coalesce(c.appeal_outcome_date, c.mr_outcome_date) desc`, [from, to, officeId])).rows as OutcomeRow[];
    const issues = rows.length ? (await c.query('select case_id, issue_key, label, result, stage from issue_results where case_id = any($1)', [rows.map(r => r.id)])).rows as IssueRow[] : [];
    return { rows, issues };
  });
}

const inPeriod = (d: string | null, from: string, to: string) => !!d && d >= from && d <= to;
const days = (a: string | null, b: string | null) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 86400000) : null);
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const rate = (o: number, d: number) => (d ? Math.round((o / d) * 1000) / 10 : null);
type Tally = { decided: number; overturned: number; rate: number | null };
const tally = (): Tally => ({ decided: 0, overturned: 0, rate: null });

export type OutcomeCase = OutcomeRow & { stageWon: 'mr' | 'appeal' | null; change: ReturnType<typeof awardChange>; gain: number | null; gainYear: string | null; mrDays: number | null; appealDays: number | null };

/** Pure: the overturn figures from the rows. A case counts once at each stage it reached in the period. */
export function summariseOutcomes(rows: OutcomeRow[], issues: IssueRow[], from: string, to: string) {
  const mr = tally(), appeal = tally(), overall = tally();
  const appealOther: Record<string, number> = {};
  const byBenefit: Record<string, { mr: Tally; appeal: Tally }> = {};
  const byAdviser: Record<string, { mr: Tally; appeal: Tally }> = {};
  const components = { dailyLivingUp: 0, dailyLivingToEnhanced: 0, mobilityUp: 0, mobilityToEnhanced: 0, toLcw: 0, toLcwra: 0 };
  const money = { total: 0, valued: 0, notValued: 0 };
  const mrDays: number[] = [], appealDays: number[] = [];
  const cases: OutcomeCase[] = [];
  const rank: Record<string, number> = { none: 0, standard: 1, enhanced: 2 };

  for (const r of rows) {
    const b = (byBenefit[r.benefit] ??= { mr: tally(), appeal: tally() });
    const a = (byAdviser[r.adviser ?? 'Unassigned'] ??= { mr: tally(), appeal: tally() });
    let stageWon: 'mr' | 'appeal' | null = null, counted = false;
    if (r.mr_outcome && inPeriod(r.mr_outcome_date, from, to)) {
      const o = MR_OVERTURN.includes(r.mr_outcome);
      for (const t of [mr, b.mr, a.mr]) { t.decided++; if (o) t.overturned++; }
      if (o) stageWon = 'mr';
      counted = true;
      const d = days(r.mr_request_date, r.mr_outcome_date); if (d !== null && d >= 0) mrDays.push(d);
    }
    if (r.appeal_outcome && inPeriod(r.appeal_outcome_date, from, to)) {
      if (APPEAL_DECIDED.includes(r.appeal_outcome)) {
        const o = APPEAL_OVERTURN.includes(r.appeal_outcome);
        for (const t of [appeal, b.appeal, a.appeal]) { t.decided++; if (o) t.overturned++; }
        if (o) stageWon = 'appeal';
        counted = true;
      } else appealOther[r.appeal_outcome] = (appealOther[r.appeal_outcome] ?? 0) + 1;
      const d = days(r.appeal_sent_date, r.appeal_outcome_date); if (d !== null && d >= 0) appealDays.push(d);
    }
    if (counted) { overall.decided++; if (stageWon) overall.overturned++; }
    const change = awardChange(r.benefit, r.award_before, r.award_after);
    const on = (r.appeal_outcome_date ?? r.mr_outcome_date)!;
    const g = stageWon ? caseGain({ ...r, on }) : null;
    if (stageWon) {
      if (g) { money.total += g.gain; money.valued++; } else money.notValued++;
      const bf = r.award_before ?? {}, af = r.award_after ?? {};
      if (r.award_before && r.award_after) {
        if (r.benefit !== 'uc-wca') {
          if ((rank[af.daily_living ?? 'none'] ?? 0) > (rank[bf.daily_living ?? 'none'] ?? 0)) { components.dailyLivingUp++; if (af.daily_living === 'enhanced') components.dailyLivingToEnhanced++; }
          if ((rank[af.mobility ?? 'none'] ?? 0) > (rank[bf.mobility ?? 'none'] ?? 0)) { components.mobilityUp++; if (af.mobility === 'enhanced') components.mobilityToEnhanced++; }
        } else if (af.wca === 'lcwra' && bf.wca !== 'lcwra') components.toLcwra++;
        else if (af.wca === 'lcw' && bf.wca === 'none') components.toLcw++;
      }
    }
    cases.push({ ...r, stageWon, change, gain: g?.gain ?? null, gainYear: g?.year ?? null, mrDays: days(r.mr_request_date, r.mr_outcome_date), appealDays: days(r.appeal_sent_date, r.appeal_outcome_date) });
  }
  for (const t of [mr, appeal, overall, ...Object.values(byBenefit).flatMap(x => [x.mr, x.appeal]), ...Object.values(byAdviser).flatMap(x => [x.mr, x.appeal])]) t.rate = rate(t.overturned, t.decided);

  // Disputed points, by activity: how often each was won.
  const byIssue: Record<string, { label: string; benefit: string; won: number; part: number; lost: number; wonAtMr: number; wonAtAppeal: number }> = {};
  const benefitOf = Object.fromEntries(rows.map(r => [r.id, r.benefit]));
  for (const i of issues) {
    const x = (byIssue[i.issue_key] ??= { label: i.label, benefit: benefitOf[i.case_id], won: 0, part: 0, lost: 0, wonAtMr: 0, wonAtAppeal: 0 });
    x[i.result]++;
    if (i.result !== 'lost') { if (i.stage === 'mr') x.wonAtMr++; else if (i.stage === 'appeal') x.wonAtAppeal++; }
  }

  return { mr, appeal, appealOther, overall, byBenefit, byAdviser, components, money: { ...money, total: Math.round(money.total * 100) / 100 },
    days: { mrMedian: median(mrDays), mrCount: mrDays.length, appealMedian: median(appealDays), appealCount: appealDays.length }, byIssue, cases };
}

const AWARD = (b: string, a: Award | null) => !a ? '' : b !== 'uc-wca' ? `DL ${a.daily_living ?? 'none'} / Mob ${a.mobility ?? 'none'}` : (a.wca ?? '').toUpperCase();
const csvCell = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s; };

/** One row per case, for funders' returns and the agency's own analysis. Client names are left out unless asked for. */
export function outcomesCsv(cases: OutcomeCase[], withNames = false): string {
  const head = ['Reference', 'Your reference', ...(withNames ? ['Client'] : []), 'Benefit', 'Office', 'Adviser', 'MR requested', 'MR result', 'MR result date', 'Days to MR result',
    'Appeal sent', 'Appeal result', 'Appeal result date', 'Days to appeal result', 'Overturned at', 'Award before', 'Award after', 'Change', 'Yearly value gained (GBP)', 'Rates year'];
  const lines = cases.map(c => [c.ref, c.external_ref, ...(withNames ? [c.client] : []), c.benefit === 'pip' ? 'PIP' : c.benefit === 'adp' ? 'ADP' : 'UC WCA', c.office, c.adviser, c.mr_request_date, c.mr_outcome && MR_OUTCOMES[c.mr_outcome as keyof typeof MR_OUTCOMES], c.mr_outcome_date, c.mrDays,
    c.appeal_sent_date, c.appeal_outcome && APPEAL_OUTCOMES[c.appeal_outcome as keyof typeof APPEAL_OUTCOMES], c.appeal_outcome_date, c.appealDays, c.stageWon === 'mr' ? 'Reconsideration' : c.stageWon === 'appeal' ? 'Appeal' : '', AWARD(c.benefit, c.award_before), AWARD(c.benefit, c.award_after), c.change ?? '', c.gain, c.gainYear].map(csvCell).join(','));
  return [head.map(csvCell).join(','), ...lines].join('\r\n') + '\r\n';
}

// ---------- trends and areas ----------

/** Rates on fewer results than this are shown as counts only: too few to compare. */
export const SMALL = 5;

const MONTHS = (from: string, to: string) => {
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split('-').map(Number);
  const [ty, tm] = to.slice(0, 7).split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) { out.push(`${y}-${String(m).padStart(2, '0')}`); if (++m > 12) { m = 1; y++; } }
  return out.slice(-60);
};

export type MonthRow = { month: string; opened: number; mr: Tally; appeal: Tally; overall: Tally; money: number };

/** Pure: month by month, by the date of each result; cases opened by the date they were created. */
export function monthlyTrends(rows: OutcomeRow[], opened: Record<string, number>, from: string, to: string): MonthRow[] {
  const by = new Map(MONTHS(from, to).map(m => [m, { month: m, opened: opened[m] ?? 0, mr: tally(), appeal: tally(), overall: tally(), money: 0 } as MonthRow]));
  for (const r of rows) {
    if (r.mr_outcome && inPeriod(r.mr_outcome_date, from, to)) {
      const x = by.get(r.mr_outcome_date!.slice(0, 7)); const o = MR_OVERTURN.includes(r.mr_outcome);
      if (x) { x.mr.decided++; x.overall.decided++; if (o) { x.mr.overturned++; x.overall.overturned++; } }
    }
    if (r.appeal_outcome && APPEAL_DECIDED.includes(r.appeal_outcome) && inPeriod(r.appeal_outcome_date, from, to)) {
      const x = by.get(r.appeal_outcome_date!.slice(0, 7)); const o = APPEAL_OVERTURN.includes(r.appeal_outcome);
      if (x) { x.appeal.decided++; x.overall.decided++; if (o) { x.appeal.overturned++; x.overall.overturned++; } }
    }
    const last = r.appeal_outcome && APPEAL_OVERTURN.includes(r.appeal_outcome) ? r.appeal_outcome_date : r.mr_outcome && MR_OVERTURN.includes(r.mr_outcome) ? r.mr_outcome_date : null;
    if (last && inPeriod(last, from, to)) { const g = caseGain({ ...r, on: last }); const x = by.get(last.slice(0, 7)); if (g && x) x.money += g.gain; }
  }
  return [...by.values()].map(x => { for (const t of [x.mr, x.appeal, x.overall]) t.rate = rate(t.overturned, t.decided); x.money = Math.round(x.money * 100) / 100; return x; });
}

export type OfficeFigures = { key: string; open: number; cases: number; mr: Tally; appeal: Tally; overall: Tally; money: number; small: boolean };
export const NO_OFFICE = 'No office set';

/** Pure: results by the office each case belongs to. */
export function byOffice(rows: OutcomeRow[], openByOffice: Record<string, number>, from: string, to: string): OfficeFigures[] {
  const m = new Map<string, OfficeFigures>();
  const get = (k: string) => m.get(k) ?? (m.set(k, { key: k, open: 0, cases: 0, mr: tally(), appeal: tally(), overall: tally(), money: 0, small: false }), m.get(k)!);
  for (const [o, n] of Object.entries(openByOffice)) get(o || NO_OFFICE).open += n;
  for (const c of summariseOutcomes(rows, [], from, to).cases) {
    const x = get(c.office || NO_OFFICE); x.cases++;
    const mrIn = !!c.mr_outcome && inPeriod(c.mr_outcome_date, from, to);
    const apIn = !!c.appeal_outcome && APPEAL_DECIDED.includes(c.appeal_outcome) && inPeriod(c.appeal_outcome_date, from, to);
    if (mrIn) { x.mr.decided++; if (MR_OVERTURN.includes(c.mr_outcome!)) x.mr.overturned++; }
    if (apIn) { x.appeal.decided++; if (APPEAL_OVERTURN.includes(c.appeal_outcome!)) x.appeal.overturned++; }
    if (mrIn || apIn) { x.overall.decided++; if (c.stageWon) x.overall.overturned++; }
    if (c.gain !== null && c.stageWon) x.money += c.gain;
  }
  return [...m.values()].map(x => {
    for (const t of [x.mr, x.appeal, x.overall]) t.rate = t.decided >= SMALL ? rate(t.overturned, t.decided) : null;
    x.small = x.overall.decided < SMALL; x.money = Math.round(x.money * 100) / 100; return x;
  }).sort((a, b) => (a.key === NO_OFFICE ? 1 : b.key === NO_OFFICE ? -1 : a.key.localeCompare(b.key)));
}

/** Cases opened per month (for one office, or all), and the open caseload by office. */
export async function trendAndOfficeData(me: Me, from: string, to: string, officeId: string | null = null) {
  return asAgency(me.agencyId, async c => {
    const opened = Object.fromEntries((await c.query("select to_char(created_at, 'YYYY-MM') m, count(*)::int n from cases where created_at::date between $1 and $2 and ($3::uuid is null or office_id = $3) group by 1", [from, to, officeId])).rows.map(r => [r.m, r.n]));
    const open = Object.fromEntries((await c.query("select coalesce(o.name, '') d, count(*)::int n from cases x left join offices o on o.id = x.office_id where x.closed_at is null group by 1")).rows.map(r => [r.d, r.n]));
    return { opened, open };
  });
}

export function officesCsv(rows: OfficeFigures[]): string {
  const head = ['Office', 'Open cases now', 'Cases with a result', 'MR decided', 'MR overturned', 'Appeals decided', 'Appeals overturned', 'Overturned, any stage', 'Overturn rate %', 'Yearly value of overturns (GBP)'];
  return [head, ...rows.map(r => [r.key, r.open, r.cases, r.mr.decided, r.mr.overturned, r.appeal.decided, r.appeal.overturned, r.overall.overturned, r.overall.rate ?? (r.overall.decided ? `fewer than ${SMALL} results` : ''), r.money])]
    .map(l => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
