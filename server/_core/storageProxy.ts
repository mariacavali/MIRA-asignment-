import type { Express } from "express";
import { ENV } from "./env";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { LOCAL_STORAGE_ROOT } from "../storage";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      // Fails closed in production unless the explicit, off-by-default
      // MIRA_ALLOW_LOCAL_STORAGE_IN_PRODUCTION opt-in is set (server/_core/env.ts)
      // - an isolated-preview fallback only, never a substitute for Forge.
      if (ENV.isProduction && !ENV.allowLocalStorageInProduction) {
        res.status(500).send("Storage proxy not configured");
        return;
      }
      const root = resolve(LOCAL_STORAGE_ROOT);
      const path = resolve(root, key);
      if (path === root || !path.startsWith(root + "/")) {
        res.status(400).send("Invalid storage key");
        return;
      }
      try {
        await access(path);
        res.set("Cache-Control", "no-store");
        res.sendFile(path);
      } catch {
        res.status(404).send("Stored file not found");
      }
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
