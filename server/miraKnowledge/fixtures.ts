// Synthetic verification data only. Never seeded or published by application startup.
import type { KnowledgeBundle } from "../../shared/miraKnowledge";
export function syntheticKnowledgeBundle(): KnowledgeBundle {
  return { formatVersion: 1,
    sources: [{ id: "synthetic-marketing-pdf", version: 1, title: "Synthetic marketing notes (not a real book)", author: "Test author", edition: "Test edition", kind: "pdf", assetReference: null,
      intendedUse: "Test reviewed summaries and page references", rightsBasis: "permission", rightsEvidence: "Synthetic permission record; no actual document imported" }],
    items: [{ id: "audience-before-style", version: 1, kind: "card", language: "en", title: "Synthetic positioning example", category: "positioning",
      segments: ["personal_brand", "small_business"], decisionDimensions: ["audience", "intended-use"], authorship: "source_summary", authorName: "Test editor",
      sourceRefs: [{ id: "synthetic-marketing-pdf", version: 1, locator: "Page 7 (synthetic)" }],
      principle: "Understand the intended audience before proposing a presentation style.", useWhen: ["An audience is unclear"], requiredClientEvidence: ["Client description of their audience"],
      application: ["Check the proposed direction against the confirmed audience"], limitations: ["Do not infer an audience from appearance"] },
      { id: "metaphor-is-not-location", version: 1, kind: "judgement", language: "en", title: "Synthetic visual judgement example", segments: ["personal_brand"], decisionDimensions: ["visual-atmosphere"],
        authorship: "original", authorName: "Test editor", sourceRefs: [], limitations: ["Illustrative case, not an approved interview recipe"], origin: "synthetic_editorial",
        situation: "A fictional client says a brand should feel like a beach gathering", originalProposal: "Book a beach location", correction: "Clarify which part of the feeling matters",
        betterResponse: "Separate atmosphere from literal location", explanation: "A metaphor does not establish a practical requirement" }],
  };
}
