import { describe, expect, it } from "vitest";
import { getShootPreparationProgress, type ShootPreparationStatus } from "../../shared/shootPreparationProgress";

const initial: ShootPreparationStatus = {
  roomState: "welcome",
  scheduleResponse: null,
  creativeDirectionConfirmed: false,
  moodboardReady: false,
  moodboardNeedsRetry: false,
  preparationReady: false,
  preparationBrief: null,
  readyToShoot: false,
};
const confirmedSchedule = { response: "confirmed" as const, note: null };
const prepared: ShootPreparationStatus = {
  ...initial,
  roomState: "preparation_active",
  scheduleResponse: confirmedSchedule,
  creativeDirectionConfirmed: true,
  moodboardReady: true,
  preparationReady: true,
  preparationBrief: { summary: "Bring your outfit and charge your phone." },
};

describe("client preparation progress", () => {
  it("counts saved milestones through the complete journey", () => {
    expect(getShootPreparationProgress(initial).percent).toBe(0);
    expect(getShootPreparationProgress({ ...initial, scheduleResponse: confirmedSchedule }).percent).toBe(33);
    expect(getShootPreparationProgress({ ...initial, scheduleResponse: confirmedSchedule, creativeDirectionConfirmed: true }).percent).toBe(67);
    expect(getShootPreparationProgress(prepared).percent).toBe(100);
  });

  it.each(["welcome", "discovery_in_progress", "summary_pending"])("does not count an unconfirmed conversation in %s", roomState => {
    const progress = getShootPreparationProgress({ ...initial, roomState });
    expect(progress.percent).toBe(0);
    expect(progress.steps[1].complete).toBe(false);
  });

  it("identifies a saved summary that still needs confirmation", () => {
    const progress = getShootPreparationProgress({ ...initial, scheduleResponse: confirmedSchedule, roomState: "summary_pending" });
    expect(progress.steps[1].status).toBe("Summary to confirm");
    expect(progress.steps[progress.nextIndex].id).toBe("mira-preparation");
  });

  it.each([
    { moodboardReady: false },
    { preparationBrief: null },
    { preparationReady: false },
  ])("does not claim completion when a plan output is missing: %j", missing => {
    const progress = getShootPreparationProgress({ ...prepared, ...missing });
    expect(progress.percent).toBe(67);
    expect(progress.steps[2].complete).toBe(false);
  });

  it("shows a failed moodboard as needing attention without promising an automatic retry", () => {
    const progress = getShootPreparationProgress({ ...prepared, moodboardReady: false, moodboardNeedsRetry: true });
    expect(progress.percent).toBe(67);
    expect(progress.steps[2].status).toBe("Needs attention");
    expect(progress.nextAction).toBe("View plan status");
  });

  it("lets clients continue while a schedule change is waiting, without marking the date confirmed", () => {
    const progress = getShootPreparationProgress({ ...initial, scheduleResponse: { response: "change_requested", note: "Could we start later?" } });
    expect(progress.steps[0].status).toBe("Waiting for photographer");
    expect(progress.percent).toBe(0);
    expect(progress.nextIndex).toBe(1);
  });

  it("keeps photographer approval distinct from client preparation completion", () => {
    expect(getShootPreparationProgress(prepared).photographerConfirmed).toBe(false);
    expect(getShootPreparationProgress({ ...prepared, readyToShoot: true }).photographerConfirmed).toBe(true);
    expect(getShootPreparationProgress(prepared).nextAction).toBe("Review your plan");
  });
});
