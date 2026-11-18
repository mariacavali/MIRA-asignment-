import { emptyKnowledgeGuidance, type KnowledgeGuidance, type PublishedKnowledgeSnapshot } from "../../shared/miraKnowledgeRetrieval";
import { createKnowledgeRetriever } from "./retrieve";
import { pineconeTarget } from "./pineconePlan";
import { createPineconeDocumentClient } from "./pineconeClient";
import { createPineconeKnowledgeRetriever } from "./pineconeRetrieve";
import type { ConversationStage } from '../miraCoach/conversationContext';

export function createConfiguredKnowledgeRetriever(options: { env: NodeJS.ProcessEnv; snapshot: () => Promise<PublishedKnowledgeSnapshot>; enabled?: boolean; fetcher?: typeof fetch }) {
  const env = options.env, enabled = options.enabled ?? env.MIRA_COACH_KNOWLEDGE_ENABLED === "true", language = env.MIRA_COACH_KNOWLEDGE_LANGUAGE || "en";
  const backend = env.MIRA_COACH_KNOWLEDGE_BACKEND || "lexical";
  if (backend === "lexical") return createKnowledgeRetriever({ enabled, language, snapshot: options.snapshot });
  let retrieve: ReturnType<typeof createPineconeKnowledgeRetriever> | undefined;
  return async (input: { message: string; segment: KnowledgeGuidance["segment"]; stage?: ConversationStage }): Promise<KnowledgeGuidance> => {
    if (backend !== "pinecone") return emptyKnowledgeGuidance("unconfigured", input.segment, language);
    if (!enabled || env.MIRA_PINECONE_READ_ENABLED !== "true") return emptyKnowledgeGuidance("disabled", input.segment, language, "pinecone-documents-v1");
    if (!input.segment) return emptyKnowledgeGuidance("unconfigured", null, language, "pinecone-documents-v1");
    try {
      if (!retrieve) {
        const target = pineconeTarget(env);
        const client = createPineconeDocumentClient({ target, apiKey: env.PINECONE_API_KEY || "", readEnabled: true, seedEnabled: false, fetcher: options.fetcher });
        retrieve = createPineconeKnowledgeRetriever({ enabled: true, language, target, snapshot: options.snapshot, search: client.search });
      }
      return await retrieve(input);
    } catch { return emptyKnowledgeGuidance("unavailable", input.segment, language, "pinecone-documents-v1"); }
  };
}
