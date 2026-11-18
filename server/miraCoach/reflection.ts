import { createHash } from "node:crypto";
import { interviewReflectionSchema, type InterviewCoverage } from "../../shared/miraInterview";

type Memory = { id: string; text: string; status: string; kind: "explicit" | "interpreted" };
export function interviewReflection(coverage: InterviewCoverage, memories: Memory[]) {
  const answers = coverage.areas.flatMap(area => {
    const proposal = coverage.proposals?.find(item => item.area === area.area);
    const memory = memories.find(item => item.id === (proposal?.memoryId ?? area.memoryId));
    if (!memory || (!proposal && area.status !== "answered")) return [];
    return [{ area: area.area, memoryId: memory.id, text: proposal?.answer ?? area.answer!, kind: memory.kind,
      status: proposal ? "proposed" as const : "confirmed" as const, proposalId: proposal?.id ?? null }];
  });
  const unresolved = coverage.areas.filter(area => !answers.some(answer => answer.area === area.area)).map(({ area, status }) => ({ area, status }));
  const fingerprint = createHash("sha256").update(JSON.stringify({ coverage: coverage.fingerprint, answers, unresolved })).digest("hex");
  return interviewReflectionSchema.parse({ fingerprint, answers, unresolved, reviewed: coverage.reviewed && !coverage.proposals?.length });
}
