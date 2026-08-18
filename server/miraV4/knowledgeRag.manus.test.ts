import { describe, expect, it } from "vitest";
import { MIRA_KNOWLEDGE_OBJECTS, indexApprovedKnowledge, retrieveMiraKnowledge, retrieveMiraKnowledgeHybrid, type MiraEmbeddingProvider } from "./knowledgeRag";
import { buildLevel2FixtureAnswers, synthesizeMiraLevel2Preparation } from "./level2";

const queries = [
  ["founder wants authority without corporate stiffness", ["005", "010", "036", "044"]],
  ["user repeatedly chooses intimate framing and soft light", ["008", "016", "018"]],
  ["brand wants premium perception but rejects polished luxury", ["007", "041", "043", "050"]],
  ["campaign should feel energetic without using loud colour", ["022", "026", "031", "048"]],
  ["show expertise without laptop and coffee imagery", ["028", "036", "044", "046"]],
  ["architectural structure with warmth", ["005", "017", "037", "040"]],
  ["close portrait but the user dislikes direct eye contact", ["008", "011", "013", "027"]],
  ["a five-image campaign needs to feel like one story", ["006", "023", "047", "048"]],
  ["quiet, tactile images for craft-led work", ["016", "040", "041", "042"]],
  ["social video needs movement but the person hates posing", ["026", "028", "045", "050"]],
  ["the reference has beautiful light but the clothes are wrong", ["015", "016", "017", "049"]],
  ["international audience and colour is central to the campaign", ["021", "023", "025"]],
] as const;

const noBirthContext = {
  numerology: { status: "unavailable" as const, confidence: "low" as const, contextSummary: "Unavailable", lens: "None", source: "none" as const },
  humanDesign: { status: "unavailable" as const, confidence: "low" as const, note: "Unavailable", source: "none" as const },
};

describe("MIRA Knowledge Objects v1", () => {
  it("maps and indexes all 50 research-curated objects without claiming production publication", () => {
    expect(MIRA_KNOWLEDGE_OBJECTS).toHaveLength(50);
    expect(indexApprovedKnowledge(MIRA_KNOWLEDGE_OBJECTS)).toHaveLength(50);
    expect(new Set(MIRA_KNOWLEDGE_OBJECTS.map(item => item.category)).size).toBe(10);
    expect(MIRA_KNOWLEDGE_OBJECTS.every(item => item.publicationState === "research_curated_development")).toBe(true);
    expect(MIRA_KNOWLEDGE_OBJECTS.every(item => item.sources.length >= 1 && item.corpusVersion === "mira_knowledge_objects_v1")).toBe(true);
  });

  it("records the bounded lexical baseline across all 12 Manus queries", () => {
    let hits = 0;
    let expectedTotal = 0;
    let usefulQueries = 0;
    for (const [query, expected] of queries) {
      const results = retrieveMiraKnowledge({ query, objects: MIRA_KNOWLEDGE_OBJECTS, topK: 4 });
      const ids = results.map(item => item.knowledgeObjectId.slice(-3));
      const overlap = ids.filter(id => (expected as readonly string[]).includes(id));
      hits += overlap.length;
      expectedTotal += expected.length;
      if (overlap.length) usefulQueries += 1;
      expect(results).toHaveLength(4);
      expect(new Set(results.map(item => item.category)).size).toBe(results.length);
    }
    expect({ hits, expectedTotal, usefulQueries }).toEqual({ hits: 20, expectedTotal: 46, usefulQueries: 12 });
  });

  it.each([
    ["authority without corporate stiffness", "founder wants authority without corporate stiffness"],
    ["premium but rejects polished luxury", "brand wants premium perception but rejects polished luxury"],
    ["beautiful light but wrong clothes", "the reference has beautiful light but the clothes are wrong"],
    ["five-image coherent campaign", "a five-image campaign needs to feel like one story"],
  ])("qualifies synthesis for %s without replacing direct direction", (_label, query) => {
    const answers = buildLevel2FixtureAnswers("quiet_luxury");
    const retrievedKnowledge = retrieveMiraKnowledge({ query, objects: MIRA_KNOWLEDGE_OBJECTS, topK: 4 });
    const synthesis = synthesizeMiraLevel2Preparation({ answers, level1Result: null, secondaryHypotheses: noBirthContext, retrievedKnowledge });
    expect(synthesis.createPreparation.direction).toBe("Editorial intimacy with precise contrast.");
    expect(synthesis.createHandoff.knowledgeContext.retrievedKnowledge).toHaveLength(4);
    expect(synthesis.canonicalEvidence.filter(item => item.sourceType === "notion_rag").every(item => item.directness === "supporting_hypothesis" && !item.userConfirmed)).toBe(true);
  });

  it("keeps explicit user direction above contradictory real-corpus research", () => {
    const answers = buildLevel2FixtureAnswers("quiet_luxury");
    const contradictory = retrieveMiraKnowledge({ query: "energetic loud colour dynamic movement", objects: MIRA_KNOWLEDGE_OBJECTS, topK: 4 });
    const synthesis = synthesizeMiraLevel2Preparation({ answers, level1Result: null, secondaryHypotheses: noBirthContext, retrievedKnowledge: contradictory });
    expect(synthesis.createPreparation.direction).toBe("Editorial intimacy with precise contrast.");
    expect(synthesis.createHandoff.createHandoff.strongestEvidence.some(item => item.includes("Keep the work intimate"))).toBe(true);
  });

  it("falls back deterministically when embeddings are unavailable", async () => {
    const query = queries[0][0];
    const hybrid = await retrieveMiraKnowledgeHybrid({ query, objects: MIRA_KNOWLEDGE_OBJECTS, topK: 4, provider: null });
    expect(hybrid.status).toBe("lexical_fallback");
    expect(hybrid.results).toEqual(retrieveMiraKnowledge({ query, objects: MIRA_KNOWLEDGE_OBJECTS, topK: 4 }));
  });

  it("uses semantic similarity with a small lexical contribution and caches corpus embeddings", async () => {
    let calls = 0;
    const provider: MiraEmbeddingProvider = {
      id: "test-semantic", model: "test-v1",
      async embed(input) {
        calls += 1;
        return input.map(text => {
          const normalized = text.toLowerCase();
          return [normalized.includes("authority") ? 1 : 0, normalized.includes("movement") ? 1 : 0, 0.1];
        });
      },
    };
    const first = await retrieveMiraKnowledgeHybrid({ query: "credible authority", objects: MIRA_KNOWLEDGE_OBJECTS, topK: 4, provider });
    const second = await retrieveMiraKnowledgeHybrid({ query: "natural movement", objects: MIRA_KNOWLEDGE_OBJECTS, topK: 4, provider });
    expect(first.status).toBe("semantic");
    expect(second.status).toBe("semantic");
    expect(first.results[0]?.principle.toLowerCase()).toContain("authority");
    expect(second.results.some(item => `${item.title} ${item.principle}`.toLowerCase().includes("movement"))).toBe(true);
    expect(calls).toBe(3); // one cached corpus batch plus two query embeddings
  });
});
