import { Button } from "@/components/ui/button";
import { Mic, Type } from "lucide-react";

type Photographer = {
  displayName: string;
  businessName: string | null;
};

export function ClientShootRoomWelcome({
  photographer,
  consent,
  onConsentChange,
  onCallMira,
  onTextMira,
  isLoading,
  error,
}: {
  photographer: Photographer;
  consent: boolean;
  onConsentChange: (checked: boolean) => void;
  onCallMira: () => void;
  onTextMira: () => void;
  isLoading: boolean;
  error: string | null;
}) {
  const photographerName =
    photographer.businessName || photographer.displayName;

  return (
    <section>
      <p className="text-lg leading-8">
        Talk with MIRA or use text. At the end, confirm your summary so{" "}
        {photographerName} can review your direction.
      </p>

      <div className="mt-6">
        <label className="flex items-start gap-3 rounded border border-white/10 p-4 text-left text-base leading-7 text-[#bdb6a9]">
          <input
            type="checkbox"
            checked={consent}
            onChange={e => onConsentChange(e.target.checked)}
            className="mt-1.5"
          />
          <span>
            I agree to AI-assisted processing of what I share for this shoot
            preparation. Short-lived text transcripts may be retained for
            service quality; raw audio is not stored.
          </span>
        </label>

        {error && (
          <p role="alert" className="mt-5 text-center text-sm text-red-200">
            {error}
          </p>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button
            disabled={!consent || isLoading}
            onClick={onCallMira}
            className="rounded-full bg-[#d2b98b] px-10 text-base text-[#171613] hover:bg-[#e0c99e]"
          >
            <Mic className="mr-2 size-5" /> Talk to MIRA
          </Button>
          <Button
            disabled={!consent || isLoading}
            onClick={onTextMira}
            variant="outline"
            className="rounded-full border-white/20 px-8 text-base text-[#f1eadc]"
          >
            <Type className="mr-2 size-5" /> Continue with text
          </Button>
        </div>
      </div>
    </section>
  );
}
