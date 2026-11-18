import { describe, expect, it } from "vitest";
import { interviewCoverage, interviewMemoryHash, interviewProposalId, newInterviewLedger } from "./coverage";
import { interviewReflection } from "./reflection";
import { planInterview } from "./questionPlanner";

const configuration = { segment: "personal_brand" as const, accessMethod: "standalone_brand" as const, discoveryDepth: "deep" as const, brandStage: "starting" as const, shootId: null, shootFormat: null };
const id = "4c7347c4-9f9d-4794-b2ae-9a3733790e31";
const memory = { id, text: "I want my portfolio to explain my illustration offer.", kind: "explicit" as const, status: "pending_confirmation" };
describe("one source-linked discovery reflection", () => {
  it("can link one story to several areas without classifying or approving it for the client", () => {
    const ledger = newInterviewLedger(configuration);
    ledger.proposals = (["intended_use", "offer"] as const).map(area => ({ id: interviewProposalId(ledger.configurationKey, area, id, memory.text), area,
      memoryId: id, memoryHash: interviewMemoryHash(memory.text), sourceRequestId: id, status: "pending" }));
    const coverage = interviewCoverage(configuration, ledger, [memory])!;
    const reflection = interviewReflection(coverage, [memory]);
    expect(reflection).toMatchObject({ reviewed: false, answers: [{ area: "intended_use", text: memory.text, status: "proposed" }, { area: "offer", text: memory.text, status: "proposed" }] });
    expect(reflection.unresolved).toHaveLength(6);
    expect(coverage.progressPercent).toBe(10);
    expect(planInterview(coverage, configuration)).toMatchObject({ mode: "adaptive", nextArea: null, question: null, alternative: null, pendingAreas: ["intended_use", "offer"] });
  });
  it("binds review to the exact current meaning and distinguishes interpretation", () => {
    const ledger = newInterviewLedger(configuration);
    ledger.decisions = [{ area: "offer", status: "answered", memoryId: id, memoryHash: interviewMemoryHash(memory.text) }];
    const memories = [{ ...memory, status: "confirmed", kind: "interpreted" as const }];
    const coverage = interviewCoverage(configuration, ledger, memories)!;
    const before = interviewReflection(coverage, memories);
    expect(before.answers[0]).toMatchObject({ kind: "interpreted", status: "confirmed", proposalId: null });
    expect(interviewReflection(coverage, [{ ...memories[0], kind: "explicit" }]).fingerprint).not.toBe(before.fingerprint);
    ledger.reviewedFingerprint = coverage.fingerprint;
    const reviewed = interviewCoverage(configuration, ledger, memories)!;
    expect(interviewReflection(reviewed, memories).reviewed).toBe(true);
    // A reviewed partial reflection does not end discovery or invent 100%.
    expect(planInterview(reviewed, configuration)).toMatchObject({ phase: "discovery", nextArea: null, progressPercent: 30 });
  });
});
