export function readJourneyStepIndex(param: string, order: readonly string[]) {
  if (typeof window === "undefined") return null;
  const step = new URL(window.location.href).searchParams.get(param);
  const index = step ? order.indexOf(step) : -1;
  return index >= 0 ? index : null;
}

export function writeJourneyStep(param: string, step: string, mode: "push" | "replace" = "push") {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set(param, step);
  window.history[mode === "replace" ? "replaceState" : "pushState"]({ ...window.history.state, miraStep: step }, "", url);
}
