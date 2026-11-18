import type { BrandEvidence } from "../../shared/miraCoach";

export type RetrievalSource = {
  id: string; title: string; text: string; referenceUrl: string | null;
  rightsBasis: "client_owned" | "permission_granted";
};
const terms = (value: string) => new Set(value.toLowerCase().match(new RegExp("[\\p{L}\\p{N}]{3,}", "gu")) ?? []);

// Local lexical retrieval over explicitly approved client text. No scraping, embedding calls or global corpus.
export function retrieveSourceExcerpts(sources: RetrievalSource[], query: string): BrandEvidence[] {
  const queryTerms = terms(query);
  if (!queryTerms.size) return [];
  const candidates = sources.flatMap(source => {
    const chunks = [];
    for (let start = 0; start < source.text.length; start += 1200) {
      const text = source.text.slice(start, start + 1200);
      const chunkTerms = terms(text);
      const score = Array.from(queryTerms).filter(term => chunkTerms.has(term)).length;
      if (score) chunks.push({ source, start, text, score });
    }
    return chunks;
  }).sort((a, b) => b.score - a.score || a.source.id.localeCompare(b.source.id) || a.start - b.start);
  const selected: BrandEvidence[] = [];
  const perSource = new Map<string, number>();
  for (const item of candidates) {
    if ((perSource.get(item.source.id) ?? 0) >= 2) continue;
    selected.push({ id: `${item.source.id}:${item.start}`, text: item.text, kind: "explicit", confirmed: false,
      provenance: { sourceId: item.source.id, title: item.source.title,
        ...(item.source.referenceUrl ? { referenceUrl: item.source.referenceUrl } : {}),
        rightsBasis: item.source.rightsBasis, start: item.start, end: item.start + item.text.length } });
    perSource.set(item.source.id, (perSource.get(item.source.id) ?? 0) + 1);
    if (selected.length === 4) break;
  }
  return selected;
}
