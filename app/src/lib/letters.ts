// Short letters an adviser sends on the client's behalf before the full
// argument: raising the reconsideration in time, and asking for the assessment
// report. Built by code from the case's dates; nothing here is AI-written.

import type { MrTiming } from '@hs/core';

export type LetterKind = 'raise_mr' | 'request_report';
export type LetterOptions = { requestReport: boolean; holdForEvidence: boolean; authorityEnclosed: boolean; disputes: string };

const long = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export function reportName(benefit: string, hasPaperBased: boolean) {
  if (benefit === 'adp') return 'any consultation report and the other supporting information used to make the determination';
  return benefit === 'pip' ? 'the health professional’s assessment report (PA4)' : hasPaperBased ? 'the healthcare professional’s report (UC85A)' : 'the healthcare professional’s report (UC85 or UC85A)';
}

export function buildLetter(kind: LetterKind, c: {
  benefit: string; ref: string; decisionDate: string | null; timing: MrTiming | null; lateReason: string | null; today: string; hasPaperBased: boolean;
}, o: LetterOptions): string {
  const benefit = c.benefit === 'pip' ? 'Personal Independence Payment' : c.benefit === 'adp' ? 'Adult Disability Payment' : 'Universal Credit (Work Capability Assessment)';
  const scot = c.benefit === 'adp';
  const decision = scot
    ? (c.decisionDate ? `the determination my client was told of on ${long(c.decisionDate)}` : 'the recent determination [add the date]')
    : (c.decisionDate ? `the decision dated ${long(c.decisionDate)}` : 'the recent decision [add the date]');
  const report = reportName(c.benefit, c.hasPaperBased);
  const out = [long(c.today), '', `${benefit}`, `Reference: ${c.ref}`, ''];
  out.push(`I act on behalf of my client, who has given their consent for me to do so.${o.authorityEnclosed ? ' Their signed authority is enclosed.' : ''}`);
  if (kind === 'raise_mr') {
    out.push('', scot
      ? `I am writing to ask for a re-determination of my client’s entitlement to ${benefit}, following ${decision}.`
      : `I am writing to ask for a mandatory reconsideration of ${decision} on my client’s ${benefit} claim.`);
    if (c.timing?.status === 'late') out.push('', `${scot ? 'This request is made more than 42 days after my client was told of the determination.' : 'This request is made more than one month after the decision.'} ${c.lateReason ? `It is late because ${c.lateReason.replace(/\.?$/, '.')}` : '[Explain why the request is late.]'}`);
    out.push('', o.disputes.trim()
      ? `My client disagrees with the decision, in particular on ${o.disputes.trim().replace(/\.$/, '')}. Full reasons and further evidence will follow.`
      : 'My client disagrees with the decision. Full reasons and further evidence will follow.');
    if (o.requestReport) out.push('', `Please send me a copy of ${report}, and of any other evidence used to make the decision, so that I can give full reasons.`);
    if (o.holdForEvidence) out.push('', scot
      ? 'Please do not make the re-determination until you have received my client’s reasons and further evidence, or contact me first if that would take you past the 56 days you have to decide.'
      : 'Please do not make the reconsideration decision until you have received my client’s reasons and further evidence. If you are unable to wait, please contact me first.');
  } else {
    out.push('', `I am writing to ask for a copy of ${report} used in ${decision}, and of any other evidence used to make the decision.`);
    out.push('', `My client is considering asking for a ${scot ? 're-determination' : 'mandatory reconsideration'}. Please send the documents to me as well as to my client.`);
  }
  out.push('', 'Please send all correspondence about this to me as well as to my client.', '', 'Yours faithfully,', '', '[Adviser name]', '[Agency]');
  return out.join('\n');
}

// ---------- storage ----------
import { asAgency, audit } from './db.ts';
import type { Me } from './auth.ts';

export type LetterRow = { id: string; kind: LetterKind; text: string; created_at: string; updated_at: string };

export async function listLetters(me: Me, caseId: string): Promise<LetterRow[]> {
  return asAgency(me.agencyId, async c => (await c.query("select id, kind, text, to_char(created_at, 'YYYY-MM-DD HH24:MI') as created_at, to_char(updated_at, 'YYYY-MM-DD HH24:MI') as updated_at from letters where case_id = $1 order by created_at desc", [caseId])).rows);
}

export async function addLetter(me: Me, caseId: string, kind: LetterKind, text: string) {
  return asAgency(me.agencyId, async c => {
    const owns = await c.query('select 1 from cases where id = $1', [caseId]);
    if (!owns.rowCount) throw new Error('Case not found.');
    const r = await c.query('insert into letters (agency_id, case_id, kind, text, created_by) values ($1, $2, $3, $4, $5) returning id', [me.agencyId, caseId, kind, text, me.userId]);
    await audit(c, me.agencyId, me.userId, caseId, kind === 'raise_mr' ? 'Letter drafted: acting on behalf, asking for reconsideration' : 'Letter drafted: request for the assessment report');
    return r.rows[0].id as string;
  });
}

export async function saveLetter(me: Me, caseId: string, id: string, text: string) {
  await asAgency(me.agencyId, async c => {
    await c.query('update letters set text = $3, updated_at = now() where id = $1 and case_id = $2', [id, caseId, text.slice(0, 50_000)]);
    await audit(c, me.agencyId, me.userId, caseId, 'Letter edited');
  });
}
