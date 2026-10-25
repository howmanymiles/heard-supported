import { requireMe } from '@/lib/auth';
import { agencyReport, MR_OUTCOMES, APPEAL_OUTCOMES, CLOSE_REASONS } from '@/lib/casework';

export const dynamic = 'force-dynamic';

const STAGE: Record<string, string> = { claim: 'Claim', assessment: 'Awaiting assessment', decision: 'Awaiting decision', mr: 'Reconsideration', appeal: 'Appeal' };
const long = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** The UK financial year containing a date: 1 April to 31 March. */
function financialYear(today: string) {
  const [y, m] = today.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

function Rows({ data, labels, total }: { data: Record<string, number>; labels: Record<string, string>; total?: boolean }) {
  const keys = Object.keys(labels).filter(k => data[k]);
  if (!keys.length) return <p className="soft small">None recorded.</p>;
  const sum = keys.reduce((n, k) => n + data[k], 0);
  return (
    <table className="list">
      <tbody>
        {keys.map(k => <tr key={k}><td>{labels[k]}</td><td className="mono">{data[k]}</td></tr>)}
        {total && <tr><td><b>Total</b></td><td className="mono"><b>{sum}</b></td></tr>}
      </tbody>
    </table>
  );
}

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireMe();
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const fy = financialYear(today);
  const ok = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  const from = ok(sp.from) ?? fy.from, to = ok(sp.to) ?? fy.to;
  const r = await agencyReport(me, from, to, today);
  const decided = (r.appeal.allowed ?? 0) + (r.appeal.allowed_in_part ?? 0) + (r.appeal.dismissed ?? 0);
  const won = (r.appeal.allowed ?? 0) + (r.appeal.allowed_in_part ?? 0);
  const mrDone = Object.values(r.mr).reduce((a, b) => a + b, 0);
  const mrWon = (r.mr.revised ?? 0) + (r.mr.revised_in_part ?? 0);

  return (
    <div className="stack-lg">
      <div className="head"><h1>Reports</h1><p className="soft">Your agency’s figures. Outcomes and closures between {long(from)} and {long(to)}; the open caseload as it is today.</p></div>

      <form className="panel row" method="get" aria-label="Period">
        <label className="field small-field">From<input type="date" name="from" defaultValue={from} /></label>
        <label className="field small-field">To<input type="date" name="to" defaultValue={to} /></label>
        <div style={{ alignSelf: 'flex-end' }}><button className="btn" type="submit">Show</button></div>
      </form>

      <section className="panel totals" aria-label="Headlines">
        <div><span className="eyebrow">Open cases</span><p><b className="big">{r.open.total}</b>{r.open.late ? <> · <span className="warn">{r.open.late} late</span></> : null}</p></div>
        <div><span className="eyebrow">Closed in period</span><p><b className="big">{r.closed}</b></p></div>
        <div><span className="eyebrow">Reconsiderations changed</span><p><b className="big">{mrWon}</b> of {mrDone}</p></div>
        <div><span className="eyebrow">Appeals won</span><p><b className="big">{won}</b> of {decided} decided</p></div>
        <div><span className="eyebrow">Award better at close</span><p><b className="big">{r.awards.better}</b> of {r.closed}</p></div>
      </section>

      <div className="grid-2">
        <section className="panel stack"><h2 className="eyebrow">Open caseload by stage</h2><Rows data={r.open.byStage} labels={STAGE} total /></section>
        <section className="panel stack"><h2 className="eyebrow">Open caseload by benefit</h2><Rows data={r.open.byBenefit} labels={{ pip: 'PIP', 'uc-wca': 'UC WCA' }} total /></section>
        <section className="panel stack"><h2 className="eyebrow">Reconsideration results</h2><Rows data={r.mr} labels={MR_OUTCOMES} total /></section>
        <section className="panel stack"><h2 className="eyebrow">Appeal results</h2><Rows data={r.appeal} labels={APPEAL_OUTCOMES} total /></section>
        <section className="panel stack">
          <h2 className="eyebrow">Awards at close</h2>
          <Rows data={{ better: r.awards.better, same: r.awards.same, worse: r.awards.worse, unknown: r.awards.unknown }} labels={{ better: 'Better', same: 'No overall change', worse: 'Worse', unknown: 'Not recorded' }} total />
          <p className="small">PIP: daily living rate up in {r.awards.pip.dailyLivingUp}, mobility rate up in {r.awards.pip.mobilityUp}. UC WCA: moved to LCWRA in {r.awards.wca.toLcwra}, to LCW in {r.awards.wca.toLcw}.</p>
        </section>
        <section className="panel stack"><h2 className="eyebrow">Why cases closed</h2><Rows data={r.closedReasons} labels={CLOSE_REASONS} total /></section>
      </div>
      <p className="soft small">Counts come from the outcomes advisers record on each case. Money gained is not calculated, because benefit rates change each April.</p>
    </div>
  );
}
