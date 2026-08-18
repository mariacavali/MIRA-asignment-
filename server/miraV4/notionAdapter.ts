import { ENV } from "../_core/env";
import {
  MIRA_KNOWLEDGE_OBJECTS,
  indexApprovedKnowledge,
  knowledgeObjectSchema,
  type MiraKnowledgeObject,
} from "./knowledgeRag";

export type NotionSignal = {
  source: string;
  signal: string;
  confidence: number;
};

export type NotionIntelligenceSnapshot = {
  status: "available" | "unavailable";
  failOpenReason: string | null;
  signals: NotionSignal[];
  specification: {
    databaseId: string | null;
    schemaVersion: "mira_l2_v1";
    requiredProperties: string[];
    optionalProperties: string[];
  };
};

export type MiraKnowledgeCorpusSnapshot = {
  source: "notion" | "local_fallback";
  objects: MiraKnowledgeObject[];
  rejectedCount: number;
  failOpenReason: string | null;
};

type NotionProperty = {
  type?: string;
  title?: Array<{ plain_text?: string }>;
  rich_text?: Array<{ plain_text?: string }>;
  select?: { name?: string } | null;
  multi_select?: Array<{ name?: string }>;
  checkbox?: boolean;
  url?: string | null;
};

type NotionPage = { properties?: Record<string, NotionProperty> };

const notionText = (property: NotionProperty | undefined) =>
  [...(property?.title ?? []), ...(property?.rich_text ?? [])].map(item => item.plain_text ?? "").join("");

const notionSelect = (property: NotionProperty | undefined) => property?.select?.name ?? "";

const parseJsonList = (property: NotionProperty | undefined) => {
  const text = notionText(property);
  if (!text) throw new Error("Expected an encoded array or non-empty string");
  let value: unknown;
  try { value = JSON.parse(text) as unknown; }
  catch { return [text]; }
  if (!Array.isArray(value)) throw new Error("Expected an encoded array");
  return value;
};

const normalizedSourceType = (value: string): MiraKnowledgeObject["sourceType"] => {
  if (value === "book" || value === "article" || value === "research" || value === "mira_editorial") return value;
  if (value === "professional-source") return "article";
  return "research";
};

const normalizedConfidence = (value: string) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  return value === "high" ? 0.9 : value === "medium" ? 0.7 : value === "low" ? 0.4 : Number.NaN;
};

/** Maps a Notion row into the existing canonical Knowledge Object schema. */
export function mapNotionKnowledgeObject(page: unknown): MiraKnowledgeObject {
  const properties = (page as NotionPage)?.properties ?? {};
  const originalSourceType = notionSelect(properties["Original Source Type"]) || notionSelect(properties["Source Type"]);
  return knowledgeObjectSchema.parse({
    id: notionText(properties.ID),
    title: notionText(properties.Name),
    principle: notionText(properties.Principle),
    category: notionSelect(properties.Category),
    summary: notionText(properties.Summary),
    visualImplications: parseJsonList(properties["Visual Implications"]),
    applicableWhen: parseJsonList(properties["Applicable When"]),
    exclusions: parseJsonList(properties.Exclusions),
    tags: (properties.Tags?.multi_select ?? []).map(item => item.name ?? "").filter(Boolean),
    confidence: normalizedConfidence(notionSelect(properties.Confidence)),
    sourceTitle: notionText(properties["Source Title"]),
    sourceUrl: properties["Source URL"]?.url ?? "",
    sourceType: normalizedSourceType(notionSelect(properties["Source Type"])),
    sourceDate: notionText(properties["Source Date"]),
    sourceVersion: notionText(properties["Source Version"]),
    status: notionSelect(properties.Status),
    reviewed: properties.Reviewed?.checkbox ?? false,
    corpusVersion: notionText(properties["Corpus Version"]),
    publicationState: notionSelect(properties["Publication State"]),
    originalSourceType,
    sources: parseJsonList(properties.Sources),
    reviewNotes: notionText(properties["Review Notes"]),
    evidenceUse: notionSelect(properties["Evidence Use"]),
  });
}

let knowledgeCorpusCache: { expiresAt: number; pending: Promise<MiraKnowledgeCorpusSnapshot> } | null = null;

