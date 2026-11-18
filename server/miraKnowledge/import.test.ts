import { describe, expect, it } from "vitest";
import { parseKnowledgeImport } from "./import";
import { normaliseBundle, contentHash } from "./schema";
import { knowledgeDiff, publicationProblems } from "./publish";
import { syntheticKnowledgeBundle } from "./fixtures";

const csvCell = (value: string) => `"${value.replaceAll('"', '""')}"`;
describe("reviewed knowledge import", () => {
  it("preserves source/page citations through both JSON and quoted CSV", () => {
    const bundle = syntheticKnowledgeBundle(); bundle.items[0].title = 'Test "quotes", commas\nand newlines';
    const csv = '\uFEFFrecord_type,payload\r\n' + [...bundle.sources.map(s => `source,${csvCell(JSON.stringify(s))}`), ...bundle.items.map(i => `${i.kind},${csvCell(JSON.stringify(i))}`)].join('\r\n');
    expect(parseKnowledgeImport("csv", csv)).toEqual(parseKnowledgeImport("json", JSON.stringify(bundle)));
    expect(parseKnowledgeImport("csv", csv).items.find(i => i.kind === "card")?.sourceRefs[0].locator).toContain("Page 7");
  });
  it("hashes equivalent objects and reordered rows consistently", () => {
    const bundle = syntheticKnowledgeBundle();
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
    expect(contentHash(normaliseBundle(bundle))).toBe(contentHash(normaliseBundle({ ...bundle, items: [...bundle.items].reverse() })));
  });
  it("rejects duplicate IDs, missing source citations and approval claims in uploads", () => {
    const bundle = syntheticKnowledgeBundle();
    expect(() => normaliseBundle({ ...bundle, items: [...bundle.items, bundle.items[0]] })).toThrow();
    expect(() => normaliseBundle({ ...bundle, sources: [] })).toThrow();
    expect(() => normaliseBundle({ ...bundle, status: "published" })).toThrow();
    expect(() => normaliseBundle({ ...bundle, items: [{ ...bundle.items[0], approved: true }] })).toThrow();
    expect(() => normaliseBundle({ ...bundle, items: [{ ...bundle.items[1], origin: "private_client" }] })).toThrow();
  });
  it.each(['wrong,header\n', 'record_type,payload\ncard,"unclosed', 'record_type,payload\nsource,"{}"trailing', 'record_type,payload\ncard,{},extra'])('rejects malformed CSV %s', csv => {
    expect(() => parseKnowledgeImport("csv", csv)).toThrow();
  });
  it("blocks unreviewed material and shows removals in a replacement release", () => {
    const bundle = normaliseBundle(syntheticKnowledgeBundle());
    expect(publicationProblems(bundle, {}, new Set())).toHaveLength(3);
    const next = { ...bundle, items: [bundle.items[0]] };
    expect(knowledgeDiff(bundle, next).removed).toHaveLength(1);
    expect(knowledgeDiff(bundle, next).unchanged).toHaveLength(1);
  });
});
