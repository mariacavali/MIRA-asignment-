import { describe, expect, it } from "vitest";
import PDFDocument from "pdfkit";
import { resolve } from "node:path";
import { createPdfExtractor } from "./pdfExtraction";

async function syntheticPdf(encrypted = false) {
  return new Promise<Buffer>((resolveBytes, reject) => {
    const document = new PDFDocument({ autoFirstPage: false, ...(encrypted ? { userPassword: "synthetic-only" } : {}) });
    const chunks: Buffer[] = []; document.on("data", b => chunks.push(b)); document.on("error", reject); document.on("end", () => resolveBytes(Buffer.concat(chunks)));
    document.addPage().text("Synthetic page one: know the audience before proposing a style.");
    document.addPage().text("Synthetic page two: this is a separate source citation.");
    document.addPage(); document.end();
  });
}
describe.skipIf(process.env.RUN_MIRA_PDF_TESTS !== "1")("real local PDF subprocess (synthetic files)", () => {
  const extract = createPdfExtractor({ python: process.env.MIRA_PDF_PYTHON || resolve(".mira-pdf-venv/bin/python") });
  it("extracts real text with physical page numbers and flags blank/scanned pages", async () => {
    const result = await extract(await syntheticPdf());
    expect(result.pageCount).toBe(3);
    expect(result.pages[0]).toMatchObject({ page: 1, status: "extracted", text: expect.stringContaining("know the audience") });
    expect(result.pages[1]).toMatchObject({ page: 2, text: expect.stringContaining("separate source citation") });
    expect(result.pages[2]).toEqual({ page: 3, text: "", status: "no_text", hasImages: false });
  });
  it("rejects encrypted and corrupt PDFs with a useful safe message", async () => {
    await expect(extract(await syntheticPdf(true))).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Use an unencrypted PDF for this first version." });
    await expect(extract(Buffer.from("%PDF-1.7\nbroken"))).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("reports a missing reader and terminates an overlong parse", async () => {
    await expect(createPdfExtractor({ python: "/missing/mira-python" })(Buffer.from("%PDF-1.7"))).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    await expect(createPdfExtractor({ python: process.execPath, script: "-e", timeoutMs: 1 })(Buffer.from("%PDF-1.7"))).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});
