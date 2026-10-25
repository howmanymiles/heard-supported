import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMe } from '@/lib/auth';
import { getMr, buildComparison } from '@/lib/mr';
import { terms } from '@hs/core';
import { CLOSE_REASONS, awardChange, caseGain } from '@/lib/casework';
import { OutcomeForm, CloseForm, IssueResultsForm } from '../../../forms';
import { getAppeal, issuesFor } from '@/lib/appeal';
import { issueResultsFor } from '@/lib/outcomes';
import { reopenAction } from '../../../actions';
import { CaseTabs } from '../tabs';

export const dynamic = 'force-dynamic';

export default async function OutcomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMe();
  const m = await getMr(me, id);
  if (!m) notFound();
  const cs = m.case;
  // The award challenged, as far as the system knows it: the DWP position for PIP, the notice for WCA.
  let beforeDefault: { daily_living?: string; mobility?: string; wca?: string } | null = null;
  if (cs.benefit !== 'uc-wca') {
    const { comparison } = buildComparison(m.choices, m.decisions, m.evidence, cs.benefit, cs.decision_date);
    if (comparison) beforeDefault = { daily_living: comparison.dailyLiving.assessor.rate, mobility: comparison.mobility.assessor.rate };
  } else if (cs.decision_outcome) beforeDefault = { wca: cs.decision_outcome };
  const ap = await getAppeal(me, id);
  const found = ap ? issuesFor(ap) : null;
  const disputed = found?.issues ?? [];
  const saved = Object.fromEntries((await issueResultsFor(me, id)).map(r => [r.issue_key, { result: r.result, stage: r.stage }]));
  const change = awardChange(cs.benefit, cs.award_before, cs.award_after);
  const on = (cs.appeal_outcome_date ?? cs.mr_outcome_date ?? new Date().toISOString()).slice(0, 10);
  const gain = caseGain({ ...cs, on });
  const pounds = (n: number) => `${n < 0 ? '−' : ''}£${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="stack-lg">
      <p className="crumbs"><Link href="/">← Cases</Link></p>
      <div className="head">
        <h1><span className="mono">{cs.ref}</span>{cs.external_ref ? <span className="soft small"> · your ref {cs.external_ref}</span> : null}</h1>
        <p className="soft">{terms(cs.benefit).name} · Outcome</p>
      </div>
      <CaseTabs id={id} benefit={cs.benefit} current="outcome" />

      <section className="panel stack" aria-label="Outcome">
        <h2 className="eyebrow">Results</h2>
        <p className="soft small">Recorded for your agency’s reports. “Award before” is filled in from the decision papers where the system has read them; check it.</p>
        <OutcomeForm caseId={id} benefit={cs.benefit} c={cs} beforeDefault={beforeDefault} />
        {change && <p className="small">Change in award: <b>{change === 'better' ? 'better' : change === 'worse' ? 'worse' : 'no overall change'}</b>.
          {gain ? <> Worth about <b>{pounds(gain.gain)} a year</b> at {gain.year} rates{cs.benefit === 'uc-wca' ? ' (the most it adds: UC is means-tested)' : ''}.</> : cs.benefit === 'uc-wca' && cs.award_after?.wca === 'lcwra' ? ' Choose which LCWRA amount applies to see its value.' : ''}</p>}
      </section>

      <section className="panel stack" aria-label="Disputed points">
        <h2 className="eyebrow">Disputed points</h2>
        {disputed.length ? (<>
          <p className="soft small">What happened to each point you challenged. This builds your agency’s figures on which activities are won.</p>
          <IssueResultsForm caseId={id} issues={disputed} saved={saved} defaultStage={cs.appeal_outcome ? 'appeal' : 'mr'} />
        </>) : <p className="soft small">{found?.blocked ?? 'No disputed points yet. They come from the reconsideration tab, once the decision maker’s position and yours are both recorded.'}</p>}
      </section>

      <section className="panel stack" aria-label="Close">
        <h2 className="eyebrow">{cs.closed_at ? 'Closed' : 'Close the case'}</h2>
        {cs.closed_at ? (
          <>
            <p>Closed on {new Date(cs.closed_at).toISOString().slice(0, 10)}: {CLOSE_REASONS[cs.closed_reason as keyof typeof CLOSE_REASONS] ?? cs.closed_reason}{cs.closed_note ? `. ${cs.closed_note}` : ''}</p>
            <form action={reopenAction}><input type="hidden" name="caseId" value={id} /><button className="btn">Reopen the case</button></form>
          </>
        ) : (
          <>
            <p className="soft small">A closed case leaves the open caseload and its deadlines. Everything on it is kept, and it can be reopened.</p>
            <CloseForm caseId={id} />
          </>
        )}
      </section>
    </div>
  );
}
