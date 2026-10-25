// Seeds a local development database with one fictional PIP case at the
// reconsideration stage, without Azure: pages are stored directly, and the
// DWP position is read with the same checks the AI's answer goes through.
// Usage: DATABASE_URL=... node scripts/seed-dev.ts
import { splitTextPages, resolveAssessor, resolveWcaAssessor } from '@hs/core';
import synthetic from '../src/data/synthetic.json' with { type: 'json' };
import { pool, asAgency } from '../src/lib/db.ts';
import { migrate } from '../src/lib/migrate.ts';
import { createCase, saveDecision } from '../src/lib/cases.ts';
import { fictionalClaimant } from '../src/lib/claimants.ts';

process.chdir(new URL('..', import.meta.url).pathname);
await migrate();
const ag = (await pool().query("insert into agencies (name) values ('Development agency (seed)') returning id")).rows[0].id;
const u = (await pool().query("insert into users (agency_id, entra_oid, name, role) values ($1, $2, 'Seed Adviser', 'admin') returning id", [ag, `seed-${Date.now()}`])).rows[0].id;
const me = { agencyId: ag, userId: u, role: 'admin' as const, name: 'Seed Adviser' };
const sc = (synthetic as any[]).find(s => s.id === 'PIP-01');
const caseId = await createCase(me, 'TEST-PIP-01-SEED', 'pip', await fictionalClaimant(me, 'PIP-01'));
const ids: Record<string, string> = {};
for (const d of [...sc.mrDocs, ...sc.docs.map((x: any) => ({ ...x, kind: 'evidence' }))]) {
  ids[d.name] = await asAgency(ag, async c => {
    const pages = splitTextPages(d.text);
    const id = (await c.query("insert into documents (agency_id, case_id, name, kind, content_type, size_bytes, blob_path, read_status, page_count, low_confidence_lines) values ($1, $2, $3, $4, 'text/markdown', $5, 'none', 'read', $6, 0) returning id", [ag, caseId, d.name, d.kind, d.text.length, pages.length])).rows[0].id;
    for (const p of pages) await c.query('insert into pages (document_id, agency_id, page_no, text, lines) values ($1, $2, $3, $4, $5)', [id, ag, p.page, p.text, JSON.stringify(p.text.split('\n').map((t: string) => ({ text: t, confidence: null, handwritten: false })))]);
    return id;
  });
}
const decDoc = sc.mrDocs.find((d: any) => d.kind === 'decision'), pa4Doc = sc.mrDocs.find((d: any) => d.kind === 'pa4');
const dec = splitTextPages(decDoc.text), pa4 = splitTextPages(pa4Doc.text);
const rows = dec.flatMap(p => [...p.text.matchAll(/^\| (\d{1,2})\.? [^|]+\| ([^|]+?) \| \d+ \|$/gm)].map(m => ({ activity: Number(m[1]), quote: m[2].trim(), page: p.page })));
const chosen = pa4.flatMap(p => [...p.text.matchAll(/Activity (\d+):[^\n]*\n+(Descriptor chosen: [a-h])\nJustification: ([^.]+\.)/g)].map(m => ({ activity: Number(m[1]), quote: m[2], just: m[3], page: p.page })));
const r = resolveAssessor({ activities: rows.map(x => { const c = chosen.find(y => y.activity === x.activity)!; return { activity: x.activity, decision: { doc: 'D', page: x.page, quote: x.quote }, pa4: { doc: 'P', page: c.page, quote: c.quote }, justification: { doc: 'P', page: c.page, quote: c.just } }; }) },
  [...dec.map(p => ({ docId: ids[decDoc.name], ...p })), ...pa4.map(p => ({ docId: ids[pa4Doc.name], ...p }))], { D: ids[decDoc.name], P: ids[pa4Doc.name] });
