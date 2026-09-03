import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

export type LocalUser = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: "user" | "admin";
  createdAt: string;
  updatedAt: string;
  lastSignedIn: string;
  paymentStatus?: "unpaid" | "test_active" | "paid";
  selectedPlan?: string | null;
  passwordHash?: string;
};

export type LocalProfile = {
  userId: number;
  displayName: string;
  businessName: string | null;
  bio: string | null;
  photographyStyle: string | null;
  areasOfExpertise: string[];
  websiteUrl: string | null;
  instagramUrl: string | null;
  timezone: string;
  onboardingStatus: "started" | "complete";
  createdAt: string;
  updatedAt: string;
};

export type LocalShoot = {
  id: number;
  photographerUserId: number;
  sourceMode: "maria_photography" | "mira_saas";
  externalSourceId: string | null;
  status: string;
  title: string;
  shootType: string | null;
  clientName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  invitationMessage: string | null;
  scheduledAt: string | null;
  timezone: string;
  intendedUse: string | null;
  location: string | null;
  durationMinutes: number | null;
  photographerNotes: string | null;
  roomState: string;
  callAllowanceSeconds: number;
  createdAt: string;
  updatedAt: string;
};

export type LocalInvitation = {
  id: string;
  shootId: number;
  photographerUserId: number;
  token: string;
  status: "active" | "completed" | "expired" | "revoked";
  deliveryStatus: "created" | "opened" | "preparation_in_progress" | "completed";
  expiresAt: string;
  consentAcknowledgedAt: string | null;
  lastOpenedAt: string | null;
  preparationStartedAt: string | null;
  completedAt: string | null;
  scheduleResponse: { response: "confirmed" | "change_requested"; note: string | null } | null;
  createdAt: string;
};

export type LocalPendingCheckout = {
  referenceId: string;
  userId: number;
  openId: string;
  name: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "consumed" | "expired";
};

export type LocalReference = {
  id: string;
  shootId: number;
  photographerUserId: number;
  uploaderRole: "photographer" | "client";
  referencePurpose: string | null;
  evidenceKind: string;
  clientDescription: string | null;
  originalName: string;
  mimeType: string;
  dataUrl: string;
  status: "uploaded" | "removed";
  analysisJson: unknown | null;
  createdAt: string;
};

export type LocalTextTestSession = {
  id: string;
  invitationId: string;
  shootId: number;
  photographerUserId: number;
  status: "active" | "ended";
  turnCount: number;
  allowedSeconds: number;
  startedAt: string;
  endedAt: string | null;
  endReason: string | null;
  messages: Array<{ role: "client" | "assistant"; content: string; createdAt: string }>;
};

type LocalState = {
  nextUserId: number;
  nextShootId: number;
  users: LocalUser[];
  profiles: LocalProfile[];
  shoots: LocalShoot[];
  invitations: LocalInvitation[];
  references: LocalReference[];
  pendingCheckouts?: LocalPendingCheckout[];
  processedStripeEvents?: string[];
  textTestSessions?: LocalTextTestSession[];
};

const storePath = join(process.cwd(), ".mira-local-data", "store.json");
let writeQueue: Promise<unknown> = Promise.resolve();

export function isLocalFileStoreEnabled(nodeEnv = process.env.NODE_ENV, flag = process.env.MIRA_LOCAL_FILE_STORE) {
  return (nodeEnv === "development" || nodeEnv === "test") && flag === "true";
}

async function load(): Promise<LocalState> {
  try {
    return JSON.parse(await readFile(storePath, "utf8")) as LocalState;
  } catch {
    return { nextUserId: 210001, nextShootId: 1, users: [], profiles: [], shoots: [], invitations: [], references: [] };
  }
}

export async function getLocalState() {
  return load();
}

export function generatePendingCheckoutReference() {
  return `mira_pc_${randomBytes(24).toString("hex")}`;
}

