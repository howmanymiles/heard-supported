// The DWP's appeal response bundle. Tribunals refer to evidence by bundle page,
// which is printed on each page and is not always the same as the PDF page.
// Finding a quote in the bundle is a text search: no AI.

import { normalise } from './verify.ts';

/** The bundle page number printed on a page ("Page 23", "23", "- 23 -", "23 of 140"), if any. Footers are usually last, headers first. */
export function printedPageNumber(text: string): number | null {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const tryLine = (l: string) => {
    const m = l.match(/^(?:page\s*)?[-–—]?\s*(\d{1,4})\s*[-–—]?(?:\s*of\s*\d{1,4})?$/i);
    return m ? Number(m[1]) : null;
  };
  for (const l of [lines[lines.length - 1], lines[0]]) { const n = l ? tryLine(l) : null; if (n) return n; }
  return null;
}

export type BundlePage = { page: number; text: string };
export type BundleHit = { pdfPage: number; bundlePage: number };

/** Where a quote appears in the bundle, by printed bundle page (falling back to the PDF page). */
export function locateInBundle(quote: string, pages: BundlePage[]): BundleHit | null {
  const q = normalise(quote).replace(/\s+/g, ' ');
  if (q.split(' ').length < 3) return null;
  for (const p of pages) {
    if (normalise(p.text).includes(q)) return { pdfPage: p.page, bundlePage: printedPageNumber(p.text) ?? p.page };
  }
  return null;
}
