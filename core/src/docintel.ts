// Reading documents with Azure AI Document Intelligence (prebuilt Read model).
// Returns each page's text and lines, with a confidence score per line and a
// handwriting flag, so low-confidence words go to the adviser, never guessed.

import { cognitiveToken } from './azure.ts';

export type ReadLine = { text: string; confidence: number | null; handwritten: boolean };
export type ReadPage = { page: number; text: string; lines: ReadLine[]; lowConfidence: number };

export const LOW_CONFIDENCE = 0.8;

type Span = { offset: number; length: number };
type DiWord = { content: string; confidence: number; span: Span };
type DiLine = { content: string; spans: Span[] };
type DiPage = { pageNumber: number; words?: DiWord[]; lines?: DiLine[] };
type DiStyle = { isHandwritten?: boolean; confidence?: number; spans: Span[] };
export type AnalyzeResult = { pages: DiPage[]; styles?: DiStyle[] };

const overlaps = (a: Span, b: Span) => a.offset < b.offset + b.length && b.offset < a.offset + a.length;

/** Convert Document Intelligence's analyze result into pages of lines. Pure, so it is unit tested. */
export function toPages(result: AnalyzeResult): ReadPage[] {
  const handwritten = (result.styles ?? []).filter(s => s.isHandwritten && (s.confidence ?? 1) >= 0.5).flatMap(s => s.spans);
  return result.pages.map(p => {
    const words = p.words ?? [];
    const lines: ReadLine[] = (p.lines ?? []).map(l => {
      const inLine = words.filter(w => l.spans.some(s => overlaps(s, w.span)));
      const confidence = inLine.length ? Math.min(...inLine.map(w => w.confidence)) : null;
      return { text: l.content, confidence, handwritten: l.spans.some(s => handwritten.some(h => overlaps(s, h))) };
    });
    return {
      page: p.pageNumber,
      text: lines.map(l => l.text).join('\n'),
      lines,
      lowConfidence: lines.filter(l => l.confidence !== null && l.confidence < LOW_CONFIDENCE).length,
    };
  });
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function readDocument(bytes: Uint8Array, endpoint = process.env.DOCINTEL_ENDPOINT): Promise<ReadPage[]> {
  if (!endpoint) throw new Error('DOCINTEL_ENDPOINT is not set.');
  const base = endpoint.replace(/\/$/, '');
  const auth = { Authorization: `Bearer ${await cognitiveToken()}` };
  const start = await fetch(`${base}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2024-11-30`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64Source: Buffer.from(bytes).toString('base64') }),
  });
  if (start.status !== 202) throw new Error(`Document reading failed to start (HTTP ${start.status}).`);
  const op = start.headers.get('operation-location');
  if (!op) throw new Error('Document reading returned no operation location.');
  for (let i = 0; i < 90; i++) {
    await sleep(i < 5 ? 1000 : 2000);
    const r = await fetch(op, { headers: auth });
    const j = await r.json() as { status: string; analyzeResult?: AnalyzeResult };
    if (j.status === 'succeeded' && j.analyzeResult) return toPages(j.analyzeResult);
    if (j.status === 'failed') throw new Error('Document reading failed.');
  }
  throw new Error('Document reading timed out.');
}
