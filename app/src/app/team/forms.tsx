'use client';

import { useActionState } from 'react';
import { Submit, Status } from '../forms';
import { addOfficeAction, renameOfficeAction, userOfficeAction } from './actions';

export function AddOfficeForm() {
  const [state, action] = useActionState(addOfficeAction, {});
  return (
    <form action={action} className="stack">
      <div className="row"><label className="field">Office name<input name="name" required maxLength={80} placeholder="e.g. Govan" /></label>
        <div style={{ alignSelf: 'flex-end' }}><Submit pending="Adding…" primary={false}>Add office</Submit></div></div>
      <Status state={state} />
    </form>
  );
}

export function RenameOfficeForm({ id, name }: { id: string; name: string }) {
  const [state, action] = useActionState(renameOfficeAction, {});
  return (
    <form action={action} className="row">
      <input type="hidden" name="officeId" value={id} />
      <label className="field small-field"><span className="sr-only">Name for {name}</span><input name="name" defaultValue={name} required maxLength={80} /></label>
      <div style={{ alignSelf: 'flex-end' }}><Submit pending="Saving…" primary={false}>Rename</Submit></div>
      <Status state={state} />
    </form>
  );
}

export function UserOfficeForm({ userId, name, officeId, offices }: { userId: string; name: string; officeId: string | null; offices: Array<{ id: string; name: string }> }) {
  const [state, action] = useActionState(userOfficeAction, {});
  return (
    <form action={action} className="row">
      <input type="hidden" name="userId" value={userId} />
      <label className="field small-field"><span className="sr-only">Office for {name}</span>
        <select name="officeId" defaultValue={officeId ?? ''}><option value="">No office set</option>{offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      <div style={{ alignSelf: 'flex-end' }}><Submit pending="Saving…" primary={false}>Save</Submit></div>
      <Status state={state} />
    </form>
  );
}
