import Link from 'next/link';
import { requireMe } from '@/lib/auth';
import { findCases, listUsers } from '@/lib/casework';
import { loadSyntheticAction } from './actions';
import synthetic from '@/data/synthetic.json';
import { nextDeadline, terms, type NextDeadline } from '@hs/core';

export const dynamic = 'force-dynamic';

const STAGE: Record<string, string> = { claim: 'Claim', assessment: 'Awaiting assessment', decision: 'Awaiting decision', mr: 'Reconsideration', appeal: 'Appeal', closed: 'Closed' };
const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const SOON = 7;

function Deadline({ d }: { d: NextDeadline | null }) {
  if (!d) return <span className="soft">–</span>;
  const what = d.kind === 'mr' ? 'MR' : 'Appeal';
  if (d.status === 'in_time') return <span className={d.daysLeft <= SOON ? 'chip chip-challenge' : ''}>{what} by {short(d.due)} · {d.daysLeft === 0 ? 'today' : `${d.daysLeft} days`}</span>;
  if (d.status === 'late') return <span className="chip chip-lower">{what} late · reason needed, by {short(d.lateLimit)}</span>;
  return <span className="chip chip-lower">{what} out of time</span>;
}

export default async function Caseload({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireMe();
  const sp = await searchParams;
  const view = sp.view === 'all' ? 'all' : sp.view === 'closed' ? 'closed' : 'mine';
  const users = await listUsers(me);
  const today = new Date().toISOString().slice(0, 10);
  const cases = (await findCases(me, { mine: view === 'mine', closed: view === 'closed', adviser: view === 'all' ? sp.adviser : undefined, stage: sp.stage, benefit: sp.benefit, q: sp.q }))
    .map(c => ({ ...c, next: nextDeadline({ benefit: c.benefit, decisionDate: c.decision_date, mrRequestDate: c.mr_request_date, mrNoticeDate: c.mr_notice_date, appealSentDate: c.appeal_sent_date }, today) }))
    .sort((a, b) => (a.next ? a.next.status === 'in_time' ? a.next.daysLeft : -1 : 1e6) - (b.next ? b.next.status === 'in_time' ? b.next.daysLeft : -1 : 1e6));
  const soon = cases.filter(c => c.next && (c.next.status !== 'in_time' || c.next.daysLeft <= SOON));
  const tests = synthetic as Array<{ id: string; title: string; benefit: string }>;
  return (
    <div className="stack-lg">
      <div className="head"><h1>Cases</h1><p className="soft">Your agency’s cases.</p></div>

      {soon.length > 0 && (
        <section className="msg msg-error" role="status" aria-label="Deadlines">
          {soon.length === 1 ? '1 case needs' : `${soon.length} cases need`} attention: {soon.map(c => c.ref).join(', ')}. Late or due within {SOON} days.
        </section>
      )}

      <form className="panel row" role="search" aria-label="Find cases" method="get">
        <label className="field small-field">Show
          <select name="view" defaultValue={view}><option value="mine">My open cases</option><option value="all">All open cases</option><option value="closed">Closed cases</option></select>
        </label>
        <label className="field small-field">Adviser
          <select name="adviser" defaultValue={sp.adviser ?? ''}><option value="">Anyone</option>{users.map(u => <option key={u.id} value={u.id}>{u.name ?? 'Unnamed'}</option>)}</select>
        </label>
        <label className="field small-field">Stage
          <select name="stage" defaultValue={sp.stage ?? ''}><option value="">Any</option>{Object.entries(STAGE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className="field small-field">Benefit
          <select name="benefit" defaultValue={sp.benefit ?? ''}><option value="">All</option><option value="pip">PIP</option><option value="adp">ADP</option><option value="uc-wca">UC WCA</option></select>
        </label>
        <label className="field small-field">Reference or client<input name="q" defaultValue={sp.q ?? ''} /></label>
        <div style={{ alignSelf: 'flex-end' }}><button className="btn" type="submit">Show</button></div>
      </form>

      <section className="panel">
        <h2 className="eyebrow">{view === 'closed' ? 'Closed cases' : view === 'all' ? 'All open cases, nearest deadline first' : 'My open cases, nearest deadline first'}</h2>
        {cases.length === 0 ? <p className="soft">{view === 'mine' && !sp.q && !sp.stage && !sp.benefit ? 'No open cases assigned to you. Start from a client, load a fictional test case, or show all open cases.' : 'No cases match.'}</p> : (
          <div className="table-wrap"><table className="list">
            <thead><tr><th scope="col">Reference</th><th scope="col">Client</th><th scope="col">Benefit</th><th scope="col">Stage</th><th scope="col">{view === 'closed' ? 'Closed' : 'Next deadline'}</th><th scope="col">Documents</th><th scope="col">Suggestions to check</th><th scope="col">Adviser</th></tr></thead>
            <tbody>{cases.map(c => (
              <tr key={c.id}>
                <td><Link className="mono" href={`/cases/${c.id}`}>{c.ref}</Link>{c.external_ref ? <><br /><span className="soft small">{c.external_ref}</span></> : null}</td>
                <td>{c.claimant_id ? <Link href={`/clients/${c.claimant_id}`}>{c.client_name}</Link> : <span className="soft">–</span>}</td>
                <td>{terms(c.benefit).short}</td>
                <td>{STAGE[c.stage] ?? c.stage}</td>
                <td>{view === 'closed' ? <span className="soft">{c.closed_on}</span> : <Deadline d={c.next} />}</td>
                <td className="mono">{c.documents}</td>
                <td className="mono">{c.suggested}</td>
                <td>{c.adviser_name ?? '–'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <div className="grid-2">
        <section className="panel stack"><h2 className="eyebrow">New case</h2><p className="soft small">Cases start from the client, once their consent is recorded.</p><p><Link className="btn btn-primary" href="/clients/new">New client</Link> <Link className="btn" href="/clients">Find a client</Link></p></section>
        <section className="panel">
          <h2 className="eyebrow">Load a fictional test case</h2>
          <p className="soft small">Creates a case with the synthetic documents already uploaded, ready to read and review.</p>
          <ul className="plain">{tests.map(t => (
            <li key={t.id}><form action={loadSyntheticAction} className="inline"><input type="hidden" name="id" value={t.id} />
              <button className="btn btn-quiet" type="submit">{t.id}</button><span className="soft small">{terms(t.benefit).short} · {t.title}</span></form></li>
          ))}</ul>
        </section>
      </div>
    </div>
  );
}