const strip = (q?: any) => (q ? { docId: q.docId, page: q.page, quote: q.quote } : null);
await asAgency(ag, async c => {
  for (const a of r.activities) await c.query('insert into assessor_choices (case_id, agency_id, activity, letter, source, decision_quote, report_quote, justification, confirmed) values ($1, $2, $3, $4, $5, $6, $7, $8, false)',
    [caseId, ag, `pip:${a.activity}`, a.letter, a.source, strip(a.decisionQuote), strip(a.pa4Quote), strip(a.justification)]);
  await c.query("update cases set decision_date = '2026-12-07', stage = 'mr' where id = $1", [caseId]);
  const notes = ids[sc.docs.find((d: any) => / notes\.md$/.test(d.name)).name];
  const t = (await c.query('select text from pages where document_id = $1 and page_no = 2', [notes])).rows[0].text as string;
  const line = t.split('\n').find(l => /walk/i.test(l)) ?? t.split('\n').find(l => l.trim().split(/\s+/).length > 6)!;
  const q = line.replace(/^[-*\s]+/, '').trim().split(/\s+/).slice(0, 14).join(' ');
  await c.query("insert into evidence (agency_id, case_id, document_id, page_no, quote, activities, status) values ($1, $2, $3, 2, $4, '{pip:12}', 'accepted')", [ag, caseId, notes, q]);
});
await saveDecision(me, caseId, 'pip', 'pip:1', 'e', 5);
await saveDecision(me, caseId, 'pip', 'pip:4', 'b', 7);
await saveDecision(me, caseId, 'pip', 'pip:12', 'b', 5);
// A WCA case (WCA-02, paper-based UC85A) at the same stage.
const wsc = (synthetic as any[]).find(s => s.id === 'WCA-02');
const wcaId = await createCase(me, 'TEST-WCA-02-SEED', 'uc-wca', await fictionalClaimant(me, 'WCA-02'));
const wids: Record<string, string> = {};
for (const d of [...wsc.mrDocs, ...wsc.docs.map((x: any) => ({ ...x, kind: / notes\.md$/.test(x.name) ? 'notes' : 'evidence' }))]) {
  wids[d.kind === 'evidence' ? d.name : d.kind] = await asAgency(ag, async c => {
    const pages = splitTextPages(d.text);
    const id = (await c.query("insert into documents (agency_id, case_id, name, kind, content_type, size_bytes, blob_path, read_status, page_count, low_confidence_lines) values ($1, $2, $3, $4, 'text/markdown', $5, 'none', 'read', $6, 0) returning id", [ag, wcaId, d.name, d.kind, d.text.length, pages.length])).rows[0].id;
    for (const p of pages) await c.query('insert into pages (document_id, agency_id, page_no, text, lines) values ($1, $2, $3, $4, $5)', [id, ag, p.page, p.text, JSON.stringify(p.text.split('\n').map((t: string) => ({ text: t, confidence: null, handwritten: false })))]);
    return id;
  });
}
const rep = splitTextPages(wsc.mrDocs.find((d: any) => d.kind === 'uc85a').text), wdec = splitTextPages(wsc.mrDocs.find((d: any) => d.kind === 'decision').text);
const find = (ps: Array<{ page: number; text: string }>, re: RegExp) => { for (const p of ps) { const m = p.text.match(re); if (m) return { page: p.page, m }; } throw new Error(String(re)); };
const sch6 = Array.from({ length: 17 }, (_, i) => i + 1).map(n => { const c = find(rep, new RegExp(`Activity ${n}:[^\\n]*\\n(Descriptor[^\\n]*)\\nReasoning: ([^.]+\\.)`)); return { activity: n, chosen: { doc: 'R', page: c.page, quote: c.m[1] }, justification: { doc: 'R', page: c.page, quote: c.m[2] } }; });
const s7 = find(rep, /^(No Schedule 7 descriptor applies\.)$/m), r8 = find(rep, /^(Schedule 8 paragraph 4[^\n]*)\nReasoning: ([^.]+\.)/m), r9 = find(rep, /^(Schedule 9 paragraph 4[^\n]*)\nReasoning: ([^.]+\.)/m);
const dd = find(wdec, /^(Date of this notice: [^\n]+)$/m), oc = find(wdec, /(We have decided that you[^.]+\.)/);
const w = resolveWcaAssessor({ decision_date: { doc: 'N', page: dd.page, quote: dd.m[1] }, outcome: { doc: 'N', page: oc.page, quote: oc.m[1] }, sch6, sch7: [{ doc: 'R', page: s7.page, quote: s7.m[1] }],
  sch8_4: { applies: false, finding: { doc: 'R', page: r8.page, quote: r8.m[1] }, justification: { doc: 'R', page: r8.page, quote: r8.m[2] } },
  sch9_4: { applies: false, finding: { doc: 'R', page: r9.page, quote: r9.m[1] }, justification: { doc: 'R', page: r9.page, quote: r9.m[2] } } },
  [...rep.map(p => ({ docId: wids.uc85a, ...p })), ...wdec.map(p => ({ docId: wids.decision, ...p }))], { R: wids.uc85a, N: wids.decision });
await asAgency(ag, async c => {
  const put = (k: string, letter: string | null, q?: any, j?: any) => c.query("insert into assessor_choices (case_id, agency_id, activity, letter, source, report_quote, justification, confirmed) values ($1, $2, $3, $4, 'report', $5, $6, false)", [wcaId, ag, k, letter, strip(q), strip(j)]);
  for (const a of w.sch6) await put(`sch6:${a.activity}`, a.letter, a.chosen, a.justification);
  await put('sch7', w.sch7.ids?.length ? w.sch7.ids.join(',') : 'none', w.sch7.quotes[0]);
  await put('sch8:4', w.sch8_4.value, w.sch8_4.quote, w.sch8_4.justification);
  await put('sch9:4', w.sch9_4.value, w.sch9_4.quote, w.sch9_4.justification);
  await c.query("update cases set decision_date = $2, decision_outcome = $3, stage = 'mr' where id = $1", [wcaId, w.decisionDate!.date, w.outcome.value]);
  const psy = wids[wsc.docs.find((d: any) => / psychiatrist\.md$/.test(d.name)).name];
  await c.query("insert into evidence (agency_id, case_id, document_id, page_no, quote, activities, status) values ($1, $2, $3, 2, $4, '{sch6:13}', 'accepted')", [ag, wcaId, psy, 'She stopped washing, stopped opening post and did not leave her flat for several weeks.']);
  await c.query("insert into evidence (agency_id, case_id, document_id, page_no, quote, activities, status) values ($1, $2, $3, 4, $4, '{sch8:4,sch9:4}', 'accepted')", [ag, wcaId, psy, 'with the possibility of a sanction, would carry a substantial risk of precipitating relapse, with a consequent risk to her health through self-neglect.']);
});
for (const [k, l] of [['sch6:13', 'c'], ['sch6:16', 'c'], ['sch8:4', 'applies'], ['sch9:4', 'applies']]) await saveDecision(me, wcaId, 'uc-wca', k, l, null);

