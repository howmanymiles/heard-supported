import Link from 'next/link';
import { notFound } from 'next/navigation';
import { terms } from '@hs/core';
import { requireMe } from '@/lib/auth';
import { getCase, getCaseHistory, type DecisionRow } from '@/lib/cases';
import { score } from '@/lib/score';
import { CaseTabs } from '../tabs';

export const dynamic = 'force-dynamic';

const RATE: Record<string, string> = { none: 'no award', standard: 'standard', enhanced: 'enhanced' };
const day = (d: Date | string) => new Date(d).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' });

export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMe();
  const [data, h] = await Promise.all([getCase(me, id), getCaseHistory(me, id)]);
  if (!data || !h) notFound();
  const { case: cs, docs, evidence, gaps, decisions, claimed } = data;

  // What the claimant claimed and what you think the evidence supports, worked through the same rules.
  const asRows = (m: Record<string, string>): DecisionRow[] => Object.entries(m).map(([activity, letter]) => ({ activity, satisfied: [{ letter }], days_per_week: null }));
  const claimedScore = score(cs.benefit, asRows(claimed), cs.decision_date);
  const viewScore = score(cs.benefit, decisions, cs.decision_date);
  const points = (s: typeof viewScore) => s.kind === 'pip'
    ? `${s.result.dailyLiving.points} daily living (${RATE[s.result.dailyLiving.rate]}) · ${s.result.mobility.points} mobility (${RATE[s.result.mobility.rate]})`
    : `${s.result.lcw.totalPoints} points${s.result.lcwra.descriptors.length ? ' · LCWRA' : ''}`;

  const ev = docs.filter(d => ['evidence', 'notes', 'other'].includes(d.kind));
  const pages = docs.reduce((n, d) => n + (d.read_status === 'read' ? d.page_count ?? 0 : 0), 0);
  const ai = evidence.filter(e => e.source === 'ai');
  const count = (s: string) => ai.filter(e => e.status === s).length;
  const people = [...new Set(h.log.map(l => l.name).filter(Boolean))];
  const opened = new Date(cs.created_at);
  const daysOpen = Math.max(0, Math.floor((Date.now() - opened.getTime()) / 86_400_000));
  const lastWorked = h.log[0]?.at;

  const stats: Array<[string, string, string?]> = [
    ['Open for', `${daysOpen} day${daysOpen === 1 ? '' : 's'}`, `since ${day(opened)}${lastWorked ? ` · last worked on ${day(lastWorked)}` : ''}`],
    ['Claimed', Object.keys(claimed).length ? points(claimedScore) : 'not recorded yet', `${Object.keys(claimed).length} activities from the claim form`],
    ['Your view', decisions.some(d => Array.isArray(d.satisfied) && d.satisfied.length) ? points(viewScore) : 'not chosen yet', 'what you think the evidence supports'],
    ['Documents', `${docs.length}`, `${ev.length} from the client · ${pages} pages read`],
    ['AI suggestions', `${count('accepted')} accepted`, `${count('rejected')} rejected · ${count('suggested')} still to check`],
    ['Gaps in the evidence', `${gaps.filter(g => g.status === 'open').length} open`, `${gaps.filter(g => g.status !== 'open').length} closed or not relevant`],
    ['Claim checks run', `${h.checks}`, h.lastCheck ? `last on ${day(h.lastCheck)}` : 'none yet'],
    ['Worked on by', people.length ? people.join(', ') : '—', `${h.log.length} change${h.log.length === 1 ? '' : 's'} recorded`],
  ];

  return (
    <div className="stack-lg">
      <p className="crumbs"><Link href="/">← Cases</Link></p>
      <div className="head">
        <h1><span className="mono">{cs.ref}</span>{cs.external_ref ? <span className="soft small"> · your ref {cs.external_ref}</span> : null}</h1>
        <p className="soft">{terms(cs.benefit).name}</p>
      </div>
      <CaseTabs id={id} benefit={cs.benefit} current="history" />

      <section className="stat-grid" aria-label="This case in numbers">
        {stats.map(([label, value, sub]) => (
          <div key={label} className="panel stat">
            <span className="eyebrow">{label}</span>
            <p className="stat-value">{value}</p>
            {sub && <p className="soft small">{sub}</p>}
          </div>
        ))}
      </section>

      <section className="panel stack">
        <h2 className="eyebrow">Activity log</h2>
        {h.log.length ? <ul className="log">{h.log.map((l, i) => <li key={i}><span className="mono soft">{new Date(l.at).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span> <b>{l.name ?? 'System'}</b> · {l.action}</li>)}</ul>
          : <p className="soft">Nothing recorded yet.</p>}
        <p className="soft small">Changes to the case, newest first. Who opened the case and when is kept in the agency’s access log.</p>
      </section>
    </div>
  );
}
