import { readFile, mkdir, open, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parse } from "dotenv";
import { createKnowledgeLabApp } from "../server/miraKnowledgeLab/app";

const root = resolve(".mira-local-data/knowledge-lab");
await mkdir(root, { recursive: true, mode: 0o700 });
await readFile(join(root, "registry.json")); // Explicit preparation, no implicit corpus creation.
const lock = join(root, "server.lock");
const handle = await open(lock, "wx", 0o600).catch(() => { throw new Error("The isolated lab lock exists. Keep the existing service or inspect its saved PID before restarting; no data was changed."); });
await handle.writeFile(String(process.pid)); await handle.close();
const env = parse(await readFile(resolve(".env"), "utf8"));
const lab = createKnowledgeLabApp({ root, openaiKey: env.OPENAI_API_KEY });
const server = lab.app.listen(5185, "127.0.0.1", () => console.log("MIRA isolated knowledge test: http://127.0.0.1:5185 — no catalogue writes or Pinecone connection"));
server.on("error", async error => { await unlink(lock).catch(() => {}); console.error(error.message); process.exitCode = 1; });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => server.close(async () => { await unlink(lock).catch(() => {}); process.exit(0); }));
// Health metadata only; no model generation, downloads, cloud fallback or paid request.
void lab.checkLocal();
