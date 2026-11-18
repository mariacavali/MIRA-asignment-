import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { importKnowledgeInputSchema, knowledgeReleaseInputSchema, reviewKnowledgeInputSchema, publishKnowledgeInputSchema, withdrawKnowledgeInputSchema } from "../../shared/miraKnowledge";
import { parseKnowledgeImport } from "./import";
import { createKnowledgeRepository } from "./repository";
import { pineconeTarget, preparePineconeSeedPlan, type PineconeTarget } from "./pineconePlan";
import { pineconeSeedPreviewSchema } from "../../shared/miraPinecone";

import { knowledgeDocumentService, type KnowledgeDocumentService } from "./documents";
import { knowledgePdfUploadSchema, knowledgeDocumentIdSchema, documentCardInputSchema } from "../../shared/miraKnowledgeDocuments";

type Repository = ReturnType<typeof createKnowledgeRepository>;
export function createKnowledgeRouter(options: { enabled: () => boolean; repository: () => Promise<Repository>; documents?: () => KnowledgeDocumentService; seedTarget?: () => PineconeTarget }) {
  const procedure = adminProcedure.use(async ({ next }) => {
    if (!options.enabled()) throw new TRPCError({ code: "NOT_FOUND", message: "Knowledge editing is not available." });
    return next();
  });
  async function call<T>(run: (repo: Repository) => Promise<T>): Promise<T> {
    try { return await run(await options.repository()); }
    catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Knowledge editing is temporarily unavailable." });
    }
  }
  async function documentCall<T>(run: (service: KnowledgeDocumentService) => Promise<T>): Promise<T> {
    try { return await run((options.documents ?? knowledgeDocumentService)()); }
    catch (error) { if (error instanceof TRPCError) throw error; throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Document intake is temporarily unavailable." }); }
  }
  return router({
    previewPineconeSeed: procedure.output(pineconeSeedPreviewSchema).query(() => call(async repo =>
      preparePineconeSeedPlan(await repo.publishedSnapshot(), (options.seedTarget ?? (() => pineconeTarget(process.env)))()).preview)),
    draftFromDocument: procedure.input(documentCardInputSchema).mutation(async ({ ctx, input }) => {
      const document = await documentCall(service => service.get(input.documentId));
      const pages = Array.from(new Set(input.pages)).sort((a, b) => a - b);
      if (pages.some(page => !document.extraction.pages.some(p => p.page === page && p.text.trim() && ["extracted", "truncated"].includes(p.status)))) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose readable pages and review them before writing a note." });
      return call(async repo => {
        const snapshot = await repo.publishedSnapshot();
        if (snapshot.revision !== input.expectedRevision) throw new TRPCError({ code: "CONFLICT", message: "The knowledge library changed. Refresh before saving." });
        const base = input.baseDraftId ? await repo.inspect(input.baseDraftId) : null;
        if (base && (base.release.status !== "draft" || base.revision !== input.expectedRevision)) throw new TRPCError({ code: "CONFLICT", message: "Choose a current draft before adding this note." });
        const baseSources = base?.release.bundle.sources ?? snapshot.sources;
        const baseItems = base?.release.bundle.items ?? snapshot.items;
        const card = { ...input.card, authorship: "source_summary" as const, authorName: ctx.user.name || `Editor ${ctx.user.id}`,
          sourceRefs: pages.map(page => ({ id: document.source.id, version: document.source.version, locator: `PDF page ${page}` })) };
        const sources = [...baseSources.filter(s => s.id !== document.source.id || s.version !== document.source.version), document.source];
        const items = [...baseItems.filter(i => i.kind !== "card" || i.id !== card.id), card];
        return repo.importDraft(ctx.user.id, { formatVersion: 1, sources, items }, input.expectedRevision);
      });
    }),
    listDocuments: procedure.query(() => documentCall(service => service.list())),
    getDocument: procedure.input(knowledgeDocumentIdSchema).query(({ input }) => documentCall(service => service.get(input.documentId))),
    uploadPdf: procedure.input(knowledgePdfUploadSchema).mutation(({ ctx, input }) => documentCall(service => service.upload(ctx.user.id, input))),
    listReleases: procedure.input(z.object({ beforeId: z.string().uuid().optional() }).strict().default({})).query(({ input }) => call(repo => repo.listReleases(input.beforeId))),
    status: procedure.query(() => call(repo => repo.status())),
    importDraft: procedure.input(importKnowledgeInputSchema).mutation(({ ctx, input }) => {
      let bundle;
      try { bundle = parseKnowledgeImport(input.format, input.content); }
      catch { throw new TRPCError({ code: "BAD_REQUEST", message: "Import does not match the knowledge format. Check IDs, source references and required fields." }); }
      return call(repo => repo.importDraft(ctx.user.id, bundle, input.expectedRevision));
    }),
    inspect: procedure.input(knowledgeReleaseInputSchema).query(({ input }) => call(repo => repo.inspect(input.releaseId))),
    review: procedure.input(reviewKnowledgeInputSchema).mutation(({ ctx, input }) => call(repo => repo.review(ctx.user.id, ctx.user.name || `Editor ${ctx.user.id}`, input))),
    publish: procedure.input(publishKnowledgeInputSchema).mutation(({ ctx, input }) => call(repo => repo.publish(ctx.user.id, input))),
    withdraw: procedure.input(withdrawKnowledgeInputSchema).mutation(({ ctx, input }) => call(repo => repo.withdraw(ctx.user.id, input))),
  });
}
export const miraKnowledgeRouter = createKnowledgeRouter({
  enabled: () => process.env.MIRA_KNOWLEDGE_ENABLED === "true",
  repository: async () => { const db = await getDb(); if (!db) throw new Error("Knowledge database unavailable"); return createKnowledgeRepository(db); },
});
