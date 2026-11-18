import { traceable } from "langsmith/traceable";
import type { CoachObserver } from "./observability";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { brandEvidenceSchema, coachDraftSchema, coachInterviewOpeningSchema, coachMessageSchema, coachTurnInputSchema,
  type BrandEvidence, type CoachDraft, type CoachInterviewOpening, type CoachMessage, type CoachTurnInput, type CompletedCoachTurn } from "../../shared/miraCoach";
import { canUseWorkspaceCapability, type WorkspaceAccessContext, type WorkspaceGrant } from "../miraWorkspace/access";
import { coachPolicyForSegment, MIRA_COACH_POLICY_VERSION } from "./policy";

import { brandConfigurationSchema, type BrandConfiguration } from "../../shared/miraBrandDirection";
import { knowledgeGuidanceSchema, emptyKnowledgeGuidance, knowledgeTrace, type KnowledgeGuidance } from "../../shared/miraKnowledgeRetrieval";
import { interviewCoverageSchema, interviewWorkingEvidenceSchema, type InterviewCoverage, type InterviewPlan } from "../../shared/miraInterview";
import { planInterview } from "./questionPlanner";
import { validateInterviewMappings } from "./interviewProposals";
import { conversationRetrieval, clientConstraints, clientBoundaryIssues, type ConversationStage } from './conversationContext';

export type CoachScope = { userId: number; workspaceId: number; conversationId: string };
export type CoachContext = {
  workspaceId: number;
  conversationId: string;
  ownerUserId: number;
  revision: number;
  messages: CoachMessage[];
  evidence: BrandEvidence[];
  configuration?: BrandConfiguration | null;
  entryOpening?: CoachInterviewOpening;
  interview?: InterviewCoverage;
  interviewWorkingEvidence?: z.infer<typeof interviewWorkingEvidenceSchema>;
};
export type { CompletedCoachTurn, PendingMemoryProposal } from "../../shared/miraCoach";
export type TurnClaim = { kind: "completed"; result: CompletedCoachTurn }
  | { kind: "claimed"; leaseToken: string; expectedRevision: number };

// Server-owned ports. No model receives DB handles, auth records or unrestricted tools.
export interface CoachDependencies {
  loadAccess(userId: number, workspaceId: number): Promise<{ context: WorkspaceAccessContext; grants: WorkspaceGrant[] } | null>;
  readBrandContext(scope: CoachScope, query?: string): Promise<CoachContext | null>;
  retrieveGuidance?(input: { message: string; segment: KnowledgeGuidance["segment"]; stage?: ConversationStage }): Promise<KnowledgeGuidance>;
  remainingInterviewMs?(scope: CoachScope): Promise<number | null>;
  draftReply(input: { guidance?: KnowledgeGuidance; interviewWorkingEvidence?: z.infer<typeof interviewWorkingEvidenceSchema>; policy: string; policyVersion: string; message: string; messages: CoachMessage[]; evidence: BrandEvidence[] }): Promise<unknown>;
  beginTurn(input: { scope: CoachScope; requestId: string; message: string; call?: boolean }): Promise<TurnClaim>;
  abandonTurn(input: { scope: CoachScope; requestId: string; leaseToken: string }): Promise<void>;
  // Durable adapter checks lease, revision, current access and duplicate requests atomically.
  saveTurn(input: { scope: CoachScope; requestId: string; expectedRevision: number; leaseToken: string; message: string; result: CompletedCoachTurn; call?: boolean }): Promise<CompletedCoachTurn>;
  now(): Date;
}

const contextSchema = z.object({
  workspaceId: z.number().int().positive(), conversationId: z.string().uuid(),
  ownerUserId: z.number().int().positive(), revision: z.number().int().nonnegative(),
  configuration: brandConfigurationSchema.nullable().optional(),
  entryOpening: coachInterviewOpeningSchema.optional(),
  interview: interviewCoverageSchema.optional(),
  interviewWorkingEvidence: interviewWorkingEvidenceSchema.optional(),
  messages: z.array(coachMessageSchema).max(101), evidence: z.array(brandEvidenceSchema).max(100),
}).strict();

const TurnState = Annotation.Root({
  context: Annotation<CoachContext>,
  guidance: Annotation<KnowledgeGuidance>,
  interviewPlan: Annotation<InterviewPlan | null>,
  draft: Annotation<CoachDraft>,
  result: Annotation<CompletedCoachTurn>,
});

