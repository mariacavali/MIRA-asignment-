import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parse } from 'dotenv';
import { Pinecone } from '@pinecone-database/pinecone';

const work = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('Pass the exact prepared work directory.');
const path = join(work, 'pinecone-account-preflight.json');
const preflight = JSON.parse(await readFile(path, 'utf8'));
const env = parse(await readFile(resolve('.env'), 'utf8'));
let requests = 0;
const fetchApi = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (requests || url.origin !== 'https://api.pinecone.io' || url.pathname !== '/indexes/mira-expertise'
    || (init?.method ?? 'GET') !== 'GET') throw new Error('Unexpected control-plane operation.');
  requests++;
  return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(10000) });
};
try {
  const index = await new Pinecone({ apiKey: env.PINECONE_API_KEY, maxRetries: 0, fetchApi }).indexes.describe('mira-expertise');
  const host = index.host.startsWith('https://') ? index.host : `https://${index.host}`;
  const field = index.schema?.fields?.chunk_text;
  if (host !== preflight.index.host || !index.status?.ready || field?.embed?.model !== 'llama-text-embed-v2'
    || field.embed.dimension !== 1024 || field.embed.metric !== 'cosine') throw new Error('The expected index configuration changed.');
  preflight.controlPlaneCheck = { at: new Date().toISOString(), success: true, requests, hostMatchesConfigured: true,
    ready: true, model: field.embed.model, dimensions: field.embed.dimension, metric: field.embed.metric,
    storeText: field.storeText, spec: index.spec, queryOrEmbeddingRequests: 0, writes: 0 };
  await writeFile(path, JSON.stringify(preflight, null, 2) + '\n');
  console.log(JSON.stringify(preflight.controlPlaneCheck));
} catch {
  console.error(JSON.stringify({ success: false, attemptedControlPlaneRequests: requests,
    message: 'Read-only Pinecone metadata check failed. No key or provider error body was retained; no retries, search, embedding or writes occurred.' }));
  process.exitCode = 1;
}
