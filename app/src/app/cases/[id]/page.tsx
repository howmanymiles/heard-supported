import Link from 'next/link';
import { notFound } from 'next/navigation';
import { activityList, LOW_CONFIDENCE } from '@hs/core';
import { requireMe } from '@/lib/auth';
import { getCase, type EvidenceRow } from '@/lib/cases';
import { score, descriptorsFor } from '@/lib/score';
import { UploadForm, ReviewForm } from '../../forms';
import { evidenceAction, gapAction, decisionAction } from '../../actions';
import { CaseTabs } from './tabs';

export const dynamic = 'force-dynamic';

const RATE: Record<string, string> = { none: 'no award', standard: 'standard rate', enhanced: 'enhanced rate' };

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMe();
  const data = await getCase(me, id);
  if (!data) notFound();
  const { case: cs, evidence, gaps, decisions, lastRun, log } = data;
  const docs = data.docs.filter(d => d.kind === 'evidence' || d.kind === 'other'); // decision papers live on the MR tab
  const acts = activityList(cs.benefit);
  const s = score(cs.benefit, decisions);
  const unread = docs.filter(d => d.read_status !== 'read').length;
  const byAct = (key: string) => evidence.filter(e => e.activities.includes(key));
  const decisionFor = (key: string) => decisions.find(d => d.activity === key);
  const syntheticOnly = process.env.DATA_MODE === 'synthetic-only';

  const evidenceItem = (e: EvidenceRow) => (
    <li key={e.id} className={`ev ev-${e.status}`}>
      <p className="quote">“{e.quote}”</p>
      <p className="src"><Link href={`/cases/${id}/documents/${e.document_id}?page=${e.page_no}&q=${encodeURIComponent(e.quote)}#p${e.page_no}`}>{e.doc_name}, page {e.page_no}</Link>{e.note ? <> · <span className="soft">{e.note}</span></> : null}</p>
      <div className="actions">
        {e.status !== 'accepted' && <form action={evidenceAction}><input type="hidden" name="caseId" value={id} /><input type="hidden" name="evidenceId" value={e.id} /><input type="hidden" name="status" value="accepted" /><button className="btn btn-small">Accept</button></form>}
        {e.status !== 'rejected' && <form action={evidenceAction}><input type="hidden" name="caseId" value={id} /><input type="hidden" name="evidenceId" value={e.id} /><input type="hidden" name="status" value="rejected" /><button className="btn btn-small">Reject</button></form>}
        {e.status !== 'suggested' && <span className={`chip chip-${e.status}`}>{e.status === 'accepted' ? 'Accepted' : 'Rejected'}</span>}
      </div>
    </li>
  );

  return (
    <div className="stack-lg">
      <p className="crumbs"><Link href="/">← Cases</Link></p>
      <div className="head">
        <h1><span className="mono">{cs.ref}</span></h1>
        <p className="soft">{cs.benefit === 'pip' ? 'Personal Independence Payment' : 'Universal Credit · Work Capability Assessment'} · Descriptor data {cs.dataset_version}</p>
      </div>
      <CaseTabs id={id} benefit={cs.benefit} current="evidence" />

      <section className="panel totals" aria-label="Totals from your decisions">
        {s.kind === 'pip' ? (<>
          <div><span className="eyebrow">Daily living</span><p><b className="big">{s.result.dailyLiving.points}</b> points · {RATE[s.result.dailyLiving.rate]}</p></div>
          <div><span className="eyebrow">Mobility</span><p><b className="big">{s.result.mobility.points}</b> points · {RATE[s.result.mobility.rate]}</p></div>
        </>) : (<>
          <div><span className="eyebrow">Limited capability for work</span><p><b className="big">{s.result.lcw.totalPoints}</b> points ({s.result.lcw.physicalPoints} physical, {s.result.lcw.mentalPoints} mental) · {s.result.lcw.byAssessment ? 'meets 15' : 'below 15'}</p></div>
          <div><span className="eyebrow">LCWRA</span><p>{s.result.lcwra.descriptors.length ? `Schedule 7: ${s.result.lcwra.descriptors.map(d => d.id).join(', ')}` : 'No Schedule 7 descriptor chosen'}</p></div>
        </>)}
        <p className="soft small full">Worked from the descriptors you choose below. Your assessment, not a prediction of the decision.</p>
      </section>

      <div className="grid-2">
        <section className="panel stack">
          <h2 className="eyebrow">Documents</h2>
          {docs.length ? <ul className="plain">{docs.map(d => (
            <li key={d.id} className="doc">
              {d.read_status === 'read' ? <Link href={`/cases/${id}/documents/${d.id}`}>{d.name}</Link> : <span>{d.name}</span>}
              <span className="soft small"> · {d.read_status === 'read' ? `${d.page_count} pages` : d.read_status === 'failed' ? 'reading failed' : 'not read yet'}
                {d.low_confidence_lines ? <> · <span className="warn">{d.low_confidence_lines} lines to check by eye</span></> : null}</span>
            </li>))}</ul> : <p className="soft">No documents yet.</p>}
          <UploadForm caseId={id} syntheticOnly={syntheticOnly} />
          {docs.length > 0 && <ReviewForm caseId={id} label={unread ? `Read ${unread} new document${unread > 1 ? 's' : ''} and review` : 'Review evidence again'} />}
          {lastRun && <p className="soft small">Last review: {lastRun.verified} cited suggestions; {lastRun.rejected} dropped because their quotes could not be found on the page; {lastRun.identifiers_removed} identifiers removed before the AI saw the text. Model: {lastRun.model}.</p>}
          <p className="soft small">Lines read with confidence below {Math.round(LOW_CONFIDENCE * 100)}% are flagged for you to check against the original.</p>
        </section>
        <section className="panel stack">
          <h2 className="eyebrow">Activity log</h2>
          <ul className="log">{log.map((l, i) => <li key={i}><span className="mono soft">{new Date(l.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span> <b>{l.name ?? 'System'}</b> · {l.action}</li>)}</ul>
        </section>
      </div>

      <section className="stack">
        <h2 className="h2">Activities</h2>
        {acts.map(a => {
          const ev = byAct(a.key); const g = gaps.filter(x => x.activity === a.key && x.status === 'open'); const dec = decisionFor(a.key);
          const chosen = Array.isArray(dec?.satisfied) && dec!.satisfied.length ? (typeof dec!.satisfied[0] === 'string' ? dec!.satisfied[0] as string : (dec!.satisfied[0] as { letter: string }).letter) : '';
          const options = descriptorsFor(a.key);
          return (
            <details key={a.key} id={a.key.replace(':', '-')} className="panel act" open={ev.length > 0 || g.length > 0}>
              <summary><span className="act-title">{a.label}</span><span className="soft small">{ev.filter(e => e.status === 'suggested').length} to check · {ev.filter(e => e.status === 'accepted').length} accepted{g.length ? ` · ${g.length} gaps` : ''}{chosen ? ` · descriptor ${chosen}` : ''}</span></summary>
              <div className="act-body">
                <div className="stack">
                  {ev.length ? <ol className="plain stack">{ev.map(evidenceItem)}</ol> : <p className="soft">No evidence found for this activity.</p>}
                  {g.length > 0 && <div className="stack"><h3 className="eyebrow">Gaps</h3><ul className="plain stack">{g.map(x => (
                    <li key={x.id} className="gap"><span>{x.gap}</span>
                      <form action={gapAction} className="inline"><input type="hidden" name="caseId" value={id} /><input type="hidden" name="gapId" value={x.id} /><input type="hidden" name="status" value="closed" /><button className="btn btn-small">Closed</button></form>
                      <form action={gapAction} className="inline"><input type="hidden" name="caseId" value={id} /><input type="hidden" name="gapId" value={x.id} /><input type="hidden" name="status" value="dismissed" /><button className="btn btn-small btn-quiet">Not relevant</button></form>
                    </li>))}</ul></div>}
                </div>
                <form action={decisionAction} className="stack decision">
                  <input type="hidden" name="caseId" value={id} /><input type="hidden" name="benefit" value={cs.benefit} /><input type="hidden" name="activity" value={a.key} />
                  <fieldset><legend className="eyebrow">Your decision</legend>
                    <label className="opt"><input type="radio" name="letter" value="" defaultChecked={!chosen} /> <span>Not decided</span></label>
                    {options.map(o => (
                      <label key={o.id} className="opt"><input type="radio" name="letter" value={o.id} defaultChecked={chosen === o.id} />
                        <span><b className="mono">{o.id}</b> {o.text}</span>{a.key.startsWith('sch7:') ? null : <span className="mono pts">{o.points}</span>}</label>
                    ))}
                  </fieldset>
                  {a.key.startsWith('pip:') && <label className="field small-field">Days a week this applies
                    <input type="number" name="days" min={0} max={7} step={0.5} defaultValue={dec?.days_per_week ?? ''} />
                    <span className="hint">Over 3.5 days a week means over half the days (reg 7).</span></label>}
                  <div><button className="btn" type="submit">Save decision</button></div>
                </form>
              </div>
            </details>
          );
        })}
      </section>

      {cs.benefit === 'uc-wca' && (
        <section className="panel stack" id="risk" aria-label="Substantial risk">
          <h2 className="h2">Substantial risk</h2>
          <p className="soft small">Schedule 8 paragraph 4 treats the claimant as having LCW where LCW is not reached on points (reg 39(7)); Schedule 9 paragraph 4 treats them as having LCWRA where no Schedule 7 descriptor applies (reg 40(6)).</p>
          <div className="grid-2">
            {(['sch8:4', 'sch9:4'] as const).map(k => {
              const cur = (decisions.find(d => d.activity === k)?.satisfied as string[] | undefined)?.[0] ?? '';
              const ev = byAct(k); const g = gaps.filter(x => x.activity === k && x.status === 'open');
              return (
                <div key={k} className="stack">
                {ev.length ? <ol className="plain stack">{ev.map(evidenceItem)}</ol> : <p className="soft small">No evidence linked yet.</p>}
                {g.map(x => <p key={x.id} className="gap"><span>{x.gap}</span></p>)}
                <form action={decisionAction} className="stack decision">
                  <input type="hidden" name="caseId" value={id} /><input type="hidden" name="benefit" value={cs.benefit} /><input type="hidden" name="activity" value={k} />
                  <fieldset><legend className="eyebrow">{k === 'sch8:4' ? 'Schedule 8 paragraph 4 (LCW)' : 'Schedule 9 paragraph 4 (LCWRA)'}</legend>
                    <label className="opt"><input type="radio" name="letter" value="" defaultChecked={!cur} /> <span>Not decided</span></label>
                    <label className="opt"><input type="radio" name="letter" value="applies" defaultChecked={cur === 'applies'} /> <span>Applies</span></label>
                    <label className="opt"><input type="radio" name="letter" value="not_applies" defaultChecked={cur === 'not_applies'} /> <span>Does not apply</span></label>
                  </fieldset>
                  <div><button className="btn" type="submit">Save</button></div>
                </form>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
