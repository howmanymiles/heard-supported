'use client';

import { useActionState } from 'react';
import { Submit, Status } from '../forms';
import { createClientAction, updateClientAction, consentAction, withdrawAction, clientCaseAction, eraseClientAction } from './actions';

type Statement = { version: string; intro: string; items: ReadonlyArray<{ key: string; required: boolean; text: string }>; withdraw: string };
const ITEM_LABEL: Record<string, string> = { store_data: 'Keeping their information', ai_processing: 'AI help', act_on_behalf: 'Acting on their behalf' };

function ConsentFields({ statement, today }: { statement: Statement; today: string }) {
  return (
    <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="soft small">Consent statement {statement.version}</legend>
      <p className="soft small">{statement.intro}</p>
      {statement.items.map(i => (
        <div key={i.key} className="panel stack" style={{ padding: '0.75rem' }}>
          <p className="small">{i.text}</p>
          <label><input type="checkbox" name={i.key} value="yes" defaultChecked={i.key === 'store_data'} required={i.required} /> {ITEM_LABEL[i.key]}: the client agrees{i.required ? ' (needed to create a record)' : ''}</label>
        </div>
      ))}
      <p className="small">{statement.withdraw}</p>
      <div className="row">
        <label className="field small-field">How consent was given
          <select name="method" defaultValue="in_person"><option value="in_person">In person</option><option value="phone">By phone</option><option value="video">By video call</option><option value="written">In writing</option></select>
        </label>
        <label className="field small-field">Date given<input type="date" name="givenOn" defaultValue={today} max={today} required /></label>
      </div>
      <label><input type="checkbox" name="confirmed" value="yes" required /> I went through this statement with my client and recorded what they agreed to.</label>
    </fieldset>
  );
}

function PersonFields({ v }: { v?: { name?: string; preferred_name?: string | null; date_of_birth?: string | null; agency_ref?: string | null } }) {
  return (
    <div className="row">
      <label className="field">Full name<input name="name" required maxLength={120} defaultValue={v?.name ?? ''} autoComplete="off" /></label>
      <label className="field small-field">Known as (optional)<input name="preferredName" maxLength={60} defaultValue={v?.preferred_name ?? ''} autoComplete="off" /></label>
      <label className="field small-field">Date of birth (optional)<input type="date" name="dateOfBirth" defaultValue={v?.date_of_birth ?? ''} /></label>
      <label className="field small-field">Your agency’s client reference (optional)<input name="agencyRef" maxLength={40} defaultValue={v?.agency_ref ?? ''} autoComplete="off" /></label>
    </div>
  );
}

export function NewClientForm({ statement, today }: { statement: Statement; today: string }) {
  const [state, action] = useActionState(createClientAction, {});
  return (
    <form action={action} className="stack-lg">
      <section className="panel stack" aria-label="Step 1: consent"><h2 className="eyebrow">1. Consent, with your client</h2><ConsentFields statement={statement} today={today} /></section>
      <section className="panel stack" aria-label="Step 2: client details">
        <h2 className="eyebrow">2. Your client</h2>
        <p className="soft small">The name is kept on the client record so you can find them. It is removed from every page before the AI sees it.</p>
        <PersonFields />
      </section>
      <div><Submit pending="Creating…">Create client record</Submit></div>
      <Status state={state} />
    </form>
  );
}

export function EditClientForm({ claimant }: { claimant: { id: string; name: string; preferred_name: string | null; date_of_birth: string | null; agency_ref: string | null } }) {
  const [state, action] = useActionState(updateClientAction, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="claimantId" value={claimant.id} />
      <PersonFields v={claimant} />
      <div><Submit pending="Saving…" primary={false}>Save details</Submit></div>
      <Status state={state} />
    </form>
  );
}

export function NewConsentForm({ claimantId, statement, today }: { claimantId: string; statement: Statement; today: string }) {
  const [state, action] = useActionState(consentAction, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="claimantId" value={claimantId} />
      <ConsentFields statement={statement} today={today} />
      <div><Submit pending="Recording…" primary={false}>Record new consent</Submit></div>
      <Status state={state} />
    </form>
  );
}

export function WithdrawForm({ claimantId }: { claimantId: string }) {
  const [state, action] = useActionState(withdrawAction, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="claimantId" value={claimantId} />
      <label className="field">Note (optional)<input name="note" maxLength={300} /></label>
      <div><Submit pending="Withdrawing…" primary={false}>Withdraw consent</Submit></div>
      <Status state={state} />
    </form>
  );
}

export function ClientCaseForm({ claimantId }: { claimantId: string }) {
  const [state, action] = useActionState(clientCaseAction, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="claimantId" value={claimantId} />
      <div className="row">
        <label className="field">Your case management reference (optional)<input name="ref" maxLength={40} autoComplete="off" /><span className="hint">The case number is given automatically. Add your own system’s reference here if you use one. Not the client’s name.</span></label>
        <label className="field">Benefit<select name="benefit" defaultValue="pip"><option value="pip">Personal Independence Payment</option><option value="adp">Adult Disability Payment (Scotland)</option><option value="uc-wca">Universal Credit (WCA)</option></select></label>
      </div>
      <div><Submit pending="Creating…">Create case</Submit></div>
      <Status state={state} />
    </form>
  );
}

export function EraseForm({ claimantId }: { claimantId: string }) {
  const [state, action] = useActionState(eraseClientAction, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="claimantId" value={claimantId} />
      <label className="field">To confirm, type the client’s full name<input name="confirmName" required autoComplete="off" /></label>
      <div><Submit pending="Erasing…" primary={false}>Erase this client permanently</Submit></div>
      <Status state={state} />
    </form>
  );
}
