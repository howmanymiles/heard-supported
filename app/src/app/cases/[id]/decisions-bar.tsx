'use client';

import { useActionState, useEffect, useState } from 'react';
import { decisionsAction } from '../../actions';
import { Submit, Status } from '../../forms';

export const DECISIONS_FORM = 'decisions';

/**
 * One save for every "your view" choice on the page. The choices sit inside each
 * activity (linked to this form by their form attribute), so changing several and
 * pressing Save once sends them all.
 */
export function DecisionsBar({ caseId, benefit }: { caseId: string; benefit: string }) {
  const [state, action] = useActionState(decisionsAction, {});
  const [dirty, setDirty] = useState(0);
  useEffect(() => {
    const seen = new Set<string>();
    const on = (e: Event) => {
      const el = e.target as HTMLInputElement;
      if (el.form?.id !== DECISIONS_FORM) return;
      seen.add(el.name.replace(/^(letter|days):/, ''));
      setDirty(seen.size);
    };
    document.addEventListener('change', on);
    document.addEventListener('input', on);
    return () => { document.removeEventListener('change', on); document.removeEventListener('input', on); };
  }, [state]);
  useEffect(() => { if (state.ok) setDirty(0); }, [state]);

  return (
    <form id={DECISIONS_FORM} action={action} className={dirty ? 'save-bar on' : 'save-bar'}>
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="benefit" value={benefit} />
      <Submit pending="Saving…">Save your view</Submit>
      <span className="soft small" aria-live="polite">{dirty ? `Unsaved changes in ${dirty} activit${dirty === 1 ? 'y' : 'ies'}` : 'Choose descriptors below, then save once.'}</span>
      <Status state={state} />
    </form>
  );
}
