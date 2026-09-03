import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { ImagePlus } from "lucide-react";

type ReferencePurposeValue =
  | "like"
  | "dislike"
  | "current_identity"
  | "direction_to_explore"
  | "portrait"
  | "location"
  | "other";

const REFERENCE_PURPOSE_OPTIONS: Array<{ value: ReferencePurposeValue; label: string }> = [
  { value: "like", label: "Something I like" },
  { value: "dislike", label: "Something I don't want" },
  { value: "current_identity", label: "My current visual identity" },
  { value: "direction_to_explore", label: "The direction I want to explore" },
  { value: "portrait", label: "This is me" },
  { value: "location", label: "This is the shoot location" },
  { value: "other", label: "Other" },
];

const PURPOSE_LABELS: Record<string, string> = Object.fromEntries(
  REFERENCE_PURPOSE_OPTIONS.map(option => [option.value, option.label]),
);

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Self-contained upload module for the pre-conversation "Visual References"
// step. Owns its own file/purpose/description state and its own upload
// mutation and room-status read, so Discovery, the call widget, and the
// moodboard display can all change independently of this file.
export function VisualReferenceUpload({ token }: { token: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [purpose, setPurpose] = useState<ReferencePurposeValue | "">("");
  const [message, setMessage] = useState<string | null>(null);
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);
  const status = trpc.miraCore.getShootRoomStatus.useQuery({ token });
  const references = trpc.miraCore.listClientVisualReferences.useQuery({ token });
  const upload = trpc.miraCore.uploadClientVisualReference.useMutation({
    onSuccess: () => {
      setFile(null);
      setDescription("");
      setPurpose("");
      setMessage("Reference added. MIRA will treat what is visible as evidence, not automatically as your preference.");
      void references.refetch();
    },
  });
  const remove = trpc.miraCore.removeClientVisualReference.useMutation({
    onSuccess: () => {
      setPendingRemovalId(null);
      void references.refetch();
    },
  });

  const canSubmit = !!file && !!purpose && description.trim().length > 0 && !upload.isPending;

  return (
    <div>
      <p className="mira-dark-kicker">Optional visual references</p>
      <p className="mt-3 text-sm leading-6 text-[#c5bfb3]">
        If you would like, share a few images before your conversation—an existing moodboard, a portrait, your location or visual references you love. You can also explain what MIRA should notice.
      </p>

      {status.data?.creativeDirectionConfirmed && (
        <p className="mt-4 rounded border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-[#c5bfb3]">
          Your creative direction is already confirmed. Adding a new reference now won't change it automatically -
          updating a confirmed direction isn't available yet.
        </p>
      )}

      {references.isError ? (
        <p role="alert" className="mt-4 text-xs text-red-200">We couldn't load your uploaded references.</p>
      ) : references.data && references.data.length > 0 ? (
        <div className="mt-5 border-t border-white/10 pt-5">
          <p className="text-xs uppercase tracking-[0.16em] text-[#b7a98f]">Your uploaded references</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {references.data.map(reference => (
              <div key={reference.id}>
                {reference.url ? (
                  <img
                    src={reference.url}
                    alt={reference.clientDescription ?? "Uploaded reference"}
                    className="aspect-square w-full rounded object-cover"
                  />
                ) : (
                  <div className="aspect-square w-full rounded bg-white/5" aria-hidden="true" />
                )}
                <p className="mt-1 truncate text-[10px] text-[#9e978b]">
                  {PURPOSE_LABELS[reference.referencePurpose ?? ""] ?? "Reference"}
                </p>
                {pendingRemovalId === reference.id ? (
                  <div className="mt-1 flex gap-2 text-[10px]">
                    <button
                      type="button"
                      onClick={() => remove.mutate({ token, assetId: reference.id })}
                      disabled={remove.isPending}
                      className="text-red-300 underline"
                    >
                      {remove.isPending ? "Removing…" : "Confirm remove"}
                    </button>
                    <button type="button" onClick={() => setPendingRemovalId(null)} className="text-[#9e978b] underline">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPendingRemovalId(reference.id)}
                    className="mt-1 text-[10px] text-[#9e978b] underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          {remove.isError && (
            <p role="alert" className="mt-2 text-xs text-red-200">We couldn't remove that reference. Please try again.</p>
          )}
        </div>
      ) : null}

      <form
        className="mt-5"
        onSubmit={async event => {
          event.preventDefault();
          if (!file || !purpose) return;
          const base64 = await fileToBase64(file);
          upload.mutate({
            token,
            reference: {
              originalName: file.name,
              mimeType: file.type as "image/jpeg" | "image/png" | "image/webp",
              base64,
              clientDescription: description.trim(),
              evidenceKind: "observed",
              referencePurpose: purpose,
            },
          });
        }}
      >
        <p className="text-xs uppercase tracking-[0.16em] text-[#b7a98f]">Visual references · optional</p>
        <input
          className="mt-4 block w-full text-xs text-[#c5bfb3]"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={event => { setFile(event.target.files?.[0] ?? null); setMessage(null); }}
        />

        <div className="mt-3">
          <Select value={purpose} onValueChange={value => setPurpose(value as ReferencePurposeValue)}>
            <SelectTrigger className="border-white/15 bg-white/5 text-[#ded5c5]">
              <SelectValue placeholder="What is this reference?" />
            </SelectTrigger>
            <SelectContent>
              {REFERENCE_PURPOSE_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Textarea
          className="mt-3 border-white/15 bg-white/5 text-[#ded5c5]"
          maxLength={800}
          value={description}
          onChange={event => setDescription(event.target.value)}
          placeholder="What should MIRA notice about this reference?"
        />

        <Button
          type="submit"
          variant="outline"
          disabled={!canSubmit}
          className="mt-4 border-white/15 bg-transparent text-[#ded5c5]"
        >
          <ImagePlus className="mr-2 size-4" />{upload.isPending ? "Adding…" : "Add visual reference"}
        </Button>
        {message ? <p className="mt-3 text-xs text-[#b7a98f]">{message}</p> : null}
        {upload.error ? <p className="mt-3 text-xs text-red-200">The image could not be added. Use a valid JPG, PNG, or WebP under 8 MB, select a purpose, and add a short note.</p> : null}
      </form>
    </div>
  );
}
