import { z } from "zod";

export const BIRTH_DATA_MODULE_TYPE = "birth_data";

const DEFAULT_DAKIDARTS_BASE_URL = "https://api.numerologyapi.com/api/v1";
const PROVIDER_ID = "private-recognition-layer";

function validCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export const birthDataInputSchema = z.object({
  fullNameAtBirth: z.string().trim().min(2).max(160).refine(value => value.split(/\s+/).length >= 2, "Enter your full name at birth"),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(validCalendarDate, "Enter a valid birth date").refine(value => value <= new Date().toISOString().slice(0, 10), "Birth date cannot be in the future"),
  birthTime: z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour time as HH:mm")]),
  timezone: z.string().trim().min(1).max(80).refine(validTimezone, "Enter a valid IANA timezone"),
  birthCity: z.string().trim().min(1).max(120),
  birthCountry: z.string().trim().min(1).max(120),
});

export type BirthDataInput = z.infer<typeof birthDataInputSchema>;

export const hiddenRecognitionLayerSchema = z.object({
  confidence: z.enum(["tentative", "supporting"]),
  contextSummary: z.string().trim().min(1).max(1200),
  adaptiveQuestionLens: z.string().trim().min(1).max(700),
});

export type HiddenRecognitionLayer = z.infer<typeof hiddenRecognitionLayerSchema>;

export const birthDataInterpretationSchema = z.object({
  available: z.boolean(),
  recognitionLayer: hiddenRecognitionLayerSchema.nullable(),
  statusMessage: z.string().trim().min(1).max(180),
});

export type BirthDataInterpretation = z.infer<typeof birthDataInterpretationSchema>;

export interface BirthDataProvider {
  readonly id: string;
  interpret(input: BirthDataInput): Promise<{ recognitionLayer: HiddenRecognitionLayer }>;
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type DakidartsRequest = { path: string; params: Record<string, string> };

function splitBirthName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return {
    first_name: parts[0]!,
    middle_name: parts.slice(1, -1).join(" "),
    last_name: parts.at(-1)!,
  };
}

export function buildApprovedDakidartsRequests(input: BirthDataInput, predictionYear = new Date().getUTCFullYear()): DakidartsRequest[] {
  const [birthYear, birthMonth, birthDay] = input.birthDate.split("-");
  const name = splitBirthName(input.fullNameAtBirth);
  const birthParts = { birth_year: birthYear!, birth_month: birthMonth!, birth_day: birthDay! };
  const system = { num_sys: "pythagorean", lang: "en" };
  return [
    { path: "/life_path", params: { ...birthParts, ...system } },
    { path: "/destiny_number", params: { ...name, ...system } },
    { path: "/heart_desire", params: { ...name, ...system } },
    { path: "/personality_number", params: { ...name, ...system } },
    { path: "/challenge_number", params: { ...birthParts, lang: "en" } },
    { path: "/maturity-number", params: { dob: input.birthDate, full_name: input.fullNameAtBirth, ...system } },
    { path: "/pinnacle-cycles", params: { dob: input.birthDate, lang: "en" } },
    { path: "/period_cycles", params: { ...birthParts, lang: "en" } },
    { path: "/essence-cycle", params: { full_name: input.fullNameAtBirth, dob: input.birthDate, start_year: String(predictionYear), ...system } },
    { path: "/hidden-passion", params: { fullname: input.fullNameAtBirth, ...system } },
    { path: "/karmic_lessons", params: { full_name: input.fullNameAtBirth, ...system } },
    { path: "/karmic_debt", params: { ...birthParts, lang: "en" } },
    { path: "/personal_year", params: { birth_day: birthDay!, birth_month: birthMonth!, prediction_year: String(predictionYear), lang: "en" } },
  ];
}

function collectText(value: unknown, depth = 0): string[] {
  if (depth > 5) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(item => collectText(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => [key, ...collectText(item, depth + 1)]);
  }
  return [];
}

