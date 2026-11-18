import { normaliseBundle } from "./schema";

// RFC-style quoted fields, embedded newlines and escaped quotes. No formula evaluation.
// CSV envelope: record_type,payload; payload is a JSON source/card/judgement object.
// Keeping nested fields structured avoids lossy delimiter-based lists or page citations.
export function parseKnowledgeCsv(content: string) {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false; let closed = false;
  const finishField = () => { row.push(field); field = ""; closed = false; };
  const finishRow = () => { finishField(); if (row.some(v => v.length)) rows.push(row); row = []; };
  const input = content.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') { if (input[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += c;
    } else if (c === ',') finishField();
    else if (c === '\n' || c === '\r') { if (c === '\r' && input[i + 1] === '\n') i++; finishRow(); }
    else if (c === '"' && !field && !closed) quoted = true;
    else { if (closed || c === '"') throw new Error("Malformed CSV quoting."); field += c; }
  }
  if (quoted) throw new Error("Unclosed CSV field.");
  if (field || row.length || closed) finishRow();
  if (rows.shift()?.join(",") !== "record_type,payload") throw new Error("CSV header must be record_type,payload.");
  const sources: unknown[] = [], items: unknown[] = [];
  for (const cells of rows) {
    if (cells.length !== 2 || !["source", "card", "judgement", "passage"].includes(cells[0])) throw new Error("Invalid knowledge CSV row.");
    const value = JSON.parse(cells[1]);
    if (cells[0] === "source") sources.push(value);
    else { if (value?.kind !== cells[0]) throw new Error("CSV record type and item kind differ."); items.push(value); }
  }
  return normaliseBundle({ formatVersion: 1, sources, items });
}
export function parseKnowledgeImport(format: "json" | "csv", content: string) {
  if (Buffer.byteLength(content, "utf8") > 2_000_000) throw new Error("Import exceeds 2 MB.");
  return format === "json" ? normaliseBundle(JSON.parse(content.replace(/^\uFEFF/, ""))) : parseKnowledgeCsv(content);
}
