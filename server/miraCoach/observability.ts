import { randomUUID } from "node:crypto";
import { Client } from "langsmith";
import { z } from "zod";

import { MIRA_COACH_POLICY_VERSION } from "./policy";

export const coachTraceEventSchema = z.object({
  outcome: z.enum(["success", "failure"]), durationMs: z.number().finite().nonnegative(),
  policyVersion: z.literal(MIRA_COACH_POLICY_VERSION),
}).strict();
export type CoachTraceEvent = z.infer<typeof coachTraceEventSchema>;
export type CoachObserver = (event: CoachTraceEvent) => Promise<void>;
export const LANGSMITH_ENDPOINTS = ["https://api.smith.langchain.com", "https://eu.api.smith.langchain.com"] as const;
export function langsmithEndpoint(value?: string) {
  const url = (value || LANGSMITH_ENDPOINTS[0]).replace(/\/$/, "");
  if (!(LANGSMITH_ENDPOINTS as readonly string[]).includes(url)) throw new Error("Select the US or EU LangSmith endpoint.");
  return url;
}

export function createCoachObserver(config: { enabled: boolean; apiKey?: string; project?: string; endpoint?: string; workspaceId?: string }, fetchImplementation?: typeof fetch): CoachObserver {
  if (!config.enabled) return async () => {};
  if (!config.apiKey?.trim() || !config.project?.trim()) throw new Error("LangSmith key and project are required to enable coach telemetry.");
  const client = new Client({ apiKey: config.apiKey, apiUrl: langsmithEndpoint(config.endpoint), workspaceId: config.workspaceId,
    timeout_ms: 1500, callerOptions: { maxRetries: 0 }, autoBatchTracing: false,
    hideInputs: true, hideOutputs: true, omitTracedRuntimeInfo: true,
    hideMetadata: metadata => ({ outcome: metadata.outcome, durationMs: metadata.durationMs, policyVersion: metadata.policyVersion }),
    anonymizer: () => ({}), fetchImplementation,
  });
  return async event => {
    const safe = coachTraceEventSchema.parse(event);
    const end = Date.now();
    await client.createRun({ id: randomUUID(), name: "MIRA coach turn", run_type: "chain", project_name: config.project,
      inputs: {}, outputs: {}, start_time: new Date(end - safe.durationMs).toISOString(), end_time: new Date(end).toISOString(),
      extra: { metadata: safe },
    });
  };
}