export async function loadMiraKnowledgeCorpus(config: {
  enabled?: boolean;
  apiKey?: string;
  databaseId?: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  bypassCache?: boolean;
} = {}): Promise<MiraKnowledgeCorpusSnapshot> {
  const enabled = config.enabled ?? ENV.notionIntelligenceEnabled;
  const apiKey = (config.apiKey ?? ENV.notionApiKey).trim();
  const databaseId = (config.databaseId ?? ENV.notionDatabaseId).trim();
  if (!enabled || !apiKey || !databaseId) {
    return { source: "local_fallback", objects: MIRA_KNOWLEDGE_OBJECTS, rejectedCount: 0, failOpenReason: "Notion knowledge is not configured." };
  }
  if (!config.bypassCache && knowledgeCorpusCache && knowledgeCorpusCache.expiresAt > Date.now()) return knowledgeCorpusCache.pending;

  const pending = (async (): Promise<MiraKnowledgeCorpusSnapshot> => {
    try {
      const fetchImpl = config.fetchImpl ?? fetch;
      const rows: unknown[] = [];
      let cursor: string | undefined;
      do {
        const response = await fetchImpl(`${(config.apiBaseUrl ?? ENV.notionApiBaseUrl).replace(/\/$/, "")}/v1/databases/${databaseId}/query`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
          body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error(`Notion knowledge query returned ${response.status}`);
        const payload = await response.json() as { results?: unknown[]; has_more?: boolean; next_cursor?: string | null };
        rows.push(...(payload.results ?? []));
        cursor = payload.has_more && payload.next_cursor ? payload.next_cursor : undefined;
      } while (cursor);

      const parsed = rows.flatMap(row => {
        try { return [mapNotionKnowledgeObject(row)]; } catch { return []; }
      });
      const approved = indexApprovedKnowledge(parsed);
      if (!approved.length) throw new Error("Notion returned no valid approved Knowledge Objects");
      return { source: "notion", objects: approved, rejectedCount: rows.length - parsed.length, failOpenReason: null };
    } catch (error) {
      return {
        source: "local_fallback", objects: MIRA_KNOWLEDGE_OBJECTS, rejectedCount: 0,
        failOpenReason: error instanceof Error ? error.message : "Notion knowledge query failed.",
      };
    }
  })();
  if (!config.bypassCache) knowledgeCorpusCache = { expiresAt: Date.now() + 5 * 60_000, pending };
  return pending;
}

export function getNotionDatabaseSpecification() {
  return {
    databaseId: ENV.notionDatabaseId || null,
    schemaVersion: "mira_l2_v1" as const,
    requiredProperties: [
      "Journey ID",
      "Signal",
      "Evidence Type",
      "Confidence",
      "Created At",
    ],
    optionalProperties: [
      "Reference ID",
      "Direction",
      "Observed Pattern",
      "Manual Context",
      "Owner",
    ],
  };
}

async function queryNotionDatabase() {
  const apiKey = ENV.notionApiKey.trim();
  const databaseId = ENV.notionDatabaseId.trim();
  if (!ENV.notionIntelligenceEnabled || !apiKey || !databaseId) {
    return {
      status: "unavailable" as const,
      failOpenReason: "Notion integration is not configured.",
      signals: [] as NotionSignal[],
    };
  }

  try {
    const response = await fetch(`${ENV.notionApiBaseUrl.replace(/\/$/, "")}/v1/databases/${databaseId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ page_size: 5 }),
      signal: AbortSignal.timeout(6_000),
    });

    if (!response.ok) {
      return {
        status: "unavailable" as const,
        failOpenReason: `Notion query failed with status ${response.status}.`,
        signals: [] as NotionSignal[],
      };
    }

    const payload = await response.json() as { results?: Array<Record<string, unknown>> };
    const signals = (payload.results ?? [])
      .slice(0, 5)
      .map((item, index) => ({
        source: "notion",
        signal: `Signal row ${index + 1} imported from Notion database ${databaseId.slice(0, 6)}...`,
        confidence: 3,
      }));

    return {
      status: "available" as const,
      failOpenReason: null,
      signals,
    };
  } catch (error) {
    return {
      status: "unavailable" as const,
      failOpenReason: error instanceof Error ? error.message : "Notion request failed.",
      signals: [] as NotionSignal[],
    };
  }
}

export async function loadNotionIntelligence(): Promise<NotionIntelligenceSnapshot> {
  const query = await queryNotionDatabase();
  return {
    status: query.status,
    failOpenReason: query.failOpenReason,
    signals: query.signals,
    specification: getNotionDatabaseSpecification(),
  };
}
