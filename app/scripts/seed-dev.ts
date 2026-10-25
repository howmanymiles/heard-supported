// Seeds a local development database with one fictional PIP case at the
// reconsideration stage, without Azure: pages are stored directly, and the
// DWP position is read with the same checks the AI's answer goes through.
// Usage: DATABASE_URL=... node scripts/seed-dev.ts
import { splitTextPages, resolveAssessor } from '@hs/core';
import synthetic from '../src/data/synthetic.json' with { type: 'json' };
import { pool, asAgency } from '../src/lib/db.ts';
import { migrate } from '../src/lib/migrate.ts';
import { createCase, saveDecision } from '../src/lib/cases.ts';

process.chdir(new URL('..', import.meta.url).pathname);
await migrate();
const ag = (await pool().query("insert into agencies (name) values ('Development agency (seed)') returning id")).rows[0].id;
const u = (await pool().query("insert into users (agency_id, entra_oid, name, role) values ($1, $2, 'Seed Adviser', 'admin') returning id", [ag, `seed-${Date.now()}`])).rows[0].id;
const me = { agencyId: ag, userId: u, role: 'admin' as const, name: 'Seed Adviser' };
const sc = (synthetic as any[]).find(s => s.id === 'PIP-01');
const caseId = await createCase(me, 'TEST-PIP-01-SEED', 'pip');
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
  for (const a of r.activities) await c.query('insert into assessor_choices (case_id, agency_id, activity, letter, source, decision_quote, pa4_quote, justification, confirmed) values ($1, $2, $3, $4, $5, $6, $7, $8, false)',
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
console.log(JSON.stringify({ agencyId: ag, userId: u, caseId }));
await pool().end();
