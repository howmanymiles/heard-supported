'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createCaseAction, uploadAction, reviewAction, assessAction, mrDatesAction, draftAction, saveDraftAction, mrNoticeAction, bundleAction, appealDatesAction, groundsAction, saveGroundsAction, aiSubmissionAction, type ActionState } from './actions';

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

const KIND_LABEL: Record<string, string> = { evidence: 'Evidence (medical, form, letters)', notes: 'Your agency’s interview notes', pa4: 'PA4 assessment report', uc85: 'UC85 assessment report', uc85a: 'UC85A paper-based assessment', decision: 'Decision letter or notice', mr_notice: 'Mandatory reconsideration notice', dwp_bundle: 'DWP response bundle', other: 'Other' };

export function UploadForm({ caseId, syntheticOnly, kinds = ['evidence'], label = 'Add documents' }: { caseId: string; syntheticOnly: boolean; kinds?: string[]; label?: string }) {
  const [state, action] = useActionState(uploadAction, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="caseId" value={caseId} />
      {kinds.length > 1
        ? <label className="field">What is it?
            <select name="kind" defaultValue={kinds[0]}>{kinds.map(k => <option key={k} value={k}>{KIND_LABEL[k] ?? k}</option>)}</select>
          </label>
        : <input type="hidden" name="kind" value={kinds[0]} />}
      <label className="field">{label}
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

export function AssessForm({ caseId, label }: { caseId: string; label: string }) {
  const [state, action] = useActionState(assessAction, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="caseId" value={caseId} />
      <div><Submit pending="Reading the decision papers… this can take a minute">{label}</Submit></div>
      <Status state={state} />
    </form>
  );
}

export function MrDatesForm({ caseId, decisionDate, requestDate, lateReason, outcome }: { caseId: string; decisionDate: string | null; requestDate: string | null; lateReason: string | null; outcome?: string | null }) {
  const [state, action] = useActionState(mrDatesAction, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="caseId" value={caseId} />
      <div className="row">
        <label className="field">Date of the decision
          <input type="date" name="decisionDate" defaultValue={decisionDate ?? ''} />
        </label>
        <label className="field">Date the request is sent
          <input type="date" name="requestDate" defaultValue={requestDate ?? ''} />
          <span className="hint">Leave blank until it is sent; today is used meanwhile.</span>
        </label>
      </div>
      {outcome !== undefined && (
        <label className="field small-field">Award in the decision notice
          <select name="outcome" defaultValue={outcome ?? ''}>
            <option value="">Not recorded</option>
            <option value="none">No limited capability for work</option>
            <option value="lcw">LCW, not LCWRA</option>
            <option value="lcwra">LCWRA</option>
          </select>
        </label>
      )}
      <label className="field">Reason the request is late, if it is
        <textarea name="lateReason" rows={3} defaultValue={lateReason ?? ''} />
        <span className="hint">The DWP can accept a late request up to 13 months after the decision if the claimant explains why it is late.</span>
      </label>
      <div><Submit pending="Saving…" primary={false}>Save dates</Submit></div>
      <Status state={state} />
    </form>
  );
}

export function DraftForm({ caseId, hasDraft }: { caseId: string; hasDraft: boolean }) {
  const [state, action] = useActionState(draftAction, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="caseId" value={caseId} />
      <div><Submit pending="Drafting…" primary={!hasDraft}>{hasDraft ? 'Draft again from the comparison' : 'Draft the request'}</Submit></div>
      {hasDraft && <p className="hint">Drafting again replaces your edits below.</p>}
      <Status state={state} />
    </form>
  );
}

export function SaveDraftForm({ caseId, draft }: { caseId: string; draft: string }) {
  const [state, action] = useActionState(saveDraftAction, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="caseId" value={caseId} />
      <label className="field">Request
        <textarea name="draft" rows={24} defaultValue={draft} className="draft" key={draft} />
      </label>
      <div><Submit pending="Saving…">Save draft</Submit></div>
      <Status state={state} />
    </form>
  );
}

export function ActionButton({ caseId, label, pending, which }: { caseId: string; label: string; pending: string; which: 'mrNotice' | 'bundle' | 'grounds' }) {
  const fn = which === 'mrNotice' ? mrNoticeAction : which === 'bundle' ? bundleAction : groundsAction;
  const [state, action] = useActionState(fn, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="caseId" value={caseId} />
      <div><Submit pending={pending}>{label}</Submit></div>
      <Status state={state} />
    </form>
  );
}

export function AppealDatesForm({ caseId, mrNoticeDate, sentDate, lateReason }: { caseId: string; mrNoticeDate: string | null; sentDate: string | null; lateReason: string | null }) {
  const [state, action] = useActionState(appealDatesAction, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="caseId" value={caseId} />
      <div className="row">
        <label className="field">Date of the MR notice
          <input type="date" name="mrNoticeDate" defaultValue={mrNoticeDate ?? ''} />
        </label>
        <label className="field">Date the appeal is sent
          <input type="date" name="sentDate" defaultValue={sentDate ?? ''} />
          <span className="hint">Leave blank until it is sent; today is used meanwhile.</span>
        </label>
      </div>
      <label className="field">Reason the appeal is late, if it is
        <textarea name="lateReason" rows={3} defaultValue={lateReason ?? ''} />
        <span className="hint">A late appeal within 12 months of the time limit is treated as in time unless the DWP objects or the tribunal directs otherwise (rule 22(8)).</span>
      </label>
      <div><Submit pending="Saving…" primary={false}>Save dates</Submit></div>
      <Status state={state} />
    </form>
  );
}

export function SaveGroundsForm({ caseId, draft }: { caseId: string; draft: string }) {
  const [state, action] = useActionState(saveGroundsAction, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="caseId" value={caseId} />
      <label className="field">Grounds
        <textarea name="draft" rows={24} defaultValue={draft} className="draft" key={draft} />
      </label>
      <div><Submit pending="Saving…">Save draft</Submit></div>
      <Status state={state} />
    </form>
  );
}

export function AiSubmissionForm({ caseId, stage }: { caseId: string; stage: 'mr' | 'appeal' }) {
  const [state, action] = useActionState(aiSubmissionAction, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="caseId" value={caseId} /><input type="hidden" name="stage" value={stage} />
      <div><Submit pending="Writing… this can take a minute">Write the letter with AI</Submit></div>
      <Status state={state} />
    </form>
  );
}
