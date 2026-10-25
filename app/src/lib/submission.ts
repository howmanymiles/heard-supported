// AI-drafted submission letters (MR request or appeal), from the case's
// confirmed facts. The checks are in @hs/core/submission.ts.

import { draftSubmission, renderSubmission, authoritiesFor, SUBMISSION_REGULATIONS, type SubmissionFacts } from '@hs/core';
import { asAgency, audit } from './db.ts';
import { getAppeal, issuesFor, locate } from './appeal.ts';
import { docTitle } from './mr.ts';
import type { Me } from './auth.ts';

type Appeal = NonNullable<Awaited<ReturnType<typeof getAppeal>>>;
const long = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** The facts a letter may use, with evidence ids, and the letter's fixed header. */
export function buildFacts(a: Appeal, stage: 'mr' | 'appeal'): { facts: SubmissionFacts; header: string[] } | { blocked: string } {
  const { issues, summary, blocked } = issuesFor(a);
  if (blocked) return { blocked };
  if (!issues.length) return { blocked: 'There are no disputed items to write about.' };
  const useBundle = stage === 'appeal' && !!a.bundle;
  const located = locate(issues, useBundle ? a.bundle : null, stage === 'appeal' ? a.responseReasoning : {});
  const kindOf = (docName: string) => a.docs.find(d => d.name === docName)?.kind;
  let n = 0;
  const facts: SubmissionFacts = {
    stage, benefit: a.case.benefit, summary: summary!, regulations: SUBMISSION_REGULATIONS[a.case.benefit as 'pip' | 'uc-wca'],
    authorities: authoritiesFor(a.case.benefit as 'pip' | 'uc-wca').map((x, i) => ({ ...x, ref: `C${i + 1}` })),
    issues: issues.map(i => {
      const l = located.find(x => x.key === i.key)!;
      const dm = l.reasoning
        ? { quote: l.reasoning.quote.quote, where: l.reasoning.at ? `bundle page ${l.reasoning.at.bundlePage}` : 'the response' }
        : l.assessorReason ? { quote: l.assessorReason.quote.quote, where: l.assessorReason.at ? `bundle page ${l.assessorReason.at.bundlePage}` : `assessment report, page ${l.assessorReason.quote.page}` } : null;
      return {
        key: i.key, label: i.label, dwp: i.dwp, ours: i.ours, letters: i.refs, decisionMaker: dm,
        evidence: l.evidence.map(e => ({
          id: `E${++n}`, quote: e.quote, source: kindOf(e.doc) === 'notes' ? 'adviser’s interview notes' : docTitle(e.doc),
          where: e.at ? `bundle page ${e.at.bundlePage}` : `page ${e.page}`, agencyNotes: kindOf(e.doc) === 'notes', inBundle: useBundle ? !!e.at : null,
        })),
      };
    }),
  };
  const header = stage === 'appeal'
    ? [`Submission on behalf of the appellant: ${a.case.benefit === 'pip' ? 'Personal Independence Payment' : 'Universal Credit, Work Capability Assessment'}`, `Reference: ${a.case.ref}`, '',
       `This is a submission on behalf of the appellant in the appeal against the decision${a.decisionDate ? ` dated ${long(a.decisionDate)}` : ''}${a.mrNoticeDate ? `, as reconsidered on ${long(a.mrNoticeDate)}` : ''}.`,
       ...(a.appealTimingNow?.status === 'late' ? ['', `The appeal is made more than one month after the mandatory reconsideration notice. ${a.case.appeal_late_reason ? `It is late because ${String(a.case.appeal_late_reason).replace(/\.?$/, '.')}` : '[Explain why the appeal is late.]'}`] : []),
       '', summary!]
    : [`Mandatory reconsideration request: ${a.case.benefit === 'pip' ? 'Personal Independence Payment' : 'Universal Credit, Work Capability Assessment'}`, `Reference: ${a.case.ref}`, '',
       `I am writing on behalf of my client to ask for a mandatory reconsideration of the decision${a.decisionDate ? ` dated ${long(a.decisionDate)}` : ''}.`,
       ...(a.timing?.status === 'late' ? ['', `This request is made more than one month after the decision. ${a.case.late_reason ? `It is late because ${String(a.case.late_reason).replace(/\.?$/, '.')}` : '[Explain why the request is late.]'}`] : []),
       '', summary!.replace(/The appellant says they score/g, 'My client scores')];
  return { facts, header };
}

export async function writeSubmission(me: Me, caseId: string, stage: 'mr' | 'appeal') {
  const a = await getAppeal(me, caseId);
  if (!a) throw new Error('Case not found.');
  const built = buildFacts(a, stage);
  if ('blocked' in built) throw new Error(built.blocked);
  const r = await draftSubmission(built.facts);
  const text = renderSubmission(r, built.facts, built.header);
  const sentences = [...r.opening, ...r.issues.flatMap(i => i.sentences), ...r.closing];
  const cited = [...new Set(sentences.flatMap(s => s.authorities))].map(ref => built.facts.authorities!.find(x => x.ref === ref)!).map(x => ({ name: x.name, citation: x.citation, proposition: x.proposition, source_url: x.source_url }));
  const review = { stage, kept: sentences.length, argument: sentences.filter(s => s.argument).map(s => s.text), dropped: r.dropped, authorities: cited };
  await asAgency(me.agencyId, async c => {
    await c.query(`update cases set ${stage === 'appeal' ? 'appeal_draft' : 'mr_draft'} = $2, submission_review = $3 where id = $1`, [caseId, text, review]);
    await c.query("insert into extraction_runs (agency_id, case_id, model, dataset_version, verified, rejected, identifiers_removed, created_by, kind) values ($1, $2, $3, $4, $5, $6, 0, $7, 'submission')",
      [me.agencyId, caseId, r.model, a.case.dataset_version, sentences.length, r.dropped.length, me.userId]);
    await audit(c, me.agencyId, me.userId, caseId, `${stage === 'appeal' ? 'Appeal submission' : 'Reconsideration letter'} drafted by AI: ${sentences.length} sentences kept, ${r.dropped.length} dropped by the checks`);
  });
  return review;
}
