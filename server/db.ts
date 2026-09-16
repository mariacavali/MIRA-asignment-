import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, miraPhotographerCredentials, miraStripeBillingIdentities, users, type User } from "../drizzle/schema";
import { ENV } from './_core/env';
import { activateLocalPlan, createLocalPaidPhotographer, getLocalAccess, getLocalUserByEmail, getLocalUserByOpenId, hashLocalPassword, isLocalFileStoreEnabled, resetLocalPhotographerJourney, upsertLocalUser, verifyLocalPassword } from "./localFileStore";
import { paymentStateGrantsAccess } from "./payment/paymentEventProcessor";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
    if (isLocalFileStoreEnabled()) {
      await upsertLocalUser({
        openId: user.openId,
        name: user.name ?? null,
        email: user.email ?? null,
        loginMethod: user.loginMethod ?? null,
        role: user.role ?? "user",
        lastSignedIn: (user.lastSignedIn ?? new Date()).toISOString(),
      });
      return;
    }

  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  if (isLocalFileStoreEnabled()) {
    const user = await getLocalUserByOpenId(openId);
    return user ? {
      ...user,
      createdAt: new Date(user.createdAt),
      updatedAt: new Date(user.updatedAt),
      lastSignedIn: new Date(user.lastSignedIn),
    } satisfies User : undefined;
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return (result.length > 0 ? result[0] : undefined) as User | undefined;
}

export async function activateLocalPlanForUser(openId: string, selectedPlan: string) {
  if (!isLocalFileStoreEnabled()) throw new Error("Local payment is unavailable");
  const user = await activateLocalPlan(openId, selectedPlan);
  return user ? { ...user, createdAt: new Date(user.createdAt), updatedAt: new Date(user.updatedAt), lastSignedIn: new Date(user.lastSignedIn) } : null;
}

export async function getPhotographerAccess(openId: string) {
  if (!isLocalFileStoreEnabled()) {
    const db = await getDb();
    if (!db) return { paymentStatus: "unpaid" as const, selectedPlan: null };
    try {
      const billingRows = await db.select({ paymentState: miraStripeBillingIdentities.paymentState, priceId: miraStripeBillingIdentities.stripePriceId, cancelAtPeriodEnd: miraStripeBillingIdentities.cancelAtPeriodEnd, currentPeriodEnd: miraStripeBillingIdentities.currentPeriodEnd })
        .from(miraStripeBillingIdentities)
        .innerJoin(users, eq(users.id, miraStripeBillingIdentities.photographerUserId))
        .where(eq(users.openId, openId)).limit(1);
      const identity = billingRows[0];
      return { paymentStatus: paymentStateGrantsAccess(identity?.paymentState) ? "paid" as const : "unpaid" as const, paymentState: identity?.paymentState ?? "pending" as const, selectedPlan: identity?.priceId ?? null, cancelAtPeriodEnd: Boolean(identity?.cancelAtPeriodEnd), currentPeriodEnd: identity?.currentPeriodEnd ?? null };
    } catch {
      return { paymentStatus: "unpaid" as const, selectedPlan: null };
    }
  }
  return getLocalAccess(openId);
}

export async function resetLocalPhotographerJourneyForUser(openId: string) {
  if (!isLocalFileStoreEnabled()) throw new Error("Local reset is unavailable");
  return resetLocalPhotographerJourney(openId);
}

export async function createLocalPaidPhotographerAccount(name: string, email: string) {
  if (!isLocalFileStoreEnabled()) throw new Error("Local payment is unavailable");
  const user = await createLocalPaidPhotographer({ name, email });
  return user ? { ...user, createdAt: new Date(user.createdAt), updatedAt: new Date(user.updatedAt), lastSignedIn: new Date(user.lastSignedIn) } : null;
}

export async function getLocalPhotographerByEmail(email: string) {
  if (!isLocalFileStoreEnabled()) return null;
  const user = await getLocalUserByEmail(email);
  return user ? { ...user, createdAt: new Date(user.createdAt), updatedAt: new Date(user.updatedAt), lastSignedIn: new Date(user.lastSignedIn) } : null;
}

// Database-mode counterpart to createLocalPhotographer (localFileStore.ts):
// the MIRA photographer product's own email/password signup, kept isolated
// from Manus OAuth users. Reuses the exact same salted-scrypt password
// hashing (hashLocalPassword) already used in local-file-store mode - only
// the persistence target differs. Returns null on a duplicate email, the
// same contract createLocalPhotographer already has, so router callers don't
// need a mode-specific branch for that case.
export async function createDbPhotographerAccount(input: { firstName: string; lastName: string; email: string; password: string }) {
  if (isLocalFileStoreEnabled()) throw new Error("Database account creation is unavailable in local-file-store mode");
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const email = input.email.trim().toLowerCase();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) return null;
  const openId = `mira-account-${randomUUID()}`;
  const name = `${input.firstName.trim()} ${input.lastName.trim()}`.trim();
  await db.insert(users).values({ openId, name, email, loginMethod: "mira-password-account", role: "user" });
  const inserted = await db.select({ id: users.id }).from(users).where(eq(users.openId, openId)).limit(1);
  const userId = inserted[0]?.id;
  if (!userId) throw new Error("Photographer account was not created");
  await db.insert(miraPhotographerCredentials).values({ userId, passwordHash: hashLocalPassword(input.password) });
  return { openId };
}

// Database-mode counterpart to the local password check backing
// localPhotographerLogin - verifies with the same timing-safe comparison
// verifyLocalPassword already uses in local-file-store mode.
export async function verifyDbPhotographerPassword(email: string, password: string) {
  if (isLocalFileStoreEnabled()) return null;
  const db = await getDb();
  if (!db) return null;
  const normalizedEmail = email.trim().toLowerCase();
  const rows = await db.select({ openId: users.openId, passwordHash: miraPhotographerCredentials.passwordHash })
    .from(users)
    .innerJoin(miraPhotographerCredentials, eq(miraPhotographerCredentials.userId, users.id))
    .where(eq(users.email, normalizedEmail))
    .limit(1);
  const row = rows[0];
  if (!row || !verifyLocalPassword(password, row.passwordHash)) return null;
  return { openId: row.openId };
}

// TODO: add feature queries here as your schema grows.
