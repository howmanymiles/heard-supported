import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionState, usedMfa, mfaRequired, IDLE_SECONDS, SESSION_MAX_SECONDS } from '../src/lib/session.ts';

const now = 1_800_000_000;
const at = (secsAgo: number) => new Date((now - secsAgo) * 1000);

test('sessions end after 8 hours, however active', () => {
  assert.equal(sessionState(now - SESSION_MAX_SECONDS - 1, at(5), now), 'expired');
  assert.equal(sessionState(now - SESSION_MAX_SECONDS + 100, at(5), now), 'ok');
});

test('sessions end after 30 minutes without activity', () => {
  assert.equal(sessionState(now - 3600, at(IDLE_SECONDS + 1), now), 'expired');
  assert.equal(sessionState(now - 3600, at(IDLE_SECONDS - 1), now), 'touch');
  assert.equal(sessionState(now - 3600, at(30), now), 'ok');
});

test('a session with no sign-in time is not trusted', () => {
  assert.equal(sessionState(0, at(5), now), 'expired');
});

test('a second sign-in step is recognised from the amr claim', () => {
  assert.equal(usedMfa({ amr: ['pwd', 'mfa'] }), true);
  assert.equal(usedMfa({ amr: ['pwd', 'otp'] }), true);
  assert.equal(usedMfa({ amr: ['pwd'] }), false);
  assert.equal(usedMfa({}), false);
  assert.equal(usedMfa(null), false);
});

test('MFA is required whenever real data is allowed', () => {
  const was = { ...process.env };
  try {
    process.env.DATA_MODE = 'live'; delete process.env.REQUIRE_MFA;
    assert.equal(mfaRequired(), true);
    process.env.REQUIRE_MFA = '0';
    assert.equal(mfaRequired(), true);              // cannot be switched off with real data
    process.env.DATA_MODE = 'synthetic-only'; delete process.env.REQUIRE_MFA;
    assert.equal(mfaRequired(), false);
    process.env.REQUIRE_MFA = '1';
    assert.equal(mfaRequired(), true);
  } finally { process.env.DATA_MODE = was.DATA_MODE; if (was.REQUIRE_MFA === undefined) delete process.env.REQUIRE_MFA; else process.env.REQUIRE_MFA = was.REQUIRE_MFA; }
});
