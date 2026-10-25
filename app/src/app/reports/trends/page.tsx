import Link from 'next/link';
import { requireMe } from '@/lib/auth';
import { outcomeData, monthlyTrends, trendAndAreaData, SMALL } from '@/lib/outcomes';
import { Bars, Line } from '../charts';

export const dynamic = 'force-dynamic';

const pounds = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** The last 12 whole and part months, ending this month. */
function lastYear(today: string) {
  const [y, m] = today.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 12, 1)), end = new Date(Date.UTC(y, m, 0));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export default async function Trends({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireMe();
  const sp = await searchParams;
  const d = lastYear(new Date().toISOString().slice(0, 10));
  const ok = (x?: string) => (x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null);
  const from = ok(sp.from) ?? d.from, to = ok(sp.to) ?? d.to;
  const [{ rows }, { opened }] = await Promise.all([outcomeData(me, from, to), trendAndAreaData(me, from, to)]);
  const months = monthlyTrends(rows, opened, from, to);
  const ratePts = (k: 'mr' | 'appeal' | 'overall') => months.map(m => ({ label: m.month, value: m[k].decided ? m[k].rate : null,
    tip: `${monthName(m.month)}: ${m[k].decided ? `${m[k].overturned} of ${m[k].decided} overturned (${m[k].rate}%)` : 'no results'}${m[k].decided && m[k].decided < SMALL ? ' · few results' : ''}` }));

  return (
    <div className="stack-lg">
      <p className="crumbs"><Link href="/reports">← Reports</Link></p>
      <div className="head"><h1>Trends</h1><p className="soft">Month by month, by the date of each result. Hover over a month for its figures; the table below has them all.</p></div>
      <form className="panel row" method="get" aria-label="Period">
        <label className="field small-field">From<input type="date" name="from" defaultValue={from} /></label>
        <label className="field small-field">To<input type="date" name="to" defaultValue={to} /></label>
        <div style={{ alignSelf: 'flex-end' }}><button className="btn" type="submit">Show</button></div>
      </form>

      <div className="grid-2">
        <section className="panel stack"><h2 className="eyebrow">Overturn rate, any stage</h2><Line title="Overturn rate by month, any stage" points={ratePts('overall')} /></section>
        <section className="panel stack"><h2 className="eyebrow">Decisions overturned</h2>
          <Bars title="Decisions overturned by month" points={months.map(m => ({ label: m.month, value: m.overall.overturned, tip: `${monthName(m.month)}: ${m.overall.overturned} overturned (${m.mr.overturned} at reconsideration, ${m.appeal.overturned} at appeal)` }))} /></section>
        <section className="panel stack"><h2 className="eyebrow">Overturn rate at reconsideration</h2><Line title="Reconsideration overturn rate by month" points={ratePts('mr')} /></section>
        <section className="panel stack"><h2 className="eyebrow">Overturn rate at appeal</h2><Line title="Appeal overturn rate by month" points={ratePts('appeal')} /></section>
        <section className="panel stack"><h2 className="eyebrow">Yearly value of overturns</h2>
          <Bars title="Yearly value of overturns by month" fmt={n => `£${n >= 1000 ? `${Math.round(n / 1000)}k` : n}`} points={months.map(m => ({ label: m.month, value: m.money, tip: `${monthName(m.month)}: ${pounds(m.money)} a year` }))} /></section>
        <section className="panel stack"><h2 className="eyebrow">Cases opened</h2>
          <Bars title="Cases opened by month" points={months.map(m => ({ label: m.month, value: m.opened, tip: `${monthName(m.month)}: ${m.opened} opened` }))} /></section>
      </div>

      <section className="panel stack" aria-label="Figures by month"><h2 className="eyebrow">By month</h2>
        <div className="table-wrap"><table className="list">
          <thead><tr><th scope="col">Month</th><th scope="col">Opened</th><th scope="col">Reconsiderations overturned</th><th scope="col">Appeals overturned</th><th scope="col">Any stage</th><th scope="col">Yearly value</th></tr></thead>
          <tbody>{[...months].reverse().map(m => (
            <tr key={m.month}><td>{monthName(m.month)}</td><td className="mono">{m.opened}</td>
              <td>{m.mr.overturned} of {m.mr.decided}{m.mr.decided ? <span className="soft"> · {m.mr.rate}%</span> : null}</td>
              <td>{m.appeal.overturned} of {m.appeal.decided}{m.appeal.decided ? <span className="soft"> · {m.appeal.rate}%</span> : null}</td>
              <td>{m.overall.overturned} of {m.overall.decided}{m.overall.decided ? <span className="soft"> · {m.overall.rate}%</span> : null}</td>
              <td className="mono">{pounds(m.money)}</td></tr>
          ))}</tbody>
        </table></div>
      </section>
      <p className="soft small">A month’s rate rests on that month’s results only; where there are fewer than {SMALL}, read it with care. The value is counted in the month of the result that won it.</p>
    </div>
  );
}
