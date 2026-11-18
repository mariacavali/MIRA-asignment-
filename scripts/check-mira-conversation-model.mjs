import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'dotenv';
import { resolve } from 'node:path';
const env = parse(await readFile(resolve('.env'), 'utf8'));
const model = 'gpt-5-mini-2025-08-07';
const result = { at: new Date().toISOString(), model, method: 'GET', generationRequests: 0, exactModelAccessible: false };
try {
  const response = await fetch(`https://api.openai.com/v1/models/${model}`, { method: 'GET',
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY || ''}` }, redirect: 'error', signal: AbortSignal.timeout(20000) });
  const data = await response.json().catch(() => null);
  result.httpStatus = response.status;
  result.exactModelAccessible = response.ok && data?.id === model;
} catch { result.transportFailure = true; }
await writeFile(resolve('../brands/mira/work/2026-11_conversation-and-library/model-access-check.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
if (!result.exactModelAccessible) process.exitCode = 1;
