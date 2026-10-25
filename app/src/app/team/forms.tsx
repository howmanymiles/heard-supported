'use client';

import { useActionState } from 'react';
import { Submit, Status } from '../forms';
import { addOfficeAction, renameOfficeAction, userOfficeAction, inviteAction, roleAction, deactivateAction, reactivateAction, revokeInviteAction, retentionAction, type InviteState } from './actions';
import type { ActionState } from '../actions';

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


export function InviteForm({ offices, canInviteAll }: { offices: Array<{ id: string; name: string }>; canInviteAll: boolean }) {
  const [state, action] = useActionState<InviteState, FormData>(inviteAction, {});
  return (
    <form action={action} className="stack">
      <div className="row">
        <label className="field">Work email<input type="email" name="email" required maxLength={200} autoComplete="off" /></label>
        <label className="field small-field">Role<select name="role" defaultValue="adviser"><option value="adviser">Adviser</option>{canInviteAll && <><option value="supervisor">Supervisor</option><option value="admin">Admin</option></>}</select></label>
        {offices.length > 0 && <label className="field small-field">Office<select name="officeId" defaultValue=""><option value="">No office set</option>{offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
        <div style={{ alignSelf: 'flex-end' }}><Submit pending="Creating…">Create invitation</Submit></div>
      </div>
      {state.error && <p className="msg msg-error" role="alert">{state.error}</p>}
      {state.link && (
        <div className="msg msg-ok stack" role="status">
          <p>Send this link to <b>{state.email}</b> yourself, by your work email. It works once, for that address only, and expires in 7 days. You won’t see it again.</p>
          <p><input readOnly value={state.link} aria-label="Invitation link" className="mono" style={{ width: '100%' }} onFocus={e => e.currentTarget.select()} /></p>
          <p><button type="button" className="btn btn-small" onClick={() => navigator.clipboard?.writeText(state.link!)}>Copy link</button></p>
        </div>
      )}
    </form>
  );
}

function Small({ act, fields, label, pending, confirm }: { act: (s: ActionState, f: FormData) => Promise<ActionState>; fields: Record<string, string>; label: string; pending: string; confirm?: string }) {
  const [state, action] = useActionState(act, {});
  return (
    <form action={action} className="inline" onSubmit={e => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Submit pending={pending} primary={false}>{label}</Submit>
      {state.error && <span className="msg msg-error small" role="alert">{state.error}</span>}
    </form>
  );
}

export function RoleForm({ userId, name, role }: { userId: string; name: string; role: string }) {
  const [state, action] = useActionState(roleAction, {});
  return (
    <form action={action} className="row">
      <input type="hidden" name="userId" value={userId} />
      <label className="field small-field"><span className="sr-only">Role for {name}</span><select name="role" defaultValue={role}><option value="adviser">Adviser</option><option value="supervisor">Supervisor</option><option value="admin">Admin</option></select></label>
      <div style={{ alignSelf: 'flex-end' }}><Submit pending="Saving…" primary={false}>Save</Submit></div>
      {state.error && <span className="msg msg-error small" role="alert">{state.error}</span>}
    </form>
  );
}

export const DeactivateButton = ({ userId, name }: { userId: string; name: string }) => <Small act={deactivateAction} fields={{ userId }} label="Remove access" pending="Removing…" confirm={`Remove ${name}’s access now?`} />;
export const ReactivateButton = ({ userId }: { userId: string }) => <Small act={reactivateAction} fields={{ userId }} label="Restore access" pending="Restoring…" />;
export const RevokeInviteButton = ({ inviteId }: { inviteId: string }) => <Small act={revokeInviteAction} fields={{ inviteId }} label="Cancel" pending="Cancelling…" />;

export function RetentionForm({ months, choices }: { months: number; choices: readonly number[] }) {
  const [state, action] = useActionState(retentionAction, {});
  return (
    <form action={action} className="row">
      <label className="field small-field">Keep a closed case’s content for
        <select name="months" defaultValue={String(months)}>{choices.map(m => <option key={m} value={m}>{m < 12 ? `${m} months` : `${m / 12} year${m === 12 ? '' : 's'}`}</option>)}</select>
      </label>
      <div style={{ alignSelf: 'flex-end' }}><Submit pending="Saving…" primary={false}>Save</Submit></div>
      <Status state={state} />
    </form>
  );
}
