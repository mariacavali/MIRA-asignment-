/**
 * MIRA Round 1 - minimum MIRA-specific LangSmith monitoring sample.
 *
 * Traces exactly three synthetic cases through MIRA's real, existing Creative
 * DNA transformation - the same functions the product uses in
 * server/miraCore/creativeDnaAdapter.ts to turn a confirmed photographer
 * brief + client preparation answers into a structured Creative DNA object
 * (server/miraV4/creativeDna.ts's synthesizeMiraV4CreativeDna, validated
 * against shared/miraV4CreativeDna.ts's schema). No new synthesis logic is
 * implemented here - this file only supplies synthetic input, traces the
 * existing call, and scores the result.
 *
 * Credentials: configured exclusively through the environment variables the
 * OpenAI client and the LangSmith SDK already recognize (OPENAI_API_KEY;
 * LANGCHAIN_API_KEY or LANGSMITH_API_KEY; LANGCHAIN_TRACING_V2 or
 * LANGSMITH_TRACING_V2 = "true"; optionally LANGCHAIN_PROJECT or
 * LANGSMITH_PROJECT). No value of any of these is ever printed, logged, or
 * written to results.json - only presence/absence and, for the project name,
 * a non-secret label.
 *
 * Run: npx tsx capstone/langsmith/mira_monitoring_sample.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { buildShootCreativeDnaSource } from "../../server/miraCore/creativeDnaAdapter";
import { applyShootMemoryPatch, emptyShootMemory } from "../../server/miraCore/memory";
import { MIRA_V4_CREATIVE_DNA_MODEL, synthesizeMiraV4CreativeDna, type MiraV4CreativeDnaSource } from "../../server/miraV4/creativeDna";
import { SHOOT_MEMORY_PATHS, type ShootMemoryPatch } from "../../shared/miraCore";
import type { MiraV4CreativeDna } from "../../shared/miraV4CreativeDna";

const HERE = import.meta.dirname;
const CASES_PATH = path.join(HERE, "synthetic_cases.json");
const RESULTS_PATH = path.join(HERE, "results.json");

const DEFAULT_LANGSMITH_PROJECT = "mira-creative-dna-monitoring-sample";

type SyntheticClientAnswer = { path: string; value: string };

type SyntheticCase = {
  id: string;
  label: string;
  photographerBrief: {
    displayName: string;
    businessName: string;
    photographyStyle: string;
    areasOfExpertise: string[];
    title: string;
    shootType: string;
    intendedUse: string;
    location: string;
    durationMinutes: number;
    photographerNotes: string;
  };
  clientAnswers: SyntheticClientAnswer[];
  summaryText: string;
  expectedBriefFacts: string[];
  expectedClientFacts: string[];
};

type CaseResult = {
  id: string;
  label: string;
  status: "success" | "failed" | "not_run";
  error: string | null;
  latencyMs: number | null;
  model: string | null;
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  estimatedCostUsd: { estimatedUsd: number | null; note: string };
  briefUsage: { matched: string[]; missed: string[]; scorePercent: number } | null;
  clientPreferenceUsage: { matched: string[]; missed: string[]; scorePercent: number } | null;
  creativeDnaCompleteness: ReturnType<typeof scoreCompleteness> | null;
  unsupportedPersonalDetails: string[] | null;
  langsmith: { runId: string; url: string | null; projectName: string } | null;
};

// ---------------------------------------------------------------------------
// 1. Load the synthetic dataset (3 cases, no real personal data - see
//    synthetic_cases.json's own top-level "note" field).
// ---------------------------------------------------------------------------

function loadSyntheticCases(): SyntheticCase[] {
  const raw = readFileSync(CASES_PATH, "utf8");
  const parsed = JSON.parse(raw) as { cases: SyntheticCase[] };
  return parsed.cases;
}

// ---------------------------------------------------------------------------
// 2. Reuse MIRA's own ShootMemory builder to turn each case's client answers
//    into a real, schema-valid ShootMemory - exactly what a confirmed client
//    preparation conversation produces in the actual product.
// ---------------------------------------------------------------------------

function buildSyntheticShootMemory(testCase: SyntheticCase) {
  const changes: ShootMemoryPatch["changes"] = testCase.clientAnswers.map((answer, index) => {
    if (!(SHOOT_MEMORY_PATHS as readonly string[]).includes(answer.path)) {
      throw new Error(`Synthetic case "${testCase.id}" uses an unknown ShootMemory path: ${answer.path}`);
    }
    return {
      operation: "set" as const,
      path: answer.path as (typeof SHOOT_MEMORY_PATHS)[number],
      value: {
        kind: "explicit" as const,
        value: answer.value,
        confidence: "high" as const,
        sourceEventIds: [`synthetic-${testCase.id}-${index + 1}`],
        clientConfirmed: true,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    };
  });
  return applyShootMemoryPatch(emptyShootMemory(), { changes });
}

// Reuses buildShootCreativeDnaSource from server/miraCore/creativeDnaAdapter.ts
// unchanged - the exact function the product calls with a real shoot,
// photographer profile, and confirmed ShootMemory. Only synthetic, minimal
// stand-ins for the Drizzle-inferred shoot/photographer row types are
// supplied here (matching the same `as any` pattern already used for this in
// server/miraCore/creativeDnaAdapter.test.ts), since this script never
// touches a database.
function buildSyntheticSource(testCase: SyntheticCase, index: number): MiraV4CreativeDnaSource {
  const memory = buildSyntheticShootMemory(testCase);
  const shoot = {
    id: 900000 + index,
    photographerUserId: 900000 + index,
    title: testCase.photographerBrief.title,
    shootType: testCase.photographerBrief.shootType,
    scheduledAt: null,
    intendedUse: testCase.photographerBrief.intendedUse,
    location: testCase.photographerBrief.location,
    durationMinutes: testCase.photographerBrief.durationMinutes,
    photographerNotes: testCase.photographerBrief.photographerNotes,
  };
  const photographer = {
    displayName: testCase.photographerBrief.displayName,
    photographyStyle: testCase.photographerBrief.photographyStyle,
    areasOfExpertise: testCase.photographerBrief.areasOfExpertise,
  };
  return buildShootCreativeDnaSource({
    shoot: shoot as any,
    photographer: photographer as any,
    memory,
    summaryText: testCase.summaryText,
    visualReferences: [],
  });
}

// ---------------------------------------------------------------------------
// 3. Monitoring metrics - computed from the real returned Creative DNA, never
//    invented. `inspiration` and `schemaVersion` are excluded from scoring:
//    inspiration is mechanically copied from the input source, not generated
//    (see synthesizeMiraV4CreativeDna's final `.parse` call), and
//    schemaVersion is a fixed literal - neither reflects model output.
// ---------------------------------------------------------------------------

function generatedContent(dna: MiraV4CreativeDna) {
  const { inspiration: _inspiration, schemaVersion: _schemaVersion, ...generated } = dna;
  return generated;
}

function flattenToText(node: unknown, out: string[] = []): string[] {
  if (node == null) return out;
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const item of node) flattenToText(item, out);
    return out;
  }
  if (typeof node === "object") {
    for (const value of Object.values(node as Record<string, unknown>)) flattenToText(value, out);
  }
  return out;
}

function scoreFactUsage(blob: string, facts: string[]) {
  const lower = blob.toLowerCase();
  const matched = facts.filter(fact => lower.includes(fact.toLowerCase()));
  const missed = facts.filter(fact => !lower.includes(fact.toLowerCase()));
  return { matched, missed, scorePercent: facts.length === 0 ? 100 : Math.round((matched.length / facts.length) * 100) };
}

// Every text field in the Creative DNA schema is schema-required and
// non-empty (min length 1) - so once shared/miraV4CreativeDna.ts validation
// succeeds, text-field completeness is always 100% by construction. The only
// field group that can legitimately still be thin is the token-list arrays
// (no schema minimum, only a max of 16) - their fullness is the real
// completeness signal reported here.
function scoreCompleteness(dna: MiraV4CreativeDna) {
  const generated = generatedContent(dna);
  let listFieldsTotal = 0;
  let listFieldsNonEmpty = 0;
  let textFieldsTotal = 0;

  function walk(node: unknown) {
    if (Array.isArray(node)) {
      listFieldsTotal += 1;
      if (node.length > 0) listFieldsNonEmpty += 1;
      return;
    }
    if (typeof node === "string") {
      textFieldsTotal += 1;
      return;
    }
    if (node && typeof node === "object") {
      for (const value of Object.values(node as Record<string, unknown>)) walk(value);
    }
  }
  walk(generated);

  const percentNonEmpty = listFieldsTotal === 0 ? 100 : Math.round((listFieldsNonEmpty / listFieldsTotal) * 100);
  return {
    requiredTextFields: {
      present: textFieldsTotal,
      total: textFieldsTotal,
      note: "Always full once schema validation succeeds - every text field is schema-required.",
    },
    tokenListFields: { nonEmpty: listFieldsNonEmpty, total: listFieldsTotal, percentNonEmpty },
    overallScorePercent: percentNonEmpty,
  };
}

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_PATTERN = /\+?\d[\d\-\s()]{7,}\d/g;
const NAME_LIKE_PATTERN = /\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/g;

function buildAllowedProperNounBigrams(testCase: SyntheticCase): Set<string> {
  const words = `${testCase.photographerBrief.displayName} ${testCase.photographerBrief.businessName}`
    .split(/\s+/)
    .filter(Boolean);
  const allowed = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) allowed.add(`${words[i]} ${words[i + 1]}`.toLowerCase());
  return allowed;
}

// Coarse heuristic, not a guarantee - flags anything that *might* be an
// invented personal detail so a human can check it. Documented in README.md
// under "Human-review requirement". Real emails/phone numbers are flagged
// outright; capitalized two-word sequences are flagged unless they match the
// synthetic case's own photographer/business name (the only proper nouns
// legitimately present in the input evidence for this sample).
function scanForUnsupportedPersonalDetails(blob: string, allowed: Set<string>): string[] {
  const flags: string[] = [];
  for (const match of blob.matchAll(EMAIL_PATTERN)) flags.push(`possible email address: "${match[0]}"`);
  for (const match of blob.matchAll(PHONE_PATTERN)) flags.push(`possible phone number: "${match[0]}"`);
  for (const match of blob.matchAll(NAME_LIKE_PATTERN)) {
    if (!allowed.has(match[0].toLowerCase())) {
      flags.push(`possible invented proper name not present in the input evidence: "${match[0]}"`);
    }
  }
  return flags;
}

function estimateCostUsd(usage: CaseResult["tokenUsage"]): CaseResult["estimatedCostUsd"] {
  const promptRate = process.env.MIRA_LANGSMITH_SAMPLE_COST_PER_1K_PROMPT_TOKENS_USD;
  const completionRate = process.env.MIRA_LANGSMITH_SAMPLE_COST_PER_1K_COMPLETION_TOKENS_USD;
  if (!usage || !promptRate || !completionRate) {
    return {
      estimatedUsd: null,
      note: "Not available - set MIRA_LANGSMITH_SAMPLE_COST_PER_1K_PROMPT_TOKENS_USD and MIRA_LANGSMITH_SAMPLE_COST_PER_1K_COMPLETION_TOKENS_USD to enable an estimate. No price is hardcoded in this sample.",
    };
  }
  const promptCost = (usage.promptTokens / 1000) * Number(promptRate);
  const completionCost = (usage.completionTokens / 1000) * Number(completionRate);
  return {
    estimatedUsd: Number((promptCost + completionCost).toFixed(6)),
    note: "Estimated from operator-configured per-1K-token rates; not an authoritative billing figure.",
  };
}

// ---------------------------------------------------------------------------
// 4. Environment gate - never invents a result. If anything required is
//    missing, every case is reported as "not_run" with the exact variable
//    names still needed, and nothing is called.
// ---------------------------------------------------------------------------

function detectMissingEnvironmentVariables(): string[] {
  const missing: string[] = [];
  if (!process.env.OPENAI_API_KEY) missing.push("OPENAI_API_KEY");
  if (!process.env.LANGCHAIN_API_KEY && !process.env.LANGSMITH_API_KEY) {
    missing.push("LANGCHAIN_API_KEY (or LANGSMITH_API_KEY)");
  }
  const tracingEnabled =
    process.env.LANGCHAIN_TRACING_V2 === "true" || process.env.LANGSMITH_TRACING_V2 === "true";
  if (!tracingEnabled) missing.push('LANGCHAIN_TRACING_V2="true" (or LANGSMITH_TRACING_V2="true")');
  return missing;
}

function resolveLangsmithProjectName(): string {
  return process.env.LANGCHAIN_PROJECT || process.env.LANGSMITH_PROJECT || DEFAULT_LANGSMITH_PROJECT;
}

// ---------------------------------------------------------------------------
// 5. Run one case: builds the real input, calls the real synthesis function
//    (wrapped in a LangSmith `traceable` run), and scores the real output.
// ---------------------------------------------------------------------------

async function runCase(
  testCase: SyntheticCase,
  index: number,
  projectName: string,
  traceable: typeof import("langsmith/traceable").traceable,
  getRunUrl: (runId: string) => Promise<string | null>,
): Promise<CaseResult> {
  const source = buildSyntheticSource(testCase, index);
  const allowedProperNouns = buildAllowedProperNounBigrams(testCase);

  let capturedRunId: string | null = null;
  const tracedSynthesize = traceable(
    async (input: MiraV4CreativeDnaSource) => synthesizeMiraV4CreativeDna({ source: input }),
    {
      name: `mira_creative_dna_${testCase.id}`,
      run_type: "chain",
      project_name: projectName,
      metadata: {
        mira_case_id: testCase.id,
        mira_case_label: testCase.label,
        mira_dataset: "round1_creative_dna_monitoring_sample",
      },
      on_end: runTree => {
        capturedRunId = runTree.id;
      },
    },
  );

  const startedAt = Date.now();
  try {
    const { creativeDna, model, usage } = await tracedSynthesize(source);
    const latencyMs = Date.now() - startedAt;
    const blobParts = flattenToText(generatedContent(creativeDna));
    const blob = blobParts.join(" \n ");

    const tokenUsage = usage
      ? { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, totalTokens: usage.total_tokens }
      : null;

    const url = capturedRunId ? await getRunUrl(capturedRunId) : null;

    return {
      id: testCase.id,
      label: testCase.label,
      status: "success",
      error: null,
      latencyMs,
      model,
      tokenUsage,
      estimatedCostUsd: estimateCostUsd(tokenUsage),
      briefUsage: scoreFactUsage(blob, testCase.expectedBriefFacts),
      clientPreferenceUsage: scoreFactUsage(blob, testCase.expectedClientFacts),
      creativeDnaCompleteness: scoreCompleteness(creativeDna),
      unsupportedPersonalDetails: scanForUnsupportedPersonalDetails(blob, allowedProperNouns),
      langsmith: capturedRunId ? { runId: capturedRunId, url, projectName } : null,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    return {
      id: testCase.id,
      label: testCase.label,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
      latencyMs,
      model: null,
      tokenUsage: null,
      estimatedCostUsd: { estimatedUsd: null, note: "Not available - the case failed before usage was returned." },
      briefUsage: null,
      clientPreferenceUsage: null,
      creativeDnaCompleteness: null,
      unsupportedPersonalDetails: null,
      langsmith: capturedRunId ? { runId: capturedRunId, url: null, projectName } : null,
    };
  }
}

function notRunResult(testCase: SyntheticCase): CaseResult {
  return {
    id: testCase.id,
    label: testCase.label,
    status: "not_run",
    error: null,
    latencyMs: null,
    model: null,
    tokenUsage: null,
    estimatedCostUsd: { estimatedUsd: null, note: "Not available - this case was not run." },
    briefUsage: null,
    clientPreferenceUsage: null,
    creativeDnaCompleteness: null,
    unsupportedPersonalDetails: null,
    langsmith: null,
  };
}

// ---------------------------------------------------------------------------
// 6. Entry point.
// ---------------------------------------------------------------------------

async function main() {
  const cases = loadSyntheticCases();
  const missing = detectMissingEnvironmentVariables();

  if (missing.length > 0) {
    console.log("MIRA LangSmith monitoring sample: not run. Missing environment variables (names only, no values reported):");
    for (const name of missing) console.log(`  - ${name}`);
    const results = {
      generatedAt: new Date().toISOString(),
      datasetSize: cases.length,
      model: MIRA_V4_CREATIVE_DNA_MODEL,
      run: { status: "not_run" as const, missingEnvironmentVariables: missing, langsmithProject: null },
      cases: cases.map(notRunResult),
    };
    writeFileSync(RESULTS_PATH, `${JSON.stringify(results, null, 2)}\n`);
    console.log(`Wrote ${RESULTS_PATH} with an honest "not_run" status - no results were invented.`);
    return;
  }

  // Dynamic import: only pulled in (and only ever contacts LangSmith) once
  // every required environment variable is confirmed present above.
  const { traceable } = await import("langsmith/traceable");
  const { Client } = await import("langsmith");
  const client = new Client();
  const projectName = resolveLangsmithProjectName();

  async function getRunUrl(runId: string): Promise<string | null> {
    try {
      return await client.getRunUrl({ runId });
    } catch {
      return null;
    }
  }

  console.log(`Running ${cases.length} synthetic case(s) against LangSmith project "${projectName}"...`);
  const caseResults: CaseResult[] = [];
  for (const [index, testCase] of cases.entries()) {
    console.log(`  - ${testCase.id}...`);
    caseResults.push(await runCase(testCase, index, projectName, traceable, getRunUrl));
  }

  const results = {
    generatedAt: new Date().toISOString(),
    datasetSize: cases.length,
    model: MIRA_V4_CREATIVE_DNA_MODEL,
    run: { status: "completed" as const, missingEnvironmentVariables: [] as string[], langsmithProject: projectName },
    cases: caseResults,
  };
  writeFileSync(RESULTS_PATH, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`Wrote ${RESULTS_PATH}.`);
}

main().catch(error => {
  console.error("MIRA LangSmith monitoring sample failed to run:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
