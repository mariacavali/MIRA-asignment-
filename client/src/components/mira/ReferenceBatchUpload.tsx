import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildReferenceDescription,
  REFERENCE_FOCUS_OPTIONS,
  REFERENCE_PURPOSE_OPTIONS,
  referenceImageMimeType,
  referenceUploadErrorMessage,
  storedReferencePurpose,
  type ReferenceFocus,
  type ReferencePurposeValue,
  type ReferenceImageMimeType,
} from "@/lib/referenceImageUpload";
import {
  selectReferenceBatch,
  uploadReferenceBatch,
} from "@/lib/referenceBatchUpload";

type PendingImage = {
  id: number;
  file: File;
  purpose: ReferencePurposeValue | "";
  focuses: ReferenceFocus[];
  note: string;
  saved?: boolean;
  error?: string;
};
type Upload = {
  originalName: string;
  mimeType: ReferenceImageMimeType;
  base64: string;
  clientDescription: string;
  referencePurpose: ReturnType<typeof storedReferencePurpose>;
  evidenceKind: "observed";
};

export function ReferenceBatchUpload({
  available,
  onUpload,
  onComplete,
  photographer = false,
}: {
  available: number;
  onUpload: (image: Upload) => Promise<unknown>;
  onComplete: () => Promise<unknown>;
  photographer?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const lock = useRef(false);
  const [images, setImages] = useState<PendingImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selectionErrors, setSelectionErrors] = useState<string[]>([]);
  const pending = images.filter(image => !image.saved);
  const hasCategories = pending.every(image => image.purpose);

  function select(files: File[]) {
    if (lock.current) return;
    const selection = selectReferenceBatch(files, available - pending.length);
    setSelectionErrors(selection.errors);
    setMessage("");
    setImages(current => [
      ...current,
      ...selection.accepted.map(file => ({
        id: ++sequence.current,
        file,
        purpose: "" as const,
        focuses: [],
        note: "",
      })),
    ]);
    if (input.current) input.current.value = "";
  }
  function change(id: number, value: Partial<PendingImage>) {
    setImages(current =>
      current.map(image => (image.id === id ? { ...image, ...value } : image))
    );
  }
  async function submit() {
    if (lock.current || !pending.length || !hasCategories) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    let saved = 0;
    try {
      await uploadReferenceBatch(
        pending,
        async image => {
          if (!image.purpose) throw new Error("Choose a category first");
          const mimeType = referenceImageMimeType(image.file);
          if (!mimeType) throw new Error("Unsupported image");
          const base64 = await fileToBase64(image.file);
          await onUpload({
            originalName: image.file.name,
            mimeType,
            base64,
            clientDescription: buildReferenceDescription(
              image.purpose,
              image.focuses,
              image.note
            ),
            referencePurpose: storedReferencePurpose(image.purpose),
            evidenceKind: "observed",
          });
        },
        (image, error) => {
          if (error)
            change(image.id, { error: referenceUploadErrorMessage(error) });
          else {
            saved++;
            change(image.id, { saved: true, error: undefined });
          }
          setMessage(`${saved} of ${pending.length} images saved.`);
        }
      );
      await onComplete();
      setImages(current => current.filter(image => !image.saved));
      setMessage(
        `${saved} of ${pending.length} images saved.${saved < pending.length ? " The remaining images are below. Check the messages before retrying." : " All done."}`
      );
    } catch {
      setMessage(
        "Your uploads have finished, but we couldn't refresh the list. Reload this page before adding more images."
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <div
        onDragOver={event => event.preventDefault()}
        onDrop={event => {
          event.preventDefault();
          select(Array.from(event.dataTransfer.files));
        }}
        className="rounded-lg border-2 border-dashed border-[#d2b98b]/40 p-5"
      >
        <Button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy || available <= pending.length}
          className="min-h-11 rounded-full bg-[#d2b98b] px-6 text-[#171613] hover:bg-[#e0c99e]"
        >
          <ImagePlus className="mr-2 size-4" />
          Choose images
        </Button>
        <p className="mt-3 text-sm leading-6 text-[#c5bfb3]">
          Select several at once, or drag them here. JPG, PNG or WebP · 8 MB
          each.
        </p>
        <p className="mt-1 text-xs text-[#b7a98f]">
          {Math.max(0, available - pending.length)} spaces available. Choose a
          category for each image. Notes are optional.
        </p>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          aria-label="Choose reference images"
          tabIndex={-1}
          className="sr-only"
          disabled={busy}
          onChange={event => select(Array.from(event.target.files ?? []))}
        />
      </div>
      {!!selectionErrors.length && (
        <ul role="alert" className="mt-3 space-y-2 text-sm text-red-200">
          {selectionErrors.map((error, index) => (
            <li key={index}>{error}</li>
          ))}
        </ul>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {images.map(image => (
          <article
            key={image.id}
            className="rounded-lg border border-white/15 p-4"
          >
            <div className="flex items-start gap-3">
              <LocalPreview file={image.file} />
              <p className="min-w-0 flex-1 break-words text-sm text-[#ded5c5]">
                {image.file.name}
                {image.saved && (
                  <span className="mt-2 block text-[#d2b98b]">Saved</span>
                )}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setImages(current =>
                    current.filter(item => item.id !== image.id)
                  )
                }
                aria-label={`Remove ${image.file.name} from selection`}
                className="p-2 text-[#b7a98f]"
              >
                <X className="size-4" />
              </button>
            </div>
            <label className="mt-4 grid gap-2 text-sm text-[#ded5c5]">
              Category
              <select
                value={image.purpose}
                disabled={busy || image.saved}
                onChange={event =>
                  change(image.id, {
                    purpose: event.target.value as ReferencePurposeValue,
                  })
                }
                className="min-h-11 w-full rounded-md border border-white/20 bg-[#242320] px-3 text-[#f1eadc]"
              >
                <option value="">Choose a category</option>
                {REFERENCE_PURPOSE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {photographer && option.value === "portrait"
                      ? "Client portrait"
                      : photographer && option.value === "wardrobe"
                        ? "Outfit"
                        : option.label}
                  </option>
                ))}
              </select>
            </label>
            <details className="mt-3">
              <summary className="cursor-pointer py-2 text-sm text-[#d2b98b]">
                Add detail · optional
              </summary>
              <fieldset disabled={busy || image.saved} className="mt-2">
                <legend className="mb-2 text-xs text-[#c5bfb3]">
                  {image.purpose === "dislike"
                    ? "What should we avoid?"
                    : "What matters in this image?"}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {REFERENCE_FOCUS_OPTIONS.map(focus => (
                    <label
                      key={focus}
                      className="flex items-center gap-2 rounded border border-white/15 p-2 text-xs text-[#c5bfb3]"
                    >
                      <input
                        type="checkbox"
                        className="accent-[#d2b98b]"
                        checked={image.focuses.includes(focus)}
                        onChange={() =>
                          change(image.id, {
                            focuses: image.focuses.includes(focus)
                              ? image.focuses.filter(item => item !== focus)
                              : [...image.focuses, focus],
                          })
                        }
                      />
                      {focus}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="mt-3 grid gap-2 text-xs text-[#c5bfb3]">
                Optional note
                <textarea
                  disabled={busy || image.saved}
                  maxLength={500}
                  value={image.note}
                  onChange={event =>
                    change(image.id, { note: event.target.value })
                  }
                  className="min-h-20 rounded border border-white/20 bg-[#242320] p-3 text-sm"
                />
              </label>
            </details>
            {image.error && (
              <p role="alert" className="mt-3 text-xs leading-5 text-red-200">
                {image.error}
              </p>
            )}
          </article>
        ))}
      </div>
      {!!pending.length && (
        <Button
          type="button"
          disabled={busy || !hasCategories}
          onClick={() => void submit()}
          className="mt-4 min-h-11 rounded-full bg-[#d2b98b] px-6 text-[#171613] hover:bg-[#e0c99e]"
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Adding images…
            </>
          ) : (
            `Add ${pending.length} ${pending.length === 1 ? "image" : "images"}`
          )}
        </Button>
      )}
      {!!pending.length && !hasCategories && (
        <p className="mt-2 text-xs text-[#b7a98f]">
          Choose a category for every image to continue.
        </p>
      )}
      <p role="status" className="mt-3 text-sm text-[#d2b98b]">
        {message}
      </p>
    </div>
  );
}

function LocalPreview({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const value = URL.createObjectURL(file);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [file]);
  return url ? (
    <img
      src={url}
      alt="Selected image"
      className="size-16 shrink-0 rounded object-cover"
    />
  ) : null;
}
function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.onabort = () => reject(new Error("Image reading was cancelled"));
    reader.readAsDataURL(file);
  });
}
