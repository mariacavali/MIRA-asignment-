import { describe, expect, it } from "vitest";
import { coachDraftSchema, type BrandEvidence } from "../../shared/miraCoach";
import { interviewMappingsSchema } from "../../shared/miraInterview";
import { interviewCoverage } from "./coverage";
import { planInterview } from "./questionPlanner";
import { validateInterviewMappings } from "./interviewProposals";

const id = "4c7347c4-9f9d-4794-b2ae-9a3733790e31";
const configuration = { segment: "personal_brand" as const, accessMethod: "standalone_brand" as const, discoveryDepth: "deep" as const, brandStage: "starting" as const, shootId: null, shootFormat: null };
const plan = planInterview(interviewCoverage(configuration, null, [])!, configuration);
const draft = { response: "Let’s check that.", memoryProposals: [{ text: "I want my website to explain my offer.", kind: "explicit" as const }], interviewProposals: [{ area: "intended_use" as const, memoryId: null, memoryProposalIndex: 0 }] };
const evidence: BrandEvidence[] = [{ id, text: draft.memoryProposals[0].text, kind: "explicit", confirmed: true }];

describe("semantic discovery proposal boundary", () => {
  it("allows only references to supplied confirmed memory or this reply's pending memory", () => {
    expect(() => validateInterviewMappings(coachDraftSchema.parse(draft), plan, [])).not.toThrow();
    const existing = { ...draft, interviewProposals: [{ area: "intended_use" as const, memoryId: id, memoryProposalIndex: null }] };
    expect(() => validateInterviewMappings(existing, plan, evidence)).not.toThrow();
    expect(() => validateInterviewMappings(existing, plan, [])).toThrow("source");
    expect(() => validateInterviewMappings(existing, plan, [{ ...evidence[0], confirmed: false }])).toThrow("source");
    expect(() => validateInterviewMappings(existing, plan, [{ ...evidence[0], provenance: { sourceId: id, title: "Reference", rightsBasis: "client_owned", start: 0, end: 20 } }])).toThrow("source");
    expect(() => validateInterviewMappings({ ...draft, interviewProposals: [{ ...draft.interviewProposals[0], memoryProposalIndex: 5 }] }, plan, [])).toThrow("index");
  });
  it("requires quoted client correction to revisit settled/skipped areas and keeps service scope", () => {
    expect(() => validateInterviewMappings(draft, null, [])).toThrow("area");
    for (const status of ["answered", "unknown", "declined"] as const) {
      const changed = { ...plan, coverage: plan.coverage.map(item => item.area === "intended_use" ? { ...item, status } : item) };
      expect(() => validateInterviewMappings(draft, changed, [])).toThrow("area");
    }
    expect(() => validateInterviewMappings(draft, { ...plan, pendingAreas: ["intended_use"] }, [])).not.toThrow();
    expect(() => validateInterviewMappings({ ...draft, interviewProposals: [{ ...draft.interviewProposals[0], area: "existing_identity" }] }, plan, [])).toThrow("area");
  });
  it("rejects invented authority, ambiguous targets and duplicate area guesses", () => {
    const item = draft.interviewProposals[0];
    for (const values of [[{ ...item, memoryId: id }], [{ ...item, memoryProposalIndex: null }], [item, item], [{ ...item, status: "accepted" }]]) {
      expect(() => interviewMappingsSchema.parse(values)).toThrow();
    }
    expect(() => coachDraftSchema.parse({ ...draft, interviewPlan: { progressPercent: 100 } })).toThrow();
    expect(coachDraftSchema.parse({ response: "Historical reply", memoryProposals: [] }).interviewProposals).toBeUndefined();
  });
  it("allows a quoted client correction as new unapproved evidence, never as automatic approval", () => {
    const changed = { ...plan, coverage: plan.coverage.map(item => item.area === "intended_use" ? { ...item, status: "answered" as const } : item) };
    const corrected = { ...draft, interviewProposals: [{ ...draft.interviewProposals[0], correctionQuote: "Actually, I need it for workshops." }] };
    expect(() => validateInterviewMappings(corrected, changed, [], "Actually, I need it for workshops.")).not.toThrow();
    expect(() => validateInterviewMappings(corrected, changed, [], "This quote was never supplied.")).toThrow("area");
    expect(() => validateInterviewMappings({ ...corrected, interviewProposals: [{ ...corrected.interviewProposals[0], memoryId: id, memoryProposalIndex: null }] }, changed, evidence, "Actually, I need it for workshops.")).toThrow("area");
  });
  it("requires actual client text and scope for working skip/uncertainty states", () => {
    const state = { area: "voice" as const, status: "declined" as const, quote: "I'd rather skip voice for now." };
    const withState = { response: "Of course.", memoryProposals: [], interviewStates: [state] };
    expect(() => validateInterviewMappings(withState, plan, [], state.quote)).not.toThrow();
    expect(() => validateInterviewMappings(withState, plan, [], "I have not said that.")).toThrow("state");
    expect(() => validateInterviewMappings(withState, null, [], state.quote)).toThrow("state");
    expect(() => coachDraftSchema.parse({ ...withState, interviewStates: [state, state] })).toThrow();
    expect(() => validateInterviewMappings({ ...draft, interviewStates: [{ ...state, area: "intended_use" }] }, plan, [], state.quote)).toThrow("state");
  });
});
