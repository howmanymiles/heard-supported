// Email from Heard & Supported, through Azure Communication Services, signed in with the
// app's managed identity (no keys). Used only for invitations. If email isn't set up
// (EMAIL_ENDPOINT unset), callers fall back to showing a link to pass on.

import { esc } from './html.ts';

export type Mail = { to: string; subject: string; text: string; html: string };
type Sender = (m: Mail) => Promise<void>;

let send: Sender | null = null;
export function setSenderForTests(f: Sender | null) { send = f; }

export function emailEnabled() { return !!send || (!!process.env.EMAIL_ENDPOINT && !!process.env.EMAIL_FROM); }

async function azureSend(m: Mail) {
  const { EmailClient, KnownEmailSendStatus } = await import('@azure/communication-email');
  const { azureCredential } = await import('@hs/core');
  const client = new EmailClient(process.env.EMAIL_ENDPOINT!, azureCredential());
  const poller = await client.beginSend({
    senderAddress: process.env.EMAIL_FROM!,
    recipients: { to: [{ address: m.to }] },
    content: { subject: m.subject, plainText: m.text, html: m.html },
    replyTo: process.env.SUPPORT_EMAIL ? [{ address: process.env.SUPPORT_EMAIL }] : undefined,
  });
  const r = await poller.pollUntilDone();
  if (r.status !== KnownEmailSendStatus.Succeeded) throw new Error(`Email not sent (${r.status}).`);
}

export async function sendMail(m: Mail) {
  if (send) return send(m);
  if (!emailEnabled()) throw new Error('Email is not set up.');
  return azureSend(m);
}

export function inviteMail(p: { to: string; agency: string; inviter: string; role: string; link: string; days: number }): Mail {
  const support = process.env.SUPPORT_EMAIL;
  const text = [
    `${p.inviter} has invited you to join ${p.agency} on Heard & Supported, as ${p.role}.`,
    '',
    `Accept the invitation: ${p.link}`,
    '',
    `Sign in with your Microsoft work account for ${p.to}. The link works once, only for that address, and expires in ${p.days} days.`,
    '',
    'If you weren’t expecting this, ignore it: nothing happens unless the link is used.',
    ...(support ? ['', `Questions: ${support}`] : []),
  ].join('\n');
  const html = `<!doctype html><html lang="en-GB"><body style="font:16px/1.5 system-ui,sans-serif;color:#1b1b1b;max-width:560px">
<p>${esc(p.inviter)} has invited you to join <b>${esc(p.agency)}</b> on Heard &amp; Supported, as ${esc(p.role)}.</p>
<p><a href="${esc(p.link)}" style="display:inline-block;background:#1f4e79;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Accept the invitation</a></p>
<p>Sign in with your Microsoft work account for <b>${esc(p.to)}</b>. The link works once, only for that address, and expires in ${p.days} days.</p>
<p style="color:#555">If you weren’t expecting this, ignore it: nothing happens unless the link is used.${support ? ` Questions: <a href="mailto:${esc(support)}">${esc(support)}</a>` : ''}</p>
</body></html>`;
  return { to: p.to, subject: `You’re invited to ${p.agency} on Heard & Supported`, text, html };
}
