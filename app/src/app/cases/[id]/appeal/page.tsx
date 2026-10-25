import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMe } from '@/lib/auth';
import { getAppeal, issuesFor, locate } from '@/lib/appeal';
import { terms } from '@hs/core';
import { docTitle } from '@/lib/mr';
import { UploadForm, ActionButton, AppealDatesForm, SaveGroundsForm, AiSubmissionForm } from '../../../forms';
import { SubmissionReview } from '../review';
import { loadSyntheticMrAction } from '../../../actions';
import { CaseTabs } from '../tabs';

export const dynamic = 'force-dynamic';

const long = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export default async function AppealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMe();
  const a = await getAppeal(me, id);
  if (!a) notFound();
  const { case: cs, docs, appealTimingNow: t } = a;
  const syntheticOnly = process.env.DATA_MODE === 'synthetic-only';
  const notice = docs.filter(d => d.kind === 'mr_notice');
  const bundleDocs = docs.filter(d => d.kind === 'dwp_bundle');
  const synthId = /^TEST-((?:PIP|WCA|ADP)-\d\d)/.exec(cs.external_ref ?? cs.ref)?.[1];
  const tm = terms(cs.benefit), scot = cs.benefit === 'adp', noticeName = scot ? 'notice of re-determination' : 'MR notice', bundleName = scot ? 'appeal papers' : 'DWP response bundle';
  const { issues, blocked } = issuesFor(a);
  const located = locate(issues, a.bundle, a.responseReasoning);
  const missingFromBundle = a.bundle ? located.flatMap(l => l.evidence.filter(e => !e.at)) : [];
  const link = (q: { docId: string; page: number; quote: string }) => `/cases/${id}/documents/${q.docId}?page=${q.page}&q=${encodeURIComponent(q.quote)}#p${q.page}`;

  return (
    <div className="stack-lg">
      <p className="crumbs"><Link href="/">← Cases</Link></p>
      <div className="head">
        <h1><span className="mono">{cs.ref}</span>{cs.external_ref ? <span className="soft small"> · your ref {cs.external_ref}</span> : null}</h1>
        <p className="soft">{tm.name} · Appeal to the {tm.tribunal}</p>
      </div>
      <CaseTabs id={id} benefit={cs.benefit} current="appeal" />

      <section className={`panel stack deadline ${t?.status === 'late' ? 'late' : t?.status === 'out_of_time' ? 'out' : ''}`} aria-label="Time limit">
        <h2 className="eyebrow">Time limit</h2>
        {a.appealSentDate && t?.status === 'in_time' ? <p><b>Appeal sent on {long(a.appealSentDate)}</b>, in time.</p>
          : t ? (
          t.status === 'in_time'
            ? <p><b>Appeal due by {long(t.deadline)}</b> · {t.daysLeft === 0 ? 'today is the last day' : `${t.daysLeft} days left`}. {scot ? `31 days beginning with the day your client was told of the re-determination (${long(t.decisionDate)}). The appeal form goes to Social Security Scotland, which sends it to the tribunal.` : `One month after the MR notice dated ${long(t.decisionDate)}.`}</p>
            : t.status === 'late'
              ? (scot
                ? <p><b>Late.</b> The 31-day limit ended on {long(t.deadline)}. An appeal can still be brought until {long(t.lateLimit)}, but only with the tribunal’s permission, given for a good reason.{cs.appeal_late_reason ? ' Your reason is recorded below.' : ' Add the reason below.'}</p>
                : <p><b>Late.</b> The one-month limit ended on {long(t.deadline)}. An appeal can still be brought until {long(t.lateLimit)}, with reasons; within that time it is treated as in time unless the DWP objects or the tribunal directs otherwise.{cs.appeal_late_reason ? ' Your reason is recorded below.' : ' Add the reason below.'}</p>)
              : <p><b>Outside the time limit.</b> {scot ? `An appeal cannot be brought after ${long(t.lateLimit)} (Social Security (Scotland) Act 2018, section 48).` : `Time cannot be extended beyond ${long(t.lateLimit)} (rule 22(8)).`}</p>
        ) : <p className="soft">Add the date of the {noticeName}, or read it, to see the time limit.</p>}
        <AppealDatesForm caseId={id} mrNoticeDate={a.mrNoticeDate} sentDate={a.appealSentDate} lateReason={cs.appeal_late_reason} scot={scot} />
      </section>

      <section className="panel stack" aria-label="Appeal papers">
        <h2 className="eyebrow">Papers</h2>
        {[...notice, ...bundleDocs].length ? <ul className="plain">{[...notice, ...bundleDocs].map(d => (
          <li key={d.id} className="doc">
            {d.read_status === 'read' ? <Link href={`/cases/${id}/documents/${d.id}`}>{d.name}</Link> : <span>{d.name}</span>}
            <span className="soft small"> · {d.kind === 'mr_notice' ? noticeName : bundleName} · {d.read_status === 'read' ? `${d.page_count} pages` : d.read_status === 'failed' ? 'reading failed' : 'not read yet'}</span>
          </li>))}</ul> : <p className="soft">Upload the {noticeName}, and the {bundleName} when {scot ? 'they arrive' : 'it arrives'}.</p>}
        {synthId === 'PIP-03' && !notice.length && (
          <form action={loadSyntheticMrAction}><input type="hidden" name="caseId" value={id} /><input type="hidden" name="syntheticId" value={synthId} /><input type="hidden" name="stage" value="appeal" />
            <button className="btn">Load the fictional MR notice and DWP bundle for {synthId}</button></form>
        )}
        <UploadForm caseId={id} syntheticOnly={syntheticOnly} kinds={['mr_notice', 'dwp_bundle']} label="Add an appeal paper" benefit={cs.benefit} />
        <div className="row">
          {notice.length > 0 && <ActionButton caseId={id} which="mrNotice" label={`Read the ${noticeName}`} pending="Reading the notice…" />}
          {bundleDocs.length > 0 && <ActionButton caseId={id} which="bundle" label={scot ? 'Read the appeal papers' : 'Read the DWP response'} pending="Reading the bundle… this can take a minute" />}
        </div>
        <p className="soft small">Reading the {noticeName} takes its date and, for {scot ? 'ADP' : 'PIP'}, any descriptor it changed; changed items go back to “to check” on the {scot ? 're-determination' : 'reconsideration'} tab. Evidence is found in the {scot ? 'papers' : 'bundle'} by text search, by page number.</p>
      </section>

      <section className="stack" aria-label="Issues">
        <h2 className="h2">Issues under appeal</h2>
        {blocked ? <p className="msg msg-error" role="note">{blocked}</p> : !issues.length ? <p className="panel soft">No disputed items: your position matches {scot ? 'Social Security Scotland’s' : 'the DWP’s'} on everything you have decided.</p> : (
          <>
            {a.bundle && missingFromBundle.length > 0 && <p className="msg msg-error" role="note">{missingFromBundle.length} piece{missingFromBundle.length > 1 ? 's' : ''} of evidence you rely on {missingFromBundle.length > 1 ? 'are' : 'is'} not in the DWP bundle. Send {missingFromBundle.length > 1 ? 'them' : 'it'} to the tribunal.</p>}
            {!a.bundle && <p className="soft small">Page numbers appear once the {bundleName} {scot ? 'are' : 'is'} uploaded and read.</p>}
            {issues.map(i => {
              const l = located.find(x => x.key === i.key)!;
              return (
                <div key={i.key} className="panel stack">
                  <h3 className="act-title">{i.label}</h3>
                  <p className="small">{i.dwp}<br />{i.ours}</p>
                  {l.reasoning
                    ? <blockquote className="small">Decision maker: “{l.reasoning.quote.quote}” <span className="soft">{l.reasoning.at ? `bundle p${l.reasoning.at.bundlePage}` : ''}</span></blockquote>
                    : l.assessorReason ? <blockquote className="small">{scot ? 'Practitioner' : 'Assessor'}: “{l.assessorReason.quote.quote}” <Link href={link(l.assessorReason.quote)}>{l.assessorReason.at ? `bundle p${l.assessorReason.at.bundlePage}` : `p${l.assessorReason.quote.page}`}</Link></blockquote> : null}
                  {l.evidence.length ? (
                    <ul className="plain stack">{l.evidence.map((e, k) => (
                      <li key={k} className={`ev ${a.bundle && !e.at ? 'ev-rejected' : 'ev-accepted'}`} style={{ opacity: 1 }}>
                        <p className="quote">“{e.quote}”</p>
                        <p className="src">{docTitle(e.doc)}, page {e.page} · {a.bundle ? (e.at ? <b>bundle page {e.at.bundlePage}</b> : <span className="warn">not in the {bundleName}: send it</span>) : <span className="soft">bundle not read yet</span>}</p>
                      </li>))}</ul>
                  ) : <p className="warn small">No accepted evidence on this item yet.</p>}
                </div>
              );
            })}
          </>
        )}
      </section>

      <section className="panel stack" aria-label="Grounds of appeal">
        <h2 className="eyebrow">Grounds and submission</h2>
        <p className="soft small"><b>Grounds</b> are built by the system from the confirmed {scot ? 'Social Security Scotland' : 'DWP'} position, your decisions and accepted evidence, with bundle pages once the bundle is read: no AI. <b>The submission letter</b> is written by the AI from the same facts only. Every sentence is checked: quotations must be word for word from the evidence they cite, numbers must come from that evidence, no case law, only listed regulations, and descriptors only as on either side. Anything that fails is removed. Your interview notes are written in your voice. Drafting either replaces the text below.</p>
        {!blocked && issues.length > 0 && <div className="row">
          <ActionButton caseId={id} which="grounds" label="Draft the grounds" pending="Drafting…" />
          <AiSubmissionForm caseId={id} stage="appeal" />
        </div>}
        <SubmissionReview review={cs.submission_review} stage="appeal" />
        {cs.appeal_draft && <SaveGroundsForm caseId={id} draft={cs.appeal_draft} />}
      </section>
    </div>
  );
}
