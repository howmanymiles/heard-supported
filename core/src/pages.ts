// Plain-text documents mark page breaks with a line that is exactly "--- Page N ---".
// Page 1 needs no marker. Used for synthetic cases and pasted text.
export function splitTextPages(text: string): Array<{ page: number; text: string }> {
  const parts = text.split(/^--- Page (\d+) ---\s*$/m);
  const pages = [{ page: 1, text: parts[0].trim() }];
  for (let i = 1; i < parts.length; i += 2) pages.push({ page: Number(parts[i]), text: parts[i + 1].trim() });
  return pages.filter(p => p.text.length > 0);
}
