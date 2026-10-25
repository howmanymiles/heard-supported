import Link from 'next/link';
import { requireMe } from '@/lib/auth';
import { listClaimants } from '@/lib/claimants';

export const dynamic = 'force-dynamic';

export default async function Clients({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireMe();
  const sp = await searchParams;
  const rows = await listClaimants(me, sp.q);
  return (
    <div className="stack-lg">
      <div className="head"><h1>Clients</h1><p className="soft">Start here when a client sits down with you: record their consent, then create their record. Their cases sit under it.</p></div>
      <div className="row">
        <form className="row" role="search" method="get" aria-label="Find a client">
          <label className="field small-field">Name or reference<input name="q" defaultValue={sp.q ?? ''} /></label>
          <div style={{ alignSelf: 'flex-end' }}><button className="btn" type="submit">Find</button></div>
        </form>
        <div style={{ alignSelf: 'flex-end', marginLeft: 'auto' }}><Link className="btn btn-primary" href="/clients/new">New client</Link></div>
      </div>
      <section className="panel">
        {rows.length === 0 ? <p className="soft">{sp.q ? 'No clients match.' : 'No clients yet.'}</p> : (
          <div className="table-wrap"><table className="list">
            <thead><tr><th scope="col">Client</th><th scope="col">Reference</th><th scope="col">Date of birth</th><th scope="col">Open cases</th><th scope="col">Consent</th></tr></thead>
            <tbody>{rows.map(k => (
              <tr key={k.id}>
                <td><Link href={`/clients/${k.id}`}>{k.name}</Link>{k.preferred_name ? <span className="soft"> ({k.preferred_name})</span> : null}</td>
                <td className="mono">{k.agency_ref ?? '–'}</td>
                <td>{k.date_of_birth ?? '–'}</td>
                <td className="mono">{k.open_cases}</td>
                <td>{!k.consent_active ? <span className="chip chip-lower">Withdrawn</span> : k.ai_ok ? 'In place' : <span className="chip chip-challenge">In place, no AI</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
