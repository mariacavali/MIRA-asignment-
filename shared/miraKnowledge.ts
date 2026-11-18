import { z } from "zod";

const id = z.string().regex(/^[a-z][a-z0-9-]{0,79}$/);
const version = z.number().int().min(1).max(1_000_000);
const text = z.string().trim().min(1).max(4000);
const list = z.array(text).min(1).max(20);
export const MAX_KNOWLEDGE_ITEMS = 20_000;
export const knowledgeRefSchema = z.object({ id, version }).strict();
export const INCOMPLETE_BOOK_LABEL = "Incomplete source coverage; documented exclusions apply.";
const checkedPartialPublicationSchema = z.object({
  mode: z.literal("checked_available_incomplete"), bookComplete: z.literal(false), sourceVersion: version,
  label: z.literal(INCOMPLETE_BOOK_LABEL),
  acceptance: z.object({ actor: text, at: z.string().datetime(), reason: text, evidence: text }).strict(),
  exclusions: z.object({ manifest: text, sha256: z.string().regex(/^[a-f0-9]{64}$/),
    acceptedIssues: z.array(z.string().min(1).max(500)).min(1).max(5000) }).strict(),
  // Immutable item IDs AND versions bind acceptance to the exact checked subset.
  passages: z.array(knowledgeRefSchema).min(1).max(MAX_KNOWLEDGE_ITEMS),
}).strict();
export const knowledgeSourceSchema = z.object({
  id, version, title: text, author: text, edition: z.string().max(200),
  kind: z.enum(["book", "pdf", "article", "editorial"]),
  // An asset reference is metadata, never a URL to fetch or an instruction to read a private client file.
  assetReference: z.string().max(500).nullable(),
  intendedUse: text,
  rightsBasis: z.enum(["pending", "original", "permission", "licensed", "public_domain"]),
  rightsEvidence: z.string().max(4000),
  fullBookCoverage: z.object({ status: z.enum(["pending", "verified"]),
    expectedPhysicalPages: z.number().int().positive(), processedPhysicalPages: z.number().int().nonnegative(),
    missingOrUnreadable: z.array(z.string().min(1).max(500)).max(5000),
    visualReviewComplete: z.boolean(), evidence: text,
  }).strict().optional(),
  checkedPartialPublication: checkedPartialPublicationSchema.optional(),
}).strict().superRefine((source, ctx) => {
  const partial=source.checkedPartialPublication;
  if (!partial) return;
  const coverage=source.fullBookCoverage;
  if (!coverage || coverage.status!=="pending" || partial.sourceVersion!==source.version
    || coverage.expectedPhysicalPages!==coverage.processedPhysicalPages
    || !coverage.missingOrUnreadable.length
    || JSON.stringify(partial.exclusions.acceptedIssues)!==JSON.stringify(coverage.missingOrUnreadable)) {
    ctx.addIssue({code:"custom",message:"Checked-incomplete publication must preserve the exact current source gaps, version and available-page receipts."});
  }
  const refs=partial.passages.map(p=>`${p.id}@${p.version}`);
  if(new Set(refs).size!==refs.length)ctx.addIssue({code:"custom",message:"Duplicate checked-incomplete passage references."});
});
const common = {
  id, version, language: z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/),
  title: text, segments: z.array(z.enum(["personal", "personal_brand", "small_business"])).min(1).max(3),
  decisionDimensions: z.array(z.string().regex(/^[a-z][a-z0-9_.-]{0,79}$/)).min(1).max(20),
  authorship: z.enum(["original", "source_summary"]), authorName: text,
  sourceRefs: z.array(knowledgeRefSchema.extend({ locator: text }).strict()).max(20),
  limitations: list,
};
export const knowledgeCardSchema = z.object({ ...common, kind: z.literal("card"),
  category: z.enum(["marketing", "positioning", "discovery", "voice", "visual_translation", "channels", "preparation"]),
  principle: text, useWhen: list, requiredClientEvidence: list, application: list,
}).strict();
export const judgementExampleSchema = z.object({ ...common, kind: z.literal("judgement"),
  // Only original editorial/synthetic examples in this first shared-library import path.
  // Private client learning cases require the separate consent/de-identification review in Slice 5.
  origin: z.literal("synthetic_editorial"), situation: text, originalProposal: text,
  correction: text, betterResponse: text, explanation: text,
}).strict();
// Verbatim OCR/source passages are not editorial summaries. The source image,
// exact offsets and review status survive import and retrieval.
export const knowledgePassageSchema = z.object({ ...common, kind: z.literal("passage"),
  authorship: z.enum(["source_excerpt", "source_description"]), sourceRefs: z.array(knowledgeRefSchema.extend({ locator: text }).strict()).min(1).max(20),
  content: z.string().min(1).max(2400).refine(value => Array.from(value).length <= 1200), contentType: z.enum(["ocr_text", "checked_table", "figure_description"]),
  provenance: z.object({ sourceSha256: z.string().regex(/^[a-f0-9]{64}$/), part: z.number().int().positive(),
    physicalPage: z.number().int().positive(), side: z.enum(["left", "right", "single"]),
    start: z.number().int().nonnegative(), end: z.number().int().positive(),
    sourceImage: z.string().min(1).max(500), artifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(), quality: z.enum(["pending", "verified", "unreadable"]),
}).strict().refine(p => p.provenance.end-p.provenance.start === Array.from(p.content).length, "Passage offsets must match its full text.")
  .refine(p => p.contentType === "figure_description" ? p.authorship === "source_description" || p.quality === "pending" : p.authorship === "source_excerpt",
    "Reviewed visual descriptions must stay separate from original authored text.");
export const knowledgeItemSchema = z.discriminatedUnion("kind", [knowledgeCardSchema, judgementExampleSchema, knowledgePassageSchema]);
export const knowledgeBundleSchema = z.object({
  formatVersion: z.literal(1), sources: z.array(knowledgeSourceSchema).max(200), items: z.array(knowledgeItemSchema).min(1).max(MAX_KNOWLEDGE_ITEMS),
}).strict().superRefine((bundle, ctx) => {
  if (bundle.items.filter(i => i.kind !== "passage").length > 200) ctx.addIssue({ code: "custom", message: "A release supports up to 200 editorial items." });
  for (const values of [bundle.sources, bundle.items]) {
    const keys = values.map(v => `${"kind" in v && (v.kind === "card" || v.kind === "judgement" || v.kind === "passage") ? v.kind : "source"}:${v.id}@${v.version}`);
    if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", message: "Duplicate IDs and versions are not allowed." });
  }
  // One current version of each item per release; history lives in previous immutable releases.
  const itemIds = bundle.items.map(i => `${i.kind}:${i.id}`);
  if (new Set(itemIds).size !== itemIds.length) ctx.addIssue({ code: "custom", message: "A release can contain only one version of each item." });
  for (const item of bundle.items) {
    if (item.authorship === "source_summary" && !item.sourceRefs.length) ctx.addIssue({ code: "custom", message: "Source summaries require a source and locator." });
    for (const ref of item.sourceRefs) if (!bundle.sources.some(s => s.id === ref.id && s.version === ref.version)) ctx.addIssue({ code: "custom", message: `Missing source ${ref.id}@${ref.version}.` });
  }
  for (const source of bundle.sources) {
    const partial=source.checkedPartialPublication;
    if(!partial)continue;
    const scoped=bundle.items.filter(item=>item.kind==="passage"&&item.sourceRefs.some(ref=>ref.id===source.id&&ref.version===source.version));
    const refs=new Set(partial.passages.map(p=>`${p.id}@${p.version}`));
    if(scoped.length!==refs.size || scoped.some(item=>!refs.has(`${item.id}@${item.version}`)
      ||item.kind!=="passage"||item.quality!=="verified"||!item.limitations.includes(partial.label))) {
      ctx.addIssue({code:"custom",message:"Checked-incomplete scope must name every exact verified passage and retain its incomplete label."});
    }
  }
});
export type KnowledgeBundle = z.infer<typeof knowledgeBundleSchema>;
export type KnowledgeItem = z.infer<typeof knowledgeItemSchema>;
export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;
export function primaryKnowledgeText(item: KnowledgeItem): string {
  return item.kind === "passage" ? item.content : item.kind === "card" ? item.principle : item.betterResponse;
}
export function fullBookPassageReady(item: KnowledgeItem, sources: KnowledgeSource[]): boolean {
  return item.kind !== "passage" || (item.quality === "verified" && bookPassageCoverageReady(item,sources));
}
export function bookPassageCoverageReady(item: KnowledgeItem, sources: KnowledgeSource[]): boolean {
  return item.kind!=="passage" || item.sourceRefs.every(ref=>{
    const source=sources.find(s=>s.id===ref.id&&s.version===ref.version),coverage=source?.fullBookCoverage;
    if(!coverage||coverage.expectedPhysicalPages!==coverage.processedPhysicalPages)return false;
    // The strict complete-book path is unchanged. Partial acceptance never clears gaps.
    if(coverage.status==="verified")return !source?.checkedPartialPublication && !coverage.missingOrUnreadable.length&&coverage.visualReviewComplete;
    const partial=source?.checkedPartialPublication;
    return !!partial && partial.mode==="checked_available_incomplete" && partial.bookComplete===false
      && partial.sourceVersion===source.version && coverage.missingOrUnreadable.length>0
      && JSON.stringify(partial.exclusions.acceptedIssues)===JSON.stringify(coverage.missingOrUnreadable)
      && item.limitations.includes(partial.label)
      && partial.passages.some(p=>p.id===item.id&&p.version===item.version);
  });
}
export type KnowledgeReview = { actorUserId: number; reviewer: string; at: string; approved: boolean; reason: string; evaluationCaseIds: string[] };
export type KnowledgeReviews = Record<string, KnowledgeReview>;
export const importKnowledgeInputSchema = z.object({ format: z.enum(["json", "csv"]), content: z.string().min(1).max(2_000_000), expectedRevision: z.number().int().nonnegative() }).strict();
export const knowledgeReleaseInputSchema = z.object({ releaseId: z.string().uuid() }).strict();
export const reviewKnowledgeInputSchema = knowledgeReleaseInputSchema.extend({ expectedRevision: z.number().int().nonnegative(),
  kind: z.enum(["source", "card", "judgement", "passage"]), ref: knowledgeRefSchema,
  approved: z.boolean(), reason: text, evaluationCaseIds: z.array(id).max(30),
}).strict();
export const publishKnowledgeInputSchema = knowledgeReleaseInputSchema.extend({ expectedRevision: z.number().int().nonnegative(), expectedHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const withdrawKnowledgeInputSchema = z.object({ expectedRevision: z.number().int().nonnegative(), kind: z.enum(["source", "card", "judgement", "passage"]), ref: knowledgeRefSchema, reason: text }).strict();
