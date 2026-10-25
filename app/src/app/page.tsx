import Link from 'next/link';
import { requireMe } from '@/lib/auth';
import { listCases } from '@/lib/cases';
import { CreateCaseForm } from './forms';
import { loadSyntheticAction } from './actions';
import synthetic from '@/data/synthetic.json';
import { nextDeadline, type NextDeadline } from '@hs/core';

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

export default async function Caseload() {
  const me = await requireMe();
  const today = new Date().toISOString().slice(0, 10);
  const cases = (await listCases(me))
    .map(c => ({ ...c, next: nextDeadline({ decisionDate: c.decision_date, mrRequestDate: c.mr_request_date, mrNoticeDate: c.mr_notice_date, appealSentDate: c.appeal_sent_date }, today) }))
    .sort((a, b) => (a.next ? a.next.status === 'in_time' ? a.next.daysLeft : -1 : 1e6) - (b.next ? b.next.status === 'in_time' ? b.next.daysLeft : -1 : 1e6));
  const soon = cases.filter(c => c.next && (c.next.status !== 'in_time' || c.next.daysLeft <= SOON));
  const tests = synthetic as Array<{ id: string; title: string; benefit: string }>;
  return (
    <div className="stack-lg">
      <div className="head"><h1>Cases</h1><p className="soft">Your agency’s cases. Each is identified by your reference only.</p></div>

      {soon.length > 0 && (
        <section className="msg msg-error" role="status" aria-label="Deadlines">
          {soon.length === 1 ? '1 case needs' : `${soon.length} cases need`} attention: {soon.map(c => c.ref).join(', ')}. Late or due within {SOON} days.
        </section>
      )}

      <section className="panel">
        <h2 className="eyebrow">Cases, nearest deadline first</h2>
        {cases.length === 0 ? <p className="soft">No cases yet. Create one below, or load a fictional test case.</p> : (
          <div className="table-wrap"><table className="list">
            <thead><tr><th scope="col">Reference</th><th scope="col">Benefit</th><th scope="col">Stage</th><th scope="col">Next deadline</th><th scope="col">Documents</th><th scope="col">Suggestions to check</th><th scope="col">Adviser</th></tr></thead>
            <tbody>{cases.map(c => (
              <tr key={c.id}>
                <td><Link className="mono" href={`/cases/${c.id}`}>{c.ref}</Link></td>
                <td>{c.benefit === 'pip' ? 'PIP' : 'UC WCA'}</td>
                <td>{STAGE[c.stage] ?? c.stage}</td>
                <td><Deadline d={c.next} /></td>
                <td className="mono">{c.documents}</td>
                <td className="mono">{c.suggested}</td>
                <td>{c.adviser_name ?? '–'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <div className="grid-2">
        <section className="panel"><h2 className="eyebrow">New case</h2><CreateCaseForm /></section>
        <section className="panel">
          <h2 className="eyebrow">Load a fictional test case</h2>
          <p className="soft small">Creates a case with the synthetic documents already uploaded, ready to read and review.</p>
          <ul className="plain">{tests.map(t => (
            <li key={t.id}><form action={loadSyntheticAction} className="inline"><input type="hidden" name="id" value={t.id} />
              <button className="btn btn-quiet" type="submit">{t.id}</button><span className="soft small">{t.benefit === 'pip' ? 'PIP' : 'UC WCA'} · {t.title}</span></form></li>
          ))}</ul>
        </section>
      </div>
    </div>
  );
}
