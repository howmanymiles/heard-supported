// Subject access: everything held about one client, as a single download the agency can
// give them. A zip with a readable report (report.html), the same data as JSON for
// anyone who needs it in machine-readable form, and the original files they or the
// DWP supplied.

import { crc32 } from 'node:zlib';
import { activityList, terms, type Benefit } from '@hs/core';
import { asAgency, audit } from './db.ts';
import { esc } from './html.ts';
import type { Me } from './auth.ts';

type BlobReader = (path: string) => Promise<Buffer>;
let readBlob: BlobReader = async p => (await import('./storage.ts')).getDocument(p);
export function setBlobReaderForTests(f: BlobReader) { readBlob = f; }

const day = (d: unknown) => (d ? new Date(d as string).toLocaleDateString('en-GB', { timeZone: 'Europe/London', dateStyle: 'long' }) : '');
const when = (d: unknown) => (d ? new Date(d as string).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' }) : '');
const safeName = (s: string) => s.replace(/[^\w .()-]+/g, '_').slice(0, 100) || 'file';

/** A zip file, entries stored without compression (scans and PDFs are compressed already). */
export function zip(files: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'), crc = crc32(f.data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);   // UTF-8 names
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(f.data.length, 18); local.writeUInt32LE(f.data.length, 22); local.writeUInt16LE(name.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(f.data.length, 20); cd.writeUInt32LE(f.data.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(offset, 42);
    parts.push(local, name, f.data); central.push(cd, name);
    offset += 30 + name.length + f.data.length;
  }
  const cdBuf = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cdBuf, end]);
}

export async function gatherClient(me: Me, claimantId: string) {
  return asAgency(me.agencyId, async c => {
    const q = async (sql: string, p: unknown[] = [claimantId]) => (await c.query(sql, p)).rows;
    const [client] = await q("select name, preferred_name, to_char(date_of_birth, 'YYYY-MM-DD') as date_of_birth, agency_ref, created_at from claimants where id = $1");
    if (!client) return null;
    const agency = (await q('select name from agencies where id = $1', [me.agencyId]))[0]?.name as string;
    const consents = await q(`select statement_version, method, to_char(given_on, 'YYYY-MM-DD') given_on, store_data, ai_processing, act_on_behalf, recorded_at, withdrawn_at, withdrawn_note
      from consents where claimant_id = $1 order by recorded_at`);
    const cases = await q(`select x.id, x.ref, x.external_ref, x.benefit, x.stage, x.created_at, x.decision_date, x.decision_outcome, x.mr_request_date, x.mr_draft, x.late_reason,
        x.mr_notice_date, x.mr_outcome, x.mr_outcome_date, x.appeal_sent_date, x.appeal_late_reason, x.appeal_draft, x.appeal_outcome, x.appeal_outcome_date,
        x.award_before, x.award_after, x.closed_at, x.closed_reason, x.closed_note, u.name as adviser
      from cases x left join users u on u.id = x.adviser_id where x.claimant_id = $1 order by x.created_at`);
    for (const cs of cases) {
      const id = [cs.id];
      cs.documents = await q("select id, name, kind, content_type, blob_path, created_at from documents where case_id = $1 order by created_at", id);
      for (const d of cs.documents) d.pages = (await q('select page_no, text from pages where document_id = $1 order by page_no', [d.id])).map(p => ({ page: p.page_no, text: p.text }));
      cs.evidence = await q("select e.quote, e.page_no, e.activities, e.note, e.status, d.name as document from evidence e join documents d on d.id = e.document_id where e.case_id = $1 order by d.created_at, e.page_no", id);
      cs.gaps = await q('select activity, gap, status from gaps where case_id = $1', id);
      cs.descriptors = await q('select activity, satisfied, days_per_week from decisions where case_id = $1', id);
      cs.dwp_descriptors = await q('select activity, letter, confirmed from assessor_choices where case_id = $1', id);
      cs.letters = await q('select kind, text, created_at, updated_at from letters where case_id = $1 order by created_at', id);
      cs.issue_results = await q('select stage, label, result from issue_results where case_id = $1', id);
    }
    const history = await q(`select a.at, a.kind, a.action, u.name as who, x.ref as case_ref from audit a left join users u on u.id = a.user_id left join cases x on x.id = a.case_id
      where a.claimant_id = $1 or a.case_id in (select id from cases where claimant_id = $1) order by a.id`);
    return { agency, client, consents, cases, history };
  });
}

type Gathered = NonNullable<Awaited<ReturnType<typeof gatherClient>>>;

