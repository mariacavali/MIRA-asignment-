import { trpc } from "@/lib/trpc";

// Displays only the real, persisted moodboard artifact. Never renders a
// text-only or fabricated substitute - while it isn't ready yet, this shows
// a calm status message and nothing else.
export function MoodboardGallery({ token }: { token: string }) {
  const status = trpc.miraCore.getShootRoomStatus.useQuery({ token }, { refetchInterval: 8000 });

  if (status.isError) {
    return (
      <p role="alert" className="text-sm text-red-200">
        We couldn't load your moodboard status. It will keep trying automatically.
      </p>
    );
  }

  if (!status.data) return null;

  if (status.data.moodboardReady) {
    return (
      <div aria-live="polite">
        <p className="mira-dark-kicker">Your moodboard</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {status.data.images.map(image => (
            <img
              key={image.id}
              src={image.url}
              alt={image.direction}
              className="aspect-[4/5] w-full rounded object-cover"
            />
          ))}
        </div>
      </div>
    );
  }

  if (status.data.moodboardNeedsRetry) {
    return (
      <p aria-live="polite" className="text-sm text-[#c5bfb3]">
        Your confirmed creative direction is safe. Your moodboard needs a little more time to come together - it will appear here shortly.
      </p>
    );
  }

  if (status.data.creativeDirectionConfirmed) {
    return (
      <p aria-live="polite" className="text-sm text-[#c5bfb3]">
        Your creative direction is confirmed. Your moodboard is being put together and will appear here once it's ready.
      </p>
    );
  }

  return (
    <p className="text-sm text-[#c5bfb3]">
      Once your Discovery conversation is confirmed, your moodboard will appear here.
    </p>
  );
}
