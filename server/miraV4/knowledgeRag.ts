import { z } from "zod";
import manuscript from "./data/mira_knowledge_objects_v1.json";
import { ENV } from "../_core/env";

const sourceRecordSchema = z.object({
  sourceTitle: z.string().trim().min(1),
  sourceUrl: z.string().url(),
  sourceType: z.string().trim().min(1),
  sourceDate: z.string().trim().min(4),
});

export const knowledgeObjectSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  principle: z.string().trim().min(1),
  category: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  visualImplications: z.array(z.string().trim().min(1)).min(1),
  applicableWhen: z.array(z.string().trim().min(1)),
  exclusions: z.array(z.string().trim().min(1)),
  tags: z.array(z.string().trim().min(1)),
  confidence: z.number().min(0).max(1),
  sourceTitle: z.string().trim().min(1),
  sourceUrl: z.string().url(),
  sourceType: z.enum(["book", "article", "research", "mira_editorial"]),
  sourceDate: z.string().trim().min(4),
  sourceVersion: z.string().trim().min(1),
  status: z.enum(["draft", "approved", "archived"]),
  reviewed: z.boolean(),
  corpusVersion: z.string().trim().min(1),
  publicationState: z.enum(["research_curated_development", "maria_editorially_approved"]),
  originalSourceType: z.string().trim().min(1),
  sources: z.array(sourceRecordSchema).min(1),
  reviewNotes: z.string(),
  evidenceUse: z.literal("supporting_intelligence_only"),
});

export type MiraKnowledgeObject = z.infer<typeof knowledgeObjectSchema>;
export type MiraRetrievedKnowledge = {
  knowledgeObjectId: string;
  title: string;
  category: string;
  principle: string;
  visualImplications: string[];
  confidence: number;
  retrievalScore: number;
  source: {
    title: string; url: string; type: string; originalType: string; date: string; version: string;
    corpusVersion: string; publicationState: MiraKnowledgeObject["publicationState"]; allSources: MiraKnowledgeObject["sources"];
  };
};

export type MiraEmbeddingProvider = { id: string; model: string; embed(input: string[]): Promise<number[][]> };
export type MiraHybridRetrievalResult = { status: "semantic" | "lexical_fallback"; results: MiraRetrievedKnowledge[]; fallbackReason: string | null };

const manuscriptKnowledgeObjectSchema = z.object({
  id: z.string().trim().min(1), title: z.string().trim().min(1), principle: z.string().trim().min(1),
  category: z.string().trim().min(1), summary: z.string().trim().min(1),
  visualImplications: z.union([z.string().trim().min(1), z.array(z.string().trim().min(1)).min(1)]),
  applicableWhen: z.union([z.string().trim().min(1), z.array(z.string().trim().min(1))]),
  exclusions: z.union([z.string().trim().min(1), z.array(z.string().trim().min(1))]),
  tags: z.array(z.string().trim().min(1)), confidence: z.enum(["high", "medium", "low"]),
  sourceTitle: z.string().trim().min(1), sourceUrl: z.string().url(), sourceType: z.string().trim().min(1),
  sourceDate: z.string().trim().min(4), sources: z.array(sourceRecordSchema).min(1), sourceVersion: z.string().trim().min(1),
  status: z.enum(["draft", "approved", "archived"]), reviewed: z.boolean(), reviewNotes: z.string(),
  evidenceUse: z.literal("supporting_intelligence_only"),
});

const asList = (value: string | string[]) => Array.isArray(value) ? value : [value];
const normalizedSourceType = (value: string): MiraKnowledgeObject["sourceType"] => {
  if (value === "book") return "book";
  if (value === "professional-source") return "article";
  return "research";
};

