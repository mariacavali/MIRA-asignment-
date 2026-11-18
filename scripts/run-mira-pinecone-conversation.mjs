import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

// Runs the prepared conversation through the SAME authenticated HTTP endpoint
// used by the existing page. Each failed request ends the run; no retries.
const work = resolve('../brands/mira/work/2026-11_conversation-and-library');
const proposal = JSON.parse(await readFile(join(work, 'conversation-proposal.json'), 'utf8'));
const turnsToRun = proposal.messages.length;
const artifactPrefix = proposal.scope === 'mira-reply-support-guard-live-retest-v1' ? 'live-quality-retest' : 'conversation';
const base = 'http://127.0.0.1:5188';
const page = await fetch(base);
const cookie = page.headers.get('set-cookie')?.split(';')[0];
if (!page.ok || !cookie) throw new Error('The existing conversation page is unavailable.');
const options = { headers: { cookie } };
let state = await (await fetch(base + '/api/status', options)).json();
if (state.proposal.proposalHash !== proposal.proposalHash || state.binding.releaseId !== proposal.releaseId
  || state.binding.namespace !== proposal.namespace || !state.generation.approved) throw new Error('Exact prepared conversation and active spending approval required.');
while (state.nextTurn < turnsToRun && state.generation.approved && !state.generation.stopped) {
  const turn = state.nextTurn;
  const response = await fetch(base + '/api/turn', { method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ turn }), signal: AbortSignal.timeout(90000) });
  const result = await response.json();
  if (!response.ok) {
    console.error(JSON.stringify({ turn: turn + 1, httpStatus: response.status, error: result.error, automaticRetry: false }));
    process.exitCode = 1;
    break;
  }
  state = result;
  const completed = state.turns.at(-1);
  console.log(JSON.stringify({ turn: turn + 1, saved: true, releaseId: completed?.result?.knowledgeTrace?.releaseId,
    knowledge: completed?.result?.knowledgeTrace?.selected, response: completed?.result?.response }));
}
const transcriptResponse = await fetch(base + '/api/transcript.json', options);
const transcript = await transcriptResponse.json();
const textResponse = await fetch(base + '/api/transcript.md', options);
const markdown = await textResponse.text();
if (!transcriptResponse.ok || !textResponse.ok) throw new Error('Saved transcript export could not be verified.');
await writeFile(join(work, `${artifactPrefix}-transcript.json`), JSON.stringify(transcript, null, 2) + '\n', { mode: 0o600 });
await writeFile(join(work, `${artifactPrefix}-transcript.md`), markdown, { mode: 0o600 });
const final = await (await fetch(base + '/api/status', options)).json();
const reloaded = await (await fetch(base + '/api/transcript.json', options)).json();
if (reloaded.successfulReplies !== transcript.successfulReplies || JSON.stringify(reloaded.turns) !== JSON.stringify(transcript.turns)) throw new Error('Transcript reload did not match saved SQL turns.');
const verification = { at: new Date().toISOString(), releaseId: final.binding.releaseId, namespace: final.binding.namespace,
  completedReplies: reloaded.successfulReplies, complete: reloaded.complete, mock: false, transcriptReloadMatched: true,
  generationAttempts: final.generation.requests, pineconeSearches: final.generation.pineconeReads,
  tokenDerivedUsd: final.generation.tokenDerivedUsd, stopped: final.generation.stopped,
  additionalUploads: 0, automaticRetries: 0 };
await writeFile(join(work, `${artifactPrefix}-execution.json`), JSON.stringify(verification, null, 2) + '\n');
console.log(JSON.stringify(verification));
if (!verification.complete) process.exitCode = 1;
