// Case references: one system-wide sequence, written as AAA-12-1234. The letters leave
// out I and O, so they can't be mistaken for 1 and 0.

import type { PoolClient } from 'pg';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';            // 24
export const CAPACITY = 24 ** 3 * 1_000_000;           // 13,824,000,000

/** Pure: the reference for the nth case. 1 is AAA-00-0001. */
export function formatRef(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n >= CAPACITY) throw new Error('Case number out of range.');
  const digits = n % 1_000_000, high = Math.floor(n / 1_000_000);
  const l = [Math.floor(high / 576) % 24, Math.floor(high / 24) % 24, high % 24].map(i => LETTERS[i]).join('');
  const d = String(digits).padStart(6, '0');
  return `${l}-${d.slice(0, 2)}-${d.slice(2)}`;
}

/** The next reference, inside the transaction that creates the case. */
export async function nextRef(c: PoolClient): Promise<string> {
  const n = Number((await c.query("select nextval('case_ref_seq') as n")).rows[0].n);
  return formatRef(n);
}

/** What an adviser types into search, tidied: "abc 12 1234" or "ABC121234" finds ABC-12-1234. */
export function normaliseRefSearch(q: string): string | null {
  const t = q.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = t.match(/^([A-Z]{3})(\d{2})(\d{4})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
