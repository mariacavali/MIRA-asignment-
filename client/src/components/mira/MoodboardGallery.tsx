import { trpc } from "@/lib/trpc";
import { MoodboardShotCard } from "./MoodboardShotCard";

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
        <p className="mt-3 text-sm leading-6 text-[#c5bfb3]">These images suggest a direction, not an exact result. Try one small action at a time, skip anything uncomfortable, and let your photographer adapt the shot to you.</p>
        <div className="mt-4 grid items-start gap-4 sm:grid-cols-2">
          {status.data.images.map((image, index) => <MoodboardShotCard key={image.id} image={image} number={index + 1} />)}
        </div>
      </div>
    );
  }

  if (status.data.moodboardNeedsRetry) {
    return (
      <p aria-live="polite" className="text-sm text-[#c5bfb3]">
        Your confirmed creative direction is saved. We couldn't finish your moodboard. Please contact your photographer for help.
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
