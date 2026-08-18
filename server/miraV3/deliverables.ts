import type { ReflectionBundle } from "./bundle";
import { z } from "zod";

export const DELIVERABLE_KINDS = ["mirror", "brand_soul", "visual_direction"] as const;
export type DeliverableKind = (typeof DELIVERABLE_KINDS)[number];

export const moodBoardBriefSchema = z.object({
  purpose: z.string().trim().max(800).optional(),
  audience: z.string().trim().max(800).optional(),
  platform: z.string().trim().max(500).optional(),
  location: z.string().trim().max(500).optional(),
  desiredFeeling: z.string().trim().max(800).optional(),
  clothingIdeas: z.string().trim().max(800).optional(),
  references: z.string().trim().max(1200).optional(),
  practicalConstraints: z.string().trim().max(1000).optional(),
});

export const moodBoardRequestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("brand") }),
  z.object({ mode: z.literal("project"), brief: moodBoardBriefSchema.optional() }),
]);
export type MoodBoardRequest = z.infer<typeof moodBoardRequestSchema>;
type MoodBoardBuildOptions = MoodBoardRequest & { imageReferenceCues?: string[] };

export function canAccessDeliverables(journeyStatus: string, revisionStatus: string | undefined) {
  return ["mirror_confirmed", "deliverables_ready", "completed"].includes(journeyStatus) && revisionStatus === "confirmed";
}

function citations(bundle: ReflectionBundle, supports: string) {
  const selected = bundle.evidence.filter(item => item.supports.includes(supports) || item.supports.includes("mirror"));
  return (selected.length ? selected : bundle.evidence).slice(0, 4).map(item => ({ turn: item.turn, quote: item.quote }));
}

const semanticColors: Array<{ pattern: RegExp; hex: string }> = [
  { pattern: /\b(?:terracotta|clay|rust|burnt)\b/i, hex: "#A45E45" },
  { pattern: /\b(?:ochre|mustard|brass|gold)\b/i, hex: "#B07A2A" },
  { pattern: /\b(?:navy|deep blue|midnight blue|ink blue)\b/i, hex: "#2F4858" },
  { pattern: /\bblue\b/i, hex: "#4C687A" },
  { pattern: /\b(?:warm beige|beige|sand|linen|oat|taupe|mineral warmth)\b/i, hex: "#B9A893" },
  { pattern: /\b(?:soft gr[ae]y|gr[ae]y|stone|silver)\b/i, hex: "#A59B8D" },
  { pattern: /\b(?:black|charcoal|shadow|ink)\b/i, hex: "#292825" },
  { pattern: /\b(?:white|ivory|cream|restrained light)\b/i, hex: "#EEE7DC" },
  { pattern: /\b(?:sage|olive|moss|green)\b/i, hex: "#6D746B" },
  { pattern: /\b(?:brown|umber|earth|walnut)\b/i, hex: "#7A5C46" },
  { pattern: /\b(?:burgundy|wine|red)\b/i, hex: "#7A3E48" },
  { pattern: /\b(?:rose|blush|pink)\b/i, hex: "#C98F8F" },
  { pattern: /\b(?:plum|purple|violet)\b/i, hex: "#66506F" },
  { pattern: /\bteal\b/i, hex: "#3F6F6B" },
  { pattern: /\borange\b/i, hex: "#C66A3D" },
  { pattern: /\byellow\b/i, hex: "#C6A15B" },
];

const neutralFallback = ["#EEE7DC", "#987D6A", "#292825", "#6D746B", "#A59B8D"];

export function resolveSemanticColor(intention: string, index: number) {
  return semanticColors.find(({ pattern }) => pattern.test(intention))?.hex ?? neutralFallback[index % neutralFallback.length];
}

