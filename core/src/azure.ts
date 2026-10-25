// Azure sign-in for services. Uses the web app's managed identity in Azure,
// the GitHub deploy identity in workflows, or `az login` on a developer machine.
// No keys: both AI resources have local (key) authentication disabled.

import { DefaultAzureCredential } from '@azure/identity';

let credential: DefaultAzureCredential | null = null;
export function azureCredential() {
  return (credential ??= new DefaultAzureCredential());
}

export async function cognitiveToken(): Promise<string> {
  const t = await azureCredential().getToken('https://cognitiveservices.azure.com/.default');
  if (!t) throw new Error('Could not get an Azure token for Cognitive Services.');
  return t.token;
}
