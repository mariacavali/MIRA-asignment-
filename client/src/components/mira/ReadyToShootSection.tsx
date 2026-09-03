import { trpc } from "@/lib/trpc";
import { SectionHeader } from "@/components/mira/SectionHeader";

// Renders the real, persisted preparation brief once Creative DNA and the
// moodboard have actually completed - never fabricated or model-improvised
// text. The photographer's own "Mark Ready to Shoot" confirmation (from the
// dashboard) is what flips the final state shown here.
export function ReadyToShootSection({ token }: { token: string }) {
  const status = trpc.miraCore.getShootRoomStatus.useQuery({ token }, { refetchInterval: 8000 });

  if (status.isError) {
    return (
      <section className="mira-dark-panel mt-6">
        <SectionHeader index="03" title="Ready to Shoot" subtitle="Are you prepared?" />
        <p role="alert" className="mt-6 text-sm text-red-200">
          We couldn't load this section. It will keep trying automatically.
        </p>
      </section>
    );
  }

  const ready = status.data?.preparationReady ?? false;
  const confirmed = status.data?.readyToShoot ?? false;
  const brief = status.data?.preparationBrief ?? null;

  return (
    <section className="mira-dark-panel mt-6">
      <SectionHeader index="03" title="Ready to Shoot" subtitle="Are you prepared?" />
      <div aria-live="polite" className="mt-6 rounded border border-white/10 bg-white/[0.03] p-5 text-sm text-[#c5bfb3]">
        {confirmed ? (
          <p className="text-[#f1eadc]">
            You're ready to shoot. Your photographer has confirmed everything is in place.
          </p>
        ) : ready && brief ? (
          <div className="space-y-5 text-left">
            <p className="text-[#f1eadc]">Your creative direction is confirmed. Here's how to prepare:</p>
            <BriefList title="Wardrobe" items={brief.wardrobe} />
            <BriefList title="Device & setup" items={brief.deviceSetup} />
            <BriefList title="Location" items={brief.locationNotes} />
            <BriefList title="Timing" items={brief.timingNotes} />
            <BriefList title="Good to know" items={brief.generalTips} />
            <BriefList title="Best avoided" items={brief.avoid} />
            <p className="text-xs text-[#9e978b]">Your photographer will confirm here once everything is set.</p>
          </div>
        ) : ready ? (
          <p>Your creative direction is confirmed. Preparation guidance for your shoot will appear here shortly.</p>
        ) : (
          <p>This section will unlock once your creative direction is ready.</p>
        )}
      </div>
    </section>
  );
}

function BriefList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mira-dark-kicker">{title}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[#c5bfb3]">
        {items.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