const signalRules: Array<{
  dimension: "direction" | "expression" | "relationship" | "pace" | "contribution";
  keywords: RegExp;
  contextPhrase: string;
  questionLens: string;
}> = [
  { dimension: "direction", keywords: /\b(?:curious|adaptable|adventurous|inventive|spontaneous|variety|explor|novel|change)\w*\b/i, contextPhrase: "openness to exploration, reinvention, and changing perspective", questionLens: "Test whether freedom to explore or a clear destination creates stronger conviction." },
  { dimension: "direction", keywords: /\b(?:organized|disciplined|methodical|reliable|order|plan|structure|consistent|precision)\w*\b/i, contextPhrase: "a preference for dependable structure, precision, and sustained follow-through", questionLens: "Test whether structure is a source of confidence or a form of protection." },
  { dimension: "expression", keywords: /\b(?:expressive|creative|charismatic|communicative|enthusiastic|dramatic|bold|visible|story)\w*\b/i, contextPhrase: "an expressive creative current that may want greater visibility", questionLens: "Explore what becomes possible when their clearest truth is made more visible." },
  { dimension: "expression", keywords: /\b(?:reserved|reflective|analytical|observant|thoughtful|private|careful|subtle|quiet)\w*\b/i, contextPhrase: "a measured, reflective mode that values depth and precision", questionLens: "Explore whether restraint protects precision or keeps an important truth hidden." },
  { dimension: "relationship", keywords: /\b(?:cooperat|diplomat|harmon|social|generous|empathetic|community|partner|connect|team)\w*\b/i, contextPhrase: "a relational orientation toward connection, care, and collaborative contribution", questionLens: "Explore how relationship and service shape the way they want to lead." },
  { dimension: "relationship", keywords: /\b(?:independent|autonomous|self-reliant|individual|pioneer|initiative|decisive|leader)\w*\b/i, contextPhrase: "a strong need for autonomy, initiative, and self-directed leadership", questionLens: "Explore where independence is essential and where it may limit support or reach." },
  { dimension: "pace", keywords: /\b(?:patient|stable|grounded|persistent|enduring|steady|calm|deliberate)\w*\b/i, contextPhrase: "a steady, grounded pace that builds through patience and continuity", questionLens: "Test whether a steady pace reflects trust or delays a decision already known." },
  { dimension: "pace", keywords: /\b(?:energetic|active|fast|dynamic|urgent|restless|rapid|momentum)\w*\b/i, contextPhrase: "a dynamic pace that seeks movement, momentum, and responsive action", questionLens: "Test whether momentum is serving the direction or replacing clarity." },
  { dimension: "contribution", keywords: /\b(?:visionary|idealistic|inspir|imaginative|future|possibility|transform|meaning)\w*\b/i, contextPhrase: "a vision-led contribution oriented toward possibility, meaning, and transformation", questionLens: "Explore the future they can see and the evidence that would make it credible to others." },
  { dimension: "contribution", keywords: /\b(?:practical|resourceful|efficient|tangible|realistic|builder|execute|result|solution)\w*\b/i, contextPhrase: "a practical contribution expressed through tangible outcomes and useful solutions", questionLens: "Explore which tangible outcome best proves the value of their work." },
  { dimension: "contribution", keywords: /\b(?:nurtur|support|care|heal|protect|guide|mentor|compassion|serve)\w*\b/i, contextPhrase: "a supportive contribution expressed through guidance, care, and responsible service", questionLens: "Explore how care can be expressed as clear leadership without over-responsibility." },
];

export function normalizeBirthIntelligence(payload: unknown): HiddenRecognitionLayer | null {
  const text = collectText(payload).join(" ").replace(/\s+/g, " ").slice(0, 20_000);
  const seen = new Set<(typeof signalRules)[number]["dimension"]>();
  const matches: typeof signalRules = [];
  for (const rule of signalRules) {
    if (matches.length >= 5 || seen.has(rule.dimension) || !rule.keywords.test(text)) continue;
    seen.add(rule.dimension);
    matches.push(rule);
  }
  if (!matches.length) return null;
  return hiddenRecognitionLayerSchema.parse({
    confidence: "tentative",
    contextSummary: `Possible contextual themes, to use only when echoed by the person's own words: ${matches.map(rule => rule.contextPhrase).join("; ")}.`,
    adaptiveQuestionLens: matches.slice(0, 3).map(rule => rule.questionLens).join(" "),
  });
}

