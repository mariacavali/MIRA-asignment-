import { readFile, mkdir, writeFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { knowledgeBundleSchema } from "../shared/miraKnowledge";
import { contentHash, entryKey } from "../server/miraKnowledge/schema";
import { labVersionSchema, eligibility, SCENARIOS, protocol, protocolHash, paidProposal, type LabVersion } from "../server/miraKnowledgeLab/core";

const root = resolve(".mira-local-data/knowledge-lab"), notes = resolve("../brands/mira/work/2026-11_notes-knowledge"), sample = resolve("../brands/mira/work/2026-11_chapter-study-sample/revision-v2");
await mkdir(root, { recursive: true, mode: 0o700 });
const registryPath = join(root, "registry.json");
try { await access(registryPath); console.log("Existing versioned lab registry preserved; no overwrite."); process.exit(0); } catch {}
const raw = JSON.parse(await readFile(join(notes, "candidate-bundle.json"), "utf8"));
const sourceIds = new Set(["mira-original-method-notes", "mira-original-question-notes"]);
const sources = raw.sources.filter((s: { id: string }) => sourceIds.has(s.id));
const items = raw.items.filter((i: { sourceRefs: { id: string }[] }) => i.sourceRefs.length && i.sourceRefs.every(ref => sourceIds.has(ref.id)));
const own = knowledgeBundleSchema.parse({ formatVersion: 1, sources, items });
if (own.sources.length !== 2 || own.items.length !== 6 || own.items.some(i => i.authorship !== "original")) throw new Error("Unexpected original-method source scope");
const scope = JSON.parse(await readFile(join(notes, "source-scope-review.json"), "utf8"));
const bindings = [];
for (const source of own.sources) {
  const record = scope.sourceRecords.find((r: { sourceId: string }) => r.sourceId === source.id);
  const path = join(notes, "sources", source.id + ".md"), hash = createHash("sha256").update(await readFile(path)).digest("hex");
  if (!record || record.artifactSha256 !== hash || source.rightsBasis !== "original") throw new Error("Original artifact identity no longer matches its reviewed scope");
  bindings.push({ path, sha256: hash });
}
const evaluationCaseIds = SCENARIOS.map(s => `local-${s.id}-v${s.version}`);
const at = new Date().toISOString();
function version(id: string, label: string, bundle: typeof own | null, parent: string | null): LabVersion {
  const reviews: LabVersion["reviews"] = {}, reviewedEntryHashes: Record<string, string> = {};
  if (bundle) for (const { kind, value } of [...bundle.sources.map(value => ({ kind: "source" as const, value })), ...bundle.items.map(value => ({ kind: value.kind, value }))]) {
    const key = entryKey(kind, value); reviewedEntryHashes[key] = contentHash(value);
    reviews[key] = { actorUserId: 1, reviewer: "Codex — original MIRA material, scoped isolated-test review", at, approved: true,
      reason: "Read against the saved MIRA-owned method/question artifacts and retained limitations. Maria explicitly authorised this isolated testing workflow with permitted original MIRA content. This review covers these exact new original entries only, not an input book, excerpt, publisher artwork, real client evidence, publication or spending.", evaluationCaseIds: kind === "source" ? [] : evaluationCaseIds };
  }
  return labVersionSchema.parse({ id, version: 1, label, parent, processing: ["local", "openai"], blockedReason: null, bundle, reviews, reviewedEntryHashes, evaluationCaseIds, artifactBindings: bundle ? bindings.filter(b => bundle.sources.some(s => b.path.endsWith(s.id + ".md"))) : [], notes: "Unpublished local test. Original MIRA method entries only; no whole-book or source-clearance claim. External answers separately need bounded spending approval." });
}
const question = knowledgeBundleSchema.parse({ formatVersion: 1, sources: own.sources.filter(s => s.id === "mira-original-question-notes"), items: own.items.filter(i => i.sourceRefs.every(s => s.id === "mira-original-question-notes")) });
const holtPath = join(sample, "retrieval-chunks.local.json");
const blocked = labVersionSchema.parse({ id: "b-holt-ch2", version: 2, label: "B · Holt Chapter 2 reviewed notes (blocked)", parent: "a-baseline", processing: [], blockedReason: "No applicable clearance recorded for processing the Holt source-derived chapter notes. Format/item review also remains pending. Excluding the five unresolved units does not clear the remaining source. No test flag can override these requirements.", bundle: null, reviews: {}, reviewedEntryHashes: {}, evaluationCaseIds: [], artifactBindings: [{ path: holtPath, sha256: createHash("sha256").update(await readFile(holtPath)).digest("hex") }], notes: "Metadata-only blocked slot. No Holt passage is loaded into retrieval or a model prompt. A future eligible exact version requires source evidence, reviews, evaluation IDs and binding hashes through the same checks." });
const versions = [version("a-baseline", "A · Baseline — no retrieval", null, null), blocked, version("c1-mira-questions", "C1 · MIRA opening-question guide", question, "a-baseline"), version("c2-mira-method", "C2 · Add MIRA original method", own, "c1-mira-questions")];
for (const v of versions.filter(v => !v.blockedReason)) if (eligibility(v, "local").length) throw new Error("Unexpected test eligibility failure");
await writeFile(registryPath, JSON.stringify({ format: "mira-isolated-knowledge-lab-v1", createdAt: at, authority: "Current explicit user authorisation for isolated testing; no Pinecone publication or paid calls", versions, withdrawnKeys: [] }, null, 2) + "\n", { mode: 0o600, flag: "wx" });
await mkdir(join(root, "protocols"), { recursive: true, mode: 0o700 });
await writeFile(join(root, "protocols", protocolHash + ".json"), JSON.stringify({ ...protocol, protocolHash, scenarios: SCENARIOS, paidProposal }, null, 2), { mode: 0o600, flag: "wx" });
console.log(JSON.stringify({ registry: registryPath, versions: versions.map(v => ({ id: v.id, version: v.version, items: v.bundle?.items.length ?? 0, blocked: !!v.blockedReason })), protocolHash, published: false, providerCalls: 0 }));
