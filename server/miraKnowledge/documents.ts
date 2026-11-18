import { randomUUID, createHash } from "node:crypto";
import { resolve } from "node:path";
import { TRPCError } from "@trpc/server";
import { knowledgePdfUploadSchema, MAX_KNOWLEDGE_PDF_BYTES, type KnowledgeDocument } from "../../shared/miraKnowledgeDocuments";
import type { z } from "zod";
import { createPdfExtractor } from "./pdfExtraction";
import { createLocalKnowledgeDocumentStorage, type KnowledgeDocumentStorage } from "./documentStorage";
import { canonicalJson } from "./schema";

export function createKnowledgeDocumentService(options: {
  storage: KnowledgeDocumentStorage;
  extract: ReturnType<typeof createPdfExtractor>;
}) {
  let processing = false;
  return {
    async list() { return options.storage.list(); },
    async get(id: string) {
      const document = await options.storage.get(id);
      if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "Knowledge document not found." });
      return document;
    },
    async upload(actorUserId: number, raw: z.infer<typeof knowledgePdfUploadSchema>) {
      const input = knowledgePdfUploadSchema.parse(raw);
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.pdfBase64) || input.pdfBase64.length % 4 !== 0) throw new TRPCError({ code: "BAD_REQUEST", message: "The PDF upload is incomplete." });
      const bytes = Buffer.from(input.pdfBase64, "base64");
      if (bytes.length > MAX_KNOWLEDGE_PDF_BYTES || !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a PDF of up to 25 MB." });
      if (processing) throw new TRPCError({ code: "CONFLICT", message: "Another PDF is being read. Please retry when it finishes." });
      processing = true;
      try {
        const fileHash = createHash("sha256").update(bytes).digest("hex"), documents = await options.storage.list();
        const prior = documents.find(d => d.source.id === input.source.id && d.source.version === input.source.version);
        if (prior) {
          const previousSource = { ...prior.source, assetReference: null };
          if (prior.fileHash !== fileHash || canonicalJson(previousSource) !== canonicalJson(input.source)) throw new TRPCError({ code: "CONFLICT", message: "This source version already has a different document or details. Increase its version." });
          const document = await options.storage.get(prior.id);
          if (!document) throw new Error("Document disappeared during intake.");
          return { document, repeated: true };
        }
        if (documents.length >= 200) throw new TRPCError({ code: "CONFLICT", message: "The local document library is full." });
        const extraction = await options.extract(bytes), id = randomUUID();
        const document: KnowledgeDocument = { id, source: { ...input.source, assetReference: `knowledge-document:${id}` },
          originalName: input.originalName, byteSize: bytes.length, fileHash, uploadedByUserId: actorUserId,
          createdAt: new Date().toISOString(), extractionPermitted: true, status: "extracted_draft", extraction };
        await options.storage.save(document, bytes);
        return { document, repeated: false };
      } finally { processing = false; }
    },
  };
}
export type KnowledgeDocumentService = ReturnType<typeof createKnowledgeDocumentService>;
let localService: KnowledgeDocumentService | undefined;
export function knowledgeDocumentService(): KnowledgeDocumentService {
  // Production adapter selection is an explicit future integration; never fall back to ephemeral files there.
  if (process.env.NODE_ENV === "production") throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Production document storage is not configured." });
  if (!localService) localService = createKnowledgeDocumentService({
    storage: createLocalKnowledgeDocumentStorage(process.env.MIRA_KNOWLEDGE_DOCUMENT_ROOT || resolve(".mira-local-data/knowledge-documents")),
    extract: createPdfExtractor({ python: process.env.MIRA_PDF_PYTHON || resolve(".mira-pdf-venv/bin/python") }),
  });
  return localService;
}
