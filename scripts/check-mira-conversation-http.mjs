import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const work = resolve('../brands/mira/work/2026-11_conversation-and-library');
const root = resolve('.mira-local-data/pinecone-conversation');
const base = 'http://127.0.0.1:5188';
let approvalExists = false; try { await access(join(root, 'generation-approval.json')); approvalExists = true; } catch {}
if (approvalExists) throw new Error('Do not run a missing-approval check after granting an allowance.');
const page = await fetch(base), html = await page.text();
const cookie = page.headers.get('set-cookie')?.split(';')[0];
if (!page.ok || !cookie || !html.includes('MIRA conversation test')) throw new Error('Local test page unavailable.');
const options = { headers: { cookie } };
const before = await (await fetch(base + '/api/status', options)).json();
const expected = JSON.parse(await readFile(resolve('../brands/mira/work/2026-11_pinecone-readiness/execution-result.json'), 'utf8'));
if (before.binding.releaseId !== expected.releaseId || before.binding.namespace !== expected.namespace || before.generation.approved
  || before.generation.requests || before.turns.length) throw new Error('Unexpected test binding or paid state.');
const denied = await fetch(base + '/api/turn', { method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ turn: 0 }) });
if (denied.status !== 409) throw new Error('Missing generation approval was not rejected.');
const after = await (await fetch(base + '/api/status', options)).json();
if (after.generation.requests || after.generation.pineconeReads || after.turns.length) throw new Error('Rejected turn consumed provider work.');
if (after.generation.blocker !== 'generation_approval_missing') throw new Error('The exact approval blocker is not reported.');
const transcript = await (await fetch(base + '/api/transcript.json', options)).json();
const transcriptText = await (await fetch(base + '/api/transcript.md', options)).text();
if (transcript.successfulReplies !== 0 || transcript.complete || transcript.mock || !transcriptText.includes(expected.releaseId)
  || transcript.binding.namespace !== expected.namespace) throw new Error('Pending transcript export is inaccurate.');
const books = await fetch(base + '/book-checklist'), bookHtml = await books.text();
if (!books.ok || (bookHtml.match(/Separate held version:/g) || []).length !== 10) throw new Error('Ten-book checklist link is incomplete.');
const result = { at: new Date().toISOString(), pageHttp: page.status, bookChecklistHttp: books.status,
  exactReleaseId: after.binding.releaseId, exactNamespace: after.binding.namespace, bindingVerified: true,
  missingGenerationApprovalRejectedHttp: denied.status, generationRequests: 0, pineconeSearchRequests: 0,
  successfullyGeneratedConversations: 0, realConversationCompletedTurns: 0, checklistTitles: 10 };
result.exactRemainingBlocker = after.generation.blocker;
result.transcriptExportsVerified = true;
await writeFile(join(work, 'http-verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
