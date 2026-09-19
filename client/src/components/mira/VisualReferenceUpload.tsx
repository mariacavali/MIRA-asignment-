import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  referenceCategory,
  REFERENCE_PURPOSE_OPTIONS,
} from "@/lib/referenceImageUpload";
import { ReferenceBatchUpload } from "./ReferenceBatchUpload";

export function VisualReferenceUpload({ token }: { token: string }) {
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);
  const status = trpc.miraCore.getShootRoomStatus.useQuery({ token });
  const references = trpc.miraCore.listClientVisualReferences.useQuery({
    token,
  });
  const upload = trpc.miraCore.uploadClientVisualReference.useMutation();
  const remove = trpc.miraCore.removeClientVisualReference.useMutation({
    onSuccess: () => {
      setPendingRemovalId(null);
      void references.refetch();
    },
  });
  const count = references.data?.length ?? 0;
  return (
    <div>
      <p className="mira-dark-kicker">Images · optional · {count} of 5 saved</p>
      <p className="mt-3 text-sm leading-6 text-[#c5bfb3]">
        Share your location, clothes, a portrait, brand images or inspiration.
        You can select up to five images together.
      </p>
      {status.data?.creativeDirectionConfirmed && (
        <p className="mt-3 rounded border border-white/15 p-3 text-sm leading-6 text-[#c5bfb3]">
          Your direction is already confirmed. New images will be saved as
          references; they won't change your existing moodboard.
        </p>
      )}
      {references.isError ? (
        <p role="alert" className="mt-4 text-sm text-red-200">
          We couldn't load your saved images. Refresh before adding more.
        </p>
      ) : null}
      {!!count && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {references.data?.map(reference => (
            <article
              key={reference.id}
              className="rounded-lg border border-white/15 p-3"
            >
              <ReferenceThumbnail
                url={reference.url}
                alt={reference.clientDescription ?? "Saved reference"}
              />
              <p className="mt-2 text-xs text-[#c5bfb3]">
                {REFERENCE_PURPOSE_OPTIONS.find(
                  option =>
                    option.value ===
                    referenceCategory(
                      reference.referencePurpose,
                      reference.clientDescription
                    )
                )?.label ?? "Reference"}
              </p>
              {pendingRemovalId === reference.id ? (
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <button
                    type="button"
                    disabled={remove.isPending}
                    onClick={() =>
                      remove.mutate({ token, assetId: reference.id })
                    }
                    className="py-2 text-red-200"
                  >
                    Confirm remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingRemovalId(null)}
                    className="py-2 text-[#c5bfb3]"
                  >
                    Keep image
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPendingRemovalId(reference.id)}
                  className="mt-2 py-2 text-xs text-[#b7a98f] underline"
                >
                  Remove
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      {remove.isError && (
        <p role="alert" className="mt-3 text-sm text-red-200">
          Couldn't remove the image. Please try again.
        </p>
      )}
      {count >= 5 ? (
        <p className="mt-4 text-sm text-[#b7a98f]">
          All five spaces are used. Remove an image above to replace it.
        </p>
      ) : null}
      {!references.isLoading && !references.isError && (
        <ReferenceBatchUpload
          available={Math.max(0, 5 - count)}
          onUpload={reference => upload.mutateAsync({ token, reference })}
          onComplete={async () => {
            const result = await references.refetch();
            if (result.error) throw result.error;
          }}
        />
      )}
    </div>
  );
}

export function ReferenceThumbnail({
  url,
  alt,
}: {
  url?: string | null;
  alt: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return url && failedUrl !== url ? (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      onError={() => setFailedUrl(url)}
      className="aspect-square w-full rounded object-cover"
    />
  ) : (
    <div className="flex aspect-square items-center justify-center rounded bg-white/5 p-4 text-center text-xs text-[#b7a98f]">
      Image preview unavailable
    </div>
  );
}
