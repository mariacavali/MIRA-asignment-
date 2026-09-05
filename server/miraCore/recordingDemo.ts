import { randomBytes } from "node:crypto";
import { isLocalFileStoreEnabled } from "../localFileStore";
import {
  createLocalInvitation,
  createLocalPaidPhotographer,
  createLocalReference,
  createLocalShoot,
  findRecordingDemoShoot,
  getLocalInvitationForShoot,
  getLocalUserByEmail,
  markRecordingDemoPreparationComplete,
  resetRecordingDemoShoot,
  saveLocalProfile,
  type LocalUser,
} from "../localFileStore";
import { buildRecordingDemoReferences } from "./recordingDemoAssets";

// MIRA_RECORDING_DEMO mode: a fully offline, deterministic, repeatable
// product walkthrough for continuous screen recording. Never activates
// unless both flags below are explicitly set - see docs/MIRA_RECORDING_DEMO.md.
// Params (mirroring isLocalFileStoreEnabled's own signature) read live
// process.env by default but can be passed explicitly for pure unit tests.
export function isRecordingDemoEnabled(
  recordingDemoFlag = process.env.MIRA_RECORDING_DEMO,
  nodeEnv = process.env.NODE_ENV,
  localFileStoreFlag = process.env.MIRA_LOCAL_FILE_STORE,
) {
  return recordingDemoFlag === "true" && isLocalFileStoreEnabled(nodeEnv, localFileStoreFlag);
}

const RECORDING_DEMO_PHOTOGRAPHER_EMAIL = "recording-demo-photographer@mira.local";
const RECORDING_DEMO_PHOTOGRAPHER_NAME = "Maria Cavali";
const RECORDING_DEMO_CLIENT_NAME = "Elena";
const RECORDING_DEMO_SHOOT_TITLE = "Founder Editorial Portrait";
const RECORDING_DEMO_LOCATION = "Amsterdam";
const RECORDING_DEMO_TIMEZONE = "Europe/Amsterdam";
const RECORDING_DEMO_DURATION_MINUTES = 60;

function safeFutureDemoDate(): string {
  // Always at least 14 days ahead of whenever the recording is actually
  // made, so the seeded shoot never appears to be in the past.
  const date = new Date();
  date.setDate(date.getDate() + 14);
  date.setHours(10, 0, 0, 0);
  return date.toISOString();
}

function generateInvitationToken() {
  return randomBytes(32).toString("hex");
}

async function seedRecordingDemoReferences(shootId: number, photographerUserId: number) {
  const fixtures = buildRecordingDemoReferences(shootId);
  for (const fixture of fixtures) {
    await createLocalReference({
      id: `recording-demo-ref-${shootId}-${fixture.purpose}-${Math.random().toString(36).slice(2, 8)}`,
      shootId,
      photographerUserId,
      uploaderRole: "client",
      referencePurpose: fixture.purpose,
      evidenceKind: "observed",
      clientDescription: fixture.description,
      originalName: `${fixture.purpose}.svg`,
      mimeType: "image/svg+xml",
      dataUrl: fixture.dataUrl,
      analysisJson: null,
    });
  }
}

// Idempotent: safe to call on every checkout-activation and after a reset.
// Reuses the existing local-file-backed storage (server/localFileStore.ts) -
// no database, no external credentials, no network access.
export async function ensureRecordingDemoSeed() {
  if (!isRecordingDemoEnabled()) throw new Error("Recording demo mode is not enabled");

  const existingShoot = await findRecordingDemoShoot();
  if (existingShoot) {
    const user = await getLocalUserByEmail(RECORDING_DEMO_PHOTOGRAPHER_EMAIL);
    const invitation = await getLocalInvitationForShoot(existingShoot.id);
    return { user, shoot: existingShoot, invitation };
  }

  let user: LocalUser | null | undefined = await getLocalUserByEmail(RECORDING_DEMO_PHOTOGRAPHER_EMAIL);
  if (!user) {
    user = await createLocalPaidPhotographer({ name: RECORDING_DEMO_PHOTOGRAPHER_NAME, email: RECORDING_DEMO_PHOTOGRAPHER_EMAIL });
  }
  if (!user) throw new Error("Could not seed the recording demo photographer account");

  await saveLocalProfile({
    userId: user.id,
    displayName: RECORDING_DEMO_PHOTOGRAPHER_NAME,
    businessName: "MIRA Studio (Demo)",
    bio: "Local recording demo photographer profile.",
    photographyStyle: "Editorial portrait",
    areasOfExpertise: ["Personal brand", "Editorial portrait"],
    websiteUrl: null,
    instagramUrl: null,
    timezone: RECORDING_DEMO_TIMEZONE,
    onboardingStatus: "complete",
  });

  const shoot = await createLocalShoot({
    photographerUserId: user.id,
    sourceMode: "mira_saas",
    externalSourceId: null,
    status: "confirmed",
    title: RECORDING_DEMO_SHOOT_TITLE,
    shootType: "Personal-brand campaign",
    clientName: RECORDING_DEMO_CLIENT_NAME,
    clientEmail: null,
    clientPhone: null,
    invitationMessage: "Looking forward to preparing this together.",
    scheduledAt: safeFutureDemoDate(),
    timezone: RECORDING_DEMO_TIMEZONE,
    intendedUse: "Personal-brand campaign",
    location: RECORDING_DEMO_LOCATION,
    durationMinutes: RECORDING_DEMO_DURATION_MINUTES,
    photographerNotes: "Seeded fictional shoot for MIRA_RECORDING_DEMO mode.",
    roomState: "welcome",
    callAllowanceSeconds: 20 * 60,
    recordingDemo: true,
    recordingDemoPreparationAt: null,
  });

  await seedRecordingDemoReferences(shoot.id, user.id);

  const invitation = await createLocalInvitation({
    id: `recording-demo-invitation-${shoot.id}`,
    shootId: shoot.id,
    photographerUserId: user.id,
    token: generateInvitationToken(),
    status: "active",
    deliveryStatus: "created",
    deliveryProvider: null,
    providerMessageId: null,
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    consentAcknowledgedAt: null,
    lastOpenedAt: null,
    preparationStartedAt: null,
    completedAt: null,
    sentAt: null,
    scheduleResponse: null,
  });

  return { user, shoot, invitation };
}

export async function completeRecordingDemoConversation(shootId: number) {
  return markRecordingDemoPreparationComplete(shootId);
}

export async function resetRecordingDemo() {
  const shoot = await findRecordingDemoShoot();
  if (!shoot) return ensureRecordingDemoSeed();
  await resetRecordingDemoShoot(shoot.id);
  const invitation = await getLocalInvitationForShoot(shoot.id);
  const user = await getLocalUserByEmail(RECORDING_DEMO_PHOTOGRAPHER_EMAIL);
  return { user, shoot, invitation };
}
