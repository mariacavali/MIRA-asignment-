import { ArrowRight, Check } from "lucide-react";
import { getShootPreparationProgress, type ShootPreparationStatus } from "@shared/shootPreparationProgress";

export function ShootPreparationProgress({ status }: { status: ShootPreparationStatus }) {
  const progress = getShootPreparationProgress(status);
  return (
    <section aria-labelledby="preparation-progress-title" className="mira-dark-panel mb-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="preparation-progress-title" className="mira-dark-display text-3xl">Your preparation, step by step.</h2>
          <p className="mt-2 text-sm text-[#c9c3b7]" aria-live="polite">{progress.completed} of 3 milestones complete</p>
        </div>
        <span className="text-3xl tabular-nums text-[#d2b98b]" aria-hidden="true">{progress.percent}%</span>
      </div>
      <div role="progressbar" aria-label="Shoot preparation" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-valuetext={`${progress.percent}% — ${progress.completed} of 3 milestones complete`} className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-[#d2b98b] transition-[width] motion-reduce:transition-none" style={{ width: `${progress.percent}%` }} />
      </div>
      <nav aria-label="Preparation steps" className="mt-6">
        <ol className="grid gap-3 sm:grid-cols-3">
          {progress.steps.map((step, index) => (
            <li key={step.id}>
              <a href={`#${step.id}`} aria-current={index === progress.nextIndex && progress.completed < 3 ? "step" : undefined} className="block h-full rounded-lg border border-white/15 p-4 hover:border-[#d2b98b]/70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d2b98b]">
                <span className="flex items-center gap-2 text-xs text-[#d2b98b]">
                  <span className="flex size-6 items-center justify-center rounded-full border border-[#d2b98b]/60" aria-hidden="true">{step.complete ? <Check className="size-3.5" /> : index + 1}</span>
                  Step {index + 1}
                </span>
                <p className="mt-3 text-sm font-medium text-[#f1eadc]">{step.title}</p>
                <p className="mt-2 text-xs text-[#d2b98b]">{step.status}</p>
                <p className="mt-2 text-xs leading-5 text-[#c9c3b7]">{step.description}</p>
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <a href={`#${progress.steps[progress.nextIndex].id}`} className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#d2b98b] px-6 text-sm font-medium text-[#171613] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d2b98b]">{progress.nextAction}<ArrowRight className="size-4" aria-hidden="true" /></a>
      <p className="mt-4 text-xs leading-5 text-[#b7a98f]">Images are optional and do not affect your percentage. Progress is saved to this Shoot Room.</p>
      <p className="mt-4 border-t border-white/10 pt-4 text-sm text-[#c9c3b7]">{progress.photographerConfirmed ? "Photographer approval: confirmed — ready to shoot." : "Photographer approval: pending. Your photographer confirms the final readiness separately."}</p>
    </section>
  );
}
