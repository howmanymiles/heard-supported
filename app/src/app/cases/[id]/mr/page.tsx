import Link from 'next/link';
import { notFound } from 'next/navigation';
import { activityList } from '@hs/core';
import { requireMe } from '@/lib/auth';
import { getMr, buildComparison, type ChoiceRow } from '@/lib/mr';
import { descriptorsFor } from '@/lib/score';
import { UploadForm, AssessForm, MrDatesForm, DraftForm, SaveDraftForm } from '../../../forms';
import { choiceAction, confirmAllAction, loadSyntheticMrAction } from '../../../actions';
import { CaseTabs } from '../tabs';

export const dynamic = 'force-dynamic';

const RATE: Record<string, string> = { none: 'no award', standard: 'standard rate', enhanced: 'enhanced rate' };
const SOURCE: Record<string, string> = { decision_letter: 'from the decision letter', pa4: 'from the PA4', adviser: 'set by you' };
const long = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export default async function MrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMe();
  const mr = await getMr(me, id);
  if (!mr) notFound();
  const { case: cs, docs, choices, decisions, evidence, timing, run } = mr;
  const syntheticOnly = process.env.DATA_MODE === 'synthetic-only';

  if (cs.benefit !== 'pip') {
    return (
      <div className="stack-lg">
        <p className="crumbs"><Link href="/">← Cases</Link></p>
        <div className="head"><h1><span className="mono">{cs.ref}</span></h1></div>
        <CaseTabs id={id} benefit={cs.benefit} current="mr" />
        <p className="panel">Reconsideration support for Work Capability Assessment cases is coming next.</p>
      </div>
    );
  }

  const papers = docs.filter(d => d.kind === 'pa4' || d.kind === 'decision');
  const unreadPapers = papers.filter(d => d.read_status !== 'read').length;
  const synthId = /^TEST-(PIP-\d\d)-/.exec(cs.ref)?.[1];
  const { comparison: cmp, missing, unconfirmed } = buildComparison(choices, decisions, evidence);
  const acts = activityList('pip');
  const choiceFor = (key: string) => choices.find(c => c.activity === key) as ChoiceRow | undefined;
  const docName = (docId: string) => docs.find(d => d.id === docId)?.name ?? 'document';
  const quoteLink = (q: { docId: string; page: number; quote: string }) => `/cases/${id}/documents/${q.docId}?page=${q.page}&q=${encodeURIComponent(q.quote)}#p${q.page}`;

  return (
    <div className="stack-lg">
      <p className="crumbs"><Link href="/">← Cases</Link></p>
      <div className="head">
        <h1><span className="mono">{cs.ref}</span></h1>
        <p className="soft">Personal Independence Payment · Mandatory reconsideration</p>
      </div>
      <CaseTabs id={id} benefit={cs.benefit} current="mr" />

      <section className={`panel stack deadline ${timing?.status === 'late' ? 'late' : timing?.status === 'out_of_time' ? 'out' : ''}`} aria-label="Time limit">
        <h2 className="eyebrow">Time limit</h2>
        {timing ? (
          timing.status === 'in_time'
            ? <p><b>Due by {long(timing.deadline)}</b> · {timing.daysLeft === 0 ? 'today is the last day' : `${timing.daysLeft} days left`}. One month from the decision dated {long(timing.decisionDate)}.</p>
            : timing.status === 'late'
              ? <p><b>Late.</b> The one-month limit ended on {long(timing.deadline)}. A late request can still be accepted until {long(timing.lateLimit)} if it explains why it is late{cs.late_reason ? '; your reason is recorded below.' : '. Add the reason below.'}</p>
              : <p><b>Outside the 13-month limit</b>, which ended on {long(timing.lateLimit)}. A reconsideration cannot normally be accepted now; consider a new claim or other routes.</p>
        ) : <p className="soft">Add the date of the decision letter, or read the decision papers, to see the time limit.</p>}
        <p className="soft small">Check the date the client actually received the letter; a delay in receiving it can be part of the reason for a late request.</p>
        <MrDatesForm caseId={id} decisionDate={mr.decisionDate} requestDate={mr.requestDate} lateReason={cs.late_reason} />
      </section>

      <section className="panel stack" aria-label="Decision papers">
        <h2 className="eyebrow">Decision papers</h2>
        {papers.length ? <ul className="plain">{papers.map(d => (
          <li key={d.id} className="doc">
            {d.read_status === 'read' ? <Link href={`/cases/${id}/documents/${d.id}`}>{d.name}</Link> : <span>{d.name}</span>}
            <span className="soft small"> · {d.kind === 'pa4' ? 'PA4' : 'decision letter'} · {d.read_status === 'read' ? `${d.page_count} pages` : d.read_status === 'failed' ? 'reading failed' : 'not read yet'}</span>
          </li>))}</ul> : <p className="soft">Upload the decision letter and the PA4 assessment report. They are read for the DWP’s position, not as evidence.</p>}
        {synthId && !papers.length && (
          <form action={loadSyntheticMrAction}><input type="hidden" name="caseId" value={id} /><input type="hidden" name="syntheticId" value={synthId} />
            <button className="btn">Load the fictional PA4 and decision letter for {synthId}</button></form>
        )}
        <UploadForm caseId={id} syntheticOnly={syntheticOnly} kinds={['decision', 'pa4']} label="Add a decision paper" />
        {papers.length > 0 && <AssessForm caseId={id} label={unreadPapers ? 'Read the decision papers' : 'Read the decision papers again'} />}
        {run && <p className="soft small">Last read: DWP descriptor found for {run.verified} of 12 activities; {run.rejected} quotes dropped because they could not be found word for word or did not match the regulations’ wording. Model: {run.model}.</p>}
        <p className="soft small">The AI only points to where the descriptor is written. The letter is worked out from the regulations’ wording, and you confirm each one.</p>
      </section>

      {choices.length > 0 && (
        <section className="stack" aria-label="Comparison">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 className="h2">DWP position and yours</h2>
            {unconfirmed.length > 0 && <form action={confirmAllAction}><input type="hidden" name="caseId" value={id} /><button className="btn">Confirm all {unconfirmed.length} found</button></form>}
          </div>
          {cmp && (
            <div className="panel totals">
              <div><span className="eyebrow">Daily living</span><p>DWP <b className="big">{cmp.dailyLiving.assessor.points}</b> {RATE[cmp.dailyLiving.assessor.rate]} → yours <b className="big">{cmp.dailyLiving.adviser.points}</b> {RATE[cmp.dailyLiving.adviser.rate]}</p></div>
              <div><span className="eyebrow">Mobility</span><p>DWP <b className="big">{cmp.mobility.assessor.points}</b> {RATE[cmp.mobility.assessor.rate]} → yours <b className="big">{cmp.mobility.adviser.points}</b> {RATE[cmp.mobility.adviser.rate]}</p></div>
              <p className="soft small full">Your figures come from the descriptors you chose on the evidence tab. A reconsideration looks at the whole award.</p>
            </div>
          )}
          {cmp?.warnings.map(w => <p key={w.code} className="msg msg-error" role="note">{w.message}</p>)}
          {missing.length > 0 && <p className="msg msg-error" role="note">No DWP descriptor yet for activity {missing.join(', ')}. Choose it from the papers.</p>}

          <div className="table-wrap panel">
            <table className="list cmp">
              <thead><tr><th>Activity</th><th>DWP descriptor</th><th>Assessor’s reason</th><th>Yours</th><th>Difference</th></tr></thead>
              <tbody>{acts.map(a => {
                const ch = choiceFor(a.key);
                const row = cmp?.activities.find(x => `pip:${x.activity}` === a.key);
                const options = descriptorsFor(a.key);
                const q = ch?.decision_quote ?? ch?.pa4_quote;
                return (
                  <tr key={a.key}>
                    <td data-label="Activity"><b>{a.label}</b></td>
                    <td data-label="DWP descriptor">
                      <form action={choiceAction} className="pick">
                        <input type="hidden" name="caseId" value={id} /><input type="hidden" name="activity" value={a.key} />
                        <select name="letter" defaultValue={ch?.letter ?? ''} aria-label={`DWP descriptor for ${a.label}`}>
                          {!ch?.letter && <option value="">Choose…</option>}
                          {options.map(o => <option key={o.id} value={o.id}>{o.id} · {o.points} pts</option>)}
                        </select>
                        <button className="btn btn-small">{ch?.confirmed ? 'Update' : 'Confirm'}</button>
                        {ch?.confirmed ? <span className="chip chip-confirmed">Confirmed</span> : ch?.letter ? <span className="chip chip-plain">To check</span> : null}
                      </form>
                      {ch?.source && <p className="soft small">{SOURCE[ch.source]}{q ? <> · <Link href={quoteLink(q)}>{docName(q.docId)}, p{q.page}</Link></> : null}</p>}
                      {ch?.departs && <p className="warn small">The decision maker used {a.key.split(':')[1]}{ch.departs.decisionLetter}; the PA4 advised {a.key.split(':')[1]}{ch.departs.pa4Letter}.</p>}
                    </td>
                    <td data-label="Assessor’s reason">{ch?.justification
                      ? <blockquote>“{ch.justification.quote}” <Link href={quoteLink(ch.justification)} className="small">p{ch.justification.page}</Link></blockquote>
                      : <span className="soft small">Not found</span>}</td>
                    <td data-label="Yours">{row?.adviser ? <span className="mono">{row.activity}{row.adviser.letter} · {row.adviserPoints} pts</span> : <Link href={`/cases/${id}#${a.key.replace(':', '-')}`} className="small">Not decided</Link>}
                      {row && row.evidence.length > 0 && <p className="soft small">{row.evidence.length} accepted evidence</p>}</td>
                    <td data-label="Difference">{row
                      ? row.status === 'challenge' ? <span className="chip chip-challenge">Challenge +{row.difference}</span>
                        : row.status === 'agree' ? <span className="chip chip-agree">Agree</span>
                          : row.status === 'adviser_lower' ? <span className="chip chip-lower">Yours is lower ({row.difference})</span>
                            : <span className="soft small">Yours not decided</span>
                      : <span className="soft small">—</span>}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel stack" aria-label="Request">
        <h2 className="eyebrow">Reconsideration request</h2>
        {cmp && !unconfirmed.length
          ? <>
              <p className="soft small">Built from the confirmed DWP descriptors, your decisions and the evidence you accepted. Nothing in it is written by the AI. Edit it before sending.</p>
              <DraftForm caseId={id} hasDraft={!!cs.mr_draft} />
            </>
          : <p className="soft">Confirm the DWP descriptor for all 12 activities to draft the request.</p>}
        {cs.mr_draft && <SaveDraftForm caseId={id} draft={cs.mr_draft} />}
      </section>
    </div>
  );
}
