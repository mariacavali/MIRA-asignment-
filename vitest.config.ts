import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
    // Deployed-preview checks require explicit configuration and opt-in.
    exclude: process.env.RUN_MIRA_RUNTIME_TESTS === "1" ? [] : [
      "server/payment/checkoutRuntimeConfig.integration.test.ts",
      "server/payment/webhookSecretRuntime.test.ts",
    ],
  },
});
