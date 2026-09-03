import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { getLocalUserByOpenId } from "../localFileStore";

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
  const localAuthEnabled = isLocalAuthEnabled();

  if (localAuthEnabled) {
    const cookieHeader = typeof opts.req.headers.cookie === "string" ? opts.req.headers.cookie : "";
    const localSession = cookieHeader.split(";").map(item => item.trim()).find(item => item.startsWith("mira_local_session="))?.slice("mira_local_session=".length);
    if (localSession) {
      const localUser = await getLocalUserByOpenId(localSession);
      user = localUser ? { ...localUser, createdAt: new Date(localUser.createdAt), updatedAt: new Date(localUser.updatedAt), lastSignedIn: new Date(localUser.lastSignedIn) } : null;
      if (user) return { req: opts.req, res: opts.res, user };
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
