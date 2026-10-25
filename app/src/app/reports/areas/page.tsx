import Link from 'next/link';
import { requireMe } from '@/lib/auth';
import { outcomeData, byArea, trendAndAreaData, SMALL } from '@/lib/outcomes';

export const dynamic = 'force-dynamic';

const pounds = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
function financialYear(today: string) { const [y, m] = today.split('-').map(Number); const s = m >= 4 ? y : y - 1; return { from: `${s}-04-01`, to: `${s + 1}-03-31` }; }

export default async function Areas({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireMe();
  const sp = await searchParams;
  const fy = financialYear(new Date().toISOString().slice(0, 10));
  const ok = (x?: string) => (x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null);
  const from = ok(sp.from) ?? fy.from, to = ok(sp.to) ?? fy.to;
  const level = sp.level === 'area' ? 'area' : 'district';
  const [{ rows }, { open }] = await Promise.all([outcomeData(me, from, to), trendAndAreaData(me, from, to)]);
  const areas = byArea(rows, open, from, to, level);
  const most = Math.max(1, ...areas.map(a => a.overall.decided));

  return (
    <div className="stack-lg">
      <p className="crumbs"><Link href="/reports">← Reports</Link></p>
      <div className="head"><h1>By area</h1><p className="soft">Where your clients live, by the first half of their postcode. Results dated in the period; open cases as they are today.</p></div>
      <form className="panel row" method="get" aria-label="Period and level">
        <label className="field small-field">From<input type="date" name="from" defaultValue={from} /></label>
        <label className="field small-field">To<input type="date" name="to" defaultValue={to} /></label>
        <label className="field small-field">Group by<select name="level" defaultValue={level}><option value="district">Postcode district (G41)</option><option value="area">Postcode area (G)</option></select></label>
        <div style={{ alignSelf: 'flex-end' }}><button className="btn" type="submit">Show</button></div>
        <div style={{ alignSelf: 'flex-end', marginLeft: 'auto' }}><a className="btn" href={`/reports/areas/csv?from=${from}&to=${to}&level=${level}`}>Download CSV</a></div>
      </form>
      <section className="panel stack">
        {areas.length === 0 ? <p className="soft">No cases yet.</p> : (
          <div className="table-wrap"><table className="list">
            <thead><tr><th scope="col">{level === 'area' ? 'Postcode area' : 'Postcode district'}</th><th scope="col">Open now</th><th scope="col">Results</th><th scope="col">Reconsideration</th><th scope="col">Appeal</th><th scope="col">Overturn rate</th><th scope="col">Yearly value</th></tr></thead>
            <tbody>{areas.map(a => (
              <tr key={a.key}>
                <td className={a.key === 'Not recorded' ? 'soft' : 'mono'}>{a.key}</td>
                <td className="mono">{a.open}</td>
                <td><span className="meter" style={{ width: `${Math.round((a.overall.decided / most) * 80)}px` }} aria-hidden="true" /><span className="mono">{a.overall.decided}</span></td>
                <td>{a.mr.overturned} of {a.mr.decided}</td>
                <td>{a.appeal.overturned} of {a.appeal.decided}</td>
                <td>{a.overall.rate === null ? <span className="soft small">{a.overall.decided ? `too few (${a.overall.overturned} of ${a.overall.decided})` : '–'}</span> : `${a.overall.rate}%`}</td>
                <td className="mono">{pounds(a.money)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      <p className="soft small">Rates are shown only where an area has at least {SMALL} results, so small numbers are not compared or used to pick out a client. Clients without a postcode are counted under “Not recorded”. Only the postcode district is stored; to report by council area, the districts can be matched to councils from the ONS postcode directory.</p>
    </div>
  );
}
