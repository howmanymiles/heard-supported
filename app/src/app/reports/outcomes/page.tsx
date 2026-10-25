import Link from 'next/link';
import { requireMe } from '@/lib/auth';
import { outcomeData, summariseOutcomes } from '@/lib/outcomes';
import { MR_OUTCOMES, APPEAL_OUTCOMES } from '@/lib/casework';

export const dynamic = 'force-dynamic';

const pct = (r: number | null) => (r === null ? '–' : `${r}%`);
const pounds = (n: number) => `${n < 0 ? '−' : ''}£${Math.abs(Math.round(n)).toLocaleString('en-GB')}`;
const long = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const AW = (b: string, a: any) => !a ? '–' : b === 'pip' ? `DL ${a.daily_living ?? 'none'}, mob ${a.mobility ?? 'none'}` : (a.wca ?? '–').toUpperCase();
function financialYear(today: string) { const [y, m] = today.split('-').map(Number); const s = m >= 4 ? y : y - 1; return { from: `${s}-04-01`, to: `${s + 1}-03-31` }; }

function Rate({ t }: { t: { decided: number; overturned: number; rate: number | null } }) {
  return <>{t.overturned} of {t.decided}{t.decided ? <span className="soft"> · {pct(t.rate)}</span> : null}</>;
}

