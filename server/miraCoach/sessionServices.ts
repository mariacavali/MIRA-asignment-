import { resolve } from "node:path";
import type { Express } from "express";
import { createContext } from "../_core/context";
import { createCoachRuntime } from "./runtime";
import { registerSessionHttp } from "./sessionHttp";
import { createReferenceAssets } from "./referenceAssets";
import { createPdfExtractor } from "../miraKnowledge/pdfExtraction";
import { createReferenceObserver } from "./referenceObserver";
import { createSessionAudio } from "./audio";
import { getDb } from "../db";
import { createKnowledgeRepository } from "../miraKnowledge/repository";

export function registerConnectedSessionServices(app: Express, env: NodeJS.ProcessEnv = process.env) {
  const runtime = () => createCoachRuntime(env);
  const uploads = env.NODE_ENV === "development";
  const references = uploads ? createReferenceAssets({ root: resolve(env.MIRA_COACH_REFERENCE_ROOT || ".mira-local-data/coach-references"),
    store: { readBrandContext: async scope => (await runtime()).readBrandContext(scope), addSource: async (userId, input) => (await runtime()).addSource(userId, input), withdrawSource: async (userId, input) => (await runtime()).withdrawSource(userId, input) },
    observeImage: env.MIRA_COACH_REFERENCE_VISION_ENABLED === "true" && env.OPENAI_API_KEY ? createReferenceObserver({ apiKey: env.OPENAI_API_KEY, model: env.MIRA_COACH_MODEL || "gpt-5-mini" }) : undefined,
    extractPdf: createPdfExtractor({ python: env.MIRA_PDF_PYTHON || resolve(".mira-pdf-venv/bin/python") }) }) : null;
  const text = env.MIRA_COACH_ENABLED === "true" && env.MIRA_COACH_CALL_ENABLED === "true" && !!(env.MIRA_COACH_PROVIDER === "openai" ? env.OPENAI_API_KEY : env.BUILT_IN_FORGE_API_KEY);
  const voice = text && env.MIRA_COACH_AUDIO_ENABLED === "true" && !!env.OPENAI_API_KEY;
  const audio = voice ? createSessionAudio({ apiKey: env.OPENAI_API_KEY!, transcriptionModel: env.MIRA_COACH_TRANSCRIPTION_MODEL, speechModel: env.MIRA_COACH_SPEECH_MODEL, voice: env.MIRA_COACH_SPEECH_VOICE }) : null;
  registerSessionHttp(app, { runtime, references, audio, enabled: () => env.MIRA_COACH_ENABLED === "true", context: (req, res) => createContext({ req, res, info: undefined as never }),
    capabilities: async () => {
      const db = env.MIRA_COACH_KNOWLEDGE_ENABLED === "true" ? await getDb() : null;
      return { localReview: false, text, voice, vision: !!references && env.MIRA_COACH_REFERENCE_VISION_ENABLED === "true" && !!env.OPENAI_API_KEY, uploads,
        publishedKnowledge: !!db && !!(await createKnowledgeRepository(db).publishedSnapshot()).items.length,
        providerMessage: text ? voice ? "MIRA text and voice are connected." : "MIRA text is connected. Voice is not enabled yet." : "MIRA’s AI connection is not enabled yet." };
    } });
}
