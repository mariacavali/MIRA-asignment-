import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, lstat, open, readdir, rename } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { MAX_REFERENCE_BYTES, sessionReferenceSchema, uploadSessionReferenceSchema, type SessionReference } from "../../shared/miraSession";
import { createPdfExtractor } from "../miraKnowledge/pdfExtraction";
import type { CoachScope } from "./graph";
import type { createCoachStore } from "./store";

type Store = Pick<ReturnType<typeof createCoachStore>, "readBrandContext" | "addSource" | "withdrawSource">;
export function createReferenceAssets(options: { root: string; store: Store; extractPdf?: ReturnType<typeof createPdfExtractor>; observeImage?: (bytes: Buffer, mime: string) => Promise<string> }) {
  if (!isAbsolute(options.root)) throw new Error("Private reference root must be absolute");
  const root = resolve(options.root);
  if ([resolve("client"), resolve("public"), resolve("dist/public")].some(path => root === path || root.startsWith(path + "/"))) throw new Error("Reference storage must be private");
  const mutations = new Map<string, Promise<unknown>>();
  async function serial<T>(scope: CoachScope, run: () => Promise<T>): Promise<T> {
    const key = `${scope.workspaceId}-${scope.userId}/${scope.conversationId}`, previous = mutations.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(run); mutations.set(key, next);
    try { return await next; } finally { if (mutations.get(key) === next) mutations.delete(key); }
  }
  async function folder(scope: CoachScope) {
    await options.store.readBrandContext(scope);
    const owner = join(root, `${z.number().int().positive().parse(scope.workspaceId)}-${z.number().int().positive().parse(scope.userId)}`), path = join(owner, z.string().uuid().parse(scope.conversationId));
    for (const directory of [root, owner, path]) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const stat = await lstat(directory);
      if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o077)) throw new Error("Reference storage must be private");
    }
    return path;
  }
  async function read(path: string, id: string) {
    const handle = await open(join(path, `${z.string().uuid().parse(id)}.json`), constants.O_RDONLY | constants.O_NOFOLLOW);
    try { if ((await handle.stat()).size > 20_000) throw new Error("Invalid reference manifest"); return sessionReferenceSchema.parse(JSON.parse(await handle.readFile("utf8"))); }
    finally { await handle.close(); }
  }
  async function manifest(path: string, record: SessionReference) {
    const temporary = join(path, `${record.id}.${randomUUID()}.tmp`), handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(JSON.stringify(sessionReferenceSchema.parse(record))); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, join(path, `${record.id}.json`));
  }
  return {
    async list(scope: CoachScope) {
      const path = await folder(scope), names = (await readdir(path)).filter(name => /^[a-f0-9-]{36}\.json$/.test(name));
      if (names.length > 200) throw new Error("Reference storage limit reached");
      const records = await Promise.all(names.map(name => read(path, name.slice(0, -5))));
      if (records.some(record => record.workspaceId !== scope.workspaceId || record.conversationId !== scope.conversationId)) throw new Error("Reference scope mismatch");
      return records.filter(record => record.status !== "withdrawn").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async upload(userId: number, raw: z.input<typeof uploadSessionReferenceSchema>) {
      const input = uploadSessionReferenceSchema.parse(raw), scope = { ...input, userId };
      return serial(scope, async () => {
      const path = await folder(scope);
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.base64)) throw new TRPCError({ code: "BAD_REQUEST", message: "The file encoding is invalid." });
      const bytes = Buffer.from(input.base64, "base64");
      if (!bytes.length || bytes.length > MAX_REFERENCE_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a file up to 10 MB." });
      const valid = input.mime === "application/pdf" ? bytes.subarray(0, 5).toString() === "%PDF-" : input.mime === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : input.mime === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : input.mime === "image/webp" ? bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP" : !bytes.includes(0);
      if (!valid) throw new TRPCError({ code: "BAD_REQUEST", message: "This file does not match its format. Use JPG, PNG, WebP, PDF or plain text." });
      const existing = await this.list(scope), hash = createHash("sha256").update(bytes).digest("hex");
      const duplicate = existing.find(record => record.hash === hash);
      if (duplicate) return duplicate;
      if (existing.length >= 50) throw new TRPCError({ code: "BAD_REQUEST", message: "This conversation already has 50 references." });
      let text = input.description, note = "Saved privately. Tell MIRA what draws you to this reference.", status: SessionReference["status"] = "needs_description";
      if (input.mime === "text/plain") { text = bytes.toString("utf8").slice(0, 19_000); note = "Text saved for this conversation."; status = "text_ready"; }
      if (input.mime === "application/pdf" && options.extractPdf) {
        const extraction = await options.extractPdf(bytes);
        text = extraction.pages.filter(page => page.text.trim()).map(page => `[Page ${page.page}] ${page.text}`).join("\n\n").slice(0, 19_000);
        status = text ? "text_ready" : "needs_description";
        note = text ? `Text extracted from this ${extraction.pageCount}-page PDF. Images and text beyond the intake limit may need your explanation.` : "The PDF is saved, but no selectable text was found. Please describe the reference.";
      }
      const record: SessionReference = { id: randomUUID(), workspaceId: input.workspaceId, conversationId: input.conversationId, name: input.name, mime: input.mime,
        size: bytes.length, hash, createdAt: new Date().toISOString(), status, note, sourceId: null };
      const handle = await open(join(path, `${record.id}.blob`), "wx", 0o600);
      try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
      if (text.trim()) {
        const context = await options.store.readBrandContext(scope);
        const source = await options.store.addSource(userId, { workspaceId: input.workspaceId, conversationId: input.conversationId, expectedRevision: context.revision,
          source: { title: input.name, text, approvedForCoaching: true, rightsBasis: "permission_granted" } });
        record.sourceId = source.sourceId;
      }
      try { await manifest(path, record); }
      catch (error) { if (record.sourceId) { const context = await options.store.readBrandContext(scope); await options.store.withdrawSource(userId, { workspaceId: scope.workspaceId, conversationId: scope.conversationId, sourceId: record.sourceId, expectedRevision: context.revision }); } throw error; }
      return record;
      });
    },
    async get(scope: CoachScope, id: string) {
      const path = await folder(scope), record = await read(path, id);
      if (record.workspaceId !== scope.workspaceId || record.conversationId !== scope.conversationId || record.status === "withdrawn") throw new TRPCError({ code: "NOT_FOUND" });
      const handle = await open(join(path, `${record.id}.blob`), constants.O_RDONLY | constants.O_NOFOLLOW);
      try { if ((await handle.stat()).size > MAX_REFERENCE_BYTES) throw new Error("Invalid reference size"); return { record, bytes: await handle.readFile() }; } finally { await handle.close(); }
    },
    async analyse(scope: CoachScope, id: string) {
      return serial(scope, async () => {
      const { record, bytes } = await this.get(scope, id);
      if (!options.observeImage || !record.mime.startsWith("image/")) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Image observation is not enabled yet." });
      if (record.status === "text_ready") return record;
      const text = await options.observeImage(bytes, record.mime), context = await options.store.readBrandContext(scope);
      const source = await options.store.addSource(scope.userId, { workspaceId: scope.workspaceId, conversationId: scope.conversationId, expectedRevision: context.revision,
        source: { title: `${record.name.slice(0, 160)} — reference observations`, text, approvedForCoaching: true, rightsBasis: "permission_granted" } });
      record.sourceIds = Array.from(new Set([...(record.sourceIds ?? []), ...(record.sourceId ? [record.sourceId] : []), source.sourceId]));
      record.sourceId = source.sourceId; record.status = "text_ready"; record.note = "MIRA has provisional observations of this reference. Tell her which details matter to you.";
      await manifest(await folder(scope), record); return record;
      });
    },
    async withdraw(scope: CoachScope, id: string) {
      return serial(scope, async () => {
      const path = await folder(scope), record = await read(path, id);
      if (record.workspaceId !== scope.workspaceId || record.conversationId !== scope.conversationId) throw new TRPCError({ code: "NOT_FOUND" });
      if (record.status === "withdrawn") return;
      for (const sourceId of Array.from(new Set([...(record.sourceIds ?? []), ...(record.sourceId ? [record.sourceId] : [])]))) { const context = await options.store.readBrandContext(scope); await options.store.withdrawSource(scope.userId, { workspaceId: scope.workspaceId, conversationId: scope.conversationId, sourceId, expectedRevision: context.revision }); }
      record.status = "withdrawn"; await manifest(path, record);
      });
    },
  };
}
