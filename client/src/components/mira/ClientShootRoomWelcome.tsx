import { Button } from "@/components/ui/button";
import { Mic } from "lucide-react";

type Photographer = {
  displayName: string;
  businessName: string | null;
};

export function ClientShootRoomWelcome({
  photographer,
  consent,
  onConsentChange,
  onCallMira,
  isLoading,
  error,
}: {
  photographer: Photographer;
  consent: boolean;
  onConsentChange: (checked: boolean) => void;
  onCallMira: () => void;
  isLoading: boolean;
  error: string | null;
}) {
  const photographerName = photographer.businessName || photographer.displayName;

  return (
    <section className="mb-20 lg:mb-32">
      <p className="mira-dark-kicker text-center">
        {photographerName.toUpperCase()} INVITED YOU TO PREPARE FOR YOUR SHOOT
      </p>
      <h2 className="mira-dark-display mt-8 text-center text-4xl sm:text-5xl text-[#f1eadc]">
        Let's prepare for your shoot.
      </h2>
      <p className="mx-auto mt-8 max-w-2xl text-center text-base leading-7 text-[#c9c3b7]">
        Your photographer has already shared the essential details, which you can review below.
      </p>
      <p className="mx-auto mt-5 max-w-2xl text-center text-base leading-7 text-[#c9c3b7]">
        Now MIRA would like to learn more about you, what you want from the photographs and anything that will help you feel prepared. Call MIRA for a private guided conversation.
      </p>

      <div className="mx-auto mt-12 max-w-2xl">
        <label className="flex items-start gap-3 rounded border border-white/10 p-4 text-left text-xs leading-6 text-[#bdb6a9]">
          <input
            type="checkbox"
            checked={consent}
            onChange={e => onConsentChange(e.target.checked)}
            className="mt-1.5"
          />
          <span>
            I agree to AI-assisted processing of what I share for this shoot
            preparation. Short-lived text transcripts may be retained for service quality; raw audio is not stored.
          </span>
        </label>

        {error && (
          <p role="alert" className="mt-5 text-center text-sm text-red-200">
            {error}
          </p>
        )}

        <div className="mt-8 flex justify-center">
          <Button
            disabled={!consent || isLoading}
            onClick={onCallMira}
            className="rounded-full bg-[#d2b98b] px-10 text-base text-[#171613] hover:bg-[#e0c99e]"
          >
            <Mic className="mr-2 size-5" /> Call MIRA
          </Button>
        </div>
      </div>
    </section>
  );
}
