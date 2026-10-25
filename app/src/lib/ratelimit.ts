// Simple limits on how often something can be done, to slow down misuse: guessing
// invitation links, mass sign-ups, or running up AI costs. Counts are kept in memory,
// which is exact while the app runs as one replica (maxReplicas is 1 in infra/main.bicep);
// with more replicas, move them to Postgres or Redis.

type Bucket = { start: number; count: number };
const buckets = new Map<string, Bucket>();

export class RateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number, message?: string) {
    super(message ?? `Too many attempts. Try again in ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} minute${retryAfterSeconds > 60 ? 's' : ''}.`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Count one use of `key`; refuse once `limit` uses fall inside `windowSeconds`. */
export function hit(key: string, limit: number, windowSeconds: number, now = Date.now()): { ok: boolean; retryAfter: number } {
  const w = windowSeconds * 1000;
  let b = buckets.get(key);
  if (!b || now - b.start >= w) { b = { start: now, count: 0 }; buckets.set(key, b); }
  b.count++;
  if (buckets.size > 50_000) sweep(now);
  return b.count <= limit ? { ok: true, retryAfter: 0 } : { ok: false, retryAfter: Math.ceil((b.start + w - now) / 1000) };
}

export function limit(key: string, max: number, windowSeconds: number, message?: string) {
  const r = hit(key, max, windowSeconds);
  if (!r.ok) throw new RateLimitError(r.retryAfter, message);
}

function sweep(now: number) {
  for (const [k, b] of buckets) if (now - b.start > 24 * 3600 * 1000) buckets.delete(k);
}

export function resetLimits() { buckets.clear(); }

/**
 * The caller's address. The Container Apps front end adds it as the last entry of
 * X-Forwarded-For; earlier entries come from the caller and could be made up.
 */
export function clientIp(h: Headers): string {
  const hops = (h.get('x-forwarded-for') ?? '').split(',').map(x => x.trim()).filter(Boolean);
  return hops[hops.length - 1] || h.get('x-real-ip') || 'unknown';
}

/** The limits in one place. */
export const LIMITS = {
  aiPerUser: { max: 40, window: 60 * 60 },            // AI steps per adviser per hour
  aiPerAgency: { max: 400, window: 24 * 60 * 60 },    // per agency per day
  signupPerIp: { max: 5, window: 60 * 60 },
  invitePerIp: { max: 20, window: 60 * 60 },
  signInPerIp: { max: 30, window: 10 * 60 },
} as const;