export default async function Outcomes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireMe();
  const sp = await searchParams;
  const fy = financialYear(new Date().toISOString().slice(0, 10));
  const ok = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  const from = ok(sp.from) ?? fy.from, to = ok(sp.to) ?? fy.to;
  const { rows, issues } = await outcomeData(me, from, to);
  const s = summariseOutcomes(rows, issues, from, to);
  const issueRows = Object.entries(s.byIssue).sort((a, b) => (b[1].won + b[1].part + b[1].lost) - (a[1].won + a[1].part + a[1].lost));
  const csv = `/reports/outcomes/csv?from=${from}&to=${to}`;

  return (
    <div className="stack-lg">
      <p className="crumbs"><Link href={`/reports?from=${from}&to=${to}`}>← Reports</Link></p>
      <div className="head"><h1>Successes and overturns</h1><p className="soft">Reconsideration and appeal results dated between {long(from)} and {long(to)}.</p></div>

      <form className="panel row" method="get" aria-label="Period">
        <label className="field small-field">From<input type="date" name="from" defaultValue={from} /></label>
        <label className="field small-field">To<input type="date" name="to" defaultValue={to} /></label>
        <div style={{ alignSelf: 'flex-end' }}><button className="btn" type="submit">Show</button></div>
        <div style={{ alignSelf: 'flex-end', marginLeft: 'auto' }}><a className="btn" href={csv}>Download CSV</a> <a className="btn btn-quiet" href={`${csv}&names=1`}>CSV with client names</a></div>
      </form>

      <section className="panel totals" aria-label="Headlines">
        <div><span className="eyebrow">Overturned, any stage</span><p><b className="big">{s.overall.overturned}</b> of {s.overall.decided} · {pct(s.overall.rate)}</p></div>
        <div><span className="eyebrow">At reconsideration</span><p><b className="big">{s.mr.overturned}</b> of {s.mr.decided} · {pct(s.mr.rate)}</p></div>
        <div><span className="eyebrow">At appeal</span><p><b className="big">{s.appeal.overturned}</b> of {s.appeal.decided} · {pct(s.appeal.rate)}</p></div>
        <div><span className="eyebrow">Yearly value of overturns</span><p><b className="big">{pounds(s.money.total)}</b></p></div>
      </section>

      <div className="grid-2">
        <section className="panel stack"><h2 className="eyebrow">By benefit</h2>
          <table className="list"><thead><tr><th scope="col">Benefit</th><th scope="col">Reconsideration</th><th scope="col">Appeal</th></tr></thead><tbody>
            {(['pip', 'uc-wca'] as const).filter(b => s.byBenefit[b]).map(b => <tr key={b}><td>{b === 'pip' ? 'PIP' : 'UC WCA'}</td><td><Rate t={s.byBenefit[b].mr} /></td><td><Rate t={s.byBenefit[b].appeal} /></td></tr>)}
          </tbody></table>
        </section>
        <section className="panel stack"><h2 className="eyebrow">By adviser</h2>
          <table className="list"><thead><tr><th scope="col">Adviser</th><th scope="col">Reconsideration</th><th scope="col">Appeal</th></tr></thead><tbody>
            {Object.entries(s.byAdviser).map(([n, t]) => <tr key={n}><td>{n}</td><td><Rate t={t.mr} /></td><td><Rate t={t.appeal} /></td></tr>)}
          </tbody></table>
        </section>
        <section className="panel stack"><h2 className="eyebrow">What was gained in overturned cases</h2>
          <table className="list"><tbody>
            <tr><td>PIP daily living rate up</td><td className="mono">{s.components.dailyLivingUp}</td></tr>
            <tr><td>… to the enhanced rate</td><td className="mono">{s.components.dailyLivingToEnhanced}</td></tr>
            <tr><td>PIP mobility rate up</td><td className="mono">{s.components.mobilityUp}</td></tr>
            <tr><td>… to the enhanced rate</td><td className="mono">{s.components.mobilityToEnhanced}</td></tr>
            <tr><td>UC: to LCWRA</td><td className="mono">{s.components.toLcwra}</td></tr>
            <tr><td>UC: to LCW</td><td className="mono">{s.components.toLcw}</td></tr>
          </tbody></table>
          {s.money.notValued ? <p className="small">{s.money.notValued} overturned {s.money.notValued === 1 ? 'case has' : 'cases have'} no money value: the award before or after, or the LCWRA amount, isn’t recorded.</p> : null}
        </section>
        <section className="panel stack"><h2 className="eyebrow">Time taken (median)</h2>
          <table className="list"><tbody>
            <tr><td>Reconsideration request to result</td><td>{s.days.mrMedian === null ? '–' : `${s.days.mrMedian} days`} <span className="soft small">({s.days.mrCount} cases)</span></td></tr>
            <tr><td>Appeal sent to result</td><td>{s.days.appealMedian === null ? '–' : `${s.days.appealMedian} days`} <span className="soft small">({s.days.appealCount} cases)</span></td></tr>
          </tbody></table>
          {Object.keys(s.appealOther).length ? <p className="small">Not counted as decided: {Object.entries(s.appealOther).map(([k, n]) => `${APPEAL_OUTCOMES[k as keyof typeof APPEAL_OUTCOMES] ?? k} ${n}`).join(', ')}.</p> : null}
        </section>
      </div>

      <section className="panel stack" aria-label="Disputed points"><h2 className="eyebrow">Disputed points won, by activity</h2>
        {issueRows.length === 0 ? <p className="soft small">None recorded yet. Advisers record these on each case’s outcome tab.</p> : (
          <div className="table-wrap"><table className="list">
            <thead><tr><th scope="col">Activity</th><th scope="col">Disputed</th><th scope="col">Won</th><th scope="col">In part</th><th scope="col">Not won</th><th scope="col">Won at MR</th><th scope="col">Won at appeal</th><th scope="col">Success</th></tr></thead>
            <tbody>{issueRows.map(([k, x]) => { const n = x.won + x.part + x.lost; return (
              <tr key={k}><td>{x.benefit === 'uc-wca' ? 'UC · ' : 'PIP · '}{x.label}</td><td className="mono">{n}</td><td className="mono">{x.won}</td><td className="mono">{x.part}</td><td className="mono">{x.lost}</td><td className="mono">{x.wonAtMr}</td><td className="mono">{x.wonAtAppeal}</td><td>{pct(n ? Math.round(((x.won + x.part) / n) * 1000) / 10 : null)}</td></tr>
            ); })}</tbody>
          </table></div>
        )}
      </section>

      <section className="panel stack" aria-label="Cases"><h2 className="eyebrow">Every case with a result</h2>
        {s.cases.length === 0 ? <p className="soft small">No results in this period.</p> : (
          <div className="table-wrap"><table className="list">
            <thead><tr><th scope="col">Case</th><th scope="col">Client</th><th scope="col">Reconsideration</th><th scope="col">Appeal</th><th scope="col">Award before → after</th><th scope="col">Yearly value</th></tr></thead>
            <tbody>{s.cases.map(c => (
              <tr key={c.id}>
                <td><Link className="mono" href={`/cases/${c.id}/outcome`}>{c.ref}</Link><br /><span className="soft small">{c.benefit === 'pip' ? 'PIP' : 'UC WCA'} · {c.adviser ?? 'Unassigned'}</span></td>
                <td>{c.client ?? '–'}</td>
                <td>{c.mr_outcome ? <>{MR_OUTCOMES[c.mr_outcome as keyof typeof MR_OUTCOMES]}<br /><span className="soft small">{c.mr_outcome_date}{c.mrDays !== null ? ` · ${c.mrDays} days` : ''}</span></> : '–'}</td>
                <td>{c.appeal_outcome ? <>{APPEAL_OUTCOMES[c.appeal_outcome as keyof typeof APPEAL_OUTCOMES]}<br /><span className="soft small">{c.appeal_outcome_date}{c.appealDays !== null ? ` · ${c.appealDays} days` : ''}</span></> : '–'}</td>
                <td>{AW(c.benefit, c.award_before)} → {AW(c.benefit, c.award_after)}</td>
                <td className="mono">{c.gain === null ? '–' : pounds(c.gain)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      <p className="soft small">Overturned means a reconsideration revised in full or in part, or an appeal allowed in full or in part, or lapsed because the DWP revised the decision before the hearing. Rates are overturned out of decided. Withdrawn and struck-out appeals are listed but not counted as decided. A case reaching both stages counts at each; it counts once in “any stage”. The award after is the final one, so a case revised in part at reconsideration and then won at appeal shows its full gain against the appeal. The money is the yearly value at that year’s DWP rates, without arrears.</p>
    </div>
  );
}
