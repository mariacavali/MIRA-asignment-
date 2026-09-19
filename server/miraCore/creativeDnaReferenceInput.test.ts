import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ invokeLLM: vi.fn() }));
vi.mock("../_core/llm", () => ({ invokeLLM: mocks.invokeLLM }));
import { synthesizeMiraV4CreativeDna } from "../miraV4/creativeDna";
import { buildDemoMiraV4CreativeDna } from "./demoCreativeDna";
import { buildInspirationFromVisualReferences } from "./creativeDnaAdapter";

it("sends all five labelled images to the existing synthesis call, including outfit and location context", async () => {
  const source = { journey: { building: "Brand", currentPosition: null, needMost: null, firstCreation: null, birthDate: null, birthTime: null, birthTimeUnknown: 1, birthCity: null, creativeInputs: null }, conversation: [], inspiration: { imageReference: null, userExplanation: null, influenceRule: "supporting_evidence_only" as const } };
  mocks.invokeLLM.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(buildDemoMiraV4CreativeDna(source)) } }] });
  const images = ["portrait", "location", "other", "current_identity", "dislike"].map((purpose, i) => ({ purpose, note: `Client selection ${i}`, url: `https://cdn.example/${i}.jpg` }));
  await synthesizeMiraV4CreativeDna({ source, visualReferenceImages: images });
  expect(mocks.invokeLLM).toHaveBeenCalledTimes(1);
  const content = mocks.invokeLLM.mock.calls[0][0].messages[1].content;
  expect(content.filter((item: any) => item.type === "image_url").map((item: any) => item.image_url.url)).toEqual(images.map(image => image.url));
  expect(content.filter((item: any) => item.type === "text").map((item: any) => item.text).join(" ")).toContain("Category: dislike");
});

describe("context is not positive inspiration", () => {
  it.each(["portrait", "location", "other", "dislike"])("does not use %s as the primary style anchor", referencePurpose => {
    expect(buildInspirationFromVisualReferences([{ id: "one", referencePurpose, clientDescription: "Client note", url: "https://cdn.example/image.jpg" }]).imageReference).toBeNull();
  });
});
