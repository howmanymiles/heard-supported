import { BlobServiceClient } from '@azure/storage-blob';
import { azureCredential } from '@hs/core';

function container() {
  const account = process.env.STORAGE_ACCOUNT;
  if (!account) throw new Error('STORAGE_ACCOUNT is not set.');
  return new BlobServiceClient(`https://${account}.blob.core.windows.net`, azureCredential()).getContainerClient(process.env.STORAGE_CONTAINER ?? 'documents');
}

export async function putDocument(path: string, bytes: Uint8Array, contentType: string) {
  await container().getBlockBlobClient(path).uploadData(bytes, { blobHTTPHeaders: { blobContentType: contentType } });
}

export async function getDocument(path: string): Promise<Buffer> {
  return container().getBlockBlobClient(path).downloadToBuffer();
}

export async function deleteDocument(path: string) {
  await container().getBlockBlobClient(path).deleteIfExists();
}
