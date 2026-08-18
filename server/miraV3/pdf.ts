import PDFDocument from "pdfkit";
import type { buildDeliverables } from "./deliverables";

export const MIRA_V3_DELIVERABLES = ["mirror", "brand_soul", "visual_direction"] as const;
export type MiraV3Deliverable = (typeof MIRA_V3_DELIVERABLES)[number];
type Deliverables = ReturnType<typeof buildDeliverables>;

export const MIRA_V3_PDF_UNAVAILABLE_MESSAGE = "The PDF could not be prepared. Please try again.";

const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const evidenceHtml = (items: Array<{ turn: number; quote: string }>) =>
  `<h2>What this came from</h2>${items.map(item => `<p><em>“${escapeHtml(item.quote)}”</em> — confirmed reflection, turn ${item.turn}</p>`).join("")}`;

export function renderDeliverableHtml(kind: MiraV3Deliverable, documents: Deliverables) {
  const styles = `<style>body{font-family:Arial,sans-serif;color:#292524;line-height:1.6;max-width:760px;margin:48px auto;padding:0 28px}h1,h2{font-family:Georgia,serif;font-weight:400}h1{font-size:42px}h2{font-size:23px;margin-top:34px;border-top:1px solid #d6d3d1;padding-top:18px}.source{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#78716c}.swatch{display:inline-block;width:18px;height:18px;border-radius:50%;vertical-align:middle;margin-right:8px}</style>`;
  let body = "";
  if (kind === "mirror") {
    const doc = documents.mirror;
    body = `<h1>${escapeHtml(doc.title)}</h1><p>${escapeHtml(doc.subtitle)}</p><h2>Returning sentence</h2><p><strong>“${escapeHtml(doc.returningSentence)}”</strong></p>${doc.sections.map(section => `<h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.body)}</p>`).join("")}${evidenceHtml(doc.evidence)}`;
  } else if (kind === "brand_soul") {
    const doc = documents.brandSoul;
    body = `<h1>${escapeHtml(doc.title)}</h1><p>${escapeHtml(doc.subtitle)}</p>${doc.sections.map(section => `<h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.body)}</p>`).join("")}<h2>Voice qualities</h2><ul>${doc.voiceQualities.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>${evidenceHtml(doc.evidence)}`;
  } else {
    const doc = documents.visualDirection;
    body = `<h1>${escapeHtml(doc.title)}</h1><p class="source">${escapeHtml(doc.modeLabel)}</p><p>${escapeHtml(doc.subtitle)}</p><h2>Identity anchor</h2><p><strong>“${escapeHtml(doc.identityAnchor)}”</strong></p><h2>Atmosphere</h2><p>${escapeHtml(doc.atmosphere)}</p><h2>Palette</h2>${doc.palette.map(item => `<p><span class="swatch" style="background:${escapeHtml(item.hex)}"></span><strong>${escapeHtml(item.name)} · ${escapeHtml(item.hex)}</strong><br/>${escapeHtml(item.rationale)}<br/><span class="source">From your conversation</span></p>`).join("")}<h2>Textures and styling</h2><ul>${doc.materialCues.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul><h2>Lighting and photography</h2><p>${escapeHtml(doc.photographicDirection.body)}</p><h2>Composition and architecture</h2><ul>${doc.compositionPrinciples.map(item => `<li>${escapeHtml(item.text)}</li>`).join("")}</ul><h2>Shoot list</h2><ol>${doc.shootList.map(item => `<li>${escapeHtml(item.text)}</li>`).join("")}</ol>${evidenceHtml(doc.evidence)}`;
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Mira private document</title>${styles}</head><body><p class="source">Mira · Private confirmed document</p>${body}</body></html>`;
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&nbsp;", " ");
}

type HtmlBlock = { type: "h1" | "h2" | "p" | "li"; text: string };

export function parseDeliverableHtml(html: string): HtmlBlock[] {
  const blocks: HtmlBlock[] = [];
  const blockPattern = /<(h1|h2|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(html)) !== null) {
    const type = match[1].toLowerCase() as HtmlBlock["type"];
    const text = decodeHtml(match[2].replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/\s+\n/g, "\n").trim();
    if (text) blocks.push({ type, text });
  }
  return blocks;
}

export async function renderPdfFromHtml(html: string): Promise<Buffer> {
  const document = new PDFDocument({ size: "A4", margins: { top: 56, right: 58, bottom: 60, left: 58 }, info: { Title: "Mira private confirmed document", Author: "Mira" } });
  const chunks: Buffer[] = [];
  document.on("data", chunk => chunks.push(Buffer.from(chunk)));
  const completed = new Promise<Buffer>((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  for (const block of parseDeliverableHtml(html)) {
    if (block.type === "h1") {
      document.moveDown(0.4).font("Times-Roman").fontSize(28).fillColor("#292524").text(block.text, { lineGap: 4 }).moveDown(0.6);
    } else if (block.type === "h2") {
      document.moveDown(0.8).font("Times-Roman").fontSize(17).fillColor("#44403c").text(block.text, { lineGap: 3 }).moveDown(0.25);
    } else {
      document.font(block.type === "li" ? "Helvetica" : "Helvetica").fontSize(10.5).fillColor("#57534e").text(`${block.type === "li" ? "•  " : ""}${block.text}`, { lineGap: 4, paragraphGap: 7 });
    }
  }
  document.end();
  return completed;
}

export function deliverableFilename(kind: MiraV3Deliverable, journeyId: number, moodBoardMode: "brand" | "project" = "brand") {
  const label = kind === "mirror" ? "brand-soul-file" : kind === "brand_soul" ? "brand-expression-guide" : moodBoardMode === "project" ? "project-mood-board" : "brand-mood-board";
  return `mira-${journeyId}-${label}.pdf`;
}