export function createPendingCheckoutRecord(input: { name: string; email: string; userId?: number; openId?: string }, now = new Date(), lifetimeMs = 30 * 60_000): LocalPendingCheckout {
  return {
    referenceId: generatePendingCheckoutReference(),
    userId: input.userId ?? 0,
    openId: input.openId ?? "",
    name: input.name,
    email: input.email,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + lifetimeMs).toISOString(),
    status: "pending",
  };
}

export async function createLocalPendingCheckout(input: { name: string; email: string }, photographerUserId?: number) {
  return update(state => {
    state.pendingCheckouts ??= [];
    const user = state.users.find(item => item.id === photographerUserId && item.email?.toLowerCase() === input.email.toLowerCase());
    if (!user) return null;
    for (const checkout of state.pendingCheckouts) if (checkout.userId === user.id && checkout.status === "pending") checkout.status = "expired";
    const record = createPendingCheckoutRecord({ ...input, userId: user.id, openId: user.openId });
    state.pendingCheckouts.push(record);
    return record;
  });
}

export async function getLocalPendingCheckout(referenceId: string, now = new Date()) {
  const record = (await load()).pendingCheckouts?.find(item => item.referenceId === referenceId);
  if (!record || record.status !== "pending" || new Date(record.expiresAt).getTime() <= now.getTime()) return null;
  return record;
}

export async function getLocalPendingCheckoutIdentity(referenceId: string) {
  const record = (await load()).pendingCheckouts?.find(item => item.referenceId === referenceId);
  if (!record) return null;
  return {
    referenceId: record.referenceId,
    createdAt: new Date(record.createdAt),
    expiresAt: new Date(record.expiresAt),
    status: record.status,
    name: record.name,
    email: record.email,
    userId: record.userId,
    openId: record.openId,
  };
}

export async function consumeLocalPendingCheckout(referenceId: string, identity: { customerId: string; subscriptionId: string; priceId: string; currency: string; cancelAtPeriodEnd?: boolean; cancelAt?: Date | null; currentPeriodEnd?: Date | null }) {
  return update(state => {
    const pending = state.pendingCheckouts?.find(item => item.referenceId === referenceId && item.status === "pending");
    if (!pending) return null;
    const user = state.users.find(item => item.id === pending.userId && item.openId === pending.openId);
    if (!user) return null;
    pending.status = "consumed";
    user.paymentStatus = "paid";
    user.selectedPlan = identity.priceId;
    user.updatedAt = new Date().toISOString();
    return {
      openId: user.openId,
      state: "active" as const,
      customerId: identity.customerId,
      subscriptionId: identity.subscriptionId,
      priceId: identity.priceId,
      currency: identity.currency,
      cancelAtPeriodEnd: identity.cancelAtPeriodEnd ?? false,
      cancelAt: identity.cancelAt ?? null,
      currentPeriodEnd: identity.currentPeriodEnd ?? null,
    };
  });
}

export async function hasProcessedLocalStripeEvent(eventId: string) {
  return Boolean((await load()).processedStripeEvents?.includes(eventId));
}

export async function recordProcessedLocalStripeEvent(eventId: string) {
  await update(state => {
    state.processedStripeEvents ??= [];
    if (!state.processedStripeEvents.includes(eventId)) state.processedStripeEvents.push(eventId);
  });
}

async function save(state: LocalState) {
  await mkdir(dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, storePath);
}

async function update<T>(mutator: (state: LocalState) => T | Promise<T>) {
  const result = writeQueue.then(async () => {
    const state = await load();
    const value = await mutator(state);
    await save(state);
    return value;
  });
  writeQueue = result.catch(() => undefined);
  return result;
}

export async function upsertLocalUser(input: Omit<LocalUser, "id" | "createdAt" | "updatedAt">) {
  return update(state => {
    let user = state.users.find(item => item.openId === input.openId);
    const now = new Date().toISOString();
    if (!user) {
      user = { ...input, id: state.nextUserId++, createdAt: now, updatedAt: now };
      state.users.push(user);
    } else Object.assign(user, input, { updatedAt: now });
    return user;
  });
}

export async function getLocalUserByOpenId(openId: string) {
  return (await load()).users.find(user => user.openId === openId);
}

