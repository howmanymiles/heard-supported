import Link from 'next/link';
import { requireMe } from '@/lib/auth';
import { listCases } from '@/lib/cases';
import { CreateCaseForm } from './forms';
import { loadSyntheticAction } from './actions';
import synthetic from '@/data/synthetic.json';

export const dynamic = 'force-dynamic';

const STAGE: Record<string, string> = { claim: 'Claim', assessment: 'Awaiting assessment', decision: 'Awaiting decision', mr: 'Reconsideration', appeal: 'Appeal', closed: 'Closed' };

export default async function Caseload() {
  const me = await requireMe();
  const cases = await listCases(me);
  const tests = synthetic as Array<{ id: string; title: string; benefit: string }>;
  return (
    <div className="stack-lg">
      <div className="head"><h1>Cases</h1><p className="soft">Your agency’s cases. Each is identified by your reference only.</p></div>

      <section className="panel">
        <h2 className="eyebrow">Cases</h2>
        {cases.length === 0 ? <p className="soft">No cases yet. Create one below, or load a fictional test case.</p> : (
          <div className="table-wrap"><table className="list">
            <thead><tr><th scope="col">Reference</th><th scope="col">Benefit</th><th scope="col">Stage</th><th scope="col">Documents</th><th scope="col">Suggestions to check</th><th scope="col">Adviser</th></tr></thead>
            <tbody>{cases.map(c => (
              <tr key={c.id}>
                <td><Link className="mono" href={`/cases/${c.id}`}>{c.ref}</Link></td>
                <td>{c.benefit === 'pip' ? 'PIP' : 'UC WCA'}</td>
                <td>{STAGE[c.stage] ?? c.stage}</td>
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
