import { createHash } from "node:crypto";
import { brandConfigurationSchema, type BrandConfiguration } from "../../shared/miraBrandDirection";
import { interviewReflectionSchema, type InterviewArea, type InterviewReflection } from "../../shared/miraInterview";
import { directionBriefSchema, type DirectionBrief } from "../../shared/miraDirectionBrief";

// Read-only preparation for later synthesis. No model, publication, approval or
// generation side effect. Exact reviewed client meaning is the only input.
export function prepareDirectionBrief(input: { revision: number; configuration: BrandConfiguration | null; reflection: InterviewReflection | null }): DirectionBrief {
  const configuration = input.configuration ? brandConfigurationSchema.parse(input.configuration) : null;
  const reflection = input.reflection ? interviewReflectionSchema.parse(input.reflection) : null;
  const available = configuration?.segment === "personal_brand" && !!reflection;
  const reviewed = available && reflection.reviewed;
  const statements: DirectionBrief["statements"] = [];
  if (reviewed) for (const answer of reflection.answers) {
    if (answer.status !== "confirmed") throw new Error("A reviewed brief cannot contain provisional meaning");
    const existing = statements.find(item => item.memoryId === answer.memoryId);
    if (existing) {
      if (existing.text !== answer.text || existing.kind !== answer.kind) throw new Error("Conflicting source text in direction brief");
      if (!existing.areas.includes(answer.area)) existing.areas.push(answer.area);
    } else statements.push({ memoryId: answer.memoryId, text: answer.text, kind: answer.kind, areas: [answer.area] });
  }
  const requirements: { dimension: DirectionBrief["dimensions"][number]["dimension"]; areas: InterviewArea[] }[] = [
    { dimension: "brand.meaning", areas: ["intended_use", "offer", "audience", "desired_understanding"] },
    { dimension: "voice.profile", areas: ["intended_use", "offer", "audience", "voice"] },
    { dimension: "visual.direction", areas: ["intended_use", "visual_preferences", "visual_boundaries",
      ...(configuration && ["established", "evolving"].includes(configuration.brandStage) ? ["existing_identity" as const] : [])] },
  ];
  const dimensions = available ? requirements.map(({ dimension, areas }) => {
    const missing = areas.filter(area => !statements.some(item => item.areas.includes(area)));
    return { dimension, ready: !!reviewed && missing.length === 0, missing,
      memoryIds: statements.filter(item => item.areas.some(area => areas.includes(area))).map(item => item.memoryId) };
  }) : [];
  const readyCount = dimensions.filter(item => item.ready).length;
  const state = !available ? "unavailable" : !reviewed ? "needs_confirmation" : !readyCount ? "collecting" : readyCount === dimensions.length ? "ready" : "partial";
  const snapshot = { version: "direction-brief-v1" as const, revision: input.revision, state,
    reflectionFingerprint: available ? reflection.fingerprint : null, statements,
    unresolved: available ? reflection.unresolved : [], dimensions };
  const fingerprint = createHash("sha256").update(JSON.stringify({ ...snapshot, configuration })).digest("hex");
  return directionBriefSchema.parse({ ...snapshot, fingerprint });
}
