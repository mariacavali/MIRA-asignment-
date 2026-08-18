import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ENV } from "../_core/env";
import { protectedProcedure, router } from "../_core/trpc";
import {
  appendMiraV3ReflectionTurn,
  confirmMiraV3MirrorRevision,
  createMiraV3MirrorDraft,
  createMiraV3MirrorEdit,
  createMiraV3Journey,
  createMiraV3MediaAsset,
  getMiraV3MediaAssetForAnalysis,
  getLatestMiraV3ModuleOutput,
  getMiraV3ConsentState,
  getMiraV3JourneyState,
  getOwnedMiraV3Journey,
  listMiraV3Journeys,
  listMiraV3MediaAssets,
  recordMiraV3Consent,
  removeMiraV3MediaAsset,
  resumeMiraV3ReflectionAfterBirthInterlude,
  saveMiraV3MediaAnalysis,
  saveMiraV3RenderArtifact,
  saveMiraV3ModuleOutput,
  softDeleteMiraV3Journey,
} from "./db";
import { canRetryReflectionBundle, generateReflectionBundle, reflectionBundleSchema } from "./bundle";
import { buildDeliverables, canAccessDeliverables, moodBoardRequestSchema, type MoodBoardRequest } from "./deliverables";
import { generateAdaptiveQuestion, isExplicitIncomprehensionResponse, rephraseQuestionForClarity, shouldGenerateAdaptiveQuestion, shouldLoadBirthSignalContext, shouldLoadImageSignalContext, shouldLoadMultiSignalContext } from "./reflection";
import { storageGetSignedUrl, storagePut } from "../storage";
import { deliverableFilename, MIRA_V3_DELIVERABLES, MIRA_V3_PDF_UNAVAILABLE_MESSAGE, renderDeliverableHtml, renderPdfFromHtml } from "./pdf";
import { BIRTH_DATA_MODULE_TYPE, birthDataInputSchema, buildHiddenRecognitionLayer, createConfiguredBirthDataProvider, normalizeBirthData, prepareBirthDataModule, publicBirthDataResult } from "./birthData";
import { buildPrivateReferenceStorageKey, canAcceptReferenceImage, decodeAndValidateReferenceImage, mediaUploadInputSchema, MIRA_V3_MEDIA_POLICY_VERSION } from "./media";
import { analyzePrivateReferenceImage, buildImageModuleEvidence, IMAGE_ANALYSIS_MODEL_ID, IMAGE_ANALYSIS_MODULE_TYPE, unavailablePrivateImageAnalysis } from "./imageAnalysis";
import {
  generateRecognitionResult,
  readCachedRecognitionResult,
  recognitionInputFingerprint,
  RECOGNITION_MODEL_ID,
  RECOGNITION_MODULE_TYPE,
} from "./recognition";

const miraV3Procedure = protectedProcedure.use(async ({ next }) => {
  if (!ENV.miraV3Enabled) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
  }
  return next();
});

async function moodBoardOptions(userId: number, journeyId: number, request: MoodBoardRequest | undefined) {
  if (!request || request.mode === "brand") return request ?? { mode: "brand" as const };
  const assets = await listMiraV3MediaAssets(userId, journeyId);
  const imageReferenceCues = buildImageModuleEvidence(assets ?? []).map(item => item.quote);
  return { ...request, imageReferenceCues };
}

function notFound(): never {
  throw new TRPCError({ code: "NOT_FOUND", message: "Journey not found" });
}

