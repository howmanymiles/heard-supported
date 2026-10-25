// Session limits and the multi-factor sign-in check, kept apart from next-auth so they can be tested.

/** Sessions end after 8 hours, or after 30 minutes with nothing done. */
export const SESSION_MAX_SECONDS = 8 * 60 * 60;
export const IDLE_SECONDS = 30 * 60;

/**
 * Real client data needs multi-factor sign-in. Microsoft reports how the person signed in
 * in the token's `amr` claim; 'mfa' (or a second factor such as 'otp', 'fido', 'ngcmfa')
 * means more than a password. Off in the fictional-data environment unless REQUIRE_MFA=1,
 * so testing can check what the claim says before it is enforced.
 */
export function mfaRequired() {
  return process.env.DATA_MODE !== 'synthetic-only' || process.env.REQUIRE_MFA === '1';
}
const SECOND_FACTORS = new Set(['mfa', 'otp', 'fido', 'ngcmfa', 'hwk', 'sms', 'tel', 'face', 'fpt']);
export function usedMfa(profile: unknown): boolean {
  const amr = (profile as { amr?: unknown } | null)?.amr;
  return Array.isArray(amr) && amr.some(m => SECOND_FACTORS.has(String(m).toLowerCase()));
}

/** Whether a session may carry on: 'expired', 'touch' (carry on and record activity) or 'ok'. */
export function sessionState(signedInAt: number, lastActive: Date | string | null, now = Date.now() / 1000): 'expired' | 'touch' | 'ok' {
  if (!signedInAt || now - signedInAt > SESSION_MAX_SECONDS) return 'expired';
  const last = lastActive ? new Date(lastActive).getTime() / 1000 : 0;
  if (last && now - last > IDLE_SECONDS) return 'expired';
  return !last || now - last > 60 ? 'touch' : 'ok';
}
