import { useEffect, useState } from "react";
import type { ShootGuide } from "@shared/miraClientBrief";

export function MoodboardShotCard({
  image,
  number,
  photographer = false,
  onImageStatus,
}: {
  onImageStatus?: (loaded: boolean) => void;
  image: { url: string; direction: string; shootGuide?: ShootGuide };
  number: number;
  photographer?: boolean;
}) {
  const guide = image.shootGuide;
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setFailed(false);
  }, [image.url]);
  return (
    <figure className="overflow-hidden rounded-lg border border-white/15 bg-white/[0.02]">
      {failed ? (
        <div
          className="flex aspect-[4/5] flex-col items-center justify-center bg-white/5 p-6 text-center"
          role="status"
        >
          <p className="text-sm text-[#ded5c5]">This image couldn't load.</p>
          <p className="mt-2 text-xs leading-5 text-[#b7a98f]">
            Your saved shoot direction is still available.
          </p>
          <button
            type="button"
            onClick={() => {
              setAttempt(value => value + 1);
              setFailed(false);
            }}
            className="mt-4 min-h-11 rounded-full border border-[#d2b98b]/40 px-5 text-sm text-[#d2b98b]"
          >
            Try loading image again
          </button>
        </div>
      ) : (
        <a
          href={image.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open image ${number}: ${image.direction}`}
        >
          <img
            key={`${image.url}:${attempt}`}
            src={image.url}
            onLoad={() => onImageStatus?.(true)}
            onError={() => {
              setFailed(true);
              onImageStatus?.(false);
            }}
            alt={image.direction}
            loading="lazy"
            className="aspect-[4/5] w-full object-cover"
          />
        </a>
      )}
      <figcaption className="p-4">
        <p className="text-xs uppercase tracking-wider text-[#d2b98b]">
          Shot {number}
        </p>
        <h4 className="mt-2 text-lg text-[#f1eadc]">
          {guide?.title ?? image.direction}
        </h4>
        {guide && (
          <>
            <p className="mt-2 text-sm leading-6 text-[#c5bfb3]">
              {guide.purpose}
            </p>
            <details className="mt-4" open={number === 1}>
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-[#d2b98b]">
                How to try this shot
              </summary>
              <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-6 text-[#ded5c5]">
                {guide.steps.map(step => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <dl className="mt-4 space-y-3 text-sm leading-6 text-[#c5bfb3]">
                <div>
                  <dt className="font-medium text-[#ded5c5]">Hands</dt>
                  <dd>{guide.hands}</dd>
                </div>
                <div>
                  <dt className="font-medium text-[#ded5c5]">Where to look</dt>
                  <dd>{guide.gaze}</dd>
                </div>
                <div>
                  <dt className="font-medium text-[#ded5c5]">
                    An easier option
                  </dt>
                  <dd>{guide.easierOption}</dd>
                </div>
                {photographer && (
                  <div>
                    <dt className="font-medium text-[#ded5c5]">
                      Photographer cue
                    </dt>
                    <dd>{guide.photographerTip}</dd>
                  </div>
                )}
              </dl>
            </details>
          </>
        )}
      </figcaption>
    </figure>
  );
}
