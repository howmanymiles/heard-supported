// Citation verification: the guarantee that nothing the AI says is shown
// unless it can be found, word for word, on the page it claims to come from.

export type PageText = { docId: string; page: number; text: string };

export type ProposedEvidence = { doc: string; page: number; quote: string; activities: string[]; note?: string };

export type VerifiedEvidence = ProposedEvidence & { docId: string };

export type Rejection = { item: ProposedEvidence; reason: 'unknown_page' | 'not_verbatim' | 'too_short' | 'too_long' | 'no_valid_activity' };

/** Fold the differences OCR and models introduce that don't change meaning. */
export function normalise(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/-\s*\n\s*/g, '')        // words hyphenated across a line break
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export function verifyEvidence(
  proposed: ProposedEvidence[],
  pages: PageText[],
  docAlias: Record<string, string>, // label shown to the model (e.g. "D1") -> document id
  validActivities: Set<string>,
): { verified: VerifiedEvidence[]; rejected: Rejection[] } {
  const verified: VerifiedEvidence[] = [];
  const rejected: Rejection[] = [];
  const index = new Map(pages.map(p => [`${p.docId}:${p.page}`, normalise(p.text)]));
  const seen = new Set<string>();

  for (const item of proposed) {
    const docId = docAlias[item.doc];
    const pageText = docId ? index.get(`${docId}:${item.page}`) : undefined;
    if (!pageText) { rejected.push({ item, reason: 'unknown_page' }); continue; }
    const n = words(item.quote);
    if (n < 3) { rejected.push({ item, reason: 'too_short' }); continue; }
    if (n > 60) { rejected.push({ item, reason: 'too_long' }); continue; }
    if (!pageText.includes(normalise(item.quote))) { rejected.push({ item, reason: 'not_verbatim' }); continue; }
    const activities = [...new Set(item.activities)].filter(a => validActivities.has(a));
    if (!activities.length) { rejected.push({ item, reason: 'no_valid_activity' }); continue; }
    const key = `${docId}:${item.page}:${normalise(item.quote)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    verified.push({ ...item, activities, docId });
  }
  return { verified, rejected };
}
