type CreateFrameStatus = { status: "pending" | "generating" | "complete" | "failed"; url?: string };

export function deriveCreateGenerationUiState(frames: CreateFrameStatus[]) {
  const completedFrames = frames.filter(frame => frame.status === "complete" && frame.url).length;
  const failedFrames = frames.filter(frame => frame.status === "failed").length;
  return {
    completedFrames,
    failedFrames,
    isComplete: completedFrames === 5 && failedFrames === 0,
    showFailureUi: failedFrames > 0,
  };
}
