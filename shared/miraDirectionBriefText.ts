import { directionBriefSchema, DIRECTION_DIMENSION_LABELS, type DirectionBrief } from "./miraDirectionBrief";
import { INTERVIEW_AREA_LABELS } from "./miraInterview";

// An editable source brief, never generated recommendations or a Brand Book.
export function directionBriefText(raw: DirectionBrief) {
  const brief = directionBriefSchema.parse(raw);
  if (!["collecting", "partial", "ready"].includes(brief.state) || !brief.statements.length) {
    throw new Error("Confirm your current reflection before downloading a direction brief.");
  }
  const stateLabel = { missing: "still open", unknown: "uncertain", declined: "skipped", needs_review: "needs clarification", answered: "answered" };
  return ["MIRA — Direction brief", "", "Based on your confirmed reflection. Creative recommendations and the Brand Book have their own later review.", "",
    ...brief.statements.flatMap(statement => [statement.areas.map(area => INTERVIEW_AREA_LABELS[area]).join(" / "),
      statement.kind === "interpreted" ? "An interpretation you confirmed:" : "From what you shared:", statement.text, ""]),
    "Preparation for the next step", ...brief.dimensions.map(item => `${DIRECTION_DIMENSION_LABELS[item.dimension]}: ${item.ready ? "confirmed inputs available for a provisional draft" : `still open — ${item.missing.map(area => INTERVIEW_AREA_LABELS[area]).join("; ")}`}`), "",
    ...(brief.unresolved.length ? ["Still open", ...brief.unresolved.map(item => `${INTERVIEW_AREA_LABELS[item.area]}: ${stateLabel[item.status]}`), ""] : []),
    "",
  ].join("\n");
}