async function prepareFinalRecognitionContext(params: {
  userId: number;
  journeyId: number;
  messages: Array<{ role: string; content: string }>;
}) {
  let recognitionLayer: ReturnType<typeof buildHiddenRecognitionLayer> = null;
  const imageEvidence: ReturnType<typeof buildImageModuleEvidence> = [];
  let cachedModule: Awaited<ReturnType<typeof getLatestMiraV3ModuleOutput>>;

  try {
    const [birthModule, recognitionModule] = await Promise.all([
      getLatestMiraV3ModuleOutput(params.userId, params.journeyId, BIRTH_DATA_MODULE_TYPE),
      getLatestMiraV3ModuleOutput(params.userId, params.journeyId, RECOGNITION_MODULE_TYPE),
    ]);
    recognitionLayer = buildHiddenRecognitionLayer(birthModule ?? null);
    cachedModule = recognitionModule;
  } catch (error) {
    console.error("Mira final Recognition evidence loading fallback", error);
  }

  const fingerprint = recognitionInputFingerprint({
    messages: params.messages,
    recognitionLayer,
    imageEvidence,
  });
  const cached = readCachedRecognitionResult(cachedModule ?? null, fingerprint);
  if (cached) return { recognition: cached, imageEvidence, fingerprint, cacheHit: true as const };

  try {
    const recognition = await generateRecognitionResult({ messages: params.messages, recognitionLayer, imageEvidence });
    try {
      await saveMiraV3ModuleOutput({
        userId: params.userId,
        journeyId: params.journeyId,
        moduleType: RECOGNITION_MODULE_TYPE,
        status: "complete",
        provider: recognition.generation.model || RECOGNITION_MODEL_ID,
        providerVersion: "1",
        input: {
          fingerprint,
          conversationTurnCount: params.messages.filter(message => message.role === "user").length,
          privateRecognitionLayerAvailable: Boolean(recognitionLayer),
          imageEvidenceCount: imageEvidence.length,
        },
        output: recognition,
        provenance: {
          version: 2,
          fallback: recognition.generation.fallback,
          privateContextStored: false,
          rawVendorResponseStored: false,
        },
      });
    } catch (error) {
      console.error("Mira final Recognition cache write fallback", error);
    }
    return { recognition, imageEvidence, fingerprint, cacheHit: false as const };
  } catch (error) {
    console.error("Mira final Recognition gate unavailable", error);
    return { recognition: undefined, imageEvidence, fingerprint, cacheHit: false as const };
  }
}

