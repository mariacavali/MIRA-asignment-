import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { getLocalUserByOpenId, isLocalFileStoreEnabled } from "../localFileStore";
import { ENV } from "./env";
import { getDbPhotographerCredentialByUserId, getUserByOpenId } from "../db";
import { isPhotographerSessionCurrent, PHOTOGRAPHER_SESSION_COOKIE, verifyPhotographerSessionToken } from "../auth/photographerSession";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export function isLocalAuthEnabled(nodeEnv = process.env.NODE_ENV, bypass = process.env.DEV_LOCAL_AUTH_BYPASS) {
  return (nodeEnv === "development" || nodeEnv === "test") && bypass === "true";
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  const localAuthEnabled = isLocalAuthEnabled() || isLocalFileStoreEnabled();

  if (localAuthEnabled) {
    const cookieHeader = typeof opts.req.headers.cookie === "string" ? opts.req.headers.cookie : "";
    const localSession = cookieHeader.split(";").map(item => item.trim()).find(item => item.startsWith("mira_local_session="))?.slice("mira_local_session=".length);
    if (localSession) {
      const localUser = await getLocalUserByOpenId(localSession);
      user = localUser ? { ...localUser, createdAt: new Date(localUser.createdAt), updatedAt: new Date(localUser.updatedAt), lastSignedIn: new Date(localUser.lastSignedIn) } : null;
      if (user) return { req: opts.req, res: opts.res, user };
    }
  }

  if (!isLocalFileStoreEnabled()) {
    const cookieHeader = typeof opts.req.headers.cookie === "string" ? opts.req.headers.cookie : "";
    const photographerSession = cookieHeader.split(";").map(item => item.trim()).find(item => item.startsWith(`${PHOTOGRAPHER_SESSION_COOKIE}=`))?.slice(PHOTOGRAPHER_SESSION_COOKIE.length + 1);
    if (photographerSession) {
      const session = await verifyPhotographerSessionToken(photographerSession, ENV.cookieSecret);
      const credential = session ? await getDbPhotographerCredentialByUserId(session.userId) : null;
      if (session && credential && isPhotographerSessionCurrent({ passwordTag: session.passwordTag, passwordHash: credential.passwordHash, secret: ENV.cookieSecret })) {
        user = await getUserByOpenId(credential.openId) ?? null;
        if (user) return { req: opts.req, res: opts.res, user };
      }
    }
  }

  if (!user) try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public purchase and invitation routes.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
