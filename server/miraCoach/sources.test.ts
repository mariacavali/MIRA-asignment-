import { describe, expect, it } from "vitest";
import { retrieveSourceExcerpts, type RetrievalSource } from "./sources";
import { sourceContentSchema } from "../../shared/miraSources";
import { brandEvidenceSchema } from "../../shared/miraCoach";
const source: RetrievalSource = { id: "c030dd28-c3ee-471f-8bf3-c50a4a3a48fa", title: "My offer",
  text: "Portrait sessions for independent designers.", referenceUrl: "https://example.com/offer", rightsBasis: "client_owned" };
describe("local approved-source retrieval", () => {
  it("retrieves relevant excerpts with provenance without confirming brand identity", () => {
    const result = retrieveSourceExcerpts([source], "portrait designers");
    expect(result).toEqual([{ id: `${source.id}:0`, text: source.text, kind: "explicit", confirmed: false,
      provenance: { sourceId: source.id, title: source.title, referenceUrl: source.referenceUrl,
        rightsBasis: "client_owned", start: 0, end: source.text.length } }]);
    expect(brandEvidenceSchema.safeParse(result[0]).success).toBe(true);
    expect(retrieveSourceExcerpts([source], "unrelated packaging")).toEqual([]);
    expect(retrieveSourceExcerpts([source], "?!")).toEqual([]);
  });
  it("bounds excerpts and source concentration with deterministic ranking", () => {
    const sources = Array.from({ length: 5 }, (_, i) => ({ ...source, id: `source-${i}`, text: "portrait ".repeat(2500) }));
    const result = retrieveSourceExcerpts(sources, "portrait");
    expect(result).toHaveLength(4);
    expect(result.every(item => item.text.length <= 1200)).toBe(true);
    expect(result.filter(item => item.provenance?.sourceId === "source-0")).toHaveLength(2);
    expect(retrieveSourceExcerpts(sources.toReversed(), "portrait")).toEqual(result);
    for (const item of result) expect(item.text).toBe(sources[0].text.slice(item.provenance!.start, item.provenance!.end));
  });
  it("requires explicit approval and a rights basis; rejects executable and credential-bearing references", () => {
    const input = { title: source.title, text: source.text, rightsBasis: "client_owned", approvedForCoaching: true };
    expect(sourceContentSchema.safeParse(input).success).toBe(true);
    for (const patch of [{ approvedForCoaching: false }, { approvedForCoaching: undefined }, { rightsBasis: "unknown" },
      { referenceUrl: "http://example.com" }, { referenceUrl: "https://user:password@example.com" },
      { referenceUrl: "javascript:alert(1)" }, { text: "x".repeat(20001) }, { status: "active" }]) {
      expect(sourceContentSchema.safeParse({ ...input, ...patch }).success).toBe(false);
    }
  });
});
