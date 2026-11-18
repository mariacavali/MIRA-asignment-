import type { PineconeSeedPreview } from "@shared/miraPinecone";
import { Button } from "@/components/ui/button";

export function PineconeSeedPreviewPanel({ preview, loading, disabled, error, stale, onPreview }: {
  preview?: PineconeSeedPreview; loading: boolean; disabled?: boolean; error?: string; stale?: boolean; onPreview: () => void;
}) {
  return <section className="space-y-3 rounded border p-5" aria-label="Pinecone seed preview">
    <h2 className="text-xl">Prepare your Pinecone knowledge</h2>
    <p>Preview the current reviewed, published knowledge before the later seeding step. This does not upload anything.</p>
    <Button disabled={loading || disabled} onClick={onPreview}>{loading ? "Preparing preview…" : "Preview Pinecone seed"}</Button>
    {error ? <p role="alert">{error}</p> : preview ? <div role="status" className="space-y-3">
      {stale ? <p>The library has changed since this preview. Refresh it before reviewing a seed.</p> : null}
      {preview.state === "no_published_knowledge" ? <p>No reviewed knowledge is published yet. Your source PDFs stay local until preparation and review.</p>
        : <><p>{preview.itemCount} reviewed knowledge item{preview.itemCount === 1 ? "" : "s"} would create {preview.recordCount} searchable record{preview.recordCount === 1 ? "" : "s"} in {preview.batchCount} batch{preview.batchCount === 1 ? "" : "es"}. Nothing has been uploaded.</p>
          <details><summary>Included knowledge and page references</summary>{preview.items.map(item => <article key={`${item.kind}:${item.id}`} className="mt-3"><strong>{item.title} · version {item.version}</strong>{item.citations.map((citation, index) => <p key={index}>{citation.title} — {citation.locator}</p>)}</article>)}</details></>}
      <details><summary>Destination and preview version</summary><p className="break-all">{preview.target.host}</p><p className="break-all">Namespace: {preview.target.namespace}</p><p className="break-all">Preview: {preview.fingerprint}</p></details>
    </div> : null}
  </section>;
}
