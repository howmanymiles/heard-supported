import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLetter } from '../src/lib/letters.ts';
import { mrTiming } from '@hs/core';

const base = { benefit: 'pip', ref: 'HS-2001', decisionDate: '2026-12-07', timing: mrTiming('2026-12-07', '2026-12-10'), lateReason: null, today: '2026-12-10', hasPaperBased: false };
const opts = { requestReport: true, holdForEvidence: true, authorityEnclosed: true, disputes: '' };

test('the acting-on-behalf letter raises the MR, asks for the PA4 and to wait for reasons', () => {
  const t = buildLetter('raise_mr', base, opts);
  assert.match(t, /I act on behalf of my client, who has given their consent for me to do so\. Their signed authority is enclosed\./);
  assert.match(t, /mandatory reconsideration of the decision dated 7 December 2026 on my client’s Personal Independence Payment claim\./);
  assert.match(t, /Full reasons and further evidence will follow\./);
  assert.match(t, /a copy of the health professional’s assessment report \(PA4\)/);
  assert.match(t, /Please do not make the reconsideration decision until/);
  assert.doesNotMatch(t, /late/);
});

test('options, disputes, late requests and UC reports are reflected', () => {
  const late = { ...base, benefit: 'uc-wca', hasPaperBased: true, timing: mrTiming('2026-12-07', '2027-02-01'), lateReason: 'the notice went to an old address' };
  const t = buildLetter('raise_mr', late, { requestReport: false, holdForEvidence: false, authorityEnclosed: false, disputes: 'mobilising and coping with change.' });
  assert.match(t, /It is late because the notice went to an old address\./);
  assert.match(t, /in particular on mobilising and coping with change\. Full reasons/);
  assert.doesNotMatch(t, /UC85|authority is enclosed|do not make the reconsideration/);
  const r = buildLetter('request_report', late, opts);
  assert.match(r, /a copy of the healthcare professional’s report \(UC85A\) used in the decision dated 7 December 2026/);
});
