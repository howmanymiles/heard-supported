import test from 'node:test';
import assert from 'node:assert/strict';
import { inviteMail } from '../src/lib/email.ts';

test('invitation email says who, where, and how long the link lasts, and escapes names', () => {
  const m = inviteMail({ to: 'a@agency.org', agency: 'Govan <Advice>', inviter: 'Pat', role: 'an adviser', link: 'https://x/invite/abc', days: 7 });
  assert.match(m.subject, /Govan <Advice> on Heard & Supported/);
  assert.match(m.text, /Pat has invited you to join Govan <Advice>/);
  assert.match(m.text, /expires in 7 days/);
  assert.ok(m.html.includes('Govan &lt;Advice&gt;') && !m.html.includes('<Advice>'));
  assert.ok(m.html.includes('href="https://x/invite/abc"'));
});
