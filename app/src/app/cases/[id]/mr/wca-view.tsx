import Link from 'next/link';
import { descriptorsFor } from '@/lib/score';
import { OUTCOME_LABEL, shortName, type WcaComparison, type WcaRow } from '@/lib/mr-wca';
import type { ChoiceRow } from '@/lib/mr';
import type { DocRow } from '@/lib/cases';
import { choiceAction, confirmAllAction } from '../../../actions';
import { data } from '@/lib/score';

const SOURCE: Record<string, string> = { report: 'from the report', adviser: 'set by you' };
const wca = data.benefits.find(b => b.id === 'uc-wca')!;
const sch7Options = (wca.lcwra_activities ?? []).flatMap(a => a.descriptors.map(d => ({ id: d.number!, label: `${d.number} ${a.name.split(' ').slice(0, 5).join(' ')}` })));

type Result = { comparison: WcaComparison | null; missing: string[]; unconfirmed: string[] };

export function WcaComparisonView({ id, docs, choices, result }: { id: string; docs: DocRow[]; choices: ChoiceRow[]; result: Result }) {
  const { comparison: cmp, missing, unconfirmed } = result;
  const choice = (k: string) => choices.find(c => c.activity === k);
  const docName = (docId: string) => docs.find(d => d.id === docId)?.name ?? 'document';
  const link = (q: { docId: string; page: number; quote: string }) => `/cases/${id}/documents/${q.docId}?page=${q.page}&q=${encodeURIComponent(q.quote)}#p${q.page}`;
  const row = (k: string) => cmp?.rows.find(r => r.key === k);

  const status = (r?: WcaRow) => !r ? <span className="soft small">—</span>
    : r.status === 'challenge' ? <span className="chip chip-challenge">Challenge{r.gain > 0 ? ` +${r.gain}` : ''}</span>
      : r.status === 'agree' ? <span className="chip chip-agree">Agree</span>
        : r.status === 'adviser_lower' ? <span className="chip chip-lower">Yours is lower</span>
          : <span className="soft small">Yours not decided</span>;

  const picker = (k: string, label: string, options: Array<{ id: string; label: string }>) => {
    const ch = choice(k);
    const q = ch?.report_quote;
    return (
      <>
        <form action={choiceAction} className="pick">
          <input type="hidden" name="caseId" value={id} /><input type="hidden" name="activity" value={k} />
          <select name="letter" defaultValue={ch?.letter ?? ''} aria-label={`DWP finding for ${label}`}>
            {!ch?.letter && <option value="">Choose…</option>}
            {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <button className="btn btn-small">{ch?.confirmed ? 'Update' : 'Confirm'}</button>
          {ch?.confirmed ? <span className="chip chip-confirmed">Confirmed</span> : ch?.letter ? <span className="chip chip-plain">To check</span> : null}
        </form>
        {ch?.source && <p className="soft small">{SOURCE[ch.source] ?? ch.source}{q ? <> · <Link href={link(q)}>{docName(q.docId)}, p{q.page}</Link></> : null}</p>}
      </>
    );
  };
  const reason = (k: string) => { const j = choice(k)?.justification; return j ? <blockquote>“{j.quote}” <Link href={link(j)} className="small">p{j.page}</Link></blockquote> : <span className="soft small">Not found</span>; };

  return (
    <section className="stack" aria-label="Comparison">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 className="h2">DWP position and yours</h2>
        {unconfirmed.length > 0 && <form action={confirmAllAction}><input type="hidden" name="caseId" value={id} /><button className="btn">Confirm all {unconfirmed.length} found</button></form>}
      </div>
      {cmp?.mode === 'outcome_only' && (
        <div className="panel stack">
          <p className="totals"><span><span className="eyebrow">Decision notice</span><b>{OUTCOME_LABEL[cmp.dwpOutcome]}</b></span>
            <span><span className="eyebrow">Yours</span><b className="big">{cmp.adviser.lcw.totalPoints}</b> points ({cmp.adviser.lcw.physicalPoints} physical, {cmp.adviser.lcw.mentalPoints} mental) · {OUTCOME_LABEL[cmp.adviserOutcome]}</span></p>
          {cmp.warnings.map(w => <p key={w.code} className="msg msg-error" role="note">{w.message}</p>)}
          {cmp.rows.length ? <ul className="plain stack">{cmp.rows.map(r => <li key={r.key + r.adviser}><b>{r.label}</b> · <span className="mono">{r.key.startsWith('sch6:') ? `${r.key.split(':')[1]}(${r.adviser}) · ${r.adviserPoints} pts` : r.adviser}</span> · <span className="soft small">{r.evidence.length} accepted evidence</span></li>)}</ul>
            : <p className="soft">No descriptors chosen yet on the evidence tab.</p>}
        </div>
      )}
      {cmp?.mode === 'full' && cmp.dwp && (
        <div className="panel totals">
          <div><span className="eyebrow">Report</span><p><b className="big">{cmp.dwp.lcw.totalPoints}</b> points ({cmp.dwp.lcw.physicalPoints} physical, {cmp.dwp.lcw.mentalPoints} mental) · {OUTCOME_LABEL[cmp.dwpOutcome]}</p></div>
          <div><span className="eyebrow">Yours</span><p><b className="big">{cmp.adviser.lcw.totalPoints}</b> points ({cmp.adviser.lcw.physicalPoints} physical, {cmp.adviser.lcw.mentalPoints} mental) · {OUTCOME_LABEL[cmp.adviserOutcome]}</p></div>
          <p className="soft small full">Your position comes from the descriptors and substantial-risk findings you chose on the evidence tab. Threshold 15 points (reg 39(3)); highest descriptor per activity counts (reg 39(5)).</p>
        </div>
      )}
      {cmp?.mode === 'full' && cmp.warnings.map(w => <p key={w.code} className="msg msg-error" role="note">{w.message}</p>)}
      {missing.length > 0 && <p className="msg msg-error" role="note">No DWP finding yet for {missing.join(', ')}. Choose it from the report.</p>}

      {cmp?.mode !== 'outcome_only' && <div className="table-wrap panel">
        <table className="list cmp">
          <thead><tr><th>Item</th><th>DWP finding (report)</th><th>Report’s reasoning</th><th>Yours</th><th>Difference</th></tr></thead>
          <tbody>
            {wca.activities.map(a => {
              const k = `sch6:${a.number}`; const r = row(k);
              return (
                <tr key={k}>
                  <td data-label="Item"><b>{a.number}. {shortName(a.number, a.name)}</b><p className="soft small">{(a as { part?: string }).part === 'mental' ? 'Mental' : 'Physical'}</p></td>
                  <td data-label="DWP finding">{picker(k, `activity ${a.number}`, descriptorsFor(k).map(o => ({ id: o.id, label: `${a.number}(${o.id}) · ${o.points} pts` })))}</td>
                  <td data-label="Report’s reasoning">{reason(k)}</td>
                  <td data-label="Yours">{r?.adviser ? <span className="mono">{a.number}({r.adviser}) · {r.adviserPoints} pts</span> : <Link href={`/cases/${id}#${k.replace(':', '-')}`} className="small">Not decided</Link>}
                    {r && r.evidence.length > 0 && <p className="soft small">{r.evidence.length} accepted evidence</p>}</td>
                  <td data-label="Difference">{status(r)}</td>
                </tr>
              );
            })}
            <tr>
              <td data-label="Item"><b>Schedule 7 (LCWRA)</b></td>
              <td data-label="DWP finding">{picker('sch7', 'Schedule 7', [{ id: 'none', label: 'None apply' }, ...sch7Options])}</td>
              <td data-label="Report’s reasoning">{reason('sch7')}</td>
              <td data-label="Yours"><span className="mono">{row('sch7')?.adviser ?? '—'}</span></td>
              <td data-label="Difference">{status(row('sch7'))}</td>
            </tr>
            {(['sch9:4', 'sch8:4'] as const).map(k => (
              <tr key={k}>
                <td data-label="Item"><b>{k === 'sch8:4' ? 'Schedule 8 para 4' : 'Schedule 9 para 4'}</b><p className="soft small">Substantial risk, {k === 'sch8:4' ? 'LCW (reg 39(7))' : 'LCWRA (reg 40(6))'}</p></td>
                <td data-label="DWP finding">{picker(k, k, [{ id: 'not_applies', label: 'Does not apply' }, { id: 'applies', label: 'Applies' }])}</td>
                <td data-label="Report’s reasoning">{reason(k)}</td>
                <td data-label="Yours">{row(k)?.adviserText ?? <Link href={`/cases/${id}#risk`} className="small">Not decided</Link>}</td>
                <td data-label="Difference">{status(row(k))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
    </section>
  );
}