export class DakidartsBirthDataProvider implements BirthDataProvider {
  readonly id = PROVIDER_ID;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = DEFAULT_DAKIDARTS_BASE_URL,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async interpret(input: BirthDataInput): Promise<{ recognitionLayer: HiddenRecognitionLayer }> {
    const payloads = await Promise.all(buildApprovedDakidartsRequests(input).map(async request => {
      const endpoint = new URL(`${this.baseUrl.replace(/\/$/, "")}${request.path}`);
      Object.entries(request.params).forEach(([key, value]) => {
        if (value) endpoint.searchParams.set(key, value);
      });
      const response = await this.fetchImpl(endpoint, {
        method: "GET",
        headers: { Accept: "application/json", "X-API-Key": this.apiKey },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`Private context request ${request.path} failed with status ${response.status}`);
      return response.json();
    }));
    const recognitionLayer = normalizeBirthIntelligence(payloads);
    if (!recognitionLayer) throw new Error("Private context contained no usable neutral layer");
    return { recognitionLayer };
  }
}

export function createConfiguredBirthDataProvider(config: { apiKey?: string; baseUrl?: string; fetchImpl?: FetchLike }): BirthDataProvider | undefined {
  const apiKey = config.apiKey?.trim();
  if (!apiKey) return undefined;
  return new DakidartsBirthDataProvider(apiKey, config.baseUrl?.trim() || DEFAULT_DAKIDARTS_BASE_URL, config.fetchImpl);
}

export function normalizeBirthData(input: BirthDataInput): BirthDataInput {
  return birthDataInputSchema.parse({
    ...input,
    fullNameAtBirth: input.fullNameAtBirth.trim().replace(/\s+/g, " "),
    timezone: input.timezone.trim(),
    birthCity: input.birthCity.trim().replace(/\s+/g, " "),
    birthCountry: input.birthCountry.trim().replace(/\s+/g, " "),
  });
}

export async function prepareBirthDataModule(input: BirthDataInput, provider?: BirthDataProvider) {
  const normalized = normalizeBirthData(input);
  if (!provider) {
    return {
      input: normalized,
      output: birthDataInterpretationSchema.parse({
        available: false,
        recognitionLayer: null,
        statusMessage: "Your details were saved, but optional personalisation is temporarily unavailable. Mira will continue from your own words.",
      }),
      status: "unavailable" as const,
      provenance: { version: 3, provider: null, generatedAt: Date.now(), fallback: true },
    };
  }
  try {
    const interpreted = await provider.interpret(normalized);
    return {
      input: normalized,
      output: birthDataInterpretationSchema.parse({ available: true, recognitionLayer: interpreted.recognitionLayer, statusMessage: "Optional birth context saved." }),
      status: "complete" as const,
      provenance: { version: 3, provider: provider.id, generatedAt: Date.now(), rawResponseStored: false },
    };
  } catch (error) {
    console.error("Mira optional birth-date context fallback", error instanceof Error ? error.message : "unknown error");
    return {
      input: normalized,
      output: birthDataInterpretationSchema.parse({
        available: false,
        recognitionLayer: null,
        statusMessage: "Your details were saved, but optional personalisation is temporarily unavailable. Mira will continue from your own words.",
      }),
      status: "failed" as const,
      provenance: { version: 3, provider: provider.id, generatedAt: Date.now(), fallback: true, rawResponseStored: false },
    };
  }
}

export function publicBirthDataResult(module: { status: string; normalizedResult: unknown } | null) {
  if (!module) return null;
  const normalized = module.normalizedResult && typeof module.normalizedResult === "object" ? module.normalizedResult as Record<string, unknown> : {};
  const output = birthDataInterpretationSchema.safeParse(normalized.output);
  return {
    status: module.status,
    output: {
      saved: true,
      contextualSignalAvailable: output.success && output.data.available && Boolean(output.data.recognitionLayer),
      statusMessage: output.success
        ? output.data.statusMessage
        : "Your details were saved, but optional personalisation is temporarily unavailable. Mira will continue from your own words.",
    },
  };
}

export function buildHiddenRecognitionLayer(module: { status: string; normalizedResult: unknown } | null): HiddenRecognitionLayer | null {
  if (!module || module.status !== "complete" || !module.normalizedResult || typeof module.normalizedResult !== "object") return null;
  const parsed = birthDataInterpretationSchema.safeParse((module.normalizedResult as Record<string, unknown>).output);
  return parsed.success && parsed.data.available ? parsed.data.recognitionLayer : null;
}
