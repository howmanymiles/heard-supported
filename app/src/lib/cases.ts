import { randomUUID } from 'node:crypto';
import { readDocument, extractEvidence, splitTextPages, activityList, datasetVersion, type Benefit } from '@hs/core';
import { asAgency, audit } from './db.ts';
import { putDocument, getDocument } from './storage.ts';
import type { Me } from './auth.ts';

export type CaseRow = { id: string; ref: string; benefit: Benefit; stage: string; status: string; adviser_name: string | null; created_at: Date; documents: number; suggested: number;
  decision_date: string | null; mr_request_date: string | null; mr_notice_date: string | null; appeal_sent_date: string | null };
export type DocKind = 'evidence' | 'notes' | 'pa4' | 'uc85' | 'uc85a' | 'decision' | 'mr_notice' | 'dwp_bundle' | 'other';
export const DOC_KINDS: DocKind[] = ['evidence', 'notes', 'pa4', 'uc85', 'uc85a', 'decision', 'mr_notice', 'dwp_bundle', 'other'];
/** Papers that record the DWP's position rather than the client's evidence. */
export const PAPER_KINDS: DocKind[] = ['pa4', 'uc85', 'uc85a', 'decision', 'mr_notice', 'dwp_bundle'];
export type DocRow = { id: string; name: string; kind: DocKind; content_type: string; size_bytes: number; read_status: string; page_count: number | null; low_confidence_lines: number | null; created_at: Date };
export type EvidenceRow = { id: string; document_id: string; doc_name: string; page_no: number; quote: string; activities: string[]; note: string | null; status: string; source: string };
export type GapRow = { id: string; activity: string; gap: string; status: string };
export type DecisionRow = { activity: string; satisfied: Array<{ letter: string; daysPercent?: number }> | string[]; days_per_week: string | null };

export const ALLOWED_TYPES: Record<string, 'read' | 'text'> = {
  'application/pdf': 'read',
  'image/jpeg': 'read',
  'image/png': 'read',
  'image/tiff': 'read',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'read',
  'text/plain': 'text',
  'text/markdown': 'text',
};
export const MAX_BYTES = 20 * 1024 * 1024;

/** Text test documents use "--- Page N ---" lines between pages, like the synthetic cases. */
export async function listCases(me: Me): Promise<CaseRow[]> {
  return asAgency(me.agencyId, async c => (await c.query(`
    select c.id, c.ref, c.benefit, c.stage, c.status, u.name as adviser_name, c.created_at,
      to_char(c.decision_date, 'YYYY-MM-DD') as decision_date, to_char(c.mr_request_date, 'YYYY-MM-DD') as mr_request_date,
      to_char(c.mr_notice_date, 'YYYY-MM-DD') as mr_notice_date, to_char(c.appeal_sent_date, 'YYYY-MM-DD') as appeal_sent_date,
      (select count(*)::int from documents d where d.case_id = c.id) as documents,
      (select count(*)::int from evidence e where e.case_id = c.id and e.status = 'suggested') as suggested
    from cases c left join users u on u.id = c.adviser_id
    order by c.created_at desc`)).rows);
}

export async function createCase(me: Me, ref: string, benefit: Benefit): Promise<string> {
  const clean = ref.trim().slice(0, 40);
  if (!/^[A-Za-z0-9][A-Za-z0-9 _\-\/]*$/.test(clean)) throw new Error('Use letters, numbers, spaces, hyphens or slashes for the case reference. Don’t use the client’s name.');
  return asAgency(me.agencyId, async c => {
    const r = await c.query('insert into cases (agency_id, ref, benefit, adviser_id, dataset_version) values ($1, $2, $3, $4, $5) returning id',
      [me.agencyId, clean, benefit, me.userId, datasetVersion(benefit)]);
    await audit(c, me.agencyId, me.userId, r.rows[0].id, 'Case created');
    return r.rows[0].id;
  });
}

export async function getCase(me: Me, id: string) {
  return asAgency(me.agencyId, async c => {
    const cs = await c.query(`select c.*, u.name as adviser_name from cases c left join users u on u.id = c.adviser_id where c.id = $1`, [id]);
    if (!cs.rowCount) return null;
    const docs = (await c.query('select id, name, kind, content_type, size_bytes, read_status, page_count, low_confidence_lines, created_at from documents where case_id = $1 order by created_at', [id])).rows as DocRow[];
    const evidence = (await c.query(`select e.id, e.document_id, d.name as doc_name, e.page_no, e.quote, e.activities, e.note, e.status, e.source
      from evidence e join documents d on d.id = e.document_id where e.case_id = $1 order by d.created_at, e.page_no`, [id])).rows as EvidenceRow[];
    const gaps = (await c.query('select id, activity, gap, status from gaps where case_id = $1 order by created_at', [id])).rows as GapRow[];
    const decisions = (await c.query('select activity, satisfied, days_per_week from decisions where case_id = $1', [id])).rows as DecisionRow[];
    const runs = (await c.query('select model, verified, rejected, identifiers_removed, created_at from extraction_runs where case_id = $1 order by created_at desc limit 1', [id])).rows;
    const log = (await c.query(`select a.action, a.at, u.name from audit a left join users u on u.id = a.user_id where a.case_id = $1 order by a.at desc limit 50`, [id])).rows;
    return { case: cs.rows[0], docs, evidence, gaps, decisions, lastRun: runs[0] ?? null, log };
  });
}

