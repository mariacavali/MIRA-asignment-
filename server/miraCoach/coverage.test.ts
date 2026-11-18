import { describe, expect, it } from "vitest";
import type { BrandConfiguration } from "../../shared/miraBrandDirection";
import { interviewReviewInputSchema, type InterviewLedger } from "../../shared/miraInterview";
import { interviewCoverage, interviewMemoryHash, interviewProposalId, newInterviewLedger, requiredInterviewAreas } from "./coverage";
import { planInterview } from "./questionPlanner";

const configuration: BrandConfiguration = { segment: "personal_brand", accessMethod: "standalone_brand", discoveryDepth: "deep", brandStage: "starting", shootId: null, shootFormat: null };
const id = "4c7347c4-9f9d-4794-b2ae-9a3733790e31";
const memory = { id, text: "I want a website that explains my offer.", status: "confirmed" };
const covered = (ledger: InterviewLedger, memories = [memory], config = configuration) => interviewCoverage(config, ledger, memories)!;

describe("reviewed discovery coverage and pacing", () => {
  it("starts at 10%, with service-specific areas and no guessed answers", () => {
    const result = covered(newInterviewLedger(configuration), []);
    expect(result).toMatchObject({ answered: 0, unresolved: 8, reviewed: false, progressPercent: 10 });
    expect(result.areas.every(item => item.status === "missing" && item.answer === null)).toBe(true);
    expect(requiredInterviewAreas({ ...configuration, brandStage: "established" })).toContain("existing_identity");
    expect(interviewCoverage({ ...configuration, segment: "personal", accessMethod: "paid_shoot" }, null, [])).toBeNull();
    expect(interviewCoverage({ ...configuration, segment: "small_business", accessMethod: "social_plan" }, null, [])).toBeNull();
  });
  it("requires a currently confirmed source and invalidates its review when corrected or withdrawn", () => {
    const ledger = newInterviewLedger(configuration);
    ledger.decisions = [{ area: "intended_use", status: "answered", memoryId: id }];
    const result = covered(ledger);
    expect(result).toMatchObject({ answered: 1, progressPercent: 20 });
    ledger.reviewedFingerprint = result.fingerprint;
    expect(covered(ledger).reviewed).toBe(true);
    for (const status of ["pending_confirmation", "rejected"]) {
      const changed = covered(ledger, [{ ...memory, status }]);
      expect(changed.areas[0]).toMatchObject({ status: "needs_review", memoryId: null, answer: null });
      expect(changed).toMatchObject({ answered: 0, reviewed: false, progressPercent: 10 });
    }
    expect(covered(ledger, [{ ...memory, text: "A corrected intention" }]).reviewed).toBe(false);
    expect(covered(ledger, [], { ...configuration, brandStage: "established" }).areas[0].status).toBe("needs_review");
  });
  it("does not turn uncertainty/skipping into answers or repeat those areas", () => {
    const ledger = newInterviewLedger(configuration);
    ledger.decisions = [{ area: "intended_use", status: "unknown", memoryId: null }, { area: "offer", status: "declined", memoryId: null }];
    const coverage = covered(ledger, []);
    expect(coverage).toMatchObject({ answered: 0, unresolved: 8, progressPercent: 10 });
    expect(planInterview(coverage, configuration)).toMatchObject({ phase: "discovery", nextArea: null, remainingMs: null });
    ledger.decisions.push({ area: "audience", status: "unknown", memoryId: null });
    expect(planInterview(covered(ledger, []), configuration).nextArea).toBeNull();
  });
  it("prioritises an invalidated source ahead of new discovery", () => {
    const ledger = newInterviewLedger(configuration);
    ledger.decisions = [{ area: "voice", status: "answered", memoryId: id }];
    expect(planInterview(covered(ledger, []), configuration).coverage).toContainEqual({ area: "voice", status: "needs_review" });
  });
  it("reserves reflection near the end and closes at zero using server time only", () => {
    const coverage = covered(newInterviewLedger(configuration), []);
    expect(planInterview(coverage, configuration, 300_001)).toMatchObject({ phase: "discovery", nextArea: null });
    expect(planInterview(coverage, configuration, 300_000)).toMatchObject({ phase: "reflection", nextArea: null, unresolved: 8 });
    expect(planInterview(coverage, configuration, 0)).toMatchObject({ phase: "closing", nextArea: null, question: null });
    for (const invalid of [-1, 1.5, Infinity, NaN]) expect(() => planInterview(coverage, configuration, invalid)).toThrow("Invalid server interview time");
  });
  it("only reaches 100% with all confirmed answers and a current review", () => {
    const ledger = newInterviewLedger(configuration);
    ledger.decisions = requiredInterviewAreas(configuration).map(area => ({ area, status: "answered", memoryId: id }));
    const before = covered(ledger);
    expect(before.progressPercent).toBe(90);
    expect(planInterview(before, configuration).phase).toBe("reflection");
    ledger.reviewedFingerprint = before.fingerprint;
    const reviewed = covered(ledger);
    expect(reviewed.progressPercent).toBe(100);
    expect(planInterview(reviewed, configuration).phase).toBe("reviewed");
    ledger.decisions[0] = { area: "intended_use", status: "declined", memoryId: null };
    expect(covered(ledger).reviewed).toBe(false);
  });
  it("lets every area remain declined without fabricating completed discovery", () => {
    const ledger = newInterviewLedger(configuration);
    ledger.decisions = requiredInterviewAreas(configuration).map(area => ({ area, status: "declined", memoryId: null }));
    const before = covered(ledger, []);
    ledger.reviewedFingerprint = before.fingerprint;
    const after = covered(ledger, []);
    expect(after).toMatchObject({ answered: 0, unresolved: 8, reviewed: true, progressPercent: 20 });
    expect(planInterview(before, configuration).phase).toBe("reflection");
  });
  it("rejects invented answers, source-less answers and extra client authority", () => {
    const input = { workspaceId: 10, conversationId: id, expectedRevision: 0, area: "offer", status: "answered", memoryId: id };
    expect(interviewReviewInputSchema.parse(input)).toEqual(input);
    expect(() => interviewReviewInputSchema.parse({ ...input, memoryId: null })).toThrow();
    expect(() => interviewReviewInputSchema.parse({ ...input, status: "declined" })).toThrow();
    expect(() => interviewReviewInputSchema.parse({ ...input, progressPercent: 100, userId: 999 })).toThrow();
  });
  it("keeps source-linked proposals pending without progress and plans around review", () => {
    const ledger = newInterviewLedger(configuration);
    ledger.proposals = [{ id: interviewProposalId(ledger.configurationKey, "intended_use", id, memory.text), area: "intended_use", memoryId: id,
      memoryHash: interviewMemoryHash(memory.text), sourceRequestId: id, status: "pending" }];
    for (const status of ["pending_confirmation", "confirmed"]) {
      const coverage = covered(ledger, [{ ...memory, status }]);
      expect(coverage).toMatchObject({ answered: 0, progressPercent: 10, reviewed: false, proposals: [{ answer: memory.text, memoryStatus: status }] });
      expect(planInterview(coverage, configuration)).toMatchObject({ nextArea: null, pendingAreas: ["intended_use"] });
    }
    expect(covered(ledger, [{ ...memory, status: "rejected" }]).proposals).toEqual([]);
    expect(covered(ledger, [{ ...memory, text: "Corrected meaning" }]).proposals).toEqual([]);
    expect(covered(ledger, [], { ...configuration, brandStage: "established" }).proposals).toEqual([]);
    ledger.proposals[0].status = "dismissed";
    expect(covered(ledger).proposals).toEqual([]);
    expect(planInterview(covered(ledger), configuration).nextArea).toBeNull();
  });
  it("reopens accepted mappings when their exact confirmed answer changes", () => {
    const ledger = newInterviewLedger(configuration);
    ledger.decisions = [{ area: "intended_use", status: "answered", memoryId: id, memoryHash: interviewMemoryHash(memory.text) }];
    const before = covered(ledger);
    ledger.reviewedFingerprint = before.fingerprint;
    expect(covered(ledger)).toMatchObject({ answered: 1, reviewed: true });
    expect(covered(ledger, [{ ...memory, text: "Changed meaning" }])).toMatchObject({ answered: 0, reviewed: false, progressPercent: 10 });
  });
});
