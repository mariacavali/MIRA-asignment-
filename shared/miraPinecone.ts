import { z } from "zod";

export const pineconeSeedPreviewSchema = z.object({
  version: z.literal("mira-pinecone-seed-v1"), fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  state: z.enum(["no_published_knowledge", "ready_for_review"]),
  target: z.object({ host: z.string().url(), namespace: z.string().min(1).max(200),
    apiVersion: z.literal("2026-07"), embeddingModel: z.literal("llama-text-embed-v2"), field: z.literal("chunk_text") }).strict(),
  corpus: z.object({ releaseId: z.string().uuid().nullable(), hash: z.string().regex(/^[a-f0-9]{64}$/).nullable(), revision: z.number().int().nonnegative() }).strict(),
  itemCount: z.number().int().min(0).max(20_000), recordCount: z.number().int().min(0).max(640_000),
  batchCount: z.number().int().min(0).max(20_000), recordBytes: z.number().int().nonnegative(),
  items: z.array(z.object({ id: z.string(), version: z.number().int().positive(), kind: z.enum(["card", "judgement", "passage"]), title: z.string(),
    records: z.number().int().positive().max(32), citations: z.array(z.object({ sourceId: z.string(), sourceVersion: z.number().int().positive(), title: z.string(), locator: z.string() }).strict()).max(20),
  }).strict()).max(20_000),
  writesPerformed: z.literal(0),
}).strict();
export type PineconeSeedPreview = z.infer<typeof pineconeSeedPreviewSchema>;
