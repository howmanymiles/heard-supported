import Link from 'next/link';
import { requireMe } from '@/lib/auth';
import { outcomeData, byOffice, trendAndOfficeData, SMALL, NO_OFFICE } from '@/lib/outcomes';
import { listOffices } from '@/lib/offices';

export const dynamic = 'force-dynamic';

const pounds = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
function financialYear(today: string) { const [y, m] = today.split('-').map(Number); const s = m >= 4 ? y : y - 1; return { from: `${s}-04-01`, to: `${s + 1}-03-31` }; }
const pct = (t: { decided: number; overturned: number; rate: number | null }) => t.rate === null ? (t.decided ? <span className="soft small">too few to compare</span> : '–') : `${t.rate}%`;

export default async function Offices({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireMe();
  const sp = await searchParams;
  const fy = financialYear(new Date().toISOString().slice(0, 10));
  const ok = (x?: string) => (x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null);
  const from = ok(sp.from) ?? fy.from, to = ok(sp.to) ?? fy.to;
  const [{ rows }, { open }] = await Promise.all([outcomeData(me, from, to), trendAndOfficeData(me, from, to)]);
  const offices = byOffice(rows, open, from, to);
  const idOf = Object.fromEntries((await listOffices(me)).map(o => [o.name, o.id]));
  const most = Math.max(1, ...offices.map(a => a.overall.decided));

  return (
    <div className="stack-lg">
      <p className="crumbs"><Link href="/reports">← Reports</Link></p>
      <div className="head"><h1>By office</h1><p className="soft">Results dated in the period, by the office each case belongs to; open cases as they are today. Set offices on the <Link href="/team">Team</Link> page.</p></div>
      <form className="panel row" method="get" aria-label="Period">
        <label className="field small-field">From<input type="date" name="from" defaultValue={from} /></label>
        <label className="field small-field">To<input type="date" name="to" defaultValue={to} /></label>
        <div style={{ alignSelf: 'flex-end' }}><button className="btn" type="submit">Show</button></div>
        <div style={{ alignSelf: 'flex-end', marginLeft: 'auto' }}><a className="btn" href={`/reports/offices/csv?from=${from}&to=${to}`}>Download CSV</a></div>
      </form>
      <section className="panel stack">
        {offices.length === 0 ? <p className="soft">No cases yet.</p> : (
          <div className="table-wrap"><table className="list">
            <thead><tr><th scope="col">Office</th><th scope="col">Open now</th><th scope="col">Results</th><th scope="col">Reconsideration</th><th scope="col">Appeal</th><th scope="col">Overturn rate</th><th scope="col">Yearly value</th><th scope="col"><span className="sr-only">Links</span></th></tr></thead>
            <tbody>{offices.map(a => (
              <tr key={a.key}>
                <td className={a.key === NO_OFFICE ? 'soft' : ''}>{a.key}</td>
                <td className="mono">{a.open}</td>
                <td><span className="meter" style={{ width: `${Math.round((a.overall.decided / most) * 80)}px` }} aria-hidden="true" /><span className="mono">{a.overall.decided}</span></td>
                <td>{a.mr.overturned} of {a.mr.decided} <span className="soft">· {pct(a.mr)}</span></td>
                <td>{a.appeal.overturned} of {a.appeal.decided} <span className="soft">· {pct(a.appeal)}</span></td>
                <td>{pct(a.overall)}</td>
                <td className="mono">{pounds(a.money)}</td>
                <td className="small">{idOf[a.key] && <><Link href={`/reports/trends?office=${idOf[a.key]}`}>Trends</Link> · <Link href={`/reports/outcomes?from=${from}&to=${to}&office=${idOf[a.key]}`}>Cases</Link></>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      <p className="soft small">Rates are shown where an office has at least {SMALL} results at that stage; below that, the counts are shown but not compared. A case counts for the office it belonged to when its result came in; moving an adviser moves only their open cases.</p>
    </div>
  );
}