export async function getLocalUserByEmail(email: string) {
  return (await load()).users.find(user => user.email?.toLowerCase() === email.toLowerCase());
}

export function hashLocalPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
}

export function verifyLocalPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 32);
  return timingSafeEqual(actual, Buffer.from(expected, "hex"));
}

export async function createLocalPhotographer(input: { firstName: string; lastName: string; email: string; password: string }) {
  return update(state => {
    const existing = state.users.find(user => user.email?.toLowerCase() === input.email.toLowerCase());
    if (existing) return null;
    const now = new Date().toISOString();
    const user: LocalUser = { id: state.nextUserId++, openId: `local-photographer-${randomUUID()}`, name: `${input.firstName} ${input.lastName}`, email: input.email, loginMethod: "local-dev-account", role: "user", createdAt: now, updatedAt: now, lastSignedIn: now, paymentStatus: "unpaid", selectedPlan: null, passwordHash: hashLocalPassword(input.password) };
    state.users.push(user);
    return user;
  });
}

export async function createLocalPaidPhotographer(input: { name: string; email: string }) {
  return update(state => {
    const existing = state.users.find(user => user.email?.toLowerCase() === input.email.toLowerCase());
    if (existing) return null;
    const now = new Date().toISOString();
    const user: LocalUser = { id: state.nextUserId++, openId: `local-photographer-${randomUUID()}`, name: input.name, email: input.email, loginMethod: "local-dev-purchase", role: "user", createdAt: now, updatedAt: now, lastSignedIn: now, paymentStatus: "test_active", selectedPlan: "MIRA Studio" };
    state.users.push(user);
    return user;
  });
}

export async function getLocalAccess(openId: string) {
  const user = (await load()).users.find(item => item.openId === openId);
  return { paymentStatus: user?.paymentStatus ?? "unpaid", selectedPlan: user?.selectedPlan ?? null };
}

export async function activateLocalPlan(openId: string, selectedPlan: string) {
  return update(state => {
    const user = state.users.find(item => item.openId === openId);
    if (!user) return null;
    user.paymentStatus = "test_active";
    user.selectedPlan = selectedPlan;
    user.updatedAt = new Date().toISOString();
    return user;
  });
}

export async function resetLocalPhotographerJourney(openId: string) {
  return update(state => {
    const user = state.users.find(item => item.openId === openId);
    if (!user) return false;
    delete user.paymentStatus;
    delete user.selectedPlan;
    state.profiles = state.profiles.filter(profile => profile.userId !== user.id);
    return true;
  });
}

export async function getLocalProfile(userId: number) {
  return (await load()).profiles.find(profile => profile.userId === userId) ?? null;
}

export async function saveLocalProfile(input: Omit<LocalProfile, "createdAt" | "updatedAt">) {
  return update(state => {
    const now = new Date().toISOString();
    const existing = state.profiles.find(profile => profile.userId === input.userId);
    if (existing) Object.assign(existing, input, { updatedAt: now });
    else state.profiles.push({ ...input, createdAt: now, updatedAt: now });
    return state.profiles.find(profile => profile.userId === input.userId) ?? null;
  });
}

export async function createLocalShoot(input: Omit<LocalShoot, "id" | "createdAt" | "updatedAt">) {
  return update(state => {
    const now = new Date().toISOString();
    const shoot = { ...input, id: state.nextShootId++, createdAt: now, updatedAt: now };
    state.shoots.push(shoot);
    return shoot;
  });
}