export function buildDeliverables(bundle: ReflectionBundle, moodBoard: MoodBoardBuildOptions = { mode: "brand" }) {
  const visualEvidence = citations(bundle, "visual_direction");
  const sourceTurn = (index: number) => visualEvidence[index % visualEvidence.length]?.turn ?? bundle.evidence[0]?.turn ?? 1;
  const projectBrief = moodBoard.mode === "project" ? moodBoard.brief ?? {} : {};
  const projectDetails = moodBoard.mode === "project"
    ? [
      projectBrief.purpose && `Purpose: ${projectBrief.purpose}`,
      projectBrief.audience && `Audience: ${projectBrief.audience}`,
      projectBrief.platform && `Platform: ${projectBrief.platform}`,
      projectBrief.location && `Location: ${projectBrief.location}`,
      projectBrief.desiredFeeling && `Desired feeling: ${projectBrief.desiredFeeling}`,
      projectBrief.clothingIdeas && `Clothing: ${projectBrief.clothingIdeas}`,
      projectBrief.references && `References: ${projectBrief.references}`,
      projectBrief.practicalConstraints && `Practical constraints: ${projectBrief.practicalConstraints}`,
    ].filter((value): value is string => Boolean(value))
    : [];
  const referenceCues = moodBoard.mode === "project" ? (moodBoard.imageReferenceCues ?? []).slice(0, 6) : [];
  const projectContext = [...projectDetails, ...referenceCues.map(cue => `Reference cue: ${cue}`)];
  const projectSuffix = projectContext.length
    ? ` For this project, adapt the execution around ${projectContext.join(" · ")} while keeping the confirmed identity and voice unchanged.`
    : " Adapt the execution to the immediate project while keeping the confirmed identity and voice unchanged.";
  return {
    mirror: {
      kind: "mirror" as const,
      title: "Brand Soul File",
      subtitle: "The complete reflection you confirmed as true.",
      sections: [
        { heading: "Recognition", body: bundle.mirror.recognition },
        { heading: "Current chapter", body: bundle.essence.currentChapter },
        { heading: "Strengths", body: bundle.essence.strengths.join(" · ") },
        { heading: "Zone of genius", body: bundle.essence.zoneOfGenius },
        { heading: "Shadows", body: bundle.essence.shadows.join(" · ") },
        { heading: "Decision compass", body: bundle.essence.decisionCompass },
        { heading: "Natural contribution", body: bundle.essence.naturalContribution },
        { heading: "Growth edge", body: bundle.essence.growthEdge },
      ],
      returningSentence: bundle.mirror.returningSentence,
      evidence: citations(bundle, "mirror"),
    },
    brandSoul: {
      kind: "brand_soul" as const,
      title: "Brand Expression Guide",
      subtitle: "A practical translation of your confirmed Brand Soul.",
      sections: [
        { heading: "Positioning", body: bundle.essence.coreTruth },
        { heading: "Audience", body: bundle.essence.peoplePortrait },
        { heading: "Messaging", body: `${bundle.mirror.returningSentence} ${bundle.mirror.recognition}` },
        { heading: "Visual language", body: bundle.visualDirection.atmosphere },
        { heading: "Creative direction", body: `${bundle.visualDirection.compositionPrinciples.join(" ")} ${bundle.visualDirection.photographicDirection}` },
      ],
      voiceQualities: bundle.essence.voiceQualities,
      evidence: citations(bundle, "brand_soul"),
    },
    visualDirection: {
      kind: "visual_direction" as const,
      title: "Shoot Mood Board",
      mode: moodBoard.mode,
      modeLabel: moodBoard.mode === "project" ? "Project Mood Board" : "Brand Mood Board",
      subtitle: moodBoard.mode === "project"
        ? "A project-specific visual execution grounded in your confirmed Brand Soul and Brand Expression Guide."
        : "Your timeless visual world, translated from your confirmed Brand Soul and Brand Expression Guide.",
      identityAnchor: bundle.mirror.returningSentence,
      projectBrief: moodBoard.mode === "project" ? projectBrief : undefined,
      atmosphere: `${bundle.visualDirection.atmosphere}${moodBoard.mode === "project" ? projectSuffix : " Keep this visual language timeless rather than campaign-specific."}`,
      palette: bundle.visualDirection.colorIntentions.map((intention, index) => ({
        name: intention,
        hex: resolveSemanticColor(intention, index),
        rationale: `Selected to carry the confirmed cue: “${intention}”.`,
        sourceTurn: sourceTurn(index),
      })),
      materialCues: [...bundle.visualDirection.materialCues, ...(moodBoard.mode === "project" ? [projectBrief.clothingIdeas, projectBrief.location].filter((value): value is string => Boolean(value)) : [])],
      typography: {
        display: "A restrained editorial serif",
        body: "A quiet humanist sans serif",
        rationale: `The contrast supports a voice that is ${bundle.essence.voiceQualities.join(", ")} without turning it into a costume.`,
        sourceTurn: sourceTurn(1),
      },
      compositionPrinciples: bundle.visualDirection.compositionPrinciples.map((text, index) => ({ text, sourceTurn: sourceTurn(index) })),
      photographicDirection: { body: `${bundle.visualDirection.photographicDirection}${moodBoard.mode === "project" ? projectSuffix : ""}`, sourceTurn: sourceTurn(2) },
      shootList: [
        ...bundle.visualDirection.materialCues.map((cue, index) =>
          ({ text: `Create one restrained frame around ${cue}; keep the subject unperformed and preserve ${bundle.visualDirection.compositionPrinciples[index % bundle.visualDirection.compositionPrinciples.length]}.`, sourceTurn: sourceTurn(index) }),
        ),
        ...(moodBoard.mode === "project" && projectBrief.purpose
          ? [{ text: `Create one defining frame that communicates ${projectBrief.purpose} without changing the person’s established visual identity.`, sourceTurn: sourceTurn(0) }]
          : []),
        ...(moodBoard.mode === "project" && projectBrief.platform
          ? [{ text: `Include a composition designed for ${projectBrief.platform}, retaining the same palette, atmosphere, and unperformed presence.`, sourceTurn: sourceTurn(1) }]
          : []),
      ],
      websiteDirection: { body: `Let ${bundle.visualDirection.compositionPrinciples[0]} lead the page. Use generous pauses, one clear idea per section, and let the returning sentence act as the visual anchor.`, sourceTurn: sourceTurn(0) },
      logoDirection: { body: `Begin with a wordmark before a symbol. Its job is to hold “${bundle.mirror.returningSentence}” quietly, not explain the whole brand.`, sourceTurn: sourceTurn(1) },
      evidence: visualEvidence,
    },
  };
}

export type MiraV3Deliverables = ReturnType<typeof buildDeliverables>;
