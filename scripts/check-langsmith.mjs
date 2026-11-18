import { config } from "dotenv";
import { Client } from "langsmith";
config({ path: new URL("../.env", import.meta.url).pathname, quiet: true });
const endpoint = (process.env.LANGSMITH_ENDPOINT || "https://api.smith.langchain.com").replace(/\/$/, "");
if (!["https://api.smith.langchain.com", "https://eu.api.smith.langchain.com"].includes(endpoint)) {
  console.error("Select the US or EU LangSmith endpoint in .env."); process.exit(1);
}
if (!process.env.LANGSMITH_API_KEY?.trim()) { console.error("LangSmith key is missing."); process.exit(1); }
const client = new Client({ apiKey: process.env.LANGSMITH_API_KEY, apiUrl: endpoint,
  workspaceId: process.env.LANGSMITH_WORKSPACE_ID || undefined,
  timeout_ms: 10_000, callerOptions: { maxRetries: 0 }, autoBatchTracing: false,
  hideInputs: true, hideOutputs: true, omitTracedRuntimeInfo: true,
});
try {
  // Only a project-list read: no project creation, traces or client material.
  const result = await client.listProjects({ name: process.env.LANGSMITH_PROJECT || "mira-development" }).next();
  console.log("LangSmith authentication: successful");
  console.log("Configured project exists:", !result.done);
  console.log("Trace uploads: none; local tracing settings unchanged.");
} catch (error) {
  const status = Number(error?.status ?? error?.statusCode);
  console.error(Number.isFinite(status) ? `LangSmith check failed (HTTP ${status}); verify key, region and workspace.` : "LangSmith check failed; verify network, key, region and workspace.");
  process.exitCode = 1;
}
