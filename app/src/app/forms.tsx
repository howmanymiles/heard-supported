'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createCaseAction, uploadAction, reviewAction, type ActionState } from './actions';

function Submit({ children, pending: pendingText, primary = true }: { children: React.ReactNode; pending: string; primary?: boolean }) {
  const { pending } = useFormStatus();
  return <button className={primary ? 'btn btn-primary' : 'btn'} type="submit" disabled={pending} aria-disabled={pending}>{pending ? pendingText : children}</button>;
}

function Status({ state }: { state: ActionState }) {
  if (state.error) return <p className="msg msg-error" role="alert">{state.error}</p>;
  if (state.ok) return <p className="msg msg-ok" role="status">{state.ok}</p>;
  return null;
}

export function CreateCaseForm() {
  const [state, action] = useActionState(createCaseAction, {});
  return (
    <form action={action} className="stack">
      <div className="row">
        <label className="field">Case reference
          <input name="ref" id="new-ref" required maxLength={40} placeholder="e.g. HS-2041" autoComplete="off" />
          <span className="hint">Your agency’s reference. Never the client’s name.</span>
        </label>
        <label className="field">Benefit
          <select name="benefit" id="new-benefit" defaultValue="pip">
            <option value="pip">Personal Independence Payment</option>
            <option value="uc-wca">Universal Credit (WCA)</option>
          </select>
        </label>
      </div>
      <div><Submit pending="Creating…">Create case</Submit></div>
      <Status state={state} />
    </form>
  );
}

export function UploadForm({ caseId, syntheticOnly }: { caseId: string; syntheticOnly: boolean }) {
  const [state, action] = useActionState(uploadAction, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="caseId" value={caseId} />
      <label className="field">Add documents
        <input type="file" name="file" id="upload-file" multiple accept=".pdf,.docx,.jpg,.jpeg,.png,.tif,.tiff,.txt,.md" />
        <span className="hint">PDF, Word, photos or scans, up to 20 MB each.</span>
      </label>
      {syntheticOnly && (
        <label className="check"><input type="checkbox" name="fictional" value="yes" id="upload-fictional" required /> This is a fictional test document, not a real client’s</label>
      )}
      <div><Submit pending="Uploading…" primary={false}>Upload</Submit></div>
      <Status state={state} />
    </form>
  );
}

export function ReviewForm({ caseId, label }: { caseId: string; label: string }) {
  const [state, action] = useActionState(reviewAction, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="caseId" value={caseId} />
      <div><Submit pending="Reading and reviewing… this can take a minute">{label}</Submit></div>
      <Status state={state} />
    </form>
  );
}
