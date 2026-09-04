import { TRPCError } from "@trpc/server";
import { ENV } from "../_core/env";
import { z } from "zod";
import {
  createShootInputSchema,
  createDiscoverySummaryInputSchema,
  confirmDiscoverySummaryInputSchema,
  photographerProfileInputSchema,
  realtimeMemoryToolInputSchema,
  respondToShootScheduleInputSchema,
  shouldActivateShootPreparation,
} from "../../shared/miraCore";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  createCanonicalShoot,
  createRealtimeDiscoverySummary,
  appendRealtimeQaEvent,
  confirmRealtimeDiscoverySummary,
  createClientInvitation,
  invitationAlreadySentToClient,
  markInvitationQueued,
  markInvitationFailed,
  endTextTestSession,
  finalizeRealtimeSession,
  getClientInvitation,
  acknowledgeClientInvitation,
  getOwnedShootState,
  getShootQaInspection,
  getShootPreparationStatusForRealtime,
  getShootRoomStatusForClient,
  listRealtimeQaEventsForOwner,
  deleteRealtimeQaEventsForOwner,
    calculateInvitationExpiry,
  getPhotographerProfile,
  listOwnedShoots,
  savePhotographerProfile,
  setRealtimeSessionPaused,
  startTextTestSession,
  submitTextTestTurn,
  persistRealtimeMemoryTool,
  updateOwnedShootContact,
  activatePreparationRoom,
  markShootReadyToShoot,
  recordShootScheduleResponse,
} from "./db";
import { deliverClientInvitation, notifyPhotographerOfCompletion } from "./delivery";
import { createRealtimeWebRtcCall } from "./realtime";
import { classifyRealtimeTranscript } from "./noise";
import { generateShootCreativeDnaForConfirmedMemory, getShootCreativeDnaForOwner } from "./creativeDnaAdapter";
import { generateShootMoodboardForCreativeDna, getShootMoodboardForOwner } from "./moodboardAdapter";
import { createLocalPhotographer, isLocalFileStoreEnabled } from "../localFileStore";
import { createPendingCheckout } from "../payment/pendingCheckout";
import { DrizzleEmailOutboxRepository, recordImmediateInvitationAsSent, scheduleMiraEmailMilestones, cancelMiraEmailOutbox } from "../email/outbox";
import { createPortalSessionForUser } from "../payment/stripePortal";
import { DrizzlePaymentRepository } from "../payment/drizzlePaymentRepository";
import {
  analyzeShootVisualReference,
  listShootVisualReferencesForOwner,
  listShootVisualReferencesForClient,
  removeClientVisualReference,
  referencePurposeSchema,
  shootVisualReferenceUploadSchema,
  uploadShootVisualReference,
} from "./visualReferences";

const tokenSchema = z.string().trim().min(32).max(256);

function notFound(): never {
  throw new TRPCError({ code: "NOT_FOUND", message: "MIRA preparation not found" });
}

function visualUploadError(error: unknown): TRPCError {
  const message = error instanceof Error ? error.message : "";
  if (/^(Reference image|A shoot can (contain|include))/.test(message)) {
    return new TRPCError({ code: "BAD_REQUEST", message });
  }
  console.warn("MIRA visual reference upload unavailable", message || "unknown error");
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Visual reference storage is temporarily unavailable. No image record was created." });
}

function requestOrigin(req: { protocol: string; get(name: string): string | undefined }) {
  const host = req.get("host");
  return host ? `${req.protocol}://${host}` : undefined;
}

