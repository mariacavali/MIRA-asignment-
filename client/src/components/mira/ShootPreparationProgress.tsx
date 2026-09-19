import { Check } from "lucide-react";
import {
  getShootPreparationProgress,
  type ShootPreparationStatus,
} from "@shared/shootPreparationProgress";

export function ShootPreparationProgress({
  status,
  activeStep,
  onStepChange,
}: {
  status: ShootPreparationStatus;
  activeStep?: number;
  onStepChange?: (index: number) => void;
}) {
  const progress = getShootPreparationProgress(status);
  return (
    <section
      aria-label="Your shoot progress"
      className="rounded-xl border border-stone-200 p-5"
    >
      <div className="flex justify-between gap-3 text-base">
        <span>{progress.completed} of 3 steps complete</span>
        <span>{progress.percent}%</span>
      </div>
      <progress
        className="mt-3 h-2 w-full accent-[#887044]"
        max={100}
        value={progress.percent}
        aria-label="Shoot preparation"
      />
      <ol className="mt-5 grid gap-3 sm:grid-cols-3">
        {progress.steps.map((step, index) => (
          <li key={step.id}>
            <button
              type="button"
              onClick={() => onStepChange?.(index)}
              aria-current={
                (activeStep ?? progress.nextIndex) === index
                  ? "step"
                  : undefined
              }
              className="flex min-h-16 w-full items-start gap-3 rounded-lg p-2 text-left hover:bg-stone-100 aria-[current=step]:bg-stone-100"
            >
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full border border-stone-400"
              >
                {step.complete ? <Check className="size-4" /> : index + 1}
              </span>
              <span className="text-base">
                {step.title}
                <span className="mt-1 block text-sm text-stone-600">
                  {step.status}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
