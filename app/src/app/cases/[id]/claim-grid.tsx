'use client';

import { useActionState, useState } from 'react';
import { claimedAction } from '../../actions';
import { Submit, Status } from '../../forms';

export type ClaimActivity = { key: string; label: string; group: string; options: Array<{ id: string; text: string; points: number }> };

/**
 * What the claimant is claiming, read off their form. Pick a descriptor for each activity,
 * then save once: nothing is sent until Save.
 */
export function ClaimGrid({ caseId, benefit, activities, initial, formName }: { caseId: string; benefit: string; activities: ClaimActivity[]; initial: Record<string, string>; formName: string }) {
  const [state, action] = useActionState(claimedAction, {});
  const [picks, setPicks] = useState<Record<string, string>>(initial);
  const norm = (m: Record<string, string>) => JSON.stringify(Object.entries(m).filter(([, v]) => v).sort());
  const dirty = norm(picks) !== norm(initial);
  const groups = [...new Set(activities.map(a => a.group))];
  const pts = (g: string) => activities.filter(a => a.group === g).reduce((s, a) => s + (a.options.find(o => o.id === picks[a.key])?.points ?? 0), 0);
  const isWca = benefit === 'uc-wca';
  const lcw = isWca ? groups.reduce((s, g) => s + pts(g), 0) : 0;
  const rate = (p: number) => (p >= 12 ? 'enhanced rate' : p >= 8 ? 'standard rate' : 'no award');

  return (
    <form action={action} className="stack claim-grid">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="benefit" value={benefit} />
      <p className="soft small">Go through the {formName} with the claimant and pick, for each activity, the descriptor their answers describe. Nothing is saved until you press Save.</p>
      {groups.map(g => (
        <fieldset key={g} className="stack">
          <legend className="eyebrow">{g}{!isWca && <> · claimed {pts(g)} points, {rate(pts(g))}</>}</legend>
          {activities.filter(a => a.group === g).map(a => {
            const chosen = a.options.find(o => o.id === picks[a.key]);
            return (
              <div key={a.key} className="claim-row">
                <div className="claim-name">{a.label}</div>
                <div className="seg" role="radiogroup" aria-label={a.label}>
                  {a.options.map(o => {
                    const on = picks[a.key] === o.id;
                    return (
                      <button key={o.id} type="button" role="radio" aria-checked={on} className={on ? 'seg-btn on' : 'seg-btn'} title={o.text}
                        onClick={() => setPicks(p => ({ ...p, [a.key]: on ? '' : o.id }))}>
                        {on && <span aria-hidden="true">✓ </span>}<b>{o.id}</b> <span className="seg-pts">{o.points}</span>
                      </button>
                    );
                  })}
                </div>
                <input type="hidden" name={`claim:${a.key}`} value={picks[a.key] ?? ''} />
                <div className="claim-text soft small">{chosen ? <><b>{chosen.id}</b> {chosen.text}</> : 'Not claimed, or not answered on the form.'}</div>
              </div>
            );
          })}
        </fieldset>
      ))}
      {isWca && <p className="small"><b>Claimed: {lcw} points</b> · {lcw >= 15 ? 'meets the 15 points for limited capability for work' : 'below the 15 points for limited capability for work'}</p>}
      <div className="row" style={{ alignItems: 'center' }}>
        <Submit pending="Saving…">Save the claim</Submit>
        {dirty && <span className="soft small">Unsaved changes</span>}
      </div>
      <Status state={state} />
    </form>
  );
}