export function report(g: Gathered, produced = new Date()): string {
  const label = (b: string, key: string) => activityList(b as Benefit).find(a => a.key === key)?.label ?? key;
  const k = g.client;
  const METHOD: Record<string, string> = { in_person: 'In person', phone: 'By phone', video: 'By video call', written: 'In writing' };
  const stageName = (st: string, b: string) => ({ claim: 'Claim', assessment: 'Assessment', decision: 'Decision', mr: terms(b as Benefit).mr.replace(/^./, ch => ch.toUpperCase()), appeal: 'Appeal', closed: 'Closed' }[st] ?? st);
  const chosen = (sat: unknown) => (Array.isArray(sat) ? sat : []).map((x: any) => typeof x === 'string' ? x : `${x.letter}${x.daysPercent != null && x.daysPercent < 100 ? ` (${x.daysPercent}% of days)` : ''}`).join(', ');
  const section = (title: string, body: string) => `<h2>${esc(title)}</h2>${body}`;
  const table = (head: string[], rows: unknown[][]) => rows.length
    ? `<table>${head.some(Boolean) ? `<thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>` : ''}<tbody>${rows.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : '<p class="none">None.</p>';
  const cases = g.cases.map((x: any) => {
    const t = terms(x.benefit);
    return `<article><h3>Case ${esc(x.ref)}: ${esc(t.name)}</h3>
      ${table(['', ''], [
        ['Adviser', x.adviser], ['Opened', day(x.created_at)], ['Stage', stageName(x.stage, x.benefit)], ['Decision date', day(x.decision_date)], ['Decision', x.decision_outcome],
        ['Reconsideration requested', day(x.mr_request_date)], ['Reconsideration outcome', [x.mr_outcome, day(x.mr_outcome_date)].filter(Boolean).join(', ')],
        ['Appeal sent', day(x.appeal_sent_date)], ['Appeal outcome', [x.appeal_outcome, day(x.appeal_outcome_date)].filter(Boolean).join(', ')],
        ['Award before', x.award_before ? JSON.stringify(x.award_before) : ''], ['Award after', x.award_after ? JSON.stringify(x.award_after) : ''],
        ['Closed', [day(x.closed_at), x.closed_reason, x.closed_note].filter(Boolean).join(', ')], ['Your agency’s reference', x.external_ref],
      ].filter(r => r[1]))}
      <h4>Evidence noted</h4>${table(['Quote', 'From', 'For', 'Status', 'Note'], x.evidence.map((e: any) => [e.quote, `${e.document}, page ${e.page_no}`, (e.activities as string[]).map(a => label(x.benefit, a)).join('; '), e.status, e.note]))}
      <h4>Gaps identified</h4>${table(['Activity', 'Gap', 'Status'], x.gaps.map((g: any) => [label(x.benefit, g.activity), g.gap, g.status]))}
      <h4>Descriptors chosen by the adviser</h4>${table(['Activity', 'Descriptor', 'Days a week'], x.descriptors.map((d: any) => [label(x.benefit, d.activity), chosen(d.satisfied), d.days_per_week]))}
      <h4>${esc(t.agency.replace(/^the /, '').replace(/^./, (ch: string) => ch.toUpperCase()))} descriptors recorded from the decision papers</h4>${table(['Activity', 'Descriptor', 'Confirmed'], x.dwp_descriptors.map((d: any) => [label(x.benefit, d.activity), d.letter, d.confirmed ? 'Yes' : 'No']))}
      <h4>Issue results</h4>${table(['Stage', 'Issue', 'Result'], x.issue_results.map((r: any) => [r.stage, r.label, r.result]))}
      <h4>Letters and drafts</h4>${[...x.letters.map((l: any) => ({ t: `${l.kind} (${day(l.updated_at ?? l.created_at)})`, b: l.text })),
        ...(x.mr_draft ? [{ t: 'Reconsideration draft', b: x.mr_draft }] : []), ...(x.appeal_draft ? [{ t: 'Appeal draft', b: x.appeal_draft }] : []),
        ...(x.late_reason ? [{ t: 'Reason for lateness (reconsideration)', b: x.late_reason }] : []), ...(x.appeal_late_reason ? [{ t: 'Reason for lateness (appeal)', b: x.appeal_late_reason }] : [])]
        .map(l => `<h5>${esc(l.t)}</h5><pre>${esc(l.b)}</pre>`).join('') || '<p class="none">None.</p>'}
      <h4>Documents</h4>${x.documents.length ? x.documents.map((d: any) => `<details><summary>${esc(d.name)} (${esc(d.kind)}, added ${day(d.created_at)}; original in <code>files/</code>)</summary>${d.pages.map((p: any) => `<h5>Page ${p.page}</h5><pre>${esc(p.text)}</pre>`).join('')}</details>`).join('') : '<p class="none">None.</p>'}
    </article>`;
  }).join('');
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>Information held about ${esc(k.name)}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;color:#1b1b1b}h1{font-size:1.6rem}h2{margin-top:2rem;border-bottom:2px solid #ddd}h3{margin-top:1.5rem}
table{border-collapse:collapse;width:100%;margin:.5rem 0}td,th{border:1px solid #ddd;padding:.3rem .5rem;text-align:left;vertical-align:top}pre{white-space:pre-wrap;background:#f6f6f6;padding:.6rem}.none{color:#666}</style></head><body>
<h1>Information held about ${esc(k.name)}</h1>
<p>Held by ${esc(g.agency)} on Heard &amp; Supported. Produced ${esc(when(produced))}. This covers everything recorded about you: your details, the consent you gave, your cases and everything in them, and a record of everyone who has looked at or changed your information.</p>
${section('Your details', table(['', ''], [['Name', k.name], ['Known as', k.preferred_name], ['Date of birth', day(k.date_of_birth)], ['Agency reference', k.agency_ref], ['Record created', day(k.created_at)]].filter(r => r[1])))}
${section('Your consent', table(['Given', 'How', 'Keep your information', 'AI help', 'Act for you', 'Withdrawn'], g.consents.map((n: any) => [day(n.given_on), METHOD[n.method] ?? n.method, n.store_data ? 'Yes' : 'No', n.ai_processing ? 'Yes' : 'No', n.act_on_behalf ? 'Yes' : 'No', n.withdrawn_at ? `${day(n.withdrawn_at)}${n.withdrawn_note ? ` (${n.withdrawn_note})` : ''}` : ''])))}
${section('Your cases', cases || '<p class="none">None.</p>')}
${section('Who has used your information', table(['When', 'Who', 'What', 'Case'], g.history.map((h: any) => [when(h.at), h.who ?? 'The system', h.action, h.case_ref])))}
<h2>About the AI</h2><p>Where you agreed, an AI service helped your adviser find evidence in your papers and draft letters. Your name and identifying numbers were removed before anything was sent to it. Every suggestion was checked by your adviser, who made all decisions.</p>
</body></html>`;
}