export function mapManusKnowledgeObject(value: unknown): MiraKnowledgeObject {
  const raw = manuscriptKnowledgeObjectSchema.parse(value);
  return knowledgeObjectSchema.parse({
    ...raw,
    visualImplications: asList(raw.visualImplications), applicableWhen: asList(raw.applicableWhen), exclusions: asList(raw.exclusions),
    confidence: raw.confidence === "high" ? 0.9 : raw.confidence === "medium" ? 0.7 : 0.4,
    sourceType: normalizedSourceType(raw.sourceType), originalSourceType: raw.sourceType,
    corpusVersion: "mira_knowledge_objects_v1", publicationState: "research_curated_development",
  });
}

export const MIRA_KNOWLEDGE_OBJECTS: MiraKnowledgeObject[] = (manuscript as unknown[]).map(mapManusKnowledgeObject);

export function indexApprovedKnowledge(input: unknown[]): MiraKnowledgeObject[] {
  return input.flatMap(item => {
    const parsed = knowledgeObjectSchema.safeParse(item);
    return parsed.success && parsed.data.status === "approved" && parsed.data.reviewed ? [parsed.data] : [];
  });
}

function tokens(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

function searchableKnowledgeText(object: MiraKnowledgeObject) {
  return [object.title, object.principle, object.summary, ...object.visualImplications, ...object.applicableWhen, ...object.exclusions, ...object.tags].join(" ");
}

function lexicalScore(queryTokens: Set<string>, object: MiraKnowledgeObject) {
  const objectTokens = tokens(searchableKnowledgeText(object));
  const overlap = Array.from(queryTokens).filter(token => objectTokens.has(token)).length;
  return queryTokens.size ? overlap / Math.sqrt(queryTokens.size * Math.max(1, objectTokens.size)) : 0;
}

export function retrieveMiraKnowledge(params: { query: string; objects: MiraKnowledgeObject[]; topK?: number }): MiraRetrievedKnowledge[] {
  const queryTokens = tokens(params.query);
  const scored = indexApprovedKnowledge(params.objects).map(object => {
    const retrievalScore = lexicalScore(queryTokens, object);
    return { object, retrievalScore };
  }).filter(item => item.retrievalScore > 0)
    .sort((a, b) => b.retrievalScore - a.retrievalScore || a.object.id.localeCompare(b.object.id));

  const selected: typeof scored = [];
  const categories = new Set<string>();
  for (const item of scored) {
    if (selected.length >= (params.topK ?? 3)) break;
    if (categories.has(item.object.category) && scored.some(candidate => !categories.has(candidate.object.category))) continue;
    selected.push(item);
    categories.add(item.object.category);
  }
  return selected.map(({ object, retrievalScore }) => ({
    knowledgeObjectId: object.id, title: object.title, category: object.category,
    principle: object.principle, visualImplications: object.visualImplications,
    confidence: object.confidence, retrievalScore: Number(retrievalScore.toFixed(4)),
    source: {
      title: object.sourceTitle, url: object.sourceUrl, type: object.sourceType, originalType: object.originalSourceType,
      date: object.sourceDate, version: object.sourceVersion, corpusVersion: object.corpusVersion,
      publicationState: object.publicationState, allSources: object.sources,
    },
  }));
}

export function createConfiguredEmbeddingProvider(config: { apiKey?: string; baseUrl?: string; model?: string; fetchImpl?: typeof fetch } = {}): MiraEmbeddingProvider | null {
  const apiKey = config.apiKey?.trim();
  if (!apiKey) return null;
  const baseUrl = (config.baseUrl?.trim() || "https://api.openai.com").replace(/\/$/, "");
  const model = config.model?.trim() || "text-embedding-3-small";
  const fetchImpl = config.fetchImpl ?? fetch;
  return { id: `openai-compatible:${baseUrl}`, model, async embed(input) {
    const response = await fetchImpl(`${baseUrl}/v1/embeddings`, {
      method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model, input }), signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Embedding provider returned ${response.status}`);
    const payload = await response.json() as { data?: Array<{ index: number; embedding: number[] }> };
    const vectors = (payload.data ?? []).sort((a, b) => a.index - b.index).map(item => item.embedding);
    if (vectors.length !== input.length || vectors.some(vector => !Array.isArray(vector) || vector.length === 0)) throw new Error("Embedding provider returned invalid vectors");
    return vectors;
  } };
}

export const CONFIGURED_MIRA_EMBEDDING_PROVIDER = process.env.NODE_ENV === "test"
  ? null
  : createConfiguredEmbeddingProvider({ apiKey: ENV.embeddingApiKey, baseUrl: ENV.embeddingApiBaseUrl, model: ENV.embeddingModel });

function cosineSimilarity(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0; let normA = 0; let normB = 0;
  for (let index = 0; index < a.length; index += 1) { dot += a[index]! * b[index]!; normA += a[index]! ** 2; normB += b[index]! ** 2; }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}

const semanticIndexCache = new Map<string, Promise<{ objects: MiraKnowledgeObject[]; vectors: number[][] }>>();

async function prepareSemanticIndex(objects: MiraKnowledgeObject[], provider: MiraEmbeddingProvider) {
  const approved = indexApprovedKnowledge(objects);
  const key = `${provider.id}:${provider.model}:${approved.map(item => `${item.id}@${item.sourceVersion}`).join("|")}`;
  let pending = semanticIndexCache.get(key);
  if (!pending) { pending = provider.embed(approved.map(searchableKnowledgeText)).then(vectors => ({ objects: approved, vectors })); semanticIndexCache.set(key, pending); }
  try { return await pending; } catch (error) { semanticIndexCache.delete(key); throw error; }
}

export async function retrieveMiraKnowledgeHybrid(params: { query: string; objects: MiraKnowledgeObject[]; topK?: number; provider?: MiraEmbeddingProvider | null }): Promise<MiraHybridRetrievalResult> {
  const provider = params.provider === undefined ? CONFIGURED_MIRA_EMBEDDING_PROVIDER : params.provider;
  if (!provider) return { status: "lexical_fallback", results: retrieveMiraKnowledge(params), fallbackReason: "Embedding provider is not configured." };
  try {
    const [{ objects, vectors }, queryVectors] = await Promise.all([prepareSemanticIndex(params.objects, provider), provider.embed([params.query])]);
    const queryVector = queryVectors[0]; if (!queryVector) throw new Error("Embedding provider returned no query vector");
    const queryTokens = tokens(params.query);
    const lexicalScores = objects.map(object => lexicalScore(queryTokens, object));
    const maxLexicalScore = Math.max(...lexicalScores, 0);
    const scored = objects.map((object, index) => ({
      object,
      retrievalScore: cosineSimilarity(queryVector, vectors[index]!) * 0.75
        + (maxLexicalScore ? lexicalScores[index]! / maxLexicalScore : 0) * 0.25,
    }))
      .sort((a, b) => b.retrievalScore - a.retrievalScore || a.object.id.localeCompare(b.object.id));
    const selected: typeof scored = []; const categories = new Set<string>();
    for (const item of scored) { if (selected.length >= (params.topK ?? 3)) break; if (categories.has(item.object.category) && scored.some(candidate => !categories.has(candidate.object.category))) continue; selected.push(item); categories.add(item.object.category); }
    const results = selected.map(({ object, retrievalScore }) => ({ knowledgeObjectId: object.id, title: object.title, category: object.category, principle: object.principle,
      visualImplications: object.visualImplications, confidence: object.confidence, retrievalScore: Number(retrievalScore.toFixed(4)), source: {
        title: object.sourceTitle, url: object.sourceUrl, type: object.sourceType, originalType: object.originalSourceType, date: object.sourceDate,
        version: object.sourceVersion, corpusVersion: object.corpusVersion, publicationState: object.publicationState, allSources: object.sources,
      } }));
    return { status: "semantic", results, fallbackReason: null };
  } catch (error) {
    return { status: "lexical_fallback", results: retrieveMiraKnowledge(params), fallbackReason: error instanceof Error ? error.message : "Embedding retrieval failed." };
  }
}
