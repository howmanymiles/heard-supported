import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMe } from '@/lib/auth';
import { getClaimant, CONSENT_STATEMENT, CONSENT_METHODS } from '@/lib/claimants';
import { EditClientForm, NewConsentForm, WithdrawForm, ClientCaseForm } from '../forms';

export const dynamic = 'force-dynamic';

const STAGE: Record<string, string> = { claim: 'Claim', assessment: 'Awaiting assessment', decision: 'Awaiting decision', mr: 'Reconsideration', appeal: 'Appeal', closed: 'Closed' };
const yes = (b: boolean) => (b ? 'Yes' : 'No');
const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

export default async function Client({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMe();
  const data = await getClaimant(me, id);
  if (!data) notFound();
  const { claimant: k, consents, current, cases } = data;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="stack-lg">
      <p className="crumbs"><Link href="/clients">← Clients</Link></p>
      <div className="head"><h1>{k.name}</h1><p className="soft">{k.preferred_name ? `Known as ${k.preferred_name} · ` : ''}{k.agency_ref ? `Ref ${k.agency_ref} · ` : ''}Record created {day(k.created_at)}</p></div>

      <section className="panel stack" aria-label="Consent">
        <h2 className="eyebrow">Consent</h2>
        {current ? (
          <>
            <table className="list"><tbody>
              <tr><td>Keeping their information</td><td>Yes</td></tr>
              <tr><td>AI help</td><td>{yes(current.ai_processing)}</td></tr>
              <tr><td>Acting on their behalf</td><td>{yes(current.act_on_behalf)}</td></tr>
              <tr><td>Given</td><td>{CONSENT_METHODS[current.method as keyof typeof CONSENT_METHODS] ?? current.method}, {current.given_on} · statement {current.statement_version} · recorded by {current.recorded_by_name ?? 'an adviser'}</td></tr>
            </tbody></table>
            {!current.ai_processing && <p className="msg msg-error" role="status">No consent to AI help: the AI steps are off on this client’s cases.</p>}
            {current.statement_version !== CONSENT_STATEMENT.version && <p className="small">The consent statement has changed since this was recorded ({CONSENT_STATEMENT.version} now). Go through the new one at the next appointment.</p>}
          </>
        ) : <p className="msg msg-error" role="status">Consent withdrawn. The AI is off and nothing more can be added to this client’s cases unless they give consent again.</p>}
        <details><summary>{current ? 'Record a change in consent' : 'Record consent again'}</summary><NewConsentForm claimantId={k.id} statement={CONSENT_STATEMENT} today={today} /></details>
        {current && <details><summary>Withdraw consent</summary><p className="soft small">Use this when your client tells you they no longer agree. The record and cases stay until your agency’s retention rules remove them.</p><WithdrawForm claimantId={k.id} /></details>}
        {consents.length > 1 && (
          <details><summary>Consent history</summary>
            <ul className="plain small">{consents.map(n => <li key={n.id}>{n.given_on}: AI {yes(n.ai_processing).toLowerCase()}, acting on behalf {yes(n.act_on_behalf).toLowerCase()} ({n.statement_version}){n.withdrawn_at ? ` · ended ${day(n.withdrawn_at)}${n.withdrawn_note ? `: ${n.withdrawn_note}` : ''}` : ' · current'}</li>)}</ul>
          </details>
        )}
      </section>

      <section className="panel stack" aria-label="Cases">
        <h2 className="eyebrow">Cases</h2>
        {cases.length === 0 ? <p className="soft">No cases yet.</p> : (
          <ul className="plain">{cases.map((c: any) => <li key={c.id}><Link className="mono" href={`/cases/${c.id}`}>{c.ref}</Link>{c.external_ref ? <span className="soft small"> ({c.external_ref})</span> : null} <span className="soft small">{c.benefit === 'pip' ? 'PIP' : c.benefit === 'adp' ? 'ADP' : 'UC WCA'} · {c.closed_on ? `Closed ${c.closed_on}` : STAGE[c.stage] ?? c.stage}</span></li>)}</ul>
        )}
        {current ? <><h3 className="eyebrow">New case</h3><ClientCaseForm claimantId={k.id} /></> : null}
      </section>

      <section className="panel stack" aria-label="Details"><h2 className="eyebrow">Details</h2><EditClientForm claimant={k} /></section>
    </div>
  );
}
