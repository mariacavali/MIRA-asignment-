import { publishedKnowledgeSnapshotSchema, type PublishedKnowledgeSnapshot } from "../../shared/miraKnowledgeRetrieval";
import { pineconeSeedPreviewSchema, type PineconeSeedPreview } from "../../shared/miraPinecone";
import { fullBookPassageReady, type KnowledgeItem } from "../../shared/miraKnowledge";
import { contentHash } from "./schema";

export type PineconeTarget = { host: string; namespace: string };
export const PINECONE_BATCH_SIZE = 32;
export type PineconeDocument = { _id: string; title: string; chunk_text: string; mira_scope: "published-expertise-v1";
  mira_corpus: string; mira_item: string; mira_version: number; mira_kind: "card" | "judgement" | "passage"; mira_item_hash: string;
  mira_segments: string[]; mira_language: string; mira_dimensions: string[]; mira_chunk: number };
export type PineconeSeedPlan = { preview: PineconeSeedPreview; documents: PineconeDocument[] };

export function pineconeTarget(env: NodeJS.ProcessEnv): PineconeTarget {
  const raw = env.PINECONE_INDEX_HOST?.trim();
  if (!raw) throw new Error("Pinecone index host is not configured.");
  const host = new URL(raw.includes("://") ? raw : `https://${raw}`);
  if (host.protocol !== "https:" || !host.hostname.endsWith(".pinecone.io") || !host.hostname.includes(".svc.")
    || host.username || host.password || host.search || host.hash || host.port || !["", "/"].includes(host.pathname)) {
    throw new Error("Use the HTTPS Pinecone index host.");
  }
  const namespace = env.PINECONE_NAMESPACE?.trim() || "mira-expertise";
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(namespace)) throw new Error("Use a dedicated shared-expertise namespace prefix.");
  return { host: host.origin, namespace };
}

// Splits at Unicode code points with a UTF-8 byte bound, without losing text.
// This conservative payload bound fits below the embedding model's 2048-token
// input window even for byte-heavy text; it is not a token/cost estimate.
export function splitEmbeddingText(text: string, limit = 1100): string[] {
  const chunks: string[] = []; let current = "", bytes = 0;
  for (const character of text) {
    const next = Buffer.byteLength(character, "utf8");
    if (bytes + next > limit && current) { chunks.push(current); current = ""; bytes = 0; }
    current += character; bytes += next;
  }
  if (current) chunks.push(current);
  return chunks;
}
function embeddingText(item: KnowledgeItem) {
  if (item.kind === "passage") return item.content;
  return item.kind === "card" ? [item.title, item.principle, "Use when:", ...item.useWhen, "Client evidence needed:", ...item.requiredClientEvidence,
    "Application:", ...item.application, "Limitations:", ...item.limitations].join("\n")
    : [item.title, "Illustrative editorial example:", item.situation, item.originalProposal, item.correction, item.betterResponse, item.explanation,
      "Limitations:", ...item.limitations].join("\n");
}
export function preparePineconeSeedPlan(raw: PublishedKnowledgeSnapshot, rawTarget: PineconeTarget): PineconeSeedPlan {
  const snapshot = publishedKnowledgeSnapshotSchema.parse(raw), target = pineconeTarget({ PINECONE_INDEX_HOST: rawTarget.host, PINECONE_NAMESPACE: rawTarget.namespace });
  const ordered = [...snapshot.items].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`, "en"));
  if (new Set(ordered.map(item => `${item.kind}:${item.id}`)).size !== ordered.length) throw new Error("Duplicate catalogue items cannot be seeded.");
  const corpus = { releaseId: snapshot.releaseId, hash: snapshot.hash, revision: snapshot.revision };
  // Every exact current published snapshot gets its own namespace. New release
  // or withdrawal means an explicit new seed; old namespaces never gain authority.
  // Editorial draft/review events also bump catalogue revision. They must not
  // change the active namespace when published content is unchanged.
  const corpusKey = contentHash({ releaseId: snapshot.releaseId, hash: snapshot.hash, items: ordered,
    sources: [...snapshot.sources].sort((a, b) => `${a.id}@${a.version}`.localeCompare(`${b.id}@${b.version}`, "en")) });
  const namespace = `${target.namespace}-${corpusKey.slice(0, 32)}`;
  const documents: PineconeDocument[] = [], items: PineconeSeedPreview["items"] = [];
  for (const item of ordered) {
    if (!fullBookPassageReady(item, snapshot.sources)) throw new Error("Full-book quality and coverage must be verified before seeding.");
    const citations = item.sourceRefs.map(ref => {
      const source = snapshot.sources.find(source => source.id === ref.id && source.version === ref.version && source.rightsBasis !== "pending" && source.rightsEvidence.trim());
      if (!source) throw new Error("Published source permission or citation is missing.");
      return { sourceId: source.id, sourceVersion: source.version, title: source.title, locator: ref.locator };
    });
    const itemHash = contentHash(item), chunks = splitEmbeddingText(embeddingText(item));
    if (chunks.length > 32) throw new Error("A knowledge item exceeds the seed chunk limit. Split it into smaller reviewed notes.");
    const prefix = splitEmbeddingText(item.title, 300)[0] + "\n";
    chunks.forEach((chunk, index) => documents.push({ _id: `mira-${contentHash({ kind: item.kind, id: item.id, version: item.version, itemHash, index })}`,
      title: item.title, chunk_text: prefix + chunk, mira_scope: "published-expertise-v1", mira_corpus: corpusKey,
      mira_item: item.id, mira_version: item.version, mira_kind: item.kind, mira_item_hash: itemHash,
      mira_segments: item.segments, mira_language: item.language, mira_dimensions: item.decisionDimensions, mira_chunk: index }));
    items.push({ id: item.id, version: item.version, kind: item.kind, title: item.title, records: chunks.length, citations });
  }
  const recordBytes = documents.reduce((total, document) => total + Buffer.byteLength(JSON.stringify(document)), 0);
  const metadata = { version: "mira-pinecone-seed-v1" as const, state: documents.length ? "ready_for_review" as const : "no_published_knowledge" as const,
    target: { host: target.host, namespace, apiVersion: "2026-07" as const, embeddingModel: "llama-text-embed-v2" as const, field: "chunk_text" as const },
    corpus, itemCount: items.length, recordCount: documents.length, batchCount: Math.ceil(documents.length / PINECONE_BATCH_SIZE), recordBytes, items, writesPerformed: 0 as const };
  return { preview: pineconeSeedPreviewSchema.parse({ ...metadata, fingerprint: contentHash({ ...metadata, documents }) }), documents };
}
