import { z } from "zod";
import { knowledgeSourceSchema, knowledgeCardSchema } from "./miraKnowledge";
export const MAX_KNOWLEDGE_PDF_BYTES = 25 * 1024 * 1024;
export const knowledgePdfUploadSchema = z.object({
  source: knowledgeSourceSchema.refine(s => s.kind === "book" || s.kind === "pdf", "Choose a book or PDF source.").refine(s => s.assetReference === null, "The server assigns the document reference."),
  originalName: z.string().trim().min(1).max(200),
  pdfBase64: z.string().min(1).max(Math.ceil(MAX_KNOWLEDGE_PDF_BYTES / 3) * 4),
  extractionPermitted: z.literal(true),
}).strict();
export const extractedPdfPageSchema = z.object({
  hasImages: z.boolean().optional(),
  page: z.number().int().positive(), text: z.string().max(30000),
  status: z.enum(["extracted", "no_text", "truncated", "error", "limit_reached"]),
}).strict();
export const pdfExtractionSchema = z.object({
  pageCount: z.number().int().min(1).max(800), pages: z.array(extractedPdfPageSchema).min(1).max(800),
}).strict().superRefine((result, ctx) => {
  if (result.pages.length !== result.pageCount || result.pages.some((p, i) => p.page !== i + 1)) ctx.addIssue({ code: "custom", message: "Extraction must preserve every physical PDF page in order." });
  if (result.pages.reduce((n, p) => n + p.text.length, 0) > 5_000_000) ctx.addIssue({ code: "custom", message: "Extraction text limit exceeded." });
});
export const knowledgeDocumentSchema = z.object({
  id: z.string().uuid(), source: knowledgeSourceSchema, originalName: z.string().max(200),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/), byteSize: z.number().int().positive().max(MAX_KNOWLEDGE_PDF_BYTES),
  uploadedByUserId: z.number().int().positive(), createdAt: z.string().datetime(),
  extractionPermitted: z.literal(true), status: z.literal("extracted_draft"), extraction: pdfExtractionSchema,
}).strict();
export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>;
export const knowledgeDocumentIdSchema = z.object({ documentId: z.string().uuid() }).strict();
export const documentCardDraftInputSchema = knowledgeDocumentIdSchema.extend({
  pages: z.array(z.number().int().positive().max(800)).min(1).max(20),
}).strict();

export function summariseKnowledgeDocument(document: KnowledgeDocument) {
  return { id: document.id, source: document.source, originalName: document.originalName, fileHash: document.fileHash,
    createdAt: document.createdAt, pageCount: document.extraction.pageCount,
    pagesWithImages: document.extraction.pages.filter(p => p.hasImages).length,
    pagesNeedingReview: document.extraction.pages.filter(p => p.status !== "extracted").length };
}
export type KnowledgeDocumentSummary = ReturnType<typeof summariseKnowledgeDocument>;
export const documentCardInputSchema = documentCardDraftInputSchema.extend({
  baseDraftId: z.string().uuid().nullable().default(null),
  expectedRevision: z.number().int().nonnegative(), extractionReviewed: z.literal(true),
  card: knowledgeCardSchema.omit({ sourceRefs: true, authorship: true, authorName: true }),
}).strict();