export const miraV3Router = router({
  listJourneys: miraV3Procedure.query(({ ctx }) => listMiraV3Journeys(ctx.user.id)),
  createJourney: miraV3Procedure.mutation(({ ctx }) => createMiraV3Journey(ctx.user.id)),
  getJourney: miraV3Procedure
    .input(z.object({ journeyId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const state = await getMiraV3JourneyState(ctx.user.id, input.journeyId);
      if (!state) notFound();
      return state;
    }),
  getBirthData: miraV3Procedure
    .input(z.object({ journeyId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const journey = await getOwnedMiraV3Journey(ctx.user.id, input.journeyId);
      if (!journey) notFound();
      if (!ENV.miraV3BirthDataEnabled) return { enabled: false as const, module: null };
      const module = await getLatestMiraV3ModuleOutput(ctx.user.id, input.journeyId, BIRTH_DATA_MODULE_TYPE);
      return { enabled: true as const, module: publicBirthDataResult(module ?? null) };
    }),
  saveBirthData: miraV3Procedure
    .input(z.object({ journeyId: z.number().int().positive(), birthData: birthDataInputSchema }))
    .mutation(async ({ ctx, input }) => {
      if (!ENV.miraV3BirthDataEnabled) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Birth data is not enabled for this experience" });
      }
      const normalizedInput = normalizeBirthData(input.birthData);
      const cachedModule = await getLatestMiraV3ModuleOutput(ctx.user.id, input.journeyId, BIRTH_DATA_MODULE_TYPE);
      const cachedResult = cachedModule?.normalizedResult && typeof cachedModule.normalizedResult === "object"
        ? cachedModule.normalizedResult as Record<string, unknown>
        : null;
      const cachedInput = birthDataInputSchema.safeParse(cachedResult?.input);
      if (cachedModule?.status === "complete" && buildHiddenRecognitionLayer(cachedModule) && cachedInput.success && JSON.stringify(cachedInput.data) === JSON.stringify(normalizedInput)) {
        await resumeMiraV3ReflectionAfterBirthInterlude(ctx.user.id, input.journeyId);
        return publicBirthDataResult(cachedModule);
      }
      const prepared = await prepareBirthDataModule(normalizedInput, undefined);
      const saved = await saveMiraV3ModuleOutput({
        userId: ctx.user.id,
        journeyId: input.journeyId,
        moduleType: BIRTH_DATA_MODULE_TYPE,
        ...prepared,
      });
      if (!saved) notFound();
      await resumeMiraV3ReflectionAfterBirthInterlude(ctx.user.id, input.journeyId);
      return publicBirthDataResult(saved);
    }),
  skipBirthData: miraV3Procedure
    .input(z.object({ journeyId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const journey = await getOwnedMiraV3Journey(ctx.user.id, input.journeyId);
      if (!journey) notFound();
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Birth details are part of opening this private conversation" });
    }),
  getMediaState: miraV3Procedure
    .input(z.object({ journeyId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const consents = await getMiraV3ConsentState(ctx.user.id, input.journeyId);
      if (!consents) notFound();
      const assets = await listMiraV3MediaAssets(ctx.user.id, input.journeyId);
      return { policyVersion: MIRA_V3_MEDIA_POLICY_VERSION, consents, assets: assets ?? [] };
    }),
  setMediaConsent: miraV3Procedure
    .input(z.object({ journeyId: z.number().int().positive(), scope: z.enum(["image_upload", "image_analysis"]), granted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const consents = await recordMiraV3Consent({ userId: ctx.user.id, journeyId: input.journeyId, scope: input.scope, status: input.granted ? "granted" : "revoked", policyVersion: MIRA_V3_MEDIA_POLICY_VERSION });
      if (!consents) notFound();
      return consents;
    }),
  uploadReferenceImage: miraV3Procedure
    .input(mediaUploadInputSchema)
    .mutation(async ({ ctx, input }) => {
      const consents = await getMiraV3ConsentState(ctx.user.id, input.journeyId);
      if (!consents) notFound();
      if (consents.image_upload !== "granted") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Image upload consent is required" });
      const existingAssets = await listMiraV3MediaAssets(ctx.user.id, input.journeyId);
      if (!canAcceptReferenceImage(existingAssets?.length ?? 0)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A journey can contain up to six reference images" });
      let bytes: Buffer;
      try {
        bytes = decodeAndValidateReferenceImage(input);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid reference image" });
      }
      const assetId = randomUUID();
      let stored: Awaited<ReturnType<typeof storagePut>>;
      try {
        stored = await storagePut(buildPrivateReferenceStorageKey({ userId: ctx.user.id, journeyId: input.journeyId, assetId, mimeType: input.mimeType }), bytes, input.mimeType);
      } catch (error) {
        console.error("Mira V3 private storage unavailable", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Private image storage is temporarily unavailable. No image record was created." });
      }
      const created = await createMiraV3MediaAsset({ id: assetId, userId: ctx.user.id, journeyId: input.journeyId, storageKey: stored.key, storageUrl: "", originalName: input.originalName, mimeType: input.mimeType, byteSize: bytes.length });
      if (!created) notFound();
      return created;
    }),
  removeReferenceImage: miraV3Procedure
    .input(z.object({ journeyId: z.number().int().positive(), assetId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const removed = await removeMiraV3MediaAsset(ctx.user.id, input.journeyId, input.assetId);
      if (removed === undefined) notFound();
      if (!removed) throw new TRPCError({ code: "NOT_FOUND", message: "Reference image not found" });
      return { success: true } as const;
    }),
  analyzeReferenceImage: miraV3Procedure
    .input(z.object({ journeyId: z.number().int().positive(), assetId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const consents = await getMiraV3ConsentState(ctx.user.id, input.journeyId);
      if (!consents) notFound();
      if (consents.image_upload !== "granted" || consents.image_analysis !== "granted") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Upload and analysis consent are both required" });
      }
      const asset = await getMiraV3MediaAssetForAnalysis(ctx.user.id, input.journeyId, input.assetId);
      if (asset === undefined) notFound();
      if (!asset) throw new TRPCError({ code: "NOT_FOUND", message: "Reference image not found" });
      let signedUrl: string;
      try {
        signedUrl = await storageGetSignedUrl(asset.storageKey);
      } catch (error) {
        console.error("Mira V3 private image access unavailable", error);
        const failure = unavailablePrivateImageAnalysis(asset.id);
        const saved = await saveMiraV3MediaAnalysis({ userId: ctx.user.id, journeyId: input.journeyId, assetId: asset.id, status: "failed", analysis: failure.output });
        if (!saved) throw new TRPCError({ code: "CONFLICT", message: "Reference image is no longer available" });
        await saveMiraV3ModuleOutput({
          userId: ctx.user.id,
          journeyId: input.journeyId,
          moduleType: IMAGE_ANALYSIS_MODULE_TYPE,
          status: "failed",
          provider: IMAGE_ANALYSIS_MODEL_ID,
          input: { assetIds: [asset.id] },
          output: failure.output,
          provenance: { ...failure.provenance, reason: "private_storage_unavailable" },
        });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Private image storage is temporarily unavailable. The image was not analyzed." });
      }
      const analysis = await analyzePrivateReferenceImage({ assetId: asset.id, imageUrl: signedUrl, mimeType: asset.mimeType });
      const saved = await saveMiraV3MediaAnalysis({ userId: ctx.user.id, journeyId: input.journeyId, assetId: asset.id, status: analysis.status === "complete" ? "analyzed" : "failed", analysis: analysis.output });
      if (!saved) throw new TRPCError({ code: "CONFLICT", message: "Reference image is no longer available" });
      const assets = (await listMiraV3MediaAssets(ctx.user.id, input.journeyId)) ?? [];
      await saveMiraV3ModuleOutput({
        userId: ctx.user.id,
        journeyId: input.journeyId,
        moduleType: IMAGE_ANALYSIS_MODULE_TYPE,
        status: analysis.status,
        provider: IMAGE_ANALYSIS_MODEL_ID,
        input: { assetIds: assets.map(item => item.id) },
        output: { evidence: buildImageModuleEvidence(assets) },
        provenance: analysis.provenance,
      });
      return analysis;
    }),
  submitReflectionTurn: miraV3Procedure
    .input(
      z.object({
        journeyId: z.number().int().positive(),
        answer: z.string().trim().min(1).max(4000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const state = await getMiraV3JourneyState(ctx.user.id, input.journeyId);
      if (!state) notFound();
      if (state.journey.status !== "reflection" || state.journey.currentStep !== "conversation") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Reflection is not accepting answers" });
      }
      if (state.journey.turnCount >= 8 || !state.journey.activeSessionId) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Reflection is complete" });
      }

      if (isExplicitIncomprehensionResponse(input.answer)) {
        const currentQuestion = [...state.messages].reverse().find(message => message.role === "assistant")?.content;
        if (!currentQuestion) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active question is available" });
        const rephrased = await rephraseQuestionForClarity(currentQuestion);
        return {
          saved: false as const,
          rephrased: true as const,
          question: rephrased.question,
          fallback: rephrased.fallback,
          turnCount: state.journey.turnCount,
          currentStep: state.journey.currentStep,
        };
      }

      const nextTurnCount = state.journey.turnCount + 1;
      if (nextTurnCount === 4) {
        const birthModule = await getLatestMiraV3ModuleOutput(ctx.user.id, input.journeyId, BIRTH_DATA_MODULE_TYPE);
        const stored = birthModule?.normalizedResult && typeof birthModule.normalizedResult === "object"
          ? birthModule.normalizedResult as Record<string, unknown>
          : null;
        const storedBirthData = birthDataInputSchema.safeParse(stored?.input);
        if (storedBirthData.success && !buildHiddenRecognitionLayer(birthModule ?? null)) {
          const provider = createConfiguredBirthDataProvider({ apiKey: ENV.dakidartsApiKey, baseUrl: ENV.dakidartsApiBaseUrl });
          const prepared = await prepareBirthDataModule(storedBirthData.data, provider);
          await saveMiraV3ModuleOutput({ userId: ctx.user.id, journeyId: input.journeyId, moduleType: BIRTH_DATA_MODULE_TYPE, ...prepared });
        }
      }
      let signalContext: Parameters<typeof generateAdaptiveQuestion>[0]["signalContext"];
      if (shouldLoadMultiSignalContext(nextTurnCount)) {
        const loadBirth = shouldLoadBirthSignalContext(nextTurnCount);
        const loadImages = shouldLoadImageSignalContext(nextTurnCount);
          const [birthModule] = await Promise.all([
            loadBirth ? getLatestMiraV3ModuleOutput(ctx.user.id, input.journeyId, BIRTH_DATA_MODULE_TYPE) : Promise.resolve(null),
          ]);
        signalContext = {
          birthRecognitionLayer: loadBirth ? buildHiddenRecognitionLayer(birthModule ?? null) : null,
            imageSignals: [],
        };
      }
      const adaptive =
        shouldGenerateAdaptiveQuestion(nextTurnCount)
          ? await generateAdaptiveQuestion({
              completedUserTurns: nextTurnCount,
              messages: state.messages.map(message => ({
                role: message.role,
                content: message.content,
              })),
              newAnswer: input.answer,
              signalContext,
            })
          : undefined;

      const saved = await appendMiraV3ReflectionTurn({
        userId: ctx.user.id,
        journeyId: input.journeyId,
        sessionId: state.journey.activeSessionId,
        expectedTurnCount: state.journey.turnCount,
        answer: input.answer,
        assistantQuestion: adaptive?.question,
        assistantProvenance: adaptive?.provenance,
      });
      if (!saved.saved) {
        throw new TRPCError({ code: "CONFLICT", message: "Another answer was saved first" });
      }
      return saved;
    }),
  rephraseReflectionQuestion: miraV3Procedure
    .input(z.object({ journeyId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const state = await getMiraV3JourneyState(ctx.user.id, input.journeyId);
      if (!state) notFound();
      if (state.journey.status !== "reflection" || state.journey.currentStep !== "conversation" || state.journey.turnCount >= 8) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Reflection is not accepting question rephrases" });
      }
      const currentQuestion = [...state.messages].reverse().find(message => message.role === "assistant")?.content;
      if (!currentQuestion) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active question is available" });
      return rephraseQuestionForClarity(currentQuestion);
    }),
  generateMirrorDraft: miraV3Procedure
    .input(z.object({ journeyId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const state = await getMiraV3JourneyState(ctx.user.id, input.journeyId);
      if (!state) notFound();
      const existing = state.revisions[0];
      if (existing) return { ...existing, bundle: reflectionBundleSchema.parse(existing.bundle) };
      if (state.journey.turnCount < 8 || state.journey.currentStep !== "mirror_ready") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Eight answers are required before synthesis" });
      }
      const recognitionContext = await prepareFinalRecognitionContext({
        userId: ctx.user.id,
        journeyId: input.journeyId,
        messages: state.messages,
      });
      const bundle = await generateReflectionBundle(
        state.messages,
        recognitionContext.imageEvidence,
        recognitionContext.recognition,
      );
      const created = await createMiraV3MirrorDraft({ userId: ctx.user.id, journeyId: input.journeyId, bundle });
      if (!created) throw new TRPCError({ code: "CONFLICT", message: "Mirror preparation has already started" });
      return created;
    }),
  regenerateMirrorDraft: miraV3Procedure
    .input(z.object({ journeyId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const state = await getMiraV3JourneyState(ctx.user.id, input.journeyId);
      if (!state) notFound();
      const existing = state.revisions[0];
      if (!existing || !canRetryReflectionBundle(existing.status, existing.bundle)) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only the active fallback Mirror can be retried" });
      }

      const recognitionContext = await prepareFinalRecognitionContext({
        userId: ctx.user.id,
        journeyId: input.journeyId,
        messages: state.messages,
      });
      const bundle = await generateReflectionBundle(
        state.messages,
        recognitionContext.imageEvidence,
        recognitionContext.recognition,
      );
      if (bundle.generation.fallback) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The richer Mirror is still unavailable. Please try again." });
      }
      const created = await createMiraV3MirrorEdit({ userId: ctx.user.id, journeyId: input.journeyId, bundle });
      if (!created) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This Mirror can no longer be retried" });
      return created;
    }),
  saveMirrorEdit: miraV3Procedure
    .input(z.object({ journeyId: z.number().int().positive(), bundle: reflectionBundleSchema }))
    .mutation(async ({ ctx, input }) => {
      const created = await createMiraV3MirrorEdit({ userId: ctx.user.id, journeyId: input.journeyId, bundle: input.bundle });
      if (!created) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This Mirror can no longer be edited" });
      return created;
    }),
  confirmMirror: miraV3Procedure
    .input(z.object({ journeyId: z.number().int().positive(), revisionId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const confirmed = await confirmMiraV3MirrorRevision({ userId: ctx.user.id, journeyId: input.journeyId, revisionId: input.revisionId });
      if (!confirmed) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only the active draft can be confirmed" });
      return { ...confirmed, bundle: reflectionBundleSchema.parse(confirmed.bundle) };
    }),
  getDeliverables: miraV3Procedure
    .input(z.object({ journeyId: z.number().int().positive(), moodBoard: moodBoardRequestSchema.optional() }))
    .query(async ({ ctx, input }) => {
      const state = await getMiraV3JourneyState(ctx.user.id, input.journeyId);
      if (!state) notFound();
      const confirmed = state.revisions.find(revision => revision.status === "confirmed");
      if (!canAccessDeliverables(state.journey.status, confirmed?.status)) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Confirm the Mirror before opening deliverables" });
      }
      const bundle = reflectionBundleSchema.parse(confirmed?.bundle);
      const moodBoard = await moodBoardOptions(ctx.user.id, input.journeyId, input.moodBoard);
      return {
        journeyId: state.journey.id,
        revisionId: confirmed!.id,
        deliverables: buildDeliverables(bundle, moodBoard),
      };
    }),
  getDeliverableHtml: miraV3Procedure
    .input(z.object({ journeyId: z.number().int().positive(), deliverable: z.enum(MIRA_V3_DELIVERABLES), moodBoard: moodBoardRequestSchema.optional() }))
    .query(async ({ ctx, input }) => {
      const state = await getMiraV3JourneyState(ctx.user.id, input.journeyId);
      if (!state) notFound();
      const confirmed = state.revisions.find(revision => revision.status === "confirmed");
      if (!canAccessDeliverables(state.journey.status, confirmed?.status)) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Confirm the Mirror before rendering deliverables" });
      }
      const bundle = reflectionBundleSchema.parse(confirmed!.bundle);
      const moodBoard = await moodBoardOptions(ctx.user.id, input.journeyId, input.moodBoard);
      return {
        journeyId: input.journeyId,
        revisionId: confirmed!.id,
        deliverable: input.deliverable,
        html: renderDeliverableHtml(input.deliverable, buildDeliverables(bundle, moodBoard)),
      };
    }),
  downloadDeliverablePdf: miraV3Procedure
    .input(z.object({ journeyId: z.number().int().positive(), deliverable: z.enum(MIRA_V3_DELIVERABLES), moodBoard: moodBoardRequestSchema.optional() }))
    .mutation(async ({ ctx, input }) => {
      const state = await getMiraV3JourneyState(ctx.user.id, input.journeyId);
      if (!state) notFound();
      const confirmed = state.revisions.find(revision => revision.status === "confirmed");
      if (!canAccessDeliverables(state.journey.status, confirmed?.status)) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Confirm the Mirror before downloading deliverables" });
      }
      const bundle = reflectionBundleSchema.parse(confirmed!.bundle);
      const moodBoard = await moodBoardOptions(ctx.user.id, input.journeyId, input.moodBoard);
      const documents = buildDeliverables(bundle, moodBoard);
      await saveMiraV3RenderArtifact({ userId: ctx.user.id, journeyId: input.journeyId, revisionId: confirmed!.id, deliverable: input.deliverable, status: "pending" });
      try {
        const html = renderDeliverableHtml(input.deliverable, documents);
        const pdf = await renderPdfFromHtml(html);
        const filename = deliverableFilename(input.deliverable, input.journeyId, moodBoard.mode);
        const stored = await storagePut(`mira-v3/${ctx.user.id}/${input.journeyId}/${confirmed!.id}/${filename}`, pdf, "application/pdf");
        await saveMiraV3RenderArtifact({ userId: ctx.user.id, journeyId: input.journeyId, revisionId: confirmed!.id, deliverable: input.deliverable, status: "ready", storageKey: stored.key, storageUrl: stored.url });
        return { filename, mimeType: "application/pdf" as const, base64: pdf.toString("base64") };
      } catch (error) {
        const message = error instanceof Error ? error.message : "PDF rendering failed";
        await saveMiraV3RenderArtifact({ userId: ctx.user.id, journeyId: input.journeyId, revisionId: confirmed!.id, deliverable: input.deliverable, status: "failed", errorMessage: message });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: MIRA_V3_PDF_UNAVAILABLE_MESSAGE });
      }
    }),
  deleteJourney: miraV3Procedure
    .input(z.object({ journeyId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const journey = await getOwnedMiraV3Journey(ctx.user.id, input.journeyId);
      if (!journey) notFound();
      await softDeleteMiraV3Journey(ctx.user.id, input.journeyId);
      return { success: true } as const;
    }),
});
