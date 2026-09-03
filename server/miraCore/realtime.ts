import { createHash } from "node:crypto";
import { ENV } from "../_core/env";
import { MIRA_MASTER_PROMPT, MIRA_MASTER_PROMPT_VERSION } from "./masterPrompt";
import { getClientInvitation, getLatestShootMemory, startOrResumeRealtimeSession, updateRealtimeProviderCall } from "./db";
import { SHOOT_MEMORY_PATHS } from "../../shared/miraCore";
import { evaluateDiscoveryGate } from "./memory";
import { daysUntilShoot, MIRA_CORE_REMOTE_PHOTOGRAPHY_KNOWLEDGE } from "./coreKnowledge";
import { listShootVisualEvidenceForRealtime } from "./visualReferences";

export function resolveRealtimeVoice(customVoiceId: string | undefined = ENV.openAiRealtimeCustomVoiceId, fallback = ENV.openAiRealtimeVoice) {
  return (customVoiceId ?? "").trim() || fallback;
}

export function buildRealtimeSessionConfig(context: {
  shoot: { id: number; title: string; shootType: string | null; clientName: string | null; clientEmail: string | null; scheduledAt: Date | string | null; timezone: string; intendedUse: string | null; location: string | null; durationMinutes: number | null; photographerNotes: string | null; roomState: string };
  photographer: { displayName: string; businessName: string | null; bio: string | null; photographyStyle: string | null; areasOfExpertise: string[] | null; websiteUrl: string | null; instagramUrl: string | null } | null;
  memory: unknown;
  visualReferences?: unknown[];
  now?: Date;
}) {
  const gate = evaluateDiscoveryGate(context.memory as any);
  const now = context.now ?? new Date();
  const timing = { currentDate: now.toISOString(), daysUntilShoot: daysUntilShoot(context.shoot.scheduledAt, now) };
  const pipelineReady = context.shoot.roomState === "preparation_active";
  const pipelineProcessing = context.shoot.roomState === "discovery_confirmed";
  const modeRules = pipelineReady
    ? "MODE: PREPARATION. Welcome the client back. Use confirmed memory to answer their question. Do not restart Discovery or call update_shoot_memory for ordinary preparation questions."
    : pipelineProcessing
      ? "MODE: CREATIVE_PROCESSING. Discovery is confirmed and closed; never reopen it or ask further discovery questions. Their moodboard is being put together separately, not by you, and it may still be a little while or may need one more try. If the client asks about their moodboard, creative direction, or what happens next (including anything like \"can I see it\"), call check_preparation_status and speak from its result in plain warm language only: if moodboardReady, welcome them into preparation; if stillWorking, let them know it's still coming together and to check back shortly; if needsRetry, warmly say it needs a little more time and you'll have it shortly, and never suggest anything is wrong on their end. Never describe, imagine, or narrate colours, scenes, wardrobe, or images yourself here - you have not seen any generated visuals. Never use technical words like pipeline, backend, gate, tick, system, field, error, or status, and never explain how any of this works internally."
      : context.shoot.roomState === "welcome" || context.shoot.roomState === "discovery_offered"
        ? "MODE: WELCOME. Use known context naturally, establish how the client feels and whether remote shooting is familiar, explain it if useful, and offer deeper Discovery now or later. Do not behave like a form."
        : "MODE: DISCOVERY. Continue adaptive Discovery from current memory. Ask one meaningful question at a time.";
  const instructions = `${MIRA_MASTER_PROMPT}\n\n${MIRA_CORE_REMOTE_PHOTOGRAPHY_KNOWLEDGE}\n\nREALTIME RULES\n${modeRules}\nDuring Discovery, after every meaningful client statement call update_shoot_memory silently before asking the next question - never say things like "let me think", "let me note that", "let me capture that", or any other narration of this internal step; just ask the next question or respond naturally. Set significance=significant_unexplored and retain an open question when important new material needs exploration. Direct answers are explicit and outrank interpretations. If new information conflicts, clarify it before replacing an explicit fact. Until ready=true, remain in discovery. When ready=true, synthesis is permitted but not required. Use create_discovery_summary exactly once when genuinely ready.\nVisual analyses are OBSERVATIONS, not client preferences. Never write an observed cue into preference memory unless the client explicitly adopts it. Explicit client statements outrank visual inference. The room has a visible JPG/PNG/WebP upload control, but you cannot inspect a social or website URL directly; ask for a screenshot, uploaded image, or description and never claim that you visited a link.\nIf the client clearly and unambiguously signals they are finished for now (for example "we're done", "that's everything", "this is exactly what I need", "I'm finished"), call finalize_preparation with their own words in clientStatement. Do not call it for ordinary politeness such as "thanks" or "sounds good" - only call it when the client is clearly signalling completion, not merely satisfaction with one answer.\n\nDISCOVERY GATE\n${JSON.stringify(gate)}\n\nDATE CONTEXT\n${JSON.stringify(timing)}\n\nSHOOT CONTEXT\n${JSON.stringify(context.shoot)}\n\nPHOTOGRAPHER PROFILE\n${JSON.stringify(context.photographer)}\n\nSHOOT VISUAL EVIDENCE\n${JSON.stringify(context.visualReferences ?? [])}\n\nCURRENT SHOOT MEMORY\n${JSON.stringify(context.memory)}`;
  return {
    type: "realtime" as const,
    model: ENV.openAiRealtimeModel,
    output_modalities: ["audio"],
    instructions,
    audio: {
      input: {
        transcription: { model: ENV.openAiRealtimeTranscriptionModel },
        turn_detection: { type: "semantic_vad", eagerness: "auto", create_response: false, interrupt_response: true },
      },
      output: { voice: resolveRealtimeVoice() },
    },
    tools: [
      {
        type: "function", name: "update_shoot_memory",
        description: "Persist meaningful client information into the canonical ShootMemory revision engine. Call silently and continue the conversation naturally - never narrate that you are thinking, noting, capturing, or processing this call.",
        parameters: {
          type: "object", additionalProperties: false, required: ["statement", "changes"],
          properties: {
            statement: { type: "string" },
            significance: { enum: ["routine", "significant_unexplored", "significant_explored"] },
            changes: { type: "array", minItems: 1, items: { oneOf: [
              { type: "object", additionalProperties: false, required: ["operation", "path", "value", "kind", "confidence", "clientConfirmed"], properties: { operation: { const: "set" }, path: { enum: SHOOT_MEMORY_PATHS }, value: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] }, kind: { enum: ["explicit", "interpreted"] }, confidence: { enum: ["high", "medium", "low"] }, clientConfirmed: { type: "boolean" } } },
              { type: "object", additionalProperties: false, required: ["operation", "path", "reason"], properties: { operation: { const: "unset" }, path: { enum: SHOOT_MEMORY_PATHS }, reason: { type: "string" } } },
            ] } },
            openQuestions: { type: "array", items: { type: "string" } },
          },
        },
      },
      { type: "function", name: "create_discovery_summary", description: "Create one versioned final Discovery summary before speaking it. Call silently; after the tool returns, speak the returned summary once and ask for confirmation in the same response.", parameters: { type: "object", additionalProperties: false, required: ["summaryText"], properties: { summaryText: { type: "string", minLength: 80, maxLength: 5000 } } } },
      { type: "function", name: "confirm_discovery_summary", description: "Record explicit confirmation of the already delivered summary.", parameters: { type: "object", additionalProperties: false, required: ["summaryId", "confirmed"], properties: { summaryId: { type: "string" }, confirmed: { const: true } } } },
      {
        type: "function", name: "check_preparation_status",
        description: "Call this whenever the client asks about their moodboard, creative direction, or what happens next. Returns { moodboardReady, stillWorking, needsRetry } - three plain flags, nothing technical. Speak naturally from these flags only; never invent, imagine, or verbally describe a moodboard yourself, and never say technical words like pipeline, backend, gate, tick, system, field, error, or status.",
        parameters: { type: "object", additionalProperties: false, properties: {} },
      },
      {
        type: "function", name: "finalize_preparation",
        description: "Call only when the client clearly and unambiguously signals they are finished for now (e.g. \"we're done\", \"that's everything\", \"this is exactly what I need\", \"I'm finished\"). Never call this for ordinary politeness like \"thanks\" or \"sounds good\".",
        parameters: { type: "object", additionalProperties: false, required: ["clientStatement"], properties: { clientStatement: { type: "string", minLength: 4, maxLength: 2000, description: "The client's own words that signalled completion, quoted or closely paraphrased." } } },
      },
    ],
    tool_choice: "auto" as const,
  };
}

