import { mkdir, open, readdir, lstat, rename, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, join, isAbsolute } from "node:path";
import { z } from "zod";
import { knowledgeDocumentSchema, summariseKnowledgeDocument, type KnowledgeDocument, type KnowledgeDocumentSummary } from "../../shared/miraKnowledgeDocuments";

export interface KnowledgeDocumentStorage {
  save(document: KnowledgeDocument, pdf: Buffer): Promise<void>;
  get(id: string): Promise<KnowledgeDocument | null>;
  list(): Promise<KnowledgeDocumentSummary[]>;
}
// Explicit private local adapter. There are no public/static URLs for books or extracted text.
export function createLocalKnowledgeDocumentStorage(root: string): KnowledgeDocumentStorage {
  if (!isAbsolute(root)) throw new Error("Knowledge document storage requires an absolute private root.");
  const folder = resolve(root);
  for (const publicRoot of [resolve("client"), resolve("dist/public"), resolve("public")]) {
    if (folder === publicRoot || folder.startsWith(publicRoot + "/")) throw new Error("Knowledge documents cannot be stored in a public website directory.");
  }
  async function ensureRoot() {
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const stat = await lstat(folder);
    if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o077) !== 0) throw new Error("Knowledge storage root must be a private directory.");
  }
  const safeId = (id: string) => z.string().uuid().parse(id);
  async function get(id: string) {
    await ensureRoot();
    try {
      const handle = await open(join(folder, `${safeId(id)}.json`), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        if ((await handle.stat()).size > 32_000_000) throw new Error("Document manifest exceeds the local limit.");
        const document = knowledgeDocumentSchema.parse(JSON.parse(await handle.readFile("utf8")));
        if (document.id !== id) throw new Error("Document identity mismatch.");
        return document;
      }
      finally { await handle.close(); }
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }
  return {
    async save(document, pdf) {
      const record = knowledgeDocumentSchema.parse(document); await ensureRoot();
      // Unique server UUID + exclusive writes. Manifest is written last, so incomplete uploads are not listed.
      const file = await open(join(folder, `${safeId(record.id)}.pdf`), "wx", 0o600);
      try { await file.writeFile(pdf); } finally { await file.close(); }
      const temporary = join(folder, `${record.id}.manifest-tmp`);
      const manifest = await open(temporary, "wx", 0o600);
      try {
        await manifest.writeFile(JSON.stringify(record)); await manifest.sync(); await manifest.close();
        await rename(temporary, join(folder, `${record.id}.json`));
      } catch (error) { await manifest.close().catch(() => {}); await unlink(temporary).catch(() => {}); throw error; }
    },
    get,
    async list() {
      await ensureRoot();
      const names = (await readdir(folder)).filter(name => /^[a-f0-9-]{36}\.json$/.test(name)).sort();
      // Development catalogue bound: avoid reading an unlimited directory into a response.
      if (names.length > 200) throw new Error("Local knowledge document limit reached.");
      const records: KnowledgeDocumentSummary[] = [];
      for (const name of names) { const record = await get(name.slice(0, -5)); if (record) records.push(summariseKnowledgeDocument(record)); }
      return records;
    },
  };
}
