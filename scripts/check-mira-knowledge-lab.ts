import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { SCENARIOS, localRetrieve, eligibility, labVersionSchema, protocolHash } from "../server/miraKnowledgeLab/core";

const root = resolve(".mira-local-data/knowledge-lab");
const registry = JSON.parse(await readFile(join(root, "registry.json"), "utf8"));
const versions = registry.versions.map((v: unknown) => labVersionSchema.parse(v));
const cases = [];
for (const version of versions.filter((v: { blockedReason: string | null }) => !v.blockedReason)) {
  if (eligibility(version, "local", new Set(registry.withdrawnKeys)).length) throw new Error("A local version is no longer eligible");
  for (const scenario of SCENARIOS) {
    const result = localRetrieve(version, scenario.retrievalProbe, "local", new Set(registry.withdrawnKeys));
    const ids = result.cards.map(c => c.item.id);
    if (version.id === "a-baseline" && ids.length) throw new Error("Baseline unexpectedly used knowledge");
    if (version.id === "c2-mira-method") {
      const expected: Record<string, string[]> = { "unclear-offer": ["mira-opening-prompts"], "brand-mismatch": ["mira-stage-aware-scope"], "misunderstood-service": ["mira-opening-prompts", "mira-evidence-layers"], "visual-direction": ["mira-visual-translation", "mira-shoot-priorities"] };
      if (scenario.id === "unsupported-question" ? ids.length !== 0 : !expected[scenario.id].some(id => ids.includes(id))) throw new Error(`Positive/no-match source check failed: ${scenario.id}: ${ids}`);
    }
    cases.push({ configurationId: version.id, configurationVersion: version.version, scenario: scenario.id, query: scenario.retrievalProbe, exactTrace: result });
  }
}
const output = resolve("../brands/mira/work/2026-11_knowledge-lab"); await mkdir(output, { recursive: true });
const report = { at: new Date().toISOString(), mode: "local lexical retrieval; no generated-answer or Pinecone claim", protocolHash, cases, positiveC2Cases: 4, c2UnsupportedQuery: "no_match", generatedAnswers: 0, providerCalls: 0, pineconeCalls: 0, paidSpendingUsd: 0 };
await writeFile(join(output, "retrieval-checks.json"), JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify({ cases: cases.length, results: cases.map(c => ({ version: c.configurationId, scenario: c.scenario, status: c.exactTrace.status, selected: c.exactTrace.cards.map(x => x.item.id) })), providerCalls: 0, pineconeCalls: 0 }));
