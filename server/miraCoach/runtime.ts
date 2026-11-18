import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { createCoachWorkflow } from "./graph";
import { coachModelConfig, createCoachModel } from "./model";
import { createCoachObserver } from "./observability";
import { createCoachStore } from "./store";

import { createKnowledgeRepository } from "../miraKnowledge/repository";
import { createConfiguredKnowledgeRetriever } from "../miraKnowledge/configuredRetrieve";

export type CoachRuntime = {
  readDirectionBrief: ReturnType<typeof createCoachStore>["readDirectionBrief"];
  readSpokenReply: ReturnType<typeof createCoachStore>["readSpokenReply"];
  remainingCallMs: ReturnType<typeof createCoachStore>["remainingCallMs"];
  readCallClock: ReturnType<typeof createCoachStore>["readCallClock"];
  controlCallClock: ReturnType<typeof createCoachStore>["controlCallClock"];
  runCall: ReturnType<typeof createCoachWorkflow>["run"];
  readInterview: ReturnType<typeof createCoachStore>["readInterview"];
  confirmInterviewReflection: ReturnType<typeof createCoachStore>["confirmInterviewReflection"];
  reviewInterview: ReturnType<typeof createCoachStore>["reviewInterview"];
  reviewInterviewProposal: ReturnType<typeof createCoachStore>["reviewInterviewProposal"];
  confirmInterviewReview: ReturnType<typeof createCoachStore>["confirmInterviewReview"];
  readDirection: ReturnType<typeof createCoachStore>["readDirection"];
  configureDirection: ReturnType<typeof createCoachStore>["configureDirection"];
  saveDirection: ReturnType<typeof createCoachStore>["saveDirection"];
  reviewDirection: ReturnType<typeof createCoachStore>["reviewDirection"];
  approveDirection: ReturnType<typeof createCoachStore>["approveDirection"];
  listConversations: ReturnType<typeof createCoachStore>["listConversations"];
  createConversation(userId: number, workspaceId: number): Promise<string>;
  addSource: ReturnType<typeof createCoachStore>["addSource"];
  listSources: ReturnType<typeof createCoachStore>["listSources"];
  withdrawSource: ReturnType<typeof createCoachStore>["withdrawSource"];
  listMemory: ReturnType<typeof createCoachStore>["listMemory"];
  decideMemory: ReturnType<typeof createCoachStore>["decideMemory"];
  readBrandContext: ReturnType<typeof createCoachStore>["readBrandContext"];
  run: ReturnType<typeof createCoachWorkflow>["run"];
};

// Lazy construction: disabled routes and server imports never initialise providers.
export async function createCoachRuntime(env: NodeJS.ProcessEnv = process.env): Promise<CoachRuntime> {
  const db = await getDb();
  if (!db) throw new Error("Coach database unavailable");
  const store = createCoachStore(db, () => new Date(), { interviewEnabled: env.MIRA_COACH_INTERVIEW_ENABLED === "true", callEnabled: env.MIRA_COACH_CALL_ENABLED === "true" });
  const config = coachModelConfig(env);
  const draftReply: Parameters<typeof createCoachWorkflow>[0]["draftReply"] = input => createCoachModel(config)(input);
  const observer = createCoachObserver({ enabled: env.MIRA_COACH_TELEMETRY_ENABLED === "true",
    apiKey: env.LANGSMITH_API_KEY, project: env.LANGSMITH_PROJECT,
    endpoint: env.LANGSMITH_ENDPOINT, workspaceId: env.LANGSMITH_WORKSPACE_ID });
  const retrieveGuidance = createConfiguredKnowledgeRetriever({ env, snapshot: () => createKnowledgeRepository(db).publishedSnapshot() });
  const call = createCoachWorkflow({ ...store, draftReply, retrieveGuidance, remainingInterviewMs: scope => store.remainingCallMs(scope) }, observer, { call: true });
  return { ...store, ...createCoachWorkflow({ ...store, draftReply, retrieveGuidance }, observer), runCall: call.run };
}

export async function coachApiCall<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof TRPCError && ["FORBIDDEN", "NOT_FOUND", "CONFLICT", "BAD_REQUEST"].includes(error.code)) throw error;
    // Do not expose SQL/provider/configuration errors or their causes to clients.
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Brand coaching is temporarily unavailable. Please retry later." });
  }
}
