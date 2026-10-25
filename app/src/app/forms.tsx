'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { uploadAction, reviewAction, assessAction, mrDatesAction, draftAction, saveDraftAction, mrNoticeAction, bundleAction, appealDatesAction, groundsAction, saveGroundsAction, aiSubmissionAction, letterAction, saveLetterAction, outcomeAction, closeAction, type ActionState } from './actions';

export function Submit({ children, pending: pendingText, primary = true }: { children: React.ReactNode; pending: string; primary?: boolean }) {
  const { pending } = useFormStatus();
  return <button className={primary ? 'btn btn-primary' : 'btn'} type="submit" disabled={pending} aria-disabled={pending}>{pending ? pendingText : children}</button>;
}

export function Status({ state }: { state: ActionState }) {
  if (state.error) return <p className="msg msg-error" role="alert">{state.error}</p>;
  if (state.ok) return <p className="msg msg-ok" role="status">{state.ok}</p>;
  return null;
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

export function LetterForm({ caseId, isPip }: { caseId: string; isPip: boolean }) {
  const [state, action] = useActionState(letterAction, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="caseId" value={caseId} />
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="small"><b>Letter</b></legend>
        <label className="check"><input type="radio" name="kind" value="raise_mr" defaultChecked /> Acting on behalf: ask for a reconsideration, reasons to follow</label>
        <label className="check"><input type="radio" name="kind" value="request_report" /> Ask for a copy of the {isPip ? 'PA4' : 'UC85 or UC85A'} only</label>
      </fieldset>
      <div className="row">
        <label className="check"><input type="checkbox" name="requestReport" value="yes" defaultChecked /> Also ask for the {isPip ? 'PA4' : 'report'}</label>
        <label className="check"><input type="checkbox" name="hold" value="yes" defaultChecked /> Ask them to wait for reasons and evidence</label>
        <label className="check"><input type="checkbox" name="authority" value="yes" /> Signed authority enclosed</label>
      </div>
      <label className="field">What your client disputes, if you want to say now <span className="hint">For example: preparing food and moving around</span>
        <input name="disputes" maxLength={300} />
      </label>
      <div><Submit pending="Drafting…" primary={false}>Draft the letter</Submit></div>
      <Status state={state} />
    </form>
  );
}

export function SaveLetterForm({ caseId, id, text }: { caseId: string; id: string; text: string }) {
  const [state, action] = useActionState(saveLetterAction, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="caseId" value={caseId} /><input type="hidden" name="id" value={id} />
      <label className="field">Letter<textarea name="text" rows={16} defaultValue={text} className="draft" key={text} /></label>
      <div><Submit pending="Saving…" primary={false}>Save</Submit></div>
      <Status state={state} />
    </form>
  );
}

type AwardV = { daily_living?: string; mobility?: string; wca?: string } | null;
const RATES = [['', 'Not recorded'], ['none', 'No award'], ['standard', 'Standard'], ['enhanced', 'Enhanced']];
const WCA_OPTS = [['', 'Not recorded'], ['none', 'No LCW'], ['lcw', 'LCW'], ['lcwra', 'LCWRA']];

function AwardFields({ prefix, label, benefit, value }: { prefix: string; label: string; benefit: string; value: AwardV }) {
  return (
    <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="small"><b>{label}</b></legend>
      {benefit === 'pip' ? (
        <div className="row">
          <label className="field small-field">Daily living<select name={`${prefix}_dl`} defaultValue={value?.daily_living ?? ''}>{RATES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
          <label className="field small-field">Mobility<select name={`${prefix}_mob`} defaultValue={value?.mobility ?? ''}>{RATES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
        </div>
      ) : (
        <label className="field small-field">Outcome<select name={`${prefix}_wca`} defaultValue={value?.wca ?? ''}>{WCA_OPTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
      )}
    </fieldset>
  );
}

export function OutcomeForm({ caseId, benefit, c, beforeDefault }: { caseId: string; benefit: string; c: Record<string, any>; beforeDefault: AwardV }) {
  const [state, action] = useActionState(outcomeAction, {});
  const d = (x: unknown) => (typeof x === 'string' ? x.slice(0, 10) : '');
  return (
    <form action={action} className="stack">
      <input type="hidden" name="caseId" value={caseId} />
      <div className="row">
        <label className="field">Reconsideration result
          <select name="mrOutcome" defaultValue={c.mr_outcome ?? ''}><option value="">Not yet / not asked for</option><option value="revised">Revised in full</option><option value="revised_in_part">Revised in part</option><option value="unchanged">Not changed</option></select>
        </label>
        <label className="field">Date of the MR notice<input type="date" name="mrOutcomeDate" defaultValue={d(c.mr_outcome_date) || d(c.mr_notice_date)} /></label>
      </div>
      <div className="row">
        <label className="field">Appeal result
          <select name="appealOutcome" defaultValue={c.appeal_outcome ?? ''}><option value="">Not yet / no appeal</option><option value="allowed">Allowed</option><option value="allowed_in_part">Allowed in part</option><option value="dismissed">Dismissed</option><option value="lapsed_revised">Lapsed: DWP revised before the hearing</option><option value="withdrawn">Withdrawn</option><option value="struck_out">Struck out</option></select>
        </label>
        <label className="field">Date of the result<input type="date" name="appealOutcomeDate" defaultValue={d(c.appeal_outcome_date)} /></label>
      </div>
      <div className="row">
        <AwardFields prefix="before" label="Award before (the decision challenged)" benefit={benefit} value={c.award_before ?? beforeDefault} />
        <AwardFields prefix="after" label="Award after" benefit={benefit} value={c.award_after} />
      </div>
      {benefit === 'uc-wca' && (
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small"><b>For the money value</b></legend>
          <div className="row">
            <label className="field">Which LCWRA amount applies
              <select name="ucLcwraRate" defaultValue={c.uc_lcwra_rate ?? ''}>
                <option value="">Not known</option>
                <option value="standard">Standard amount (most claims made from 6 April 2026)</option>
                <option value="protected">Higher amount (claim before April 2026, severe conditions criteria, or terminally ill)</option>
              </select>
            </label>
            <label className="field small-field" style={{ alignSelf: 'flex-end' }}><span><input type="checkbox" name="lcwLegacy" value="yes" defaultChecked={!!c.lcw_legacy} /> Legacy LCW element in payment</span></label>
          </div>
          <p className="soft small">Only claims with the LCW element from before April 2017 get money for LCW alone.</p>
        </fieldset>
      )}
      <div><Submit pending="Saving…" primary={false}>Save outcome</Submit></div>
      <Status state={state} />
    </form>
  );
}

export function CloseForm({ caseId }: { caseId: string }) {
  const [state, action] = useActionState(closeAction, {});
  return (
    <form action={action} className="stack">
      <input type="hidden" name="caseId" value={caseId} />
      <div className="row">
        <label className="field small-field">Reason
          <select name="reason" defaultValue="outcome"><option value="outcome">Outcome reached</option><option value="client_withdrew">Client withdrew</option><option value="no_contact">Lost contact</option><option value="referred">Referred elsewhere</option><option value="other">Other</option></select>
        </label>
        <label className="field">Note (optional)<input name="note" maxLength={500} /></label>
      </div>
      <div><Submit pending="Closing…" primary={false}>Close the case</Submit></div>
      <Status state={state} />
    </form>
  );
}