export const miraCoreRouter = router({
  completeLocalPurchase: protectedProcedure.input(z.object({ email: z.string().email().optional() }).strict()).mutation(async ({ ctx, input }) => {
    if (ENV.paymentMode === "local" && !isLocalFileStoreEnabled()) throw new TRPCError({ code: "FORBIDDEN", message: "Test checkout is unavailable" });
    if (ENV.paymentMode === "stripe") {
      try {
        let checkoutUser = ctx.user;
        let email = checkoutUser.email?.trim().toLowerCase();
        if (!email && input.email && isLocalFileStoreEnabled()) {
          const localUser = await (await import("../db")).getLocalPhotographerByEmail(input.email);
          if (localUser) {
            checkoutUser = localUser;
            email = localUser.email?.trim().toLowerCase();
            ctx.res.cookie("mira_local_session", localUser.openId, { httpOnly: true, sameSite: "lax", secure: false, path: "/" });
          }
        }
        if (!email) throw new Error("The photographer account needs an email before checkout");
        const checkout = await createPendingCheckout({ name: checkoutUser.name?.trim() || "MIRA Photographer", email }, checkoutUser.id);
        return { mode: "stripe" as const, redirectUrl: checkout.redirectUrl };
      } catch (error) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "Stripe checkout is unavailable" });
      }
    }
    const { activateLocalPlanForUser } = await import("../db");
    const user = await activateLocalPlanForUser(ctx.user.openId, "MIRA Studio");
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Photographer account was not found" });
    return { mode: "local" as const, paid: true as const, paymentStatus: user.paymentStatus, selectedPlan: user.selectedPlan };
  }),
  localPhotographerLogin: publicProcedure.input(z.object({ email: z.string().email() })).mutation(async ({ input, ctx }) => {
    if (!isLocalFileStoreEnabled()) throw new TRPCError({ code: "FORBIDDEN", message: "Local login is unavailable" });
    const user = await (await import("../db")).getLocalPhotographerByEmail(input.email);
    if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "No photographer account was found for that email" });
    ctx.res.cookie("mira_local_session", user.openId, { httpOnly: true, sameSite: "lax", secure: false, path: "/" });
    return { signedIn: true as const };
  }),
  createLocalPhotographerAccount: publicProcedure.input(z.object({ firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80), email: z.string().email(), password: z.string().min(8).max(200) })).mutation(async ({ input, ctx }) => {
    if (!isLocalFileStoreEnabled()) throw new TRPCError({ code: "FORBIDDEN", message: "Account creation is unavailable in this environment" });
    const user = await createLocalPhotographer(input);
    if (!user) throw new TRPCError({ code: "CONFLICT", message: "An account already exists for this email" });
    ctx.res.cookie("mira_local_session", user.openId, { httpOnly: true, sameSite: "lax", secure: false, path: "/" });
    return { created: true as const };
  }),
  getPhotographerAccess: protectedProcedure.query(async ({ ctx }) => (await import("../db")).getPhotographerAccess(ctx.user.openId)),
  createCustomerPortalSession: protectedProcedure.input(z.object({}).strict()).mutation(async ({ ctx }) => {
    if (ENV.paymentMode !== "stripe") throw new TRPCError({ code: "FORBIDDEN", message: "Subscription management is unavailable" });
    try {
      const portalUrl = await createPortalSessionForUser({ userOpenId: ctx.user.openId, repository: new DrizzlePaymentRepository() });
      return { portalUrl };
    } catch {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Subscription management is unavailable" });
    }
  }),
  activateTestPayment: protectedProcedure.input(z.object({ selectedPlan: z.literal("Studio Test") })).mutation(async ({ ctx, input }) => {
    const { activateLocalPlanForUser } = await import("../db");
    const user = await activateLocalPlanForUser(ctx.user.openId, input.selectedPlan);
    if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Payment could not be recorded" });
    return { paymentStatus: user.paymentStatus, selectedPlan: user.selectedPlan };
  }),
  resetLocalPhotographerJourney: protectedProcedure.mutation(async ({ ctx }) => {
    const { resetLocalPhotographerJourneyForUser } = await import("../db");
    if (!(await resetLocalPhotographerJourneyForUser(ctx.user.openId))) throw new TRPCError({ code: "NOT_FOUND", message: "Local photographer was not found" });
    return { reset: true as const };
  }),
  getPhotographerProfile: protectedProcedure.query(({ ctx }) => getPhotographerProfile(ctx.user.id)),
  savePhotographerProfile: protectedProcedure.input(photographerProfileInputSchema)
    .mutation(({ ctx, input }) => savePhotographerProfile({ userId: ctx.user.id, ...input })),
  listShoots: protectedProcedure.query(({ ctx }) => listOwnedShoots(ctx.user.id)),
  createShoot: protectedProcedure.input(createShootInputSchema).mutation(async ({ ctx, input }) => {
    const profile = await getPhotographerProfile(ctx.user.id);
    if (!profile || profile.onboardingStatus !== "complete") {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Complete photographer onboarding first" });
    }
    return createCanonicalShoot({
      photographerUserId: ctx.user.id,
      sourceMode: "mira_saas",
      title: input.title,
      shootType: input.shootType,
      clientName: input.clientName,
      clientEmail: input.clientEmail,
      clientPhone: input.clientPhone,
      invitationMessage: input.invitationMessage,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      timezone: input.timezone,
      intendedUse: input.intendedUse,
      location: input.location,
      durationMinutes: input.durationMinutes,
      photographerNotes: input.photographerNotes,
      callAllowanceSeconds: input.callAllowanceMinutes * 60,
    });
  }),
  getShoot: protectedProcedure.input(z.object({ shootId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const state = await getOwnedShootState(ctx.user.id, input.shootId);
      if (!state) notFound();
      return state;
    }),
  getShootQaInspection: protectedProcedure.input(z.object({ shootId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const inspection = await getShootQaInspection(ctx.user.id, input.shootId);
      if (!inspection) notFound();
      const visualReferences = await listShootVisualReferencesForOwner(ctx.user.id, input.shootId);
      return { ...inspection, visualReferences: visualReferences ?? [] };
    }),
  listShootVisualReferences: protectedProcedure.input(z.object({ shootId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const references = await listShootVisualReferencesForOwner(ctx.user.id, input.shootId);
      if (!references) notFound();
      return references;
    }),
  uploadShootVisualReference: protectedProcedure.input(z.object({
    shootId: z.number().int().positive(),
    reference: shootVisualReferenceUploadSchema,
  })).mutation(async ({ ctx, input }) => {
    try {
      const created = await uploadShootVisualReference({ shootId: input.shootId, photographerUserId: ctx.user.id, uploaderRole: "photographer", input: input.reference });
      if (!created) notFound();
      return created;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw visualUploadError(error);
    }
  }),
  analyzeShootVisualReference: protectedProcedure.input(z.object({ shootId: z.number().int().positive(), assetId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await analyzeShootVisualReference({ photographerUserId: ctx.user.id, ...input });
      if (!result) notFound();
      return result;
    }),
  updateShootContact: protectedProcedure.input(z.object({
    shootId: z.number().int().positive(),
    clientName: z.string().trim().max(160).nullable(),
    clientEmail: z.string().trim().email().max(320).nullable(),
    clientPhone: z.string().trim().max(32).nullable(),
    invitationMessage: z.string().trim().max(800).nullable(),
  }).strict()).mutation(async ({ ctx, input }) => {
    const shoot = await updateOwnedShootContact({ photographerUserId: ctx.user.id, ...input });
    if (!shoot) notFound();
    return shoot;
  }),
  createInvitation: protectedProcedure.input(z.object({
    shootId: z.number().int().positive(),
    expiresInDays: z.number().int().min(1).max(30).default(7),
  })).mutation(async ({ ctx, input }) => {
    const shoot = await getOwnedShootState(ctx.user.id, input.shootId);
    if (!shoot) notFound();
    const expiresAt = calculateInvitationExpiry(shoot.shoot.scheduledAt, shoot.shoot.timezone, input.expiresInDays, shoot.shoot.durationMinutes);
    const invitation = await createClientInvitation({
      photographerUserId: ctx.user.id,
      shootId: input.shootId,
      expiresAt,
    });
    if (!invitation) notFound();
    return invitation;
  }),
  sendInvitation: protectedProcedure.input(z.object({
    shootId: z.number().int().positive(),
    expiresInDays: z.number().int().min(1).max(30).default(7),
    // A plain "Send invitation" click never resends once delivery has
    // already been attempted for the current active invitation - that
    // guards against a double click or a retried request firing two emails.
    // Resending is still possible, but only as an explicit, separate action.
    force: z.boolean().default(false),
  })).mutation(async ({ ctx, input }) => {
    const shoot = await getOwnedShootState(ctx.user.id, input.shootId);
    if (!shoot) notFound();
    if (!input.force && invitationAlreadySentToClient(shoot.invitations[0])) {
      throw new TRPCError({ code: "CONFLICT", message: "An invitation was already sent for this shoot. Use Resend invitation to send another one." });
    }
    const expiresAt = calculateInvitationExpiry(shoot.shoot.scheduledAt, shoot.shoot.timezone, input.expiresInDays, shoot.shoot.durationMinutes);
    const invitation = await createClientInvitation({
      photographerUserId: ctx.user.id,
      shootId: input.shootId,
      expiresAt,
    });
    if (!invitation) notFound();
    await markInvitationQueued({ invitationId: invitation.invitationId, photographerUserId: ctx.user.id });
    try {
      const delivery = await deliverClientInvitation({
        photographerUserId: ctx.user.id,
        photographerEmail: ctx.user.email,
        invitationId: invitation.invitationId,
        token: invitation.token,
        shootId: input.shootId,
        expiresAt: invitation.expiresAt,
        requestOrigin: requestOrigin(ctx.req),
      });
      if (ENV.paymentMode === "stripe" && !ENV.miraLocalFileStore) {
        try {
          const repository = new DrizzleEmailOutboxRepository();
          const invitationSentAt = new Date();
          await recordImmediateInvitationAsSent(repository, { invitationId: invitation.invitationId, shootId: input.shootId, scheduledAt: invitationSentAt, idempotencyKey: `mira:shoot:${input.shootId}:milestone:shoot_room_invitation`, providerMessageId: delivery.providerMessageId }, invitationSentAt);
          if (shoot.shoot.scheduledAt) await scheduleMiraEmailMilestones(repository, { invitationId: invitation.invitationId, shootId: input.shootId, scheduledAt: shoot.shoot.scheduledAt, timeZone: shoot.shoot.timezone, invitationSentAt });
        } catch { /* Outbox availability must not change immediate delivery. */ }
      }
      return { ...invitation, ...delivery, deliveryError: null };
    } catch (error) {
      console.warn("MIRA invitation email was not delivered", error instanceof Error ? error.message : "unknown error");
      await markInvitationFailed({ invitationId: invitation.invitationId, photographerUserId: ctx.user.id }).catch(() => undefined);
      return {
        ...invitation,
        preparationUrl: `${requestOrigin(ctx.req) ?? ""}/prepare/${invitation.token}`,
        provider: null,
        providerMessageId: null,
        deliveryStatus: "failed" as const,
        deliveryError: "Email delivery failed. Copy the secure link instead.",
        replyToWarning: null,
      };
    }
  }),
  openInvitation: publicProcedure.input(z.object({ token: tokenSchema })).query(async ({ input }) => {
    const state = await getClientInvitation(input.token, true);
    if (!state) notFound();
    return {
      status: state.invitation.status,
      accepted: Boolean(state.invitation.consentAcknowledgedAt),
      expiresAt: state.invitation.expiresAt,
      consentPolicyVersion: state.invitation.consentPolicyVersion,
      shoot: {
        title: state.shoot.title,
        shootType: state.shoot.shootType,
        clientName: state.shoot.clientName,
        clientEmail: state.shoot.clientEmail,
        scheduledAt: state.shoot.scheduledAt,
        timezone: state.shoot.timezone,
        location: state.shoot.location,
        durationMinutes: state.shoot.durationMinutes,
        intendedUse: state.shoot.intendedUse,
        photographerNotes: state.shoot.photographerNotes,
        roomState: state.shoot.roomState,
        callAllowanceSeconds: state.shoot.callAllowanceSeconds,
      },
      photographer: {
        displayName: state.photographer?.displayName ?? "Your photographer",
        businessName: state.photographer?.businessName ?? null,
        bio: state.photographer?.bio ?? null,
        photographyStyle: state.photographer?.photographyStyle ?? null,
        areasOfExpertise: state.photographer?.areasOfExpertise ?? [],
        websiteUrl: state.photographer?.websiteUrl ?? null,
        instagramUrl: state.photographer?.instagramUrl ?? null,
      },
    };
  }),
  acknowledgeInvitation: publicProcedure.input(z.object({ token: tokenSchema })).mutation(async ({ input }) => {
    const result = await acknowledgeClientInvitation(input.token);
    if (!result) notFound();
    if (ENV.paymentMode === "stripe" && !ENV.miraLocalFileStore) {
      try {
        const state = await getClientInvitation(input.token);
        if (state?.shoot.scheduledAt) await scheduleMiraEmailMilestones(new DrizzleEmailOutboxRepository(), { invitationId: state.invitation.id, shootId: state.shoot.id, scheduledAt: state.shoot.scheduledAt, timeZone: state.shoot.timezone, invitationSentAt: (state.invitation as any).sentAt ?? (state.invitation as any).createdAt, acceptedAt: new Date() });
      } catch { /* Scheduling is eventually retryable and must not block acceptance. */ }
    }
    return result;
  }),
  // Read-only room status for the client Shoot Room's "Your Vision" and
  // "Ready to Shoot" sections. Deliberately separate from checkPreparationStatus
  // (the realtime tool's mutation) so the UI and the voice call can evolve
  // independently even though they read the same underlying shoot/moodboard data.
  getShootRoomStatus: publicProcedure.input(z.object({ token: tokenSchema })).query(async ({ input }) => {
    const state = await getClientInvitation(input.token);
    if (!state) notFound();
    return getShootRoomStatusForClient(state.shoot.id);
  }),
  uploadClientVisualReference: publicProcedure.input(z.object({
    token: tokenSchema,
    // The client (unlike the existing photographer-dashboard upload) must
    // always state why a reference was shared and add a short explanation.
    reference: shootVisualReferenceUploadSchema.extend({
      referencePurpose: referencePurposeSchema,
      clientDescription: z.string().trim().min(1).max(800),
    }),
  })).mutation(async ({ input }) => {
    const state = await getClientInvitation(input.token);
    if (!state || state.invitation.status !== "active") notFound();
    try {
      const created = await uploadShootVisualReference({
        shootId: state.shoot.id,
        photographerUserId: state.shoot.photographerUserId,
        uploaderRole: "client",
        input: input.reference,
      });
      if (!created) notFound();
      return created;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw visualUploadError(error);
    }
  }),
  // Client-facing "what have I already shared" list - scoped to the
  // client's own uploads for this shoot only.
  listClientVisualReferences: publicProcedure.input(z.object({ token: tokenSchema })).query(async ({ input }) => {
    const state = await getClientInvitation(input.token);
    if (!state) notFound();
    return listShootVisualReferencesForClient(state.shoot.id);
  }),
  removeClientVisualReference: publicProcedure.input(z.object({ token: tokenSchema, assetId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const state = await getClientInvitation(input.token);
      if (!state || state.invitation.status !== "active") notFound();
      const removed = await removeClientVisualReference({ shootId: state.shoot.id, assetId: input.assetId });
      if (!removed) notFound();
      return { removed: true as const };
    }),
  // Client confirm/request-change response to the scheduled date, time, and
  // location. Deliberately separate from Discovery/Creative Direction - see
  // recordShootScheduleResponse in db.ts.
  respondToShootSchedule: publicProcedure.input(z.object({ token: tokenSchema, input: respondToShootScheduleInputSchema }))
    .mutation(async ({ input }) => {
      const state = await getClientInvitation(input.token);
      if (!state || state.invitation.status !== "active") notFound();
      return recordShootScheduleResponse({
        shootId: state.shoot.id,
        photographerUserId: state.shoot.photographerUserId,
        response: input.input.response,
        note: input.input.note,
      });
    }),
  createRealtimeCall: publicProcedure.input(z.object({
    token: tokenSchema,
    sdp: z.string().min(100).max(100_000),
    consentAcknowledged: z.literal(true),
  })).mutation(async ({ input }) => {
    try {
      const call = await createRealtimeWebRtcCall({ token: input.token, sdp: input.sdp });
      if (!call) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This preparation link cannot start a realtime session" });
      return call;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.warn("MIRA realtime session could not start", error instanceof Error ? error.message : "unknown error");
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "MIRA voice is temporarily unavailable. Please try again." });
    }
  }),
  applyRealtimeMemory: publicProcedure.input(z.object({ token: tokenSchema, sessionId: z.string().uuid(), input: realtimeMemoryToolInputSchema }))
    .mutation(async ({ input }) => {
      const result = await persistRealtimeMemoryTool(input);
      if (!result) notFound();
      return result;
    }),
  createRealtimeSummary: publicProcedure.input(z.object({ token: tokenSchema, sessionId: z.string().uuid(), input: createDiscoverySummaryInputSchema }))
    .mutation(async ({ input }) => {
      const result = await createRealtimeDiscoverySummary({ token: input.token, sessionId: input.sessionId, summaryText: input.input.summaryText });
      if (!result) notFound();
      return result;
    }),
  confirmRealtimeSummary: publicProcedure.input(z.object({ token: tokenSchema, sessionId: z.string().uuid(), input: confirmDiscoverySummaryInputSchema }))
    .mutation(async ({ input }) => {
      const result = await confirmRealtimeDiscoverySummary({ token: input.token, sessionId: input.sessionId, summaryId: input.input.summaryId });
      if (!result) notFound();
      if (!result.confirmed) return result;
      const state = await getClientInvitation(input.token);
      if (!state) notFound();
      // Preparation is only allowed to activate once the real creative
      // pipeline (Creative DNA, then the existing V4 moodboard/campaign
      // engine) has actually produced its artifact. Discovery stays
      // confirmed-but-processing until then; it must never be skipped.
      let creativeDnaStatus: "complete" | "retryable_error" = "retryable_error";
      let moodboardStatus: "complete" | "retryable_error" = "retryable_error";
      let moodboardRenderStatus: "not_configured" | "pending" | "complete" | "failed" = "not_configured";
      try {
        const record = await generateShootCreativeDnaForConfirmedMemory({ shootId: state.shoot.id, photographerUserId: state.shoot.photographerUserId });
        creativeDnaStatus = record?.status === "complete" ? "complete" : "retryable_error";
        if (creativeDnaStatus === "complete" && record?.creativeDnaJson) {
          const moodboard = await generateShootMoodboardForCreativeDna({
            shootId: state.shoot.id,
            photographerUserId: state.shoot.photographerUserId,
            confirmedMemoryVersion: record.confirmedMemoryVersion,
            creativeDna: record.creativeDnaJson,
          });
          moodboardStatus = moodboard?.status === "complete" ? "complete" : "retryable_error";
          moodboardRenderStatus = moodboard?.renderStatus ?? "not_configured";
        }
      } catch (error) {
        console.warn("Shoot Creative DNA/moodboard generation deferred after confirmation", error instanceof Error ? error.message : "unknown error");
      }
      if (shouldActivateShootPreparation(creativeDnaStatus, moodboardStatus)) {
        await activatePreparationRoom(state.shoot.id);
        return { ...result, roomState: "preparation_active" as const, creativeDnaStatus, moodboardStatus, moodboardRenderStatus };
      }
      return { ...result, roomState: "discovery_confirmed" as const, creativeDnaStatus, moodboardStatus, moodboardRenderStatus };
    }),
  checkPreparationStatus: publicProcedure.input(z.object({ token: tokenSchema })).mutation(async ({ input }) => {
    const state = await getClientInvitation(input.token);
    if (!state) notFound();
    const raw = await getShootPreparationStatusForRealtime(state.shoot.id);
    // Never hand the realtime model raw DB enums/error codes (e.g. "retryable_error",
    // "creative_dna_synthesis_failed") - only plain booleans it can safely narrate.
    const ready = raw.roomState === "preparation_active";
    const stillWorking = !ready && raw.roomState === "discovery_confirmed"
      && raw.creativeDna?.status !== "retryable_error" && raw.moodboard?.status !== "retryable_error";
    const needsRetry = !ready && raw.roomState === "discovery_confirmed"
      && (raw.creativeDna?.status === "retryable_error" || raw.moodboard?.status === "retryable_error");
    return { moodboardReady: ready, stillWorking, needsRetry };
  }),
  classifyRealtimeInput: publicProcedure.input(z.object({ token: tokenSchema, sessionId: z.string().uuid(), content: z.string().max(8000), confidence: z.number().min(0).max(1).nullable().optional() }))
    .mutation(async ({ input }) => {
      const state = await getClientInvitation(input.token);
      if (!state) notFound();
      return classifyRealtimeTranscript(input.content, input.confidence);
    }),
  appendRealtimeQaEvent: publicProcedure.input(z.object({ token: tokenSchema, sessionId: z.string().uuid(), direction: z.enum(["client", "assistant"]), modality: z.enum(["voice_transcript", "text_fallback"]), content: z.string().trim().min(1).max(8000) }))
    .mutation(async ({ input }) => ({ saved: await appendRealtimeQaEvent(input) })),
  listRealtimeQaEvents: protectedProcedure.input(z.object({ shootId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const events = await listRealtimeQaEventsForOwner(ctx.user.id, input.shootId);
    if (!events) notFound();
    return events;
  }),
  deleteRealtimeQaEvents: protectedProcedure.input(z.object({ shootId: z.number().int().positive() })).mutation(async ({ ctx, input }) => ({ deleted: await deleteRealtimeQaEventsForOwner(ctx.user.id, input.shootId) })),
  getShootCreativeDna: protectedProcedure.input(z.object({ shootId: z.number().int().positive() })).query(({ ctx, input }) => getShootCreativeDnaForOwner(ctx.user.id, input.shootId)),
  getShootMoodboard: protectedProcedure.input(z.object({ shootId: z.number().int().positive() })).query(({ ctx, input }) => getShootMoodboardForOwner(ctx.user.id, input.shootId)),
  // Photographer-only completion of the journey. Only succeeds once the
  // creative pipeline has actually activated Preparation (roomState) for this
  // shoot - never lets the photographer skip ahead of the client's own room.
  markShootReadyToShoot: protectedProcedure.input(z.object({ shootId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const updated = await markShootReadyToShoot({ photographerUserId: ctx.user.id, shootId: input.shootId });
      if (!updated) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This shoot isn't ready to be marked Ready to Shoot yet." });
      return { readyToShoot: true as const };
    }),
  setRealtimePaused: publicProcedure.input(z.object({ token: tokenSchema, sessionId: z.string().uuid(), paused: z.boolean() }))
    .mutation(async ({ input }) => ({ updated: await setRealtimeSessionPaused(input) })),
  finalizeRealtime: publicProcedure.input(z.object({ token: tokenSchema, sessionId: z.string().uuid(), completed: z.boolean(), reason: z.string().trim().min(1).max(200), clientStatement: z.string().trim().max(2000).nullable().optional() }))
    .mutation(async ({ input, ctx }) => {
      const result = await finalizeRealtimeSession(input);
      if (!result) notFound();
      if (result.completed && !result.alreadyFinalized) void notifyPhotographerOfCompletion({ shootId: result.shootId, requestOrigin: requestOrigin(ctx.req) }).catch(error => console.warn("MIRA completion email was not delivered", error instanceof Error ? error.message : "unknown error"));
      if (result.completed && !result.alreadyFinalized && ENV.paymentMode === "stripe" && !ENV.miraLocalFileStore) void getClientInvitation(input.token).then(state => state ? cancelMiraEmailOutbox(new DrizzleEmailOutboxRepository(), state.invitation.id, "preparation_completed") : undefined).catch(() => undefined);
      return result;
    }),
  startTextTestSession: publicProcedure.input(z.object({
    token: tokenSchema,
    consentAcknowledged: z.literal(true),
  })).mutation(async ({ input }) => {
    const session = await startTextTestSession(input.token, input.consentAcknowledged);
    if (!session) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This preparation link cannot start another session" });
    return session;
  }),
  submitTextTestTurn: publicProcedure.input(z.object({
    token: tokenSchema,
    sessionId: z.string().uuid(),
    answer: z.string().trim().min(1).max(4000),
  })).mutation(async ({ input, ctx }) => {
    const result = await submitTextTestTurn(input);
    if (!result) notFound();
    if (result.complete) {
      void notifyPhotographerOfCompletion({
        shootId: result.shootId,
        requestOrigin: requestOrigin(ctx.req),
      }).catch(error => console.warn("MIRA completion email was not delivered", error instanceof Error ? error.message : "unknown error"));
      if (ENV.paymentMode === "stripe" && !ENV.miraLocalFileStore) void getClientInvitation(input.token).then(state => state ? cancelMiraEmailOutbox(new DrizzleEmailOutboxRepository(), state.invitation.id, "preparation_completed") : undefined).catch(() => undefined);
    }
    return result;
  }),
  endTextTestSession: publicProcedure.input(z.object({
    token: tokenSchema,
    sessionId: z.string().uuid(),
  })).mutation(async ({ input }) => ({ ended: await endTextTestSession(input) })),
});
