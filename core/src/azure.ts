// Azure sign-in for services. Uses the web app's managed identity in Azure,
// the GitHub deploy identity in workflows, or `az login` on a developer machine.
// No keys: both AI resources have local (key) authentication disabled.

import { DefaultAzureCredential, ManagedIdentityCredential, type TokenCredential } from '@azure/identity';

let credential: TokenCredential | null = null;
/** In Azure, only the app's own managed identity; elsewhere the usual developer chain. */
export function azureCredential(): TokenCredential {
  const inAzure = !!process.env.IDENTITY_ENDPOINT && !!process.env.AZURE_CLIENT_ID;
  return (credential ??= inAzure ? new ManagedIdentityCredential({ clientId: process.env.AZURE_CLIENT_ID! }) : new DefaultAzureCredential());
}

export async function cognitiveToken(): Promise<string> {
  const t = await azureCredential().getToken('https://cognitiveservices.azure.com/.default');
  if (!t) throw new Error('Could not get an Azure token for Cognitive Services.');
  return t.token;
}