// PIP-03 at appeal: decision 22 July, MR notice 9 September (dressing revised to 6b), DWP bundle in.
import fs from 'node:fs';
const appeal = JSON.parse(fs.readFileSync(new URL('../../evals/cases/PIP-03/appeal.json', import.meta.url), 'utf8'));
const s3 = (synthetic as any[]).find(s => s.id === 'PIP-03');
const apId = await createCase(me, 'TEST-PIP-03-SEED', 'pip', await fictionalClaimant(me, 'PIP-03'));
const aid: Record<string, string> = {};
for (const d of [...s3.docs.map((x: any) => ({ ...x, kind: / notes\.md$/.test(x.name) ? 'notes' : 'evidence', key: x.name.split(' ')[1].replace('.md', '') })), ...s3.mrDocs.map((x: any) => ({ ...x, key: x.kind })), ...s3.appealDocs.map((x: any) => ({ ...x, key: x.kind }))]) {
  aid[d.key] = await asAgency(ag, async c => {
    const pages = splitTextPages(d.text);
    const id = (await c.query("insert into documents (agency_id, case_id, name, kind, content_type, size_bytes, blob_path, read_status, page_count, low_confidence_lines) values ($1, $2, $3, $4, 'text/markdown', $5, 'none', 'read', $6, 0) returning id", [ag, apId, d.name, d.kind, d.text.length, pages.length])).rows[0].id;
    for (const p of pages) await c.query('insert into pages (document_id, agency_id, page_no, text, lines) values ($1, $2, $3, $4, $5)', [id, ag, p.page, p.text, JSON.stringify(p.text.split('\n').map((t: string) => ({ text: t, confidence: null, handwritten: false })))]);
    return id;
  });
}
const notice = splitTextPages(s3.appealDocs.find((d: any) => d.kind === 'mr_notice').text);
const nrows = notice.flatMap(p => [...p.text.matchAll(/^\| (\d{1,2})\.? [^|]+\| ([^|]+?) \| \d+ \|$/gm)].map(m => ({ activity: Number(m[1]), quote: m[2].trim(), page: p.page })));
const nr = resolveAssessor({ activities: nrows.map(x => ({ activity: x.activity, decision: { doc: 'N', page: x.page, quote: x.quote } })) }, notice.map(p => ({ docId: aid.mr_notice, ...p })), { N: aid.mr_notice });
const bundle = splitTextPages(s3.appealDocs.find((d: any) => d.kind === 'dwp_bundle').text);
const reasoning = Object.fromEntries(appeal.issues.map((i: any) => [`pip:${i.activity}`, { docId: aid.dwp_bundle, page: bundle.find(p => p.text.includes(i.dm_reasoning.quote))!.page, quote: i.dm_reasoning.quote }]));
await asAgency(ag, async c => {
  for (const a of nr.activities) await c.query("insert into assessor_choices (case_id, agency_id, activity, letter, source, decision_quote, confirmed) values ($1, $2, $3, $4, $5, $6, true)", [apId, ag, `pip:${a.activity}`, a.letter, a.activity === 6 ? 'mr_notice' : 'decision_letter', strip(a.decisionQuote)]);
  await c.query("update cases set decision_date = '2026-07-22', mr_request_date = '2026-08-12', mr_notice_date = $2, stage = 'appeal', response_reasoning = $3 where id = $1", [apId, new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10), reasoning]);
  for (const i of appeal.issues) for (const e of [...i.evidence, ...i.not_in_bundle].filter((e: any) => ['physio', 'gp', 'form', 'notes'].includes(e.doc)))
    await c.query("insert into evidence (agency_id, case_id, document_id, page_no, quote, activities, status) values ($1, $2, $3, $4, $5, $6, 'accepted')", [ag, apId, aid[e.doc], e.page, e.quote, [`pip:${i.activity}`]]);
});
for (const i of appeal.issues) await saveDecision(me, apId, 'pip', `pip:${i.activity}`, i.adviser_letter, 5);
await saveDecision(me, apId, 'pip', 'pip:6', 'b', 7);

console.log(JSON.stringify({ agencyId: ag, userId: u, caseId, wcaId, apId }));
await pool().end();