export async function listLocalShoots(userId: number) {
  return (await load()).shoots.filter(shoot => shoot.photographerUserId === userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getLocalShoot(userId: number, shootId: number) {
  return (await load()).shoots.find(shoot => shoot.photographerUserId === userId && shoot.id === shootId) ?? null;
}

export async function createLocalInvitation(input: Omit<LocalInvitation, "createdAt">) {
  return update(state => {
    state.invitations = state.invitations ?? [];
    for (const invitation of state.invitations) if (invitation.shootId === input.shootId && invitation.status === "active") invitation.status = "revoked";
    const invitation = { ...input, createdAt: new Date().toISOString() };
    state.invitations.push(invitation);
    return invitation;
  });
}

export async function getLocalInvitation(token: string, markOpened = false) {
  const state = await load();
  const invitation = (state.invitations ?? []).find(item => item.token === token);
  if (!invitation) return null;
  const shoot = state.shoots.find(item => item.id === invitation.shootId);
  if (!shoot) return null;
  if (markOpened && invitation.status === "active") {
    invitation.lastOpenedAt ??= new Date().toISOString();
    if (invitation.deliveryStatus === "created") invitation.deliveryStatus = "opened";
    await save(state);
  }
  const profile = (state.profiles ?? []).find(item => item.userId === shoot.photographerUserId);
  const user = (state.users ?? []).find(item => item.id === shoot.photographerUserId);
  return {
    invitation,
    shoot,
    photographer: profile ?? (user?.name ? {
      userId: user.id,
      displayName: user.name,
      businessName: null,
      bio: null,
      photographyStyle: null,
      areasOfExpertise: [],
      websiteUrl: null,
      instagramUrl: null,
      timezone: shoot.timezone,
      onboardingStatus: "complete" as const,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    } : null),
  };
}

export async function listLocalReferences(shootId: number, uploaderRole?: LocalReference["uploaderRole"]) {
  return ((await load()).references ?? []).filter(reference => reference.shootId === shootId && (!uploaderRole || reference.uploaderRole === uploaderRole) && reference.status !== "removed");
}

export async function createLocalReference(input: Omit<LocalReference, "createdAt" | "status">) {
  return update(state => {
    state.references = state.references ?? [];
    const reference = { ...input, status: "uploaded" as const, analysisJson: input.analysisJson ?? null, createdAt: new Date().toISOString() };
    state.references.push(reference);
    return reference;
  });
}

export async function removeLocalReference(shootId: number, assetId: string) {
  return update(state => {
    const reference = (state.references ?? []).find(item => item.shootId === shootId && item.id === assetId && item.uploaderRole === "client" && item.status !== "removed");
    if (!reference) return false;
    reference.status = "removed";
    return true;
  });
}

export async function updateLocalInvitation(id: string, patch: Partial<LocalInvitation>) {
  return update(state => {
    const invitation = (state.invitations ?? []).find(item => item.id === id);
    if (!invitation) return null;
    Object.assign(invitation, patch);
    return invitation;
  });
}

export async function acceptLocalInvitation(token: string) {
  return update(state => {
    const invitation = (state.invitations ?? []).find(item => item.token === token && item.status === "active");
    if (!invitation) return null;
    const now = new Date().toISOString();
    invitation.consentAcknowledgedAt = now;
    invitation.lastOpenedAt ??= now;
    invitation.deliveryStatus = "preparation_in_progress";
    invitation.preparationStartedAt ??= now;
    return invitation;
  });
}

export async function updateLocalShoot(userId: number, shootId: number, patch: Partial<LocalShoot>) {
  return update(state => {
    const shoot = state.shoots.find(item => item.id === shootId && item.photographerUserId === userId);
    if (!shoot) return null;
    Object.assign(shoot, patch, { updatedAt: new Date().toISOString() });
    return shoot;
  });
}

export async function startLocalTextTestSession(input: { token: string; prompts: readonly string[]; allowedSeconds: number; maxSessions?: number }) {
  return update(state => {
    const invitation = (state.invitations ?? []).find(item => item.token === input.token && item.status === "active");
    if (!invitation || !input.prompts[0]) return null;
    const shoot = state.shoots.find(item => item.id === invitation.shootId && item.photographerUserId === invitation.photographerUserId);
    if (!shoot) return null;
    state.textTestSessions ??= [];
    const active = state.textTestSessions.find(item => item.invitationId === invitation.id && item.status === "active");
    if (active) {
      return { sessionId: active.id, prompt: input.prompts[active.turnCount] ?? input.prompts[0], allowedSeconds: active.allowedSeconds };
    }
    if (state.textTestSessions.filter(item => item.invitationId === invitation.id).length >= (input.maxSessions ?? 3)) return null;
    const now = new Date().toISOString();
    const session: LocalTextTestSession = {
      id: randomUUID(),
      invitationId: invitation.id,
      shootId: shoot.id,
      photographerUserId: shoot.photographerUserId,
      status: "active",
      turnCount: 0,
      allowedSeconds: input.allowedSeconds,
      startedAt: now,
      endedAt: null,
      endReason: null,
      messages: [{ role: "assistant", content: input.prompts[0], createdAt: now }],
    };
    state.textTestSessions.push(session);
    invitation.consentAcknowledgedAt ??= now;
    invitation.lastOpenedAt ??= now;
    invitation.deliveryStatus = "preparation_in_progress";
    invitation.preparationStartedAt ??= now;
    shoot.status = "conversation_in_progress";
    if (shoot.roomState === "welcome") shoot.roomState = "discovery_offered";
    shoot.updatedAt = now;
    return { sessionId: session.id, prompt: input.prompts[0], allowedSeconds: session.allowedSeconds };
  });
}

export async function submitLocalTextTestTurn(input: { token: string; sessionId: string; answer: string; prompts: readonly string[] }) {
  return update(state => {
    const invitation = (state.invitations ?? []).find(item => item.token === input.token && item.status === "active");
    const session = state.textTestSessions?.find(item => item.id === input.sessionId && item.status === "active" && item.invitationId === invitation?.id);
    if (!invitation || !session) return null;
    const now = new Date();
    const consumedSeconds = Math.max(0, Math.floor((now.getTime() - new Date(session.startedAt).getTime()) / 1000));
    if (consumedSeconds >= session.allowedSeconds) {
      session.status = "ended";
      session.endedAt = now.toISOString();
      session.endReason = "allowance_exhausted";
      invitation.status = "completed";
      invitation.deliveryStatus = "completed";
      invitation.completedAt = now.toISOString();
      return null;
    }
    session.messages.push({ role: "client", content: input.answer, createdAt: now.toISOString() });
    session.turnCount += 1;
    const nextPrompt = input.prompts[session.turnCount] ?? null;
    if (nextPrompt) session.messages.push({ role: "assistant", content: nextPrompt, createdAt: now.toISOString() });
    else {
      session.status = "ended";
      session.endedAt = now.toISOString();
      session.endReason = "test_complete";
      invitation.status = "completed";
      invitation.deliveryStatus = "completed";
      invitation.completedAt = now.toISOString();
    }
    return { shootId: session.shootId, turnCount: session.turnCount, nextPrompt, complete: !nextPrompt };
  });
}

export async function endLocalTextTestSession(input: { token: string; sessionId: string }) {
  return update(state => {
    const invitation = (state.invitations ?? []).find(item => item.token === input.token && item.status === "active");
    const session = state.textTestSessions?.find(item => item.id === input.sessionId && item.status === "active" && item.invitationId === invitation?.id);
    if (!invitation || !session) return false;
    const now = new Date().toISOString();
    session.status = "ended";
    session.endedAt = now;
    session.endReason = "client_ended";
    invitation.status = "completed";
    invitation.deliveryStatus = "completed";
    invitation.completedAt = now;
    return true;
  });
}

export async function listLocalTextTestSessions(userId: number, shootId: number) {
  const state = await load();
  if (!state.shoots.some(item => item.id === shootId && item.photographerUserId === userId)) return null;
  return (state.textTestSessions ?? []).filter(item => item.shootId === shootId && item.photographerUserId === userId);
}

export async function deleteLocalTextTestMessages(userId: number, shootId: number) {
  return update(state => {
    if (!state.shoots.some(item => item.id === shootId && item.photographerUserId === userId)) return false;
    for (const session of state.textTestSessions ?? []) {
      if (session.shootId === shootId && session.photographerUserId === userId) session.messages = [];
    }
    return true;
  });
}

export async function getLocalInvitationForShoot(shootId: number) {
  return (await load()).invitations?.filter(item => item.shootId === shootId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

export async function listLocalInvitations(shootId: number) {
  return (await load()).invitations?.filter(item => item.shootId === shootId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) ?? [];
}