export async function getDocumentPages(me: Me, caseId: string, docId: string) {
  return asAgency(me.agencyId, async c => {
    const d = await c.query('select id, name from documents where id = $1 and case_id = $2', [docId, caseId]);
    if (!d.rowCount) return null;
    const pages = (await c.query('select page_no, text, lines from pages where document_id = $1 order by page_no', [docId])).rows;
    return { doc: d.rows[0], pages };
  });
}

export async function addDocument(me: Me, caseId: string, file: File, docKind: DocKind = 'evidence') {
  if (!DOC_KINDS.includes(docKind)) throw new Error('Unknown document type.');
  const kind = ALLOWED_TYPES[file.type] ?? (file.name.endsWith('.md') ? 'text' : undefined);
  if (!kind) throw new Error('Upload a PDF, Word document, photo (JPEG, PNG, TIFF) or a text test file.');
  if (file.size > MAX_BYTES) throw new Error('Files must be 20 MB or smaller.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const docId = randomUUID();
  const path = `${me.agencyId}/${caseId}/${docId}`;
  await putDocument(path, bytes, file.type || 'text/markdown');
  await asAgency(me.agencyId, async c => {
    const owns = await c.query('select 1 from cases where id = $1', [caseId]);
    if (!owns.rowCount) throw new Error('Case not found.');
    await c.query('insert into documents (id, agency_id, case_id, name, kind, content_type, size_bytes, blob_path, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [docId, me.agencyId, caseId, file.name.slice(0, 200), docKind, file.type || 'text/markdown', file.size, path, me.userId]);
    await audit(c, me.agencyId, me.userId, caseId, `Document added (${kind === 'text' ? 'text' : 'scan or file'})`);
  });
}

/** Read (OCR or split) any documents of the given kinds not yet read, storing their pages. */
export async function readUnread(me: Me, caseId: string, docs: DocRow[]) {
  for (const d of docs.filter(d => d.read_status !== 'read')) {
    await asAgency(me.agencyId, c => c.query("update documents set read_status = 'reading' where id = $1", [d.id]));
    try {
      const blobPath = (await asAgency(me.agencyId, c => c.query('select blob_path from documents where id = $1', [d.id]))).rows[0].blob_path;
      const bytes = await getDocument(blobPath);
      const isText = d.content_type.startsWith('text/') || d.name.endsWith('.md');
      const pages = isText
        ? splitTextPages(bytes.toString('utf8')).map(p => ({ page: p.page, text: p.text, lines: p.text.split('\n').map(t => ({ text: t, confidence: null, handwritten: false })), lowConfidence: 0 }))
        : await readDocument(bytes);
      await asAgency(me.agencyId, async c => {
        await c.query('delete from pages where document_id = $1', [d.id]);
        for (const p of pages) {
          await c.query('insert into pages (document_id, agency_id, page_no, text, lines) values ($1, $2, $3, $4, $5)', [d.id, me.agencyId, p.page, p.text, JSON.stringify(p.lines)]);
        }
        await c.query("update documents set read_status = 'read', page_count = $2, low_confidence_lines = $3 where id = $1",
          [d.id, pages.length, pages.reduce((s, p) => s + p.lowConfidence, 0)]);
        await audit(c, me.agencyId, me.userId, caseId, `Document read: ${pages.length} pages`);
      });
    } catch (e) {
      await asAgency(me.agencyId, c => c.query("update documents set read_status = 'failed' where id = $1", [d.id]));
      throw e;
    }
  }
}

/** Pages of read documents of the given kinds, for the AI. */
export async function readPages(me: Me, caseId: string, kinds: DocKind[]) {
  return asAgency(me.agencyId, async c => {
    const ds = (await c.query("select id, name, kind from documents where case_id = $1 and read_status = 'read' and kind = any($2) order by created_at, name", [caseId, kinds])).rows;
    return Promise.all(ds.map(async d => ({
      id: d.id as string,
      name: d.name as string,
      kind: d.kind as DocKind,
      pages: (await c.query('select page_no as page, text from pages where document_id = $1 order by page_no', [d.id])).rows as Array<{ page: number; text: string }>,
    })));
  });
}

/** Read any unread evidence, then extract evidence across the whole case. The PA4 and decision letter are not evidence. */
export async function readAndReview(me: Me, caseId: string) {
  const { case: cs, docs } = (await getCase(me, caseId)) ?? {};
  if (!cs) throw new Error('Case not found.');
  const evidenceKinds: DocKind[] = ['evidence', 'notes', 'other'];
  await readUnread(me, caseId, docs!.filter(d => evidenceKinds.includes(d.kind)));
  const input = await readPages(me, caseId, evidenceKinds);
  if (!input.length) return;

  const result = await extractEvidence(cs.benefit, input);
  await asAgency(me.agencyId, async c => {
    // Keep everything the adviser has already decided; replace only open suggestions.
    await c.query("delete from evidence where case_id = $1 and source = 'ai' and status = 'suggested'", [caseId]);
    await c.query("delete from gaps where case_id = $1 and status = 'open'", [caseId]);
    const decided = new Set((await c.query("select document_id || ':' || page_no || ':' || lower(quote) as k from evidence where case_id = $1", [caseId])).rows.map(r => r.k));
    for (const e of result.verified) {
      if (decided.has(`${e.docId}:${e.page}:${e.quote.toLowerCase()}`)) continue;
      await c.query('insert into evidence (agency_id, case_id, document_id, page_no, quote, activities, note) values ($1, $2, $3, $4, $5, $6, $7)',
        [me.agencyId, caseId, e.docId, e.page, e.quote, e.activities, e.note?.slice(0, 200) ?? null]);
    }
    for (const g of result.gaps) {
      await c.query('insert into gaps (agency_id, case_id, activity, gap) values ($1, $2, $3, $4)', [me.agencyId, caseId, g.activity, g.gap]);
    }
    await c.query('insert into extraction_runs (agency_id, case_id, model, dataset_version, verified, rejected, identifiers_removed, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8)',
      [me.agencyId, caseId, result.model, cs.dataset_version, result.verified.length, result.rejected.length, result.identifiersRemoved, me.userId]);
    await audit(c, me.agencyId, me.userId, caseId, `Evidence review run: ${result.verified.length} cited suggestions, ${result.rejected.length} dropped for failing citation checks`);
  });
}

export async function setEvidenceStatus(me: Me, caseId: string, evidenceId: string, status: 'accepted' | 'rejected' | 'suggested') {
  await asAgency(me.agencyId, async c => {
    await c.query('update evidence set status = $3, decided_by = $4 where id = $1 and case_id = $2', [evidenceId, caseId, status, me.userId]);
    await audit(c, me.agencyId, me.userId, caseId, `Evidence ${status === 'suggested' ? 'reopened' : status}`);
  });
}

export async function setGapStatus(me: Me, caseId: string, gapId: string, status: 'open' | 'closed' | 'dismissed') {
  await asAgency(me.agencyId, async c => {
    await c.query('update gaps set status = $3 where id = $1 and case_id = $2', [gapId, caseId, status]);
    await audit(c, me.agencyId, me.userId, caseId, `Gap ${status}`);
  });
}

export const RISK_KEYS: Record<string, string> = { 'sch8:4': 'Schedule 8 paragraph 4 (substantial risk, LCW)', 'sch9:4': 'Schedule 9 paragraph 4 (substantial risk, LCWRA)' };

export async function saveDecision(me: Me, caseId: string, benefit: Benefit, activity: string, letter: string, daysPerWeek: number | null) {
  if (benefit === 'uc-wca' && RISK_KEYS[activity]) {
    if (letter && letter !== 'applies' && letter !== 'not_applies') throw new Error('Choose whether it applies.');
    await asAgency(me.agencyId, async c => {
      await c.query(`insert into decisions (case_id, agency_id, activity, satisfied, updated_by) values ($1, $2, $3, $4, $5)
        on conflict (case_id, activity) do update set satisfied = excluded.satisfied, updated_by = excluded.updated_by, updated_at = now()`,
        [caseId, me.agencyId, activity, JSON.stringify(letter ? [letter] : []), me.userId]);
      await audit(c, me.agencyId, me.userId, caseId, letter ? `${RISK_KEYS[activity]}: ${letter === 'applies' ? 'applies' : 'does not apply'}` : `${RISK_KEYS[activity]}: cleared`);
    });
    return;
  }
  const act = activityList(benefit).find(a => a.key === activity);
  if (!act) throw new Error('Unknown activity.');
  if (daysPerWeek !== null && (daysPerWeek < 0 || daysPerWeek > 7)) throw new Error('Days per week must be between 0 and 7.');
  const satisfied = !letter ? []
    : activity.startsWith('sch7:') ? [letter]
    : [{ letter, ...(daysPerWeek !== null && activity.startsWith('pip:') ? { daysPercent: Math.round((daysPerWeek / 7) * 100) } : {}) }];
  await asAgency(me.agencyId, async c => {
    await c.query(`insert into decisions (case_id, agency_id, activity, satisfied, days_per_week, updated_by) values ($1, $2, $3, $4, $5, $6)
      on conflict (case_id, activity) do update set satisfied = excluded.satisfied, days_per_week = excluded.days_per_week, updated_by = excluded.updated_by, updated_at = now()`,
      [caseId, me.agencyId, activity, JSON.stringify(satisfied), daysPerWeek, me.userId]);
    await audit(c, me.agencyId, me.userId, caseId, letter ? `Descriptor ${letter} chosen for ${act.label}` : `Descriptor cleared for ${act.label}`);
  });
}
