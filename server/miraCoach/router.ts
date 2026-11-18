import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { coachTurnInputSchema, completedCoachTurnSchema, coachMemoryListInputSchema, coachMemoryDecisionInputSchema } from "../../shared/miraCoach";
import { addCoachSourceInputSchema, listCoachSourcesInputSchema, withdrawCoachSourceInputSchema } from "../../shared/miraSources";
import { coachApiCall, createCoachRuntime, type CoachRuntime } from "./runtime";

import { configureDirectionInputSchema, saveDirectionInputSchema, reviewDirectionInputSchema, approveDirectionInputSchema } from "../../shared/miraBrandDirection";
import { interviewReviewInputSchema, interviewConfirmInputSchema, interviewProposalReviewInputSchema, interviewReflectionInputSchema } from "../../shared/miraInterview";
import { callClockCommandSchema, callClockStatusSchema } from "../../shared/miraCallClock";
import { directionBriefSchema } from "../../shared/miraDirectionBrief";

const workspaceInput = z.object({ workspaceId: z.number().int().positive() }).strict();
const conversationInput = workspaceInput.extend({ conversationId: z.string().uuid() }).strict();

export function createCoachRouter(options: {
  enabled: () => boolean;
  runtime: () => Promise<CoachRuntime>;
}) {
  const procedure = protectedProcedure.use(async ({ next }) => {
    if (!options.enabled()) throw new TRPCError({ code: "NOT_FOUND", message: "Brand coaching is not available." });
    return next();
  });
  return router({
    readDirectionBrief: procedure.input(conversationInput).output(directionBriefSchema).query(({ ctx, input }) => coachApiCall(async () =>
      (await options.runtime()).readDirectionBrief({ ...input, userId: ctx.user.id }))),
    readCallClock: procedure.input(conversationInput).output(callClockStatusSchema.nullable()).query(({ ctx, input }) => coachApiCall(async () => (await options.runtime()).readCallClock({ ...input, userId: ctx.user.id }))),
    controlCallClock: procedure.input(callClockCommandSchema).output(callClockStatusSchema).mutation(({ ctx, input }) => coachApiCall(async () => (await options.runtime()).controlCallClock(ctx.user.id, input))),
    callTurn: procedure.input(coachTurnInputSchema).output(completedCoachTurnSchema).mutation(({ ctx, input }) => coachApiCall(async () => (await options.runtime()).runCall(ctx.user.id, input))),
    readInterview: procedure.input(conversationInput).query(({ ctx, input }) => coachApiCall(async () => (await options.runtime()).readInterview({ ...input, userId: ctx.user.id }))),
    confirmInterviewReflection: procedure.input(interviewReflectionInputSchema).mutation(({ ctx, input }) => coachApiCall(async () => (await options.runtime()).confirmInterviewReflection(ctx.user.id, input))),
    reviewInterview: procedure.input(interviewReviewInputSchema).mutation(({ ctx, input }) => coachApiCall(async () => (await options.runtime()).reviewInterview(ctx.user.id, input))),
    reviewInterviewProposal: procedure.input(interviewProposalReviewInputSchema).mutation(({ ctx, input }) => coachApiCall(async () => (await options.runtime()).reviewInterviewProposal(ctx.user.id, input))),
    confirmInterviewReview: procedure.input(interviewConfirmInputSchema).mutation(({ ctx, input }) => coachApiCall(async () => (await options.runtime()).confirmInterviewReview(ctx.user.id, input))),
    readDirection: procedure.input(conversationInput).query(({ctx, input}) => coachApiCall(async () => (await options.runtime()).readDirection({ ...input, userId: ctx.user.id }))),
    configureDirection: procedure.input(configureDirectionInputSchema).mutation(({ctx, input}) => coachApiCall(async () => (await options.runtime()).configureDirection(ctx.user.id, input))),
    saveDirection: procedure.input(saveDirectionInputSchema).mutation(({ctx, input}) => coachApiCall(async () => (await options.runtime()).saveDirection(ctx.user.id, input))),
    reviewDirection: procedure.input(reviewDirectionInputSchema).mutation(({ctx, input}) => coachApiCall(async () => (await options.runtime()).reviewDirection(ctx.user.id, input))),
    approveDirection: procedure.input(approveDirectionInputSchema).mutation(({ctx, input}) => coachApiCall(async () => (await options.runtime()).approveDirection(ctx.user.id, input))),
    availability: protectedProcedure.query(() => ({ enabled: options.enabled() })),
    listConversations: procedure.input(workspaceInput.extend({ beforeId: z.string().uuid().optional() }).strict())
      .query(({ ctx, input }) => coachApiCall(async () =>
        (await options.runtime()).listConversations(ctx.user.id, input.workspaceId, input.beforeId))),
    createConversation: procedure.input(workspaceInput).mutation(({ ctx, input }) => coachApiCall(async () => ({
      conversationId: await (await options.runtime()).createConversation(ctx.user.id, input.workspaceId),
    }))),
    getConversation: procedure.input(conversationInput).query(({ ctx, input }) => coachApiCall(async () => {
      const context = await (await options.runtime()).readBrandContext({ ...input, userId: ctx.user.id });
      return { conversationId: context.conversationId, revision: context.revision, messages: context.messages };
    })),
    addSource: procedure.input(addCoachSourceInputSchema).mutation(({ ctx, input }) => coachApiCall(async () =>
      (await options.runtime()).addSource(ctx.user.id, input))),
    listSources: procedure.input(listCoachSourcesInputSchema).query(({ ctx, input }) => coachApiCall(async () =>
      (await options.runtime()).listSources({ workspaceId: input.workspaceId, conversationId: input.conversationId, userId: ctx.user.id }, input.beforeId))),
    withdrawSource: procedure.input(withdrawCoachSourceInputSchema).mutation(({ ctx, input }) => coachApiCall(async () =>
      (await options.runtime()).withdrawSource(ctx.user.id, input))),
    listMemory: procedure.input(coachMemoryListInputSchema).query(({ ctx, input }) => coachApiCall(async () =>
      (await options.runtime()).listMemory({ workspaceId: input.workspaceId, conversationId: input.conversationId, userId: ctx.user.id }, input.beforeId))),
    decideMemory: procedure.input(coachMemoryDecisionInputSchema).mutation(({ ctx, input }) => coachApiCall(async () =>
      (await options.runtime()).decideMemory(ctx.user.id, input))),
    turn: procedure.input(coachTurnInputSchema).output(completedCoachTurnSchema)
      .mutation(({ ctx, input }) => coachApiCall(async () => (await options.runtime()).run(ctx.user.id, input))),
  });
}

export const miraCoachRouter = createCoachRouter({
  enabled: () => process.env.MIRA_COACH_ENABLED === "true", runtime: () => createCoachRuntime(),
});
