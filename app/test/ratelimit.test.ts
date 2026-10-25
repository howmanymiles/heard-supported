import test from 'node:test';
import assert from 'node:assert/strict';
import { hit, clientIp, resetLimits } from '../src/lib/ratelimit.ts';
import { csp } from '../src/lib/csp.ts';

test('limits refuse once the count is passed, and reset after the window', () => {
  resetLimits();
  const t = 1_000_000;
  for (let i = 0; i < 3; i++) assert.equal(hit('k', 3, 60, t + i).ok, true);
  const r = hit('k', 3, 60, t + 10);
  assert.equal(r.ok, false); assert.ok(r.retryAfter > 0 && r.retryAfter <= 60);
  assert.equal(hit('other', 3, 60, t + 10).ok, true);
  assert.equal(hit('k', 3, 60, t + 61_000).ok, true);
});

test('the caller address is the one the front end added, not one the caller made up', () => {
  assert.equal(clientIp(new Headers({ 'x-forwarded-for': '1.2.3.4, 203.0.113.7' })), '203.0.113.7');
  assert.equal(clientIp(new Headers({})), 'unknown');
});

test('the production policy allows only nonce scripts', () => {
  const p = csp('abc', false);
  assert.match(p, /script-src 'self' 'nonce-abc' 'strict-dynamic';/);
  assert.doesNotMatch(p, /unsafe-eval|script-src[^;]*unsafe-inline/);
  assert.match(p, /frame-ancestors 'none'/);
  assert.match(p, /object-src 'none'/);
});