export async function createRealtimeWebRtcCall(params: { token: string; sdp: string }) {
  if (!ENV.embeddingApiKey) throw new Error("OpenAI realtime is not configured");
  const local = await startOrResumeRealtimeSession(params.token);
  if (!local) return null;
  const memory = await getLatestShootMemory(local.shoot.id);
  const invitation = await getClientInvitation(params.token);
  if (!invitation) return null;
  const visualReferences = await listShootVisualEvidenceForRealtime(local.shoot.id);
  const config = buildRealtimeSessionConfig({ shoot: local.shoot, photographer: invitation.photographer, memory, visualReferences });
  const form = new FormData();
  form.set("sdp", params.sdp);
  form.set("session", JSON.stringify(config));
  const safetyId = createHash("sha256").update(`mira-shoot:${local.shoot.id}`).digest("hex");
  const response = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: { Authorization: `Bearer ${ENV.embeddingApiKey}`, "OpenAI-Safety-Identifier": safetyId },
    body: form,
  });
  if (!response.ok) throw new Error(`OpenAI realtime authorization failed (${response.status})`);
  const answerSdp = await response.text();
  const location = response.headers.get("location");
  const providerCallId = location?.split("/").filter(Boolean).at(-1) ?? null;
  await updateRealtimeProviderCall(local.session.id, providerCallId);
  const elapsed = Math.max(0, Math.floor((Date.now() - local.session.startedAt.getTime()) / 1000));
  return {
    answerSdp,
    sessionId: local.session.id,
    promptVersion: MIRA_MASTER_PROMPT_VERSION,
    remainingSeconds: Math.max(0, local.session.allowedSeconds - elapsed),
    reused: local.reused,
    roomState: local.shoot.roomState,
  };
}
