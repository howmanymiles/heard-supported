// Removes identifiers before text is sent to the AI model. Case records hold
// no client names; documents can, so names in standard positions are removed
// too. This is a first line of defence, not a guarantee: the AI page commits
// to it, and the evaluation set should include documents that test it.

const RULES: Array<[RegExp, string]> = [
  // National Insurance number, with or without spaces
  [/\b[A-Z]{2}[ \t]?\d{2}[ \t]?\d{2}[ \t]?\d{2}[ \t]?[A-D]\b/gi, '[NI number]'],  // shape only: over-removing is the safe side
  // NHS number (10 digits, often 3-3-4)
  [/\b\d{3}[\s-]?\d{3}[\s-]?\d{4}\b/g, '[NHS number]'],
  // Email addresses
  [/\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b/g, '[email]'],
  // UK phone numbers
  [/(?:\+44\s?\(?0?\)?\s?|\b0)(?:\d[\s-]?){9,10}\b/g, '[phone]'],
  // UK postcodes
  [/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi, '[postcode]'],
  // Date of birth after a label
  [/\b(D\.?O\.?B\.?|date of birth)\s*[:\-]?\s*\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}/gi, '$1: [date of birth]'],
  // Names after a label: "Name: Jane Smith", "Patient: J Smith", "Dear Ms Smith"
  [/\b(Name|Patient|Claimant)[ \t]*:[ \t]*(?:(?:Mr|Mrs|Ms|Miss|Mx|Dr)\.?[ \t]+)?(?:[A-Z]\.?(?=[ \t])|[A-Z](?:[a-z]|['’][A-Z])[a-zA-Z'’-]*)(?:[ \t]+(?:[A-Z]\.?(?=[ \t])|[A-Z](?:[a-z]|['’][A-Z])[a-zA-Z'’-]*)){0,3}(?![\w-])/g, '$1: [name]'],
  [/\bDear[ \t]+(?:Mr|Mrs|Ms|Miss|Mx|Dr)\.?[ \t]+[A-Z][a-z][a-zA-Z'’-]*/g, 'Dear [name]'],
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The client's own names, from the claimant record: the full name first, then each part. */
function nameRule(names: string[]): RegExp | null {
  const parts = new Set<string>();
  for (const n of names) {
    const t = n.trim().replace(/\s+/g, ' ');
    if (t.length >= 2) parts.add(t);
    for (const w of t.split(/[ \-]/)) if (w.length >= 2) parts.add(w);
  }
  if (!parts.size) return null;
  const alts = [...parts].sort((a, b) => b.length - a.length).map(p => esc(p).replace(/ /g, '\\s+'));
  return new RegExp(`(?<![\\p{L}])(?:${alts.join('|')})(?=['’]s(?![\\p{L}])|(?![\\p{L}]))`, 'giu');
}

export function scrub(text: string, names: string[] = []): { text: string; removed: number } {
  let removed = 0;
  let out = text;
  const own = nameRule(names);
  if (own) out = out.replace(own, () => { removed++; return '[name]'; });
  for (const [re, rep] of RULES) {
    out = out.replace(re, (...m) => { removed++; return rep.replace('$1', m[1] ?? ''); });
  }
  return { text: out, removed };
}