export function createCoachWorkflow(dependencies: CoachDependencies, observer?: CoachObserver, options: { call?: boolean } = {}) {
    async function execute(userId: number, rawInput: CoachTurnInput): Promise<CompletedCoachTurn> {
      // Legacy tracing/console settings bypass modern tracingEnabled controls in LangChain.
      if (process.env.LANGCHAIN_TRACING || process.env.LANGCHAIN_VERBOSE === "true") {
        throw new Error("Remove legacy LangChain tracing/verbose settings; coach telemetry is configured separately.");
      }
      const input = coachTurnInputSchema.parse(rawInput);
      const access = await dependencies.loadAccess(userId, input.workspaceId);
      if (!access || access.context.userId !== userId || access.context.workspace.id !== input.workspaceId
        || !canUseWorkspaceCapability(access.context, "brand_coaching", access.grants, dependencies.now())) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Brand coaching is not available for this workspace." });
      }
      const scope: CoachScope = { userId, workspaceId: input.workspaceId, conversationId: input.conversationId };
      const claim = await dependencies.beginTurn({ scope, requestId: input.requestId, message: input.message, ...(options.call ? { call: true } : {}) });
      if (claim.kind === "completed") return claim.result;
      // Completed turns are application checkpoints; graph nodes are not durable checkpoints.
      const graph = new StateGraph(TurnState)
        .addNode("read_brand_context", async () => {
          const context = await dependencies.readBrandContext(scope, input.message);
          if (!context || context.workspaceId !== scope.workspaceId || context.conversationId !== scope.conversationId
            || context.ownerUserId !== userId) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Brand conversation not found." });
          }
          if (context.revision !== claim.expectedRevision) {
            throw new TRPCError({ code: "CONFLICT", message: "The conversation changed. Please retry." });
          }
          return { context: contextSchema.parse(context) };
        })
        .addNode("plan_interview", async state => {
          const configuration = state.context.configuration;
          if (!state.context.interview || configuration?.segment !== "personal_brand") return { interviewPlan: null };
          const remainingMs = dependencies.remainingInterviewMs ? await dependencies.remainingInterviewMs(scope) : null;
          return { interviewPlan: planInterview(state.context.interview, configuration, remainingMs) };
        })
        .addNode("retrieve_guidance", async state => {
          const segment = state.context.configuration?.segment ?? null;
          // Short answers still need the topic of the actual conversation for
          // lexical retrieval. This remains scoped reference lookup, no AI call.
          const lookup = conversationRetrieval(input.message,state.context.messages);
          const guidance = dependencies.retrieveGuidance ? await dependencies.retrieveGuidance({ message: lookup.query, segment, stage: lookup.stage }) : emptyKnowledgeGuidance("disabled", segment);
          const parsed = knowledgeGuidanceSchema.parse(guidance);
          if (parsed.segment !== segment || parsed.cards.some(card => !segment || !card.item.segments.includes(segment))) throw new Error("Knowledge scope mismatch");
          return { guidance: parsed };
        })
        .addNode("draft_reply", async state => {
          const draft=coachDraftSchema.parse(await dependencies.draftReply({
          policy: coachPolicyForSegment(state.context.configuration?.segment ?? null, state.context.configuration?.brandStage, state.interviewPlan), policyVersion: MIRA_COACH_POLICY_VERSION,
          message: input.message, messages: state.context.messages, evidence: state.context.evidence, guidance: state.guidance,
          interviewWorkingEvidence: state.context.interviewWorkingEvidence,
          }));
          if(clientBoundaryIssues(draft.response,clientConstraints([...state.context.messages,{role:'client',content:input.message}],state.context.evidence)).length)throw new Error('Client service boundary conflict; response withheld.');
          return {draft};
        })
        .addNode("save_turn", async state => {
          validateInterviewMappings(state.draft, state.interviewPlan, state.context.evidence, input.message);
          const result: CompletedCoachTurn = {
            ...(state.draft.interviewStates?.length ? { interviewStates: state.draft.interviewStates } : {}),
            ...(state.draft.interviewProposals?.length ? { interviewProposals: state.draft.interviewProposals } : {}),
            ...(state.interviewPlan ? { interviewPlan: state.interviewPlan } : {}),
            ...(state.context.entryOpening ? { interviewOpening: state.context.entryOpening } : {}),
            knowledgeTrace: knowledgeTrace(state.guidance),
            response: state.draft.response,
            memoryProposals: state.draft.memoryProposals.map(proposal => ({ ...proposal,
              status: "pending_confirmation", sourceRequestId: input.requestId })),
          };
          const saved = await dependencies.saveTurn({ scope, requestId: input.requestId,
            ...(options.call ? { call: true } : {}),
            expectedRevision: claim.expectedRevision, leaseToken: claim.leaseToken, message: input.message, result });
          return { result: saved };
        })
        .addEdge(START, "read_brand_context")
        .addEdge("read_brand_context", "plan_interview")
        .addEdge("plan_interview", "retrieve_guidance")
        .addEdge("retrieve_guidance", "draft_reply")
        .addEdge("draft_reply", "save_turn")
        .addEdge("save_turn", END)
        .compile();
      try {
        const state = await graph.invoke({}, { recursionLimit: 10 });
        return state.result;
      } catch (error) {
        // Do not hide the original failure if cleanup itself is unavailable.
        await dependencies.abandonTurn({ scope, requestId: input.requestId, leaseToken: claim.leaseToken }).catch(() => undefined);
        throw error;
      }
    }
    const privateRun = traceable(execute, { name: "mira_private_coach", tracingEnabled: false });
    return { async run(userId: number, input: CoachTurnInput) {
      const start = Date.now();
      let outcome: "success" | "failure" = "failure";
      try { const result = await privateRun(userId, input); outcome = "success"; return result; }
      finally {
        if (observer) {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              observer({ outcome, durationMs: Math.max(0, Date.now() - start), policyVersion: MIRA_COACH_POLICY_VERSION }),
              new Promise<void>(resolve => { timer = setTimeout(resolve, 2000); }),
            ]);
          } catch { /* Telemetry cannot fail a saved coaching turn or expose raw errors. */ }
          finally { if (timer) clearTimeout(timer); }
        }
      }
    } };
}
