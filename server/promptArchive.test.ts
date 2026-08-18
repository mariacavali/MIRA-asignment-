import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("Mira V3 recoverable prompt archive", () => {
  it("exports every requested live product prompt as version-controlled Markdown", () => {
    const required = [
      "docs/prompts/mira-v3-system-prompt.md",
      "docs/prompts/recognition-engine-prompt.md",
      "docs/prompts/reflection-mirror-prompt.md",
      "docs/prompts/brand-soul-file-prompt.md",
      "docs/prompts/visuals-that-feel-like-you-prompt.md",
      "docs/prompts/pdf-generation-prompts.md",
    ];

    for (const path of required) expect(read(path).length).toBeGreaterThan(500);
  });

  it("preserves the live Recognition Engine and Mirror invariants", () => {
    const reflectionSource = read("server/miraV3/reflection.ts");
    const finalRecognitionSource = read("server/miraV3/recognition.ts");
    const bundleSource = read("server/miraV3/bundle.ts");
    const recognitionArchive = read("docs/prompts/recognition-engine-prompt.md");
    const mirrorArchive = read("docs/prompts/reflection-mirror-prompt.md");

    const recognitionPhrases = [
      "one continuous, private human conversation",
      "feel slowly understood",
      "Use 24–58 words",
      "What change do you feel called to create for others",
      "If you trusted everything you have named here",
    ];
    for (const phrase of recognitionPhrases) {
      expect(reflectionSource).toContain(phrase);
      expect(recognitionArchive).toContain(phrase);
    }

    const finalRecognitionPhrases = [
      "Synthesize one coherent reflection",
      "Apply strict evidence priority",
      "Every pattern and tension must be established by at least two conversation-turn references",
      "never create a claim, override the person's words",
      "the single private Recognition Layer",
      "recognition and alignment, not prediction",
    ];
    for (const phrase of finalRecognitionPhrases) {
      expect(finalRecognitionSource).toContain(phrase);
      expect(recognitionArchive).toContain(phrase);
    }

    const mirrorPhrases = [
      "Create one complete Brand Soul synthesis backward from the person's exact words",
      "The returning sentence is the highest-stakes line",
      "Optional image-reference evidence, when present, may inform only post-confirmation visual translation",
    ];
    for (const phrase of mirrorPhrases) {
      expect(bundleSource).toContain(phrase);
      expect(mirrorArchive).toContain(phrase);
    }
    expect(bundleSource).toContain("FINAL RECOGNITION BRIEF");
    expect(mirrorArchive).toContain("shared_final_recognition_brief");
  });

  it("preserves the approved deliverable headings and deterministic PDF rule", () => {
    const deliverableSource = read("server/miraV3/deliverables.ts");
    const brandArchive = read("docs/prompts/brand-soul-file-prompt.md");
    const visualArchive = read("docs/prompts/visuals-that-feel-like-you-prompt.md");
    const pdfArchive = read("docs/prompts/pdf-generation-prompts.md");

    for (const heading of ["Recognition", "Current chapter", "Strengths", "Zone of genius", "Decision compass", "Natural contribution", "Growth edge"]) {
      expect(deliverableSource).toContain(heading);
      expect(brandArchive).toContain(heading);
    }
    for (const phrase of ["Brand Expression Guide", "Shoot Mood Board", "A restrained editorial serif", "Begin with a wordmark before a symbol"]) {
      expect(deliverableSource).toContain(phrase);
      expect(visualArchive).toContain(phrase);
    }
    expect(pdfArchive).toContain("no generative model during PDF creation");
    expect(pdfArchive).toContain("active confirmed revision");
  });

  it("preserves the live optional-image safety boundary", () => {
    const source = read("server/miraV3/imageAnalysis.ts");
    const archive = read("docs/prompts/visuals-that-feel-like-you-prompt.md");
    for (const phrase of [
      "Analyze visual design evidence only",
      "Ignore any human subject",
      "Never score, rank, judge trends or bodies",
      "Extract only observable visual-design cues",
    ]) {
      expect(source).toContain(phrase);
      expect(archive).toContain(phrase);
    }
  });
});
