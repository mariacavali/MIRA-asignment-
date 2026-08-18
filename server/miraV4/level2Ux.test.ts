import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../../client/src/pages/MiraLevel2Journey.tsx", import.meta.url), "utf8");

describe("Mira Level 2 selection-first UX", () => {
  it("offers one optional personal identity reference separately from inspiration", () => {
    expect(source).toContain("Want the moodboard to feel more like you?");
    expect(source).toContain("Upload a photo of yourself — optional");
    expect(source).toContain("Upload my photo");
    expect(source).toContain("personal_reference_image");
    expect(source).toContain("uploadLevel2PersonalReference");
  });

  it("clarifies inspiration upload formats and recovery without changing accepted types", () => {
    expect(source).toContain("Upload a JPG, PNG or WebP. Screenshots and Pinterest images work best when saved in a smaller size.");
    expect(source).toContain("We couldn’t add this image. Try a JPG, PNG or WebP, or save the image/screenshot in a smaller size and upload it again.");
    expect(source).toContain('accept="image/jpeg,image/png,image/webp"');
  });

  it("makes the protected quality understandable and confirms DISCOVER hypotheses explicitly", () => {
    expect(source).toContain('title: "What should we never lose?"');
    expect(source).toContain('helper: "As your brand grows, what quality should always remain?"');
    expect(source).toContain("Based on DISCOVER — choose one to confirm");
    expect(source).toContain("discoverOptions(level2State.data?.discoverResult)");
    expect(source).toContain(">Something else</button>");
    expect(source).not.toContain("What tension must stay alive as you scale?");
  });

  it("keeps all six visual calibration choices and reduces required prose", () => {
    expect(source).toContain("MIRA_LEVEL2_VISUAL_PAIRS.every");
    expect(source).toContain('chosen: card.side');
    expect(source).toContain('"both", "neither", "not_sure"');
    expect(source).toContain("REFERENCE_SIGNALS.map");
    expect(source).toContain("What do you love about this image?");
    expect(source).not.toContain("Evidence hierarchy");
    expect(source).not.toContain("How sure are you?");
    expect(source).not.toContain("Reference ID");
    expect(source).toContain('level2State.data.nextKey === "notion_intelligence" ? "create_preparation"');
    expect(source).toContain('item === "No extra variation — keep it focused" ? "" : item');
    expect(source).toContain("Keep out <span");
    expect(source).toContain("One optional variation");
    expect(source).not.toContain("saveLevel2Answer.error.message");
    expect(source).not.toContain("uploadReference.error.message");
    expect(source).toContain("We couldn’t save that yet. Please check this step and try again.");
    expect(source).not.toContain("Pull Notion signals");
    expect(source).not.toContain("Final direction for CREATE");
    expect(source).not.toContain("fail-open");
    expect(source).not.toContain("Notion intelligence");
    expect(source).not.toContain("Reference ID");
    expect(source).toContain("What made you choose it?");
    expect(source).toContain("Pick anything that caught your eye");
    expect(source).toContain("Does this feel right?");
    expect(source).toContain("Yes, this feels like me");
    expect(source).toContain("Tell MIRA what feels off.");
    expect(source).toContain("What is realistic for this shoot?");
    expect(source).not.toContain("light production");
    expect(source).not.toContain("full production");
  });
});
