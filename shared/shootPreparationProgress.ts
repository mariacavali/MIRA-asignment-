export type ShootPreparationStatus = {
  roomState: string;
  scheduleResponse: {
    response: "confirmed" | "change_requested";
    note: string | null;
  } | null;
  creativeDirectionConfirmed: boolean;
  moodboardReady: boolean;
  moodboardNeedsRetry: boolean;
  preparationReady: boolean;
  preparationBrief: unknown | null;
  readyToShoot: boolean;
};

// Only persisted milestones count. Opening a section, checking consent or
// uploading optional references never claims that preparation is complete.
export function getShootPreparationProgress(status: ShootPreparationStatus) {
  const detailsConfirmed = status.scheduleResponse?.response === "confirmed";
  const changeRequested =
    status.scheduleResponse?.response === "change_requested";
  const directionConfirmed = status.creativeDirectionConfirmed;
  const planReady =
    directionConfirmed &&
    status.preparationReady &&
    status.moodboardReady &&
    Boolean(status.preparationBrief);
  const steps = [
    {
      id: "shoot-details",
      title: "Confirm your shoot",
      complete: detailsConfirmed,
      status: detailsConfirmed
        ? "Complete"
        : changeRequested
          ? "Waiting for photographer"
          : "To do",
      description: detailsConfirmed
        ? "Your date, time and location are confirmed."
        : changeRequested
          ? "Your change request is saved. You can continue preparing."
          : "Check the date, time and location, then confirm or request a change.",
    },
    {
      id: "mira-preparation",
      title: "Prepare with MIRA",
      complete: directionConfirmed,
      status: directionConfirmed
        ? "Complete"
        : status.roomState === "summary_pending"
          ? "Summary to confirm"
          : status.roomState === "discovery_in_progress"
            ? "In progress"
            : "To do",
      description: directionConfirmed
        ? "Your creative direction is confirmed and saved."
        : "Add images if you wish. Use voice or text, then confirm your conversation summary.",
    },
    {
      id: "shoot-plan",
      title: "Photographer approves",
      complete: planReady && status.readyToShoot,
      status:
        planReady && status.readyToShoot
          ? "Approved"
          : planReady
            ? "Waiting for photographer"
            : status.moodboardNeedsRetry
              ? "Needs attention"
              : directionConfirmed
                ? "Preparing your plan"
                : "After step 2",
      description:
        planReady && status.readyToShoot
          ? "Your photographer has approved your plan. Ready to shoot."
          : planReady
            ? "Your photographer reviews the moodboard and confirms you are ready."
            : status.moodboardNeedsRetry
              ? "Your direction is saved, but the moodboard could not finish. Contact your photographer."
              : directionConfirmed
                ? "Your direction is saved. This step completes when your moodboard and guidance are ready."
                : "MIRA prepares these after you confirm your creative direction.",
    },
  ];
  const completed = steps.filter(step => step.complete).length;
  const nextIndex =
    !detailsConfirmed && !changeRequested ? 0 : !directionConfirmed ? 1 : 2;
  return {
    steps,
    completed,
    percent: Math.round((completed / steps.length) * 100),
    nextIndex,
    nextAction:
      nextIndex === 0
        ? "Confirm shoot details"
        : nextIndex === 1
          ? "Continue preparation"
          : planReady
            ? "Review your plan"
            : "View plan status",
    photographerConfirmed: status.readyToShoot,
  };
}