/** The download: report, data and original files. Admins and supervisors; recorded in the audit. */
export async function exportClient(me: Me, claimantId: string): Promise<{ filename: string; data: Buffer } | null> {
  if (me.role !== 'admin' && me.role !== 'supervisor') throw new Error('Only admins and supervisors can produce a subject access export.');
  const g = await gatherClient(me, claimantId);
  if (!g) return null;
  const files: { name: string; data: Buffer }[] = [];
  const used = new Set<string>();
  for (const x of g.cases as any[]) for (const d of x.documents) {
    if (d.blob_path === 'none') continue;
    let n = `files/${x.ref}/${safeName(d.name)}`;
    for (let i = 2; used.has(n); i++) n = `files/${x.ref}/${i}-${safeName(d.name)}`;
    used.add(n);
    try { files.push({ name: n, data: await readBlob(d.blob_path) }); }
    catch { files.push({ name: `${n}.missing.txt`, data: Buffer.from('The original file is no longer stored. The text read from it is in report.html.\n', 'utf8') }); }
  }
  const data = { produced: new Date().toISOString(), ...g, cases: (g.cases as any[]).map(({ id, ...x }) => ({ ...x, documents: x.documents.map(({ id: _i, blob_path: _b, ...d }: any) => d) })) };
  const out = zip([{ name: 'report.html', data: Buffer.from(report(g), 'utf8') }, { name: 'data.json', data: Buffer.from(JSON.stringify(data, null, 2), 'utf8') }, ...files]);
  await asAgency(me.agencyId, c => audit(c, me.agencyId, me.userId, null, `Subject access export produced (${g.cases.length} case${g.cases.length === 1 ? '' : 's'}, ${files.length} file${files.length === 1 ? '' : 's'})`, claimantId));
  const stamp = new Date().toISOString().slice(0, 10);
  return { filename: `subject-access-${safeName(String(g.client.agency_ref ?? 'client')).replace(/ /g, '-')}-${stamp}.zip`, data: out };
}
