import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pdfExtractionSchema } from "../../shared/miraKnowledgeDocuments";
import { TRPCError } from "@trpc/server";

// A subprocess contains parser failures/timeouts. Never pass a client command, path or URL.
export function createPdfExtractor(options: { python: string; script?: string; timeoutMs?: number }) {
  return (bytes: Buffer) => new Promise<ReturnType<typeof pdfExtractionSchema.parse>>((resolveResult, reject) => {
    const process = spawn(options.python, [options.script ?? resolve("scripts/extract-mira-pdf.py")], { stdio: ["pipe", "pipe", "ignore"], shell: false });
    const chunks: Buffer[] = []; let size = 0; let settled = false;
    const finish = (error?: Error, result?: ReturnType<typeof pdfExtractionSchema.parse>) => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (error) reject(error); else resolveResult(result!);
    };
    const timer = setTimeout(() => { process.kill("SIGKILL"); finish(new TRPCError({ code: "TIMEOUT", message: "PDF extraction took too long. Try a smaller section." })); }, options.timeoutMs ?? 45_000);
    process.on("error", () => finish(new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "The local PDF reader is unavailable." })));
    process.stdin.on("error", () => {}); // Early parser rejection can close stdin.
    process.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 32_000_000) { process.kill("SIGKILL"); finish(new TRPCError({ code: "BAD_REQUEST", message: "The PDF contains too much text. Use a smaller section." })); }
      else chunks.push(chunk);
    });
    process.on("close", code => {
      if (settled) return;
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (code !== 0 || !parsed.ok) {
          if (parsed.code === "reader_unavailable") return finish(new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "The local PDF reader dependencies are not installed." }));
          const messages: Record<string, string> = { encrypted_pdf: "Use an unencrypted PDF for this first version.", page_limit: "Use a PDF with 1–800 pages.", invalid_pdf: "Choose a valid PDF file." };
          return finish(new TRPCError({ code: "BAD_REQUEST", message: messages[parsed.code] ?? "This PDF could not be read. Try another export." }));
        }
        finish(undefined, pdfExtractionSchema.parse(parsed.result));
      } catch { finish(new TRPCError({ code: "BAD_REQUEST", message: "This PDF could not be read. Try another export." })); }
    });
    process.stdin.end(bytes);
  });
}
