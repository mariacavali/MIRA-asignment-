import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    const devBypassEnabled =
      process.env.NODE_ENV === "development" &&
      process.env.DEV_LOCAL_AUTH_BYPASS === "true";

    if (devBypassEnabled) {
      const localOpenId = process.env.DEV_LOCAL_OPEN_ID ?? "local-dev-mira-user";

      try {
        await db.upsertUser({
          openId: localOpenId,
          name: "Local Dev User",
          email: "local-dev@mira.local",
          loginMethod: "local-dev",
          role: "user",
          lastSignedIn: new Date(),
        });
        const localUser = await db.getUserByOpenId(localOpenId);
        if (localUser) {
          user = localUser;
          console.warn("[Auth] DEV_LOCAL_AUTH_BYPASS active; using fixed local test user");
        } else {
          console.warn("[Auth] DEV_LOCAL_AUTH_BYPASS requested but local user could not be loaded");
          user = null;
        }
      } catch (devBypassError) {
        console.warn("[Auth] DEV_LOCAL_AUTH_BYPASS failed", devBypassError);
        user = null;
      }
    } else {
      // Authentication is optional for public procedures.
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
