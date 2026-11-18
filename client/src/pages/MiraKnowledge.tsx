import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX_KNOWLEDGE_PDF_BYTES } from "@shared/miraKnowledgeDocuments";
import type { z } from "zod";
import type { documentCardInputSchema } from "@shared/miraKnowledgeDocuments";
import type { KnowledgeSource } from "@shared/miraKnowledge";
import { PineconeSeedPreviewPanel } from "@/components/mira/PineconeSeedPreviewPanel";

const slug = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
const queryOptions = { retry: false, gcTime: 0, staleTime: 0, refetchOnWindowFocus: false };
function friendly(error: unknown) {
  const value = error as { data?: { code?: string }; message?: string };
  if (value.data?.code === "FORBIDDEN" || value.data?.code === "UNAUTHORIZED") return "Sign in with an editor account to open this library.";
  if (value.data?.code === "NOT_FOUND") return "The knowledge library is not enabled here yet.";
  if (value.data?.code === "BAD_REQUEST" && value.message?.startsWith("[")) return "Check the required fields, language code and version. Use up to 20 short items per list.";
  return value.message || "Something went wrong. Your file and notes are still available to retry.";
}
function fileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onerror = () => reject(new Error("The file could not be opened."));
    reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.readAsDataURL(file);
  });
}
export default function MiraKnowledge() {
  const auth = useAuth();
  return <main className="mx-auto max-w-5xl space-y-7 px-5 py-10">
    <header><a href="/mira/coach" className="underline">MIRA</a><h1 className="mt-5 text-3xl">Marketing knowledge library</h1><p className="mt-3">Upload a source, check its pages and write a short knowledge note. Notes stay drafts until separately reviewed and approved.</p></header>
    {auth.loading ? <p role="status">Opening the library…</p> : !auth.user ? <Button onClick={() => startLogin()}>Sign in</Button> : auth.user.role !== "admin" ? <p role="alert">This library is for MIRA’s editors.</p> : <KnowledgeEditor />}
  </main>;
}
function KnowledgeEditor() {
  const documents = trpc.miraKnowledge.listDocuments.useQuery(undefined, queryOptions);
  const releases = trpc.miraKnowledge.listReleases.useQuery(undefined, queryOptions);
  const [baseDraftId, setBaseDraftId] = useState<string | null>(null);
  const catalogue = trpc.miraKnowledge.status.useQuery(undefined, queryOptions);
  const seedPreview = trpc.miraKnowledge.previewPineconeSeed.useQuery(undefined, { ...queryOptions, enabled: false });
  const [selected, setSelected] = useState(""); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const document = trpc.miraKnowledge.getDocument.useQuery({ documentId: selected || "00000000-0000-4000-8000-000000000000" }, { ...queryOptions, enabled: Boolean(selected) });
  const upload = trpc.miraKnowledge.uploadPdf.useMutation({ retry: false });
  const draft = trpc.miraKnowledge.draftFromDocument.useMutation({ retry: false });
  const [file, setFile] = useState<File | null>(null); const [permitted, setPermitted] = useState(false);
  const [source, setSource] = useState<KnowledgeSource>({ id: "", version: 1, title: "", author: "", edition: "", kind: "book", assetReference: null, intendedUse: "Create reviewed marketing knowledge notes for MIRA", rightsBasis: "pending", rightsEvidence: "" });
  const busy = upload.isPending || draft.isPending;
  if (documents.error || catalogue.error) return <p role="alert">{friendly(documents.error || catalogue.error)}</p>;
  const field = "mt-2";
  return <>
    {error ? <p role="alert" className="rounded border border-red-300 p-4">{error}</p> : null}
    {notice ? <p role="status" className="rounded border p-4">{notice}</p> : null}
    <PineconeSeedPreviewPanel preview={seedPreview.data} loading={seedPreview.isFetching} disabled={busy}
      error={seedPreview.error ? friendly(seedPreview.error) : undefined} stale={!!seedPreview.data && seedPreview.data.corpus.revision !== catalogue.data?.revision}
      onPreview={() => void seedPreview.refetch()} />
    <form className="space-y-4 rounded border p-5" onSubmit={async event => {
      event.preventDefault(); if (!file || !permitted || busy) return; setError(""); setNotice("");
      try {
        if (file.size > MAX_KNOWLEDGE_PDF_BYTES) throw new Error("Choose a PDF of up to 25 MB.");
        const result = await upload.mutateAsync({ source, originalName: file.name, pdfBase64: await fileBase64(file), extractionPermitted: true });
        setSelected(result.document.id); await documents.refetch();
        setNotice(result.repeated ? "This source is already here. Its existing pages are open below." : "Your PDF is saved privately. Check the extracted pages below before writing a note.");
      } catch (err) { setError(friendly(err)); }
    }}>
      <h2 className="text-xl">Add a PDF</h2>
      <label className="block">PDF file · up to 25 MB<Input className={field} type="file" accept="application/pdf,.pdf" disabled={busy} required onChange={e => { setFile(e.target.files?.[0] || null); setPermitted(false); }} /></label>
      <div className="grid gap-4 sm:grid-cols-2">{([ ["title", "Book or document title"], ["author", "Author"], ["edition", "Edition (optional)"], ] as const).map(([key, label]) => <label key={key}>{label}<Input className={field} maxLength={key === "edition" ? 200 : 4000} required={key !== "edition"} disabled={busy} value={source[key]} onChange={e => setSource(s => ({ ...s, [key]: e.target.value, ...(key === "title" ? { id: `book-${slug(e.target.value)}` } : {}) }))} /></label>)}
        <label>Source version<Input className={field} type="number" min={1} max={1000000} required disabled={busy} value={source.version} onChange={e => setSource(s => ({ ...s, version: Number(e.target.value) }))} /></label>
        <label>Permission for later use<select className="mt-2 block w-full rounded border p-2" value={source.rightsBasis} disabled={busy} onChange={e => setSource(s => ({ ...s, rightsBasis: e.target.value as KnowledgeSource["rightsBasis"] }))}><option value="pending">Review before publication</option><option value="original">My original material</option><option value="permission">Permission granted</option><option value="licensed">Licensed for this use</option><option value="public_domain">Public domain</option></select></label>
      </div>
      <label className="block">Intended use<Textarea className={field} maxLength={4000} required disabled={busy} value={source.intendedUse} onChange={e => setSource(s => ({ ...s, intendedUse: e.target.value }))} /></label>
      <label className="block">Permission notes (optional now)<Textarea className={field} maxLength={4000} disabled={busy} value={source.rightsEvidence} onChange={e => setSource(s => ({ ...s, rightsEvidence: e.target.value }))} /></label>
      <label className="flex gap-3"><input type="checkbox" checked={permitted} disabled={busy} onChange={e => setPermitted(e.target.checked)} />I have permission to upload and extract text from this file.</label>
      <Button disabled={busy || !file || !permitted}>{upload.isPending ? "Reading PDF…" : "Upload and read PDF"}</Button>
    </form>
    <section className="space-y-4"><h2 className="text-xl">Your source documents</h2>
      <label className="block">Working draft<select className="mt-2 block w-full rounded border p-3" value={baseDraftId ?? ""} disabled={busy} onChange={e => setBaseDraftId(e.target.value || null)}><option value="">Start from the published library</option>{baseDraftId && !releases.data?.releases.some(r => r.id === baseDraftId) ? <option value={baseDraftId}>Current working draft</option> : null}{releases.data?.releases.filter(r => r.status === "draft").map(r => <option key={r.id} value={r.id}>Draft {r.id.slice(0, 8)} · {new Date(r.createdAt).toLocaleString()}</option>)}</select></label>
      <p className="text-sm">New notes are added to the selected draft, so you can build a collection before review.</p>
      {documents.isFetching ? <p role="status">Loading documents…</p> : !documents.data?.length ? <p>No PDFs added yet.</p> : <select className="w-full rounded border p-3" aria-label="Choose a document" value={selected} disabled={busy} onChange={e => { setSelected(e.target.value); setNotice(""); }}><option value="">Choose a document</option>{documents.data.map(d => <option key={d.id} value={d.id}>{d.source.title} · v{d.source.version} · {d.pageCount} pages · {d.pagesNeedingReview} to check</option>)}</select>}
      {document.isFetching ? <p role="status">Opening pages…</p> : document.error ? <p role="alert">{friendly(document.error)}</p> : document.data ? <DocumentNotes key={document.data.id} document={document.data} busy={busy} onSave={async (pages, card) => {
        if (catalogue.data?.revision === undefined) return false; setError(""); setNotice("");
        try { const result = await draft.mutateAsync({ documentId: document.data!.id, baseDraftId, pages, card, extractionReviewed: true, expectedRevision: catalogue.data.revision }); setBaseDraftId(result.releaseId); await Promise.all([catalogue.refetch(), releases.refetch()]); setNotice(`Knowledge note saved as a draft. It still needs review and publication. Draft reference: ${result.releaseId}`); return true; }
        catch (err) { setError(friendly(err)); await catalogue.refetch(); return false; }
      }} /> : null}
    </section>
  </>;
}
export function DocumentNotes({ document, busy, onSave }: {
  document: import("@shared/miraKnowledgeDocuments").KnowledgeDocument; busy: boolean;
  onSave: (pages: number[], card: z.infer<typeof documentCardInputSchema>["card"]) => Promise<boolean>;
}) {
  const [language, setLanguage] = useState(""); const [version, setVersion] = useState(1); const [dimension, setDimension] = useState("brand.meaning");
  const [page, setPage] = useState(1); const [checked, setChecked] = useState(false); const [note, setNote] = useState({ id: "", title: "", principle: "", useWhen: "", requiredClientEvidence: "", application: "", limitations: "" });
  const current = document.extraction.pages[page - 1];
  const list = (value: string) => value.split("\n").map(v => v.trim()).filter(Boolean);
  return <div className="space-y-5 rounded border p-5">
    <h3 className="text-lg">{document.source.title}</h3><p>PDF pages are numbered from the first page of the file. Printed book numbers may differ.</p>
    <label>PDF page<input type="number" className="ml-3 w-24 rounded border p-2" min={1} max={document.extraction.pageCount} value={page} disabled={busy} onChange={e => { setPage(Math.max(1, Math.min(document.extraction.pageCount, Math.trunc(Number(e.target.value)) || 1))); setChecked(false); }} /></label>
    {current.hasImages ? <p role="status" className="rounded border p-3">This page contains images. Text inside screenshots, charts or pictures is not included in the extracted text below. Check the original PDF before using those details.</p> : null}
    {current.status !== "extracted" ? <p role="status">{current.status === "no_text" ? "No selectable text found. This page may be blank or need OCR." : current.status === "truncated" ? "This page has more text than the preview limit. Check the original PDF before using it." : "This page could not be fully read. Try another PDF export or a smaller section."}</p> : null}
    <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded border bg-gray-50 p-4 font-sans text-sm">{current.text || "No text available."}</pre>
    <form className="space-y-4" onSubmit={async e => {
      e.preventDefault(); if (!checked || busy || !current.text) return;
      await onSave([page], { ...note, id: `note-${slug(note.title)}`, version, kind: "card", category: "marketing", language, segments: ["personal_brand", "small_business"], decisionDimensions: [dimension], useWhen: list(note.useWhen), requiredClientEvidence: list(note.requiredClientEvidence), application: list(note.application), limitations: list(note.limitations) });
    }}>
      <h4 className="text-lg">Write a short knowledge note</h4><p>Summarise the useful principle in your own words. This saves a draft with the selected page attached.</p>
      {Object.entries({ title: "Note title", principle: "Marketing principle", useWhen: "When it is useful · one item per line", requiredClientEvidence: "What we need to know about the client · one item per line", application: "How MIRA should apply it · one item per line", limitations: "Limits and exceptions · one item per line" }).map(([key, label]) => <label key={key} className="block">{label}<Textarea className="mt-2" required maxLength={4000} disabled={busy} value={note[key as keyof typeof note]} onChange={e => setNote(n => ({ ...n, [key]: e.target.value }))} /></label>)}
      <label className="block">Where this guidance applies<select className="mt-2 block w-full rounded border p-2" value={dimension} disabled={busy} onChange={e => setDimension(e.target.value)}><option value="brand.meaning">Brand meaning and marketing</option><option value="voice.profile">Brand voice</option><option value="visual.direction">Visual direction</option></select></label>
      <div className="grid gap-4 sm:grid-cols-2"><label>Note language code (for example en or lt)<Input value={language} onChange={e => setLanguage(e.target.value)} pattern="[a-z]{2,3}(-[A-Z]{2})?" required disabled={busy} /></label><label>Note version<Input type="number" min={1} max={1000000} value={version} onChange={e => setVersion(Number(e.target.value))} required disabled={busy} /></label></div>
      <label className="flex gap-3"><input type="checkbox" checked={checked} disabled={busy || !current.text} onChange={e => setChecked(e.target.checked)} />I checked this page against the original PDF and reviewed my summary.</label>
      <Button disabled={busy || !checked || !current.text}>Save draft knowledge note</Button>
    </form>
  </div>;
}
