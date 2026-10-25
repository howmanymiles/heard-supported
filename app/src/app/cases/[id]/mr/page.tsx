import Link from 'next/link';
import { docType } from '@/lib/doctypes';
import { notFound } from 'next/navigation';
import { activityList, terms, isPipLike, adpRedeterminationDue } from '@hs/core';
import { requireMe } from '@/lib/auth';
import { getMr, buildComparison, type ChoiceRow } from '@/lib/mr';
import { descriptorsFor } from '@/lib/score';
import { UploadForm, AssessForm, MrDatesForm, DraftForm, SaveDraftForm, AiSubmissionForm } from '../../../forms';
import { SubmissionReview } from '../review';
import { choiceAction, confirmAllAction, loadSyntheticMrAction } from '../../../actions';
import { CaseTabs } from '../tabs';
import { listLetters } from '@/lib/letters';
import { LetterForm, SaveLetterForm } from '../../../forms';
import { WcaComparisonView } from './wca-view';
import { buildWcaComparison } from '@/lib/mr-wca';

export const dynamic = 'force-dynamic';

const RATE: Record<string, string> = { none: 'no award', standard: 'standard rate', enhanced: 'enhanced rate' };
const SOURCE: Record<string, string> = { decision_letter: 'from the decision letter', pa4: 'from the PA4', report: 'from the report', adviser: 'set by you' };
const KIND_SHORT: Record<string, string> = { pa4: 'PA4', uc85: 'UC85', uc85a: 'UC85A', decision: 'decision' };
const long = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export default async function MrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMe();
  const mr = await getMr(me, id);
  if (!mr) notFound();
  const { case: cs, docs, choices, decisions, evidence, timing, run } = mr;
  const syntheticOnly = process.env.DATA_MODE === 'synthetic-only';

  const isPip = isPipLike(cs.benefit);
  const t = terms(cs.benefit), scot = cs.benefit === 'adp', who = scot ? 'Social Security Scotland' : 'DWP', rep = scot ? 'consultation report' : 'PA4';
  const letters = await listLetters(me, id);
  const paperKinds = isPip ? ['decision', 'pa4'] : ['uc85', 'uc85a', 'decision'];
  const papers = docs.filter(d => paperKinds.includes(d.kind));
  const unreadPapers = papers.filter(d => d.read_status !== 'read').length;
  const synthId = /^TEST-((?:PIP|WCA|ADP)-\d\d)/.exec(cs.external_ref ?? cs.ref)?.[1];
  const pip = isPip ? buildComparison(choices, decisions, evidence, cs.benefit, cs.decision_date) : null;
  const hasReport = docs.some(d => d.kind === 'uc85' || d.kind === 'uc85a');
  const wca = isPip ? null : buildWcaComparison(choices, decisions, evidence, cs.decision_outcome, hasReport, cs.decision_date);
  const { comparison: cmp, missing, unconfirmed } = pip ?? { comparison: null, missing: [] as number[], unconfirmed: [] as number[] };
  const ready = isPip ? !!cmp && !unconfirmed.length : !!wca?.comparison && !wca.unconfirmed.length && wca.comparison.challenges.length > 0;
  const acts = activityList(scot ? 'adp' : 'pip');
  const choiceFor = (key: string) => choices.find(c => c.activity === key) as ChoiceRow | undefined;
  const docName = (docId: string) => docs.find(d => d.id === docId)?.name ?? 'document';
  const quoteLink = (q: { docId: string; page: number; quote: string }) => `/cases/${id}/documents/${q.docId}?page=${q.page}&q=${encodeURIComponent(q.quote)}#p${q.page}`;

  return (
    <div className="stack-lg">
      <p className="crumbs"><Link href="/">← Cases</Link></p>
      <div className="head">
        <h1><span className="mono">{cs.ref}</span>{cs.external_ref ? <span className="soft small"> · your ref {cs.external_ref}</span> : null}</h1>
        <p className="soft">{t.name} · {scot ? 'Re-determination' : 'Mandatory reconsideration'}</p>
      </div>
      <CaseTabs id={id} benefit={cs.benefit} current="mr" />

      <section className={`panel stack deadline ${timing?.status === 'late' ? 'late' : timing?.status === 'out_of_time' ? 'out' : ''}`} aria-label="Time limit">
        <h2 className="eyebrow">Time limit</h2>
        {timing ? (
          timing.status === 'in_time'
            ? <p><b>Due by {long(timing.deadline)}</b> · {timing.daysLeft === 0 ? 'today is the last day' : `${timing.daysLeft} days left`}. {scot ? `42 days beginning with the day your client was told of the determination (${long(timing.decisionDate)}).` : `One month from the decision dated ${long(timing.decisionDate)}.`}</p>
            : timing.status === 'late'
              ? <p><b>Late.</b> The {scot ? '42-day' : 'one-month'} limit ended on {long(timing.deadline)}. A late request can still be accepted until {long(timing.lateLimit)} {scot ? 'if your client has a good reason for not asking sooner' : 'if it explains why it is late'}{cs.late_reason ? '; your reason is recorded below.' : '. Add the reason below.'}</p>
              : <p><b>Outside the {scot ? 'one-year' : '13-month'} limit</b>, which ended on {long(timing.lateLimit)}. {scot ? 'A re-determination cannot be asked for now' : 'A reconsideration cannot normally be accepted now'}; consider a new {scot ? 'application' : 'claim'} or other routes.</p>
        ) : <p className="soft">Add the date {scot ? 'your client was told of the determination' : 'of the decision letter'}, or read the decision papers, to see the time limit.</p>}
        <p className="soft small">{scot ? 'The time limit runs from the day your client was told of the determination. Check when the notice actually reached them; a delay can be a good reason for a late request.' : 'Check the date the client actually received the letter; a delay in receiving it can be part of the reason for a late request.'}</p>
        {scot && mr.requestDate && <p className="small">Social Security Scotland should re-determine within 56 days of receiving the request, by about {long(adpRedeterminationDue(mr.requestDate))}. If it does not, your client can appeal the original determination.</p>}
        <MrDatesForm caseId={id} decisionDate={mr.decisionDate} requestDate={mr.requestDate} lateReason={cs.late_reason} outcome={isPip ? undefined : (cs.decision_outcome ?? null)} scot={scot} />
      </section>

      <section className="panel stack" aria-label="Letters">
        <h2 className="eyebrow">Letters on your client’s behalf</h2>
        <p className="soft small">Send these with just the {t.decision}: one raises the {t.mr} in time with reasons to follow, the other asks for the {isPip ? rep : 'UC85 or UC85A'}{scot ? ' and supporting information' : ''}. Built by the system from the case details, not by AI.</p>
        <LetterForm caseId={id} isPip={isPip} scot={scot} />
        {letters.map(l => (
          <details key={l.id} className="panel">
            <summary><b>{l.kind === 'raise_mr' ? `Acting on behalf: ${t.mr} request` : scot ? 'Request for the consultation report and supporting information' : 'Request for the assessment report'}</b> <span className="soft small">· {l.updated_at}</span></summary>
            <SaveLetterForm caseId={id} id={l.id} text={l.text} />
          </details>
        ))}
      </section>

      <section className="panel stack" aria-label="Decision papers">
        <h2 className="eyebrow">Decision papers</h2>
        {papers.length ? <ul className="plain">{papers.map(d => (
          <li key={d.id} className="doc">
            {d.read_status === 'read' ? <Link href={`/cases/${id}/documents/${d.id}`}>{d.name}</Link> : <span>{d.name}</span>}{docType(d.doc_type) ? <span className="chip">{docType(d.doc_type)!.label}</span> : null}
             <span className="soft small"> · {scot ? (d.kind === 'pa4' ? 'consultation report' : d.kind === 'decision' ? 'notice of determination' : d.kind) : KIND_SHORT[d.kind] ?? d.kind} · {d.read_status === 'read' ? `${d.page_count} pages` : d.read_status === 'failed' ? 'reading failed' : 'not read yet'}</span>
          </li>))}</ul> : <p className="soft">{scot ? 'Upload the notice of determination, and the consultation report if there was one.' : isPip ? 'Upload the decision letter and the PA4 assessment report.' : 'Upload the UC85 or UC85A report and the decision notice. The report holds the descriptors; the notice gives the date and award.'} They are read for {scot ? 'Social Security Scotland’s' : 'the DWP’s'} position, not as evidence.</p>}
        {synthId && !papers.length && (
          <form action={loadSyntheticMrAction}><input type="hidden" name="caseId" value={id} /><input type="hidden" name="syntheticId" value={synthId} />
            <button className="btn">Load the fictional decision papers for {synthId}</button></form>
        )}
        <UploadForm caseId={id} syntheticOnly={syntheticOnly} kinds={paperKinds} label="Add a decision paper" benefit={cs.benefit} />
        {papers.length > 0 && <AssessForm caseId={id} label={unreadPapers ? 'Read the decision papers' : 'Read the decision papers again'} />}
        {run && <p className="soft small">Last read: {who} finding found for {run.verified} of {isPip ? '12 activities' : '20 items'}; {run.rejected} quotes dropped because they could not be found word for word or did not match the regulations’ wording. Model: {run.model}.</p>}
        <p className="soft small">The AI only points to where the descriptor is written. The letter is worked out from the regulations’ wording, and you confirm each one.</p>
      </section>

      {!isPip && (choices.length > 0 || !hasReport) && wca && <WcaComparisonView id={id} docs={docs} choices={choices} result={wca} />}

      {isPip && choices.length > 0 && (
        <section className="stack" aria-label="Comparison">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 className="h2">{who} position and yours</h2>
            {unconfirmed.length > 0 && <form action={confirmAllAction}><input type="hidden" name="caseId" value={id} /><button className="btn">Confirm all {unconfirmed.length} found</button></form>}
          </div>
          {cmp && (
            <div className="panel totals">
              <div><span className="eyebrow">Daily living</span><p>{who} <b className="big">{cmp.dailyLiving.assessor.points}</b> {RATE[cmp.dailyLiving.assessor.rate]} → yours <b className="big">{cmp.dailyLiving.adviser.points}</b> {RATE[cmp.dailyLiving.adviser.rate]}</p></div>
              <div><span className="eyebrow">Mobility</span><p>{who} <b className="big">{cmp.mobility.assessor.points}</b> {RATE[cmp.mobility.assessor.rate]} → yours <b className="big">{cmp.mobility.adviser.points}</b> {RATE[cmp.mobility.adviser.rate]}</p></div>
              <p className="soft small full">Your figures come from the descriptors you chose on the evidence tab. A {t.mr} looks at the whole award.</p>
            </div>
          )}
          {cmp?.warnings.map(w => <p key={w.code} className="msg msg-error" role="note">{w.message}</p>)}
          {missing.length > 0 && <p className="msg msg-error" role="note">No {who} descriptor yet for activity {missing.join(', ')}. Choose it from the papers.</p>}

          <div className="table-wrap panel">
            <table className="list cmp">
              <thead><tr><th>Activity</th><th>{who} descriptor</th><th>{scot ? 'Practitioner’s reason' : 'Assessor’s reason'}</th><th>Yours</th><th>Difference</th></tr></thead>
              <tbody>{acts.map(a => {
                const ch = choiceFor(a.key);
                const row = cmp?.activities.find(x => `pip:${x.activity}` === a.key);
                const options = descriptorsFor(a.key, cs.benefit, cs.decision_date);
                const q = ch?.decision_quote ?? ch?.report_quote;
                return (
                  <tr key={a.key}>
                    <td data-label="Activity"><b>{a.label}</b></td>
                    <td data-label={`${who} descriptor`}>
                      <form action={choiceAction} className="pick">
                        <input type="hidden" name="caseId" value={id} /><input type="hidden" name="activity" value={a.key} />
                        <select name="letter" defaultValue={ch?.letter ?? ''} aria-label={`${who} descriptor for ${a.label}`}>
                          {!ch?.letter && <option value="">Choose…</option>}
                          {options.map(o => <option key={o.id} value={o.id}>{o.id} · {o.points} pts</option>)}
                        </select>
                        <button className="btn btn-small">{ch?.confirmed ? 'Update' : 'Confirm'}</button>
                        {ch?.confirmed ? <span className="chip chip-confirmed">Confirmed</span> : ch?.letter ? <span className="chip chip-plain">To check</span> : null}
                      </form>
                      {ch?.source && <p className="soft small">{SOURCE[ch.source]}{q ? <> · <Link href={quoteLink(q)}>{docName(q.docId)}, p{q.page}</Link></> : null}</p>}
                      {!ch?.letter && ch?.candidates?.length ? <p className="warn small">The letter gives only the points, which could be {ch.candidates.map(c => `${a.key.split(':')[1]}${c}`).join(' or ')}. Choose from the {rep} or the reasons.</p> : null}
                      {ch?.departs && <p className="warn small">The decision maker used {a.key.split(':')[1]}{ch.departs.decisionLetter}; the {rep} advised {a.key.split(':')[1]}{ch.departs.pa4Letter}.</p>}
                    </td>
                    <td data-label={scot ? 'Practitioner’s reason' : 'Assessor’s reason'}>{ch?.justification
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
        <h2 className="eyebrow">{scot ? 'Re-determination request' : 'Reconsideration request'}</h2>
        {ready
          ? <>
              <p className="soft small"><b>Draft the request</b> builds it from the confirmed {who} position, your decisions and accepted evidence: no AI. <b>Write the letter with AI</b> drafts it in prose from the same facts only, with every sentence checked (quotations and numbers must come from the evidence cited, no case law, only listed regulations); anything that fails is removed. Either replaces the text below. Edit before sending.</p>
              <div className="row"><DraftForm caseId={id} hasDraft={!!cs.mr_draft} /><AiSubmissionForm caseId={id} stage="mr" /></div>
              <SubmissionReview review={cs.submission_review} stage="mr" />
            </>
          : <p className="soft">{isPip ? `Confirm the ${who} descriptor for all 12 activities to draft the full request.` : hasReport ? 'Confirm every DWP finding (17 Schedule 6 activities, Schedule 7 and both substantial-risk paragraphs) to draft the full request.' : 'Choose your descriptors on the evidence tab to draft the full request.'} To protect the time limit now, use a letter above.</p>}
        {cs.mr_draft && <SaveDraftForm caseId={id} draft={cs.mr_draft} />}
      </section>
    </div>
  );
}
