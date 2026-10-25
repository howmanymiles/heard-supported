// The one internal interface to the AI model, so the model can be changed
// without touching the rest of the product. Currently: an Azure OpenAI-style
// chat deployment in Azure AI Foundry, called with Entra ID (no keys).

import { cognitiveToken } from './azure.ts';

export type ChatMessage = { role: 'system' | 'user'; content: string };

// Tests point AI_ENDPOINT at a local stub and swap the Entra token for a dummy.
let tokenProvider: () => Promise<string> = cognitiveToken;
export function setTokenProviderForTests(fn: () => Promise<string>) { tokenProvider = fn; }

export async function chatJson<T>(messages: ChatMessage[], opts: { endpoint?: string; deployment?: string } = {}): Promise<{ data: T; model: string }> {
  const endpoint = (opts.endpoint ?? process.env.AI_ENDPOINT ?? '').replace(/\/$/, '');
  const deployment = opts.deployment ?? process.env.AI_DEPLOYMENT;
  if (!endpoint || !deployment) throw new Error('AI_ENDPOINT and AI_DEPLOYMENT must be set.');
  const apiVersion = process.env.AI_API_VERSION ?? '2025-04-01-preview';
  const body: Record<string, unknown> = { messages, response_format: { type: 'json_object' } };
  if (process.env.AI_TEMPERATURE) body.temperature = Number(process.env.AI_TEMPERATURE);

  let last = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await tokenProvider()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.status === 429 || r.status >= 500) {
      last = `HTTP ${r.status}`;
      await new Promise(res => setTimeout(res, 2000 * 2 ** attempt));
      continue;
    }
    if (!r.ok) throw new Error(`AI model call failed (HTTP ${r.status}): ${(await r.text()).slice(0, 300)}`);
    const j = await r.json() as { model?: string; choices: Array<{ message: { content: string } }> };
    const text = j.choices?.[0]?.message?.content ?? '';
    try {
      return { data: JSON.parse(text) as T, model: j.model ?? deployment };
    } catch {
      throw new Error('AI model returned something that is not valid JSON.');
    }
  }
  throw new Error(`AI model unavailable after retries (${last}).`);
}
