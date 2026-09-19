import { describe, expect, it } from "vitest";
import { nextClientJourneyView } from "../../client/src/lib/clientJourney";
import { EMPTY_CLIENT_PREFERENCES } from "../../shared/miraClientPreferences";
import type { ShootPreparationStatus } from "../../shared/shootPreparationProgress";
const status: ShootPreparationStatus = {
  roomState: "welcome",
  scheduleResponse: { response: "confirmed", note: null },
  creativeDirectionConfirmed: false,
  moodboardReady: false,
  moodboardNeedsRetry: false,
  preparationReady: false,
  preparationBrief: null,
  readyToShoot: false,
};
const choices = {
  ...EMPTY_CLIENT_PREFERENCES,
  calendarChoice: "skip" as const,
  emailReminders: false,
};
describe("client journey resumes saved choices", () => {
  it("asks for confirmation before anything else", () => {
    expect(nextClientJourneyView(false, status, choices)).toBe("confirm");
    expect(
      nextClientJourneyView(
        true,
        { ...status, scheduleResponse: null },
        choices
      )
    ).toBe("confirm");
  });
  it("asks only unanswered calendar and email questions", () => {
    expect(nextClientJourneyView(true, status, EMPTY_CLIENT_PREFERENCES)).toBe(
      "calendar"
    );
    expect(
      nextClientJourneyView(true, status, { ...choices, emailReminders: null })
    ).toBe("email");
    expect(nextClientJourneyView(true, status, choices)).toBe("when");
  });
  it("lets opted-out clients prepare or return without email", () => {
    expect(
      nextClientJourneyView(true, status, { ...choices, prepareChoice: "now" })
    ).toBe("prepare");
    expect(
      nextClientJourneyView(true, status, {
        ...choices,
        prepareChoice: "later",
      })
    ).toBe("later");
  });
  it("returns confirmed preparations to review instead of restarting the conversation", () => {
    expect(
      nextClientJourneyView(
        true,
        { ...status, creativeDirectionConfirmed: true },
        { ...choices, prepareChoice: "later" }
      )
    ).toBe("review");
  });
  it("allows preparation while a change is pending without claiming confirmation", () => {
    expect(
      nextClientJourneyView(
        true,
        {
          ...status,
          scheduleResponse: {
            response: "change_requested",
            note: "Later please",
          },
        },
        choices
      )
    ).toBe("when");
  });
});
