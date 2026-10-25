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

export function scrub(text: string): { text: string; removed: number } {
  let removed = 0;
  let out = text;
  for (const [re, rep] of RULES) {
    out = out.replace(re, (...m) => { removed++; return rep.replace('$1', m[1] ?? ''); });
  }
  return { text: out, removed };
}
