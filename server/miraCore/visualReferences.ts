import { and, asc, count, eq, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { miraShootVisualReferences, miraShoots } from "../../drizzle/schema";
import { getDb } from "../db";
import { createLocalReference, listLocalReferences, isLocalFileStoreEnabled, removeLocalReference } from "../localFileStore";
import { analyzePrivateReferenceImage, IMAGE_ANALYSIS_MODEL_ID } from "../miraV3/imageAnalysis";
import {
  decodeAndValidateReferenceImage,
  MIRA_V3_IMAGE_MIME_TYPES,
  MIRA_V3_MAX_IMAGE_BYTES,
  MIRA_V3_MAX_IMAGE_COUNT,
} from "../miraV3/media";
import { storageGetSignedUrl, storagePut } from "../storage";

// Client-facing "what is this reference for" categories. Distinct from
// evidenceKind (the provenance/confidence model MIRA reasons with during
// Discovery) - this is display/intent metadata that maps onto it, so the
// client never needs to understand the underlying provenance model.
export const referencePurposeSchema = z.enum([
  "like",
  "dislike",
  "current_identity",
  "direction_to_explore",
  "portrait",
  "location",
  "other",
]);
export type ReferencePurpose = z.infer<typeof referencePurposeSchema>;

// The downstream Creative DNA synthesis step is designed around exactly five
// client references - distinct from and stricter than
// MIRA_V3_MAX_IMAGE_COUNT, which bounds the shoot's combined photographer +
// client total and is unrelated to this per-role limit.
export const MIRA_CORE_MAX_CLIENT_VISUAL_REFERENCES = 5;

export function evidenceKindForReferencePurpose(purpose: ReferencePurpose): "observed" | "explicit_preference" {
  switch (purpose) {
    case "like":
    case "dislike":
    case "direction_to_explore":
      return "explicit_preference";
    case "current_identity":
    case "portrait":
    case "location":
    case "other":
      return "observed";
  }
}

export const shootVisualReferenceUploadSchema = z.object({
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.enum(MIRA_V3_IMAGE_MIME_TYPES),
  base64: z.string().min(4).max(Math.ceil(MIRA_V3_MAX_IMAGE_BYTES * 4 / 3) + 8),
  clientDescription: z.string().trim().max(800).nullable().default(null),
  evidenceKind: z.enum(["observed", "explicit_preference"]).default("observed"),
  // Optional and unused by the existing photographer-dashboard upload path,
  // which keeps setting evidenceKind directly - when present, it overrides
  // evidenceKind (see uploadShootVisualReference).
  referencePurpose: referencePurposeSchema.optional(),
}).strict();

export type ShootVisualReferenceUpload = z.infer<typeof shootVisualReferenceUploadSchema>;

export function visualEvidenceMayBecomePreference(evidenceKind: string) {
  return evidenceKind === "explicit_preference" || evidenceKind === "confirmed_direction";
}

export function buildShootReferenceStorageKey(params: {
  photographerUserId: number;
  shootId: number;
  assetId: string;
  mimeType: typeof MIRA_V3_IMAGE_MIME_TYPES[number];
}) {
  const extension = params.mimeType === "image/jpeg" ? "jpg" : params.mimeType === "image/png" ? "png" : "webp";
  return `mira-shoots/${params.photographerUserId}/${params.shootId}/references/${params.assetId}.${extension}`;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

export async function listShootVisualReferencesForOwner(photographerUserId: number, shootId: number) {
  if (isLocalFileStoreEnabled()) return listLocalReferences(shootId, "photographer");
  const db = await requireDb();
  const owned = await db.select({ id: miraShoots.id }).from(miraShoots).where(and(
    eq(miraShoots.id, shootId),
    eq(miraShoots.photographerUserId, photographerUserId),
  )).limit(1);
  if (!owned[0]) return null;
  return db.select().from(miraShootVisualReferences).where(and(
    eq(miraShootVisualReferences.shootId, shootId),
    eq(miraShootVisualReferences.photographerUserId, photographerUserId),
    ne(miraShootVisualReferences.status, "removed"),
  )).orderBy(asc(miraShootVisualReferences.createdAt));
}

// Client-facing "what have I already shared" view - scoped to the client's
// own uploads only (never a photographer's own reference material), and
// never returns analysisJson/analysisModel/storageKey/photographerUserId,
// which are internal QA-only fields.
export async function listShootVisualReferencesForClient(shootId: number) {
  if (isLocalFileStoreEnabled()) return (await listLocalReferences(shootId, "client")).map(reference => ({
    id: reference.id, referencePurpose: reference.referencePurpose, clientDescription: reference.clientDescription,
    createdAt: new Date(reference.createdAt), url: reference.dataUrl,
  }));
  const db = await requireDb();
  const rows = await db.select({
    id: miraShootVisualReferences.id,
    referencePurpose: miraShootVisualReferences.referencePurpose,
    clientDescription: miraShootVisualReferences.clientDescription,
    storageKey: miraShootVisualReferences.storageKey,
    createdAt: miraShootVisualReferences.createdAt,
  }).from(miraShootVisualReferences).where(and(
    eq(miraShootVisualReferences.shootId, shootId),
    eq(miraShootVisualReferences.uploaderRole, "client"),
    ne(miraShootVisualReferences.status, "removed"),
  )).orderBy(asc(miraShootVisualReferences.createdAt));
  return Promise.all(rows.map(async row => ({
    id: row.id,
    referencePurpose: row.referencePurpose,
    clientDescription: row.clientDescription,
    createdAt: row.createdAt,
    url: await storageGetSignedUrl(row.storageKey).catch(() => null),
  })));
}

// The "removed" status already existed in the schema for this exact purpose
// but had no caller. Scoped to the client's own uploads for a given shoot -
// a client can never remove a photographer-uploaded reference this way.
export async function removeClientVisualReference(params: { shootId: number; assetId: string }) {
  if (isLocalFileStoreEnabled()) return removeLocalReference(params.shootId, params.assetId);
  const db = await requireDb();
  const result = await db.update(miraShootVisualReferences).set({ status: "removed" }).where(and(
    eq(miraShootVisualReferences.id, params.assetId),
    eq(miraShootVisualReferences.shootId, params.shootId),
    eq(miraShootVisualReferences.uploaderRole, "client"),
    ne(miraShootVisualReferences.status, "removed"),
  ));
  return Number(result[0].affectedRows) === 1;
}

export async function listShootVisualEvidenceForRealtime(shootId: number) {
  const db = await requireDb();
  return db.select({
    id: miraShootVisualReferences.id,
    uploaderRole: miraShootVisualReferences.uploaderRole,
    evidenceKind: miraShootVisualReferences.evidenceKind,
    referencePurpose: miraShootVisualReferences.referencePurpose,
    clientDescription: miraShootVisualReferences.clientDescription,
    status: miraShootVisualReferences.status,
    analysis: miraShootVisualReferences.analysisJson,
  }).from(miraShootVisualReferences).where(and(
    eq(miraShootVisualReferences.shootId, shootId),
    ne(miraShootVisualReferences.status, "removed"),
  )).orderBy(asc(miraShootVisualReferences.createdAt));
}

export async function uploadShootVisualReference(params: {
  shootId: number;
  photographerUserId: number;
  uploaderRole: "photographer" | "client";
  input: ShootVisualReferenceUpload;
}) {
  if (isLocalFileStoreEnabled()) {
    const parsed = shootVisualReferenceUploadSchema.parse(params.input);
    if (params.uploaderRole === "client") {
      const existingClientReferences = await listLocalReferences(params.shootId, "client");
      if (existingClientReferences.length >= MIRA_CORE_MAX_CLIENT_VISUAL_REFERENCES) {
        throw new Error(`A shoot can include up to ${MIRA_CORE_MAX_CLIENT_VISUAL_REFERENCES} client visual references`);
      }
    }
    const bytes = decodeAndValidateReferenceImage({ journeyId: params.shootId, ...parsed });
    const assetId = randomUUID();
    const reference = await createLocalReference({
      id: assetId, shootId: params.shootId, photographerUserId: params.photographerUserId,
      uploaderRole: params.uploaderRole, referencePurpose: parsed.referencePurpose ?? null,
      evidenceKind: parsed.referencePurpose ? evidenceKindForReferencePurpose(parsed.referencePurpose) : parsed.evidenceKind,
      clientDescription: parsed.clientDescription, originalName: parsed.originalName,
      mimeType: parsed.mimeType, dataUrl: `data:${parsed.mimeType};base64,${parsed.base64}`, analysisJson: null,
    });
    return { id: reference.id, originalName: reference.originalName, mimeType: reference.mimeType, byteSize: bytes.length, evidenceKind: parsed.referencePurpose ? evidenceKindForReferencePurpose(parsed.referencePurpose) : parsed.evidenceKind, referencePurpose: reference.referencePurpose };
  }
  const db = await requireDb();
  const parsed = shootVisualReferenceUploadSchema.parse(params.input);
  const owned = await db.select({ id: miraShoots.id }).from(miraShoots).where(and(
    eq(miraShoots.id, params.shootId),
    eq(miraShoots.photographerUserId, params.photographerUserId),
  )).limit(1);
  if (!owned[0]) return null;
  const totals = await db.select({ total: count() }).from(miraShootVisualReferences).where(and(
    eq(miraShootVisualReferences.shootId, params.shootId),
    ne(miraShootVisualReferences.status, "removed"),
  ));
  if ((totals[0]?.total ?? 0) >= MIRA_V3_MAX_IMAGE_COUNT) throw new Error("A shoot can contain up to six visual references");
  if (params.uploaderRole === "client") {
    const clientTotals = await db.select({ total: count() }).from(miraShootVisualReferences).where(and(
      eq(miraShootVisualReferences.shootId, params.shootId),
      eq(miraShootVisualReferences.uploaderRole, "client"),
      ne(miraShootVisualReferences.status, "removed"),
    ));
    if ((clientTotals[0]?.total ?? 0) >= MIRA_CORE_MAX_CLIENT_VISUAL_REFERENCES) {
      throw new Error(`A shoot can include up to ${MIRA_CORE_MAX_CLIENT_VISUAL_REFERENCES} client visual references`);
    }
  }
  const bytes = decodeAndValidateReferenceImage({ journeyId: params.shootId, ...parsed });
  const assetId = randomUUID();
  const stored = await storagePut(buildShootReferenceStorageKey({
    photographerUserId: params.photographerUserId,
    shootId: params.shootId,
    assetId,
    mimeType: parsed.mimeType,
  }), bytes, parsed.mimeType);
  const evidenceKind = parsed.referencePurpose ? evidenceKindForReferencePurpose(parsed.referencePurpose) : parsed.evidenceKind;
  await db.insert(miraShootVisualReferences).values({
    id: assetId,
    shootId: params.shootId,
    photographerUserId: params.photographerUserId,
    uploaderRole: params.uploaderRole,
    evidenceKind,
    referencePurpose: parsed.referencePurpose ?? null,
    storageKey: stored.key,
    originalName: parsed.originalName,
    mimeType: parsed.mimeType,
    byteSize: bytes.length,
    clientDescription: parsed.clientDescription,
  });
  return { id: assetId, originalName: parsed.originalName, mimeType: parsed.mimeType, byteSize: bytes.length, evidenceKind, referencePurpose: parsed.referencePurpose ?? null };
}

export async function analyzeShootVisualReference(params: {
  photographerUserId: number;
  shootId: number;
  assetId: string;
}) {
  const db = await requireDb();
  const rows = await db.select().from(miraShootVisualReferences).where(and(
    eq(miraShootVisualReferences.id, params.assetId),
    eq(miraShootVisualReferences.shootId, params.shootId),
    eq(miraShootVisualReferences.photographerUserId, params.photographerUserId),
    ne(miraShootVisualReferences.status, "removed"),
  )).limit(1);
  const asset = rows[0];
  if (!asset) return null;
  const signedUrl = await storageGetSignedUrl(asset.storageKey);
  const analysis = await analyzePrivateReferenceImage({ assetId: asset.id, imageUrl: signedUrl, mimeType: asset.mimeType });
  await db.update(miraShootVisualReferences).set({
    status: analysis.status === "complete" ? "analyzed" : "failed",
    analysisJson: analysis.output,
    analysisModel: analysis.provenance.model || IMAGE_ANALYSIS_MODEL_ID,
  }).where(eq(miraShootVisualReferences.id, asset.id));
  return analysis;
}
