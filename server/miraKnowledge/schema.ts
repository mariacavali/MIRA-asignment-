import { createHash } from "node:crypto";
import { knowledgeBundleSchema, type KnowledgeBundle } from "../../shared/miraKnowledge";

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

// Stable hashes are independent of object-key order and row ordering in an import.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => compare(a, b)).map(([key, v]) => `${JSON.stringify(key)}:${canonicalJson(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export const contentHash = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");
export const entryKey = (kind: "source" | "card" | "judgement" | "passage", ref: { id: string; version: number }) => `${kind}:${ref.id}@${ref.version}`;
export function normaliseBundle(raw: unknown): KnowledgeBundle {
  const bundle = knowledgeBundleSchema.parse(raw);
  bundle.sources.sort((a, b) => compare(entryKey("source", a), entryKey("source", b)));
  bundle.items.sort((a, b) => compare(entryKey(a.kind, a), entryKey(b.kind, b)));
  return bundle;
}
export function bundleEntries(bundle: KnowledgeBundle) {
  return [...bundle.sources.map(value => ({ key: entryKey("source", value), hash: contentHash(value) })),
    ...bundle.items.map(value => ({ key: entryKey(value.kind, value), hash: contentHash(value) }))];
}
