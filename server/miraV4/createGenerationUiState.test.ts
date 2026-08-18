import { describe, expect, it } from "vitest";
import { deriveCreateGenerationUiState } from "../../client/src/lib/miraCreateGenerationState";

const complete = (index: number) => ({ status: "complete" as const, url: `/manus-storage/${index}.png` });

describe("CREATE persisted generation UI state", () => {
  it("shows a clean completed state for five persisted images", () => {
    expect(deriveCreateGenerationUiState([1, 2, 3, 4, 5].map(complete))).toEqual({
      completedFrames: 5, failedFrames: 0, isComplete: true, showFailureUi: false,
    });
  });

  it("shows retry state only while a persisted frame is failed", () => {
    const partial = deriveCreateGenerationUiState([complete(1), complete(2), complete(3), complete(4), { status: "failed" }]);
    expect(partial).toMatchObject({ completedFrames: 4, failedFrames: 1, isComplete: false, showFailureUi: true });

    const retried = deriveCreateGenerationUiState([complete(1), complete(2), complete(3), complete(4), complete(5)]);
    expect(retried).toMatchObject({ completedFrames: 5, failedFrames: 0, isComplete: true, showFailureUi: false });
  });

  it("does not turn pending or actively generating frames into failure UI", () => {
    expect(deriveCreateGenerationUiState([complete(1), { status: "pending" }, { status: "generating" }]).showFailureUi).toBe(false);
  });
});
