import { createHash } from "node:crypto";
import type { MiraLevel2Synthesis } from "./level2";
import {
  MARIA_VISUAL_PROMPT_VERSION,
  MARIA_VISUAL_STYLE_VERSION,
  applyMariaLevel2CreateStyleLayer,
} from "./mariaVisualStyle";

export const MIRA_LEVEL2_CREATE_VERSION = "mira-level2-create-v1";

export type CreateFrame = {
  id: string;
  number: number;
  title: string;
  narrativeRole: string;
  visualDirection: string;
  shotPlan: {
    purpose: string;
    framing: string;
    bodyPosition: string;
    gestureAction: string;
    expression: string;
    gaze: string;
    movement: string;
    environmentUse: string;
    stylingTreatment: string;
    composition: string;
  };
  prompt: string;
};

export type MiraLevel2CreateDirection = {
  schemaVersion: typeof MIRA_LEVEL2_CREATE_VERSION;
  title: string;
  creativeDirection: string;
  rationale: string;
  confidence: "low" | "medium" | "high";
  shootContext: MiraLevel2Synthesis["createHandoff"]["shootContext"];
  campaignLanguage: {
    colour: string[];
    light: string;
    styling: string;
    composition: string;
    location: string;
    materials: string;
    movement: string;
    atmosphere: string;
  };
  continuityRules: string[];
  mustInclude: string[];
  avoid: string[];
  frames: CreateFrame[];
  evidenceUsed: string[];
  personalReference: MiraLevel2Synthesis["createHandoff"]["personalReference"];
  mariaStyle: { connected: true; styleVersion: string; promptVersion: string };
  imageStatus: "structured_prompts" | "generating" | "partially_generated" | "generated";
  sourceFingerprint: string;
};

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value))));
}

function titleCase(value: string) {
  return value.split(/\s+/).filter(Boolean).map(word => word[0]?.toUpperCase() + word.slice(1)).join(" ");
}

function generationTitle(synthesis: MiraLevel2Synthesis) {
  const handoff = synthesis.createHandoff;
  const tension = handoff.brandContext.coreTension
    .replace(/^Protect:\s*/i, "")
    .replace(/^You do not need to choose between\s+/i, "")
    .replace(/\.\s.*$/, "")
    .replace(/\band\b/i, "Meets");
  const purpose = handoff.shootContext?.shootPurpose?.replace(/\b(campaign|shoot|content)\b/gi, "").trim();
  const theme = [tension, purpose].filter(Boolean).join(" — ")
    .replace(/[.?!,:;]/g, "")
    .split(/\s+/).slice(0, 6).join(" ");
  return titleCase(theme) || "The Campaign World";
}

function editorialTitle(synthesis: MiraLevel2Synthesis) {
  const preferred = synthesis.createHandoff.visualEvidence.preferredDimensions;
  const selected = (dimension: string) => preferred.find(item => item.dimension === dimension)?.value.toLowerCase();
  const environment = selected("environment");
  const movement = selected("movement");
  const finish = selected("finish");
  const tension = synthesis.createHandoff.brandContext.coreTension.toLowerCase();
  if (environment === "organic" && tension.includes("precis")) return "Living Precision";
  if (environment === "architectural" && movement === "still") return "Precision in Stillness";
  if (movement === "dynamic") return finish === "raw" ? "Unfinished Momentum" : "Movement, Resolved";
  if (environment === "organic") return "The Living World";
  if (environment === "architectural") return "Space Holds the Story";
  return "A World With Intent";
}

export function compileLevel2CreateDirection(synthesis: MiraLevel2Synthesis): MiraLevel2CreateDirection {
  const handoff = synthesis.createHandoff;
  const visual = handoff.visualDirection;
  const mustInclude = unique([
    ...handoff.creativeRules.mustHave,
    ...handoff.visualEvidence.referenceSignals,
  ]).slice(0, 10);
  const avoid = unique([
    ...handoff.creativeRules.avoid,
    ...handoff.visualEvidence.rejectedPatterns,
  ]).slice(0, 10);
  const title = editorialTitle(synthesis);
  const promptTitle = generationTitle(synthesis);
  const colour = unique([
    ...handoff.visualEvidence.preferredDimensions
      .filter(item => /colou?r|palette|saturation|tone/i.test(item.dimension))
      .map(item => item.value),
    visual.colourDirection,
  ]);
  const continuityRules = [
    "One photographer, one recognizable subject or casting logic, one location world and one coordinated styling system across all five frames.",
    "Lock subject identity, colour treatment, grading, wardrobe language, lighting logic and overall emotional world; deliberately vary expression, gaze, head angle, body position, gesture, crop and camera distance between frames.",
    "Every frame must feel captured during the same editorial production, never assembled from unrelated inspiration images.",
    "Adjacent frames must have visibly different photographic purposes and cannot repeat the same pose, facial expression, head position, gaze direction or exact outfit treatment.",
  ];
  const personalReference = handoff.personalReference ?? {
    provided: false,
    imageId: null,
    purpose: "subject_identity_reference" as const,
  };
  const selectedDimension = (dimension: string) => handoff.visualEvidence.preferredDimensions
    .find(item => item.dimension === dimension)?.value.toLowerCase();
  const intimate = selectedDimension("proximity") === "intimate";
  const organic = selectedDimension("environment") === "organic";
  const dynamic = selectedDimension("movement") === "dynamic";
  const layered = selectedDimension("density") === "layered";
  const raw = selectedDimension("finish") === "raw";
  const graphic = selectedDimension("light") === "graphic";
  const architectural = selectedDimension("environment") === "architectural";
  const polished = selectedDimension("finish") === "polished";
  const concreteColour = organic
    ? ["warm ivory", "tobacco brown", "muted olive", "deep earth — across wardrobe, environment and small accents"]
    : architectural
      ? ["soft stone", "charcoal", "warm white", "one restrained rust accent — led by environment and tailoring"]
      : ["warm neutral base", "one deep grounding tone", "one muted accent — consistent across the full visual world"];
  const concreteLocation = organic
    ? "Choose one of these connected worlds: a lived-in plaster interior with warm wood; a weathered garden or courtyard; or an old street with textured façades and minimal signage."
    : architectural
      ? "Choose one of these connected worlds: a quiet modernist interior with warm stone; a concrete gallery with strong thresholds; or a restrained civic exterior with repeated lines and open space."
      : "Choose one specific, uncluttered environment whose materials and architecture express the business rather than a generic studio backdrop.";
  const concreteStyling = raw || organic
    ? "Build one coordinated wardrobe system from tactile natural fabrics and softly structured tailoring; vary it purposefully through layering, sleeve treatment, accessory or a secondary coordinated piece rather than repeating one identical linen look."
    : polished || architectural
      ? "Use a restrained coordinated wardrobe system with matte tailoring, a clean knit or crisp natural fabric; vary jacket, layer or one minimal accessory across the sequence without looking corporate."
      : "Use one coherent wardrobe story combining a clean silhouette with tactile natural material; vary styling treatment or one coordinated layer across frames without introducing unrelated looks.";
  const concreteLight = graphic
    ? "Use one hard directional source, like low sun through a window or a focused studio light, to cast clean-edged geometric shadows across the subject and architecture; keep fill minimal but preserve face detail."
    : "Use broad window light or a large diffused source close to the subject, with soft shadow edges, gentle falloff and enough reflected fill to keep skin and materials open.";

  const work = handoff.brandContext.work ?? "the user's confirmed work and offer";
  const frameSeeds = [
    {
      title: "The world opens",
      shotPlan: {
        purpose: "Establish the campaign world and show why this environment belongs to the subject's work.",
        framing: "Wide environmental portrait; full or three-quarter body with meaningful space around the subject.",
        bodyPosition: dynamic ? "Body entering or crossing the space on a diagonal." : "Body grounded within the architecture, weight clearly placed rather than front-on.",
        gestureAction: `Subject actively arriving into or orienting within the world of ${work}; use one credible business-relevant object or spatial cue only if natural.`,
        expression: "Alert, open presence with the face secondary to the wider story.",
        gaze: "Gaze into the environment or toward an off-camera point, not straight into lens.",
        movement: dynamic ? "Visible forward movement with responsive fabric and a stable readable face." : "Quiet bodily transition settling into the space.",
        environmentUse: "Environment occupies most of the frame and establishes material, scale and location logic.",
        stylingTreatment: "Base campaign look shown in full silhouette; outer layer worn or styling most complete here.",
        composition: layered ? "Layer foreground, subject and background with a clear visual path." : "Use scale and negative space to establish the world cleanly.",
      },
      narrativeRole: organic
        ? "Enter through the lived texture and irregular rhythms of the organic location, with the subject already embedded in its atmosphere."
        : "Establish the architectural geometry, scale and controlled spatial order, placing the subject deliberately within its lines.",
      visualDirection: `${visual.environmentDirection} ${visual.compositionDirection}`,
    },
    {
      title: intimate ? "Presence, closer" : "Subject within space",
      shotPlan: {
        purpose: "Establish recognizable identity and a more personal relationship with the audience.",
        framing: intimate ? "Close portrait at face-and-shoulders or chest-up distance." : "Medium environmental portrait with face clearly readable.",
        bodyPosition: "Torso turned away from the establishing-frame axis; head returns on a different angle.",
        gestureAction: "A small natural hand adjustment or resting gesture, never the establishing-frame action.",
        expression: "Direct and assured but human; a responsive expression rather than a blank neutral face.",
        gaze: "Clear gaze into lens to create the campaign's strongest moment of personal recognition.",
        movement: "Still enough for identity clarity, with subtle breath and micro-gesture rather than a frozen pose.",
        environmentUse: "Location becomes contextual texture or geometry behind the face, not the dominant subject.",
        stylingTreatment: "Remove, open or reposition one outer layer/accessory while preserving the same wardrobe language.",
        composition: "Face-led composition with a different head angle and crop from every other frame.",
      },
      narrativeRole: intimate
        ? "Move into personal distance so face, hands and material detail register as immediate human presence."
        : "Keep enough distance to show how the subject inhabits and is shaped by the complete environment.",
      visualDirection: `${visual.intimacyDistance} ${visual.lightingDirection}`,
    },
    {
      title: dynamic ? "The living gesture" : "Held tension",
      shotPlan: {
        purpose: "Show the subject doing, communicating or moving in a way that makes the specific business credible.",
        framing: "Medium-to-wide action frame with hands and body mechanics visible.",
        bodyPosition: dynamic ? "Body in asymmetric mid-action—turning, walking, reaching or demonstrating." : "Body held in a deliberate side-on or three-quarter stance with active posture.",
        gestureAction: `Perform one believable action connected to ${work}: working, explaining, handling a relevant material, speaking or moving between tasks—choose what fits the brief, never generic laptop stock imagery.`,
        expression: dynamic ? "Engaged and alive, caught mid-response or mid-conversation." : "Focused concentration with restrained tension rather than the portrait expression.",
        gaze: "Gaze follows the action, another person or relevant object; do not look into lens.",
        movement: dynamic ? "Peak living gesture with visible directional energy." : "Controlled minimal action whose tension comes from posture and hands.",
        environmentUse: "Use a functional zone of the same location so space participates in the action.",
        stylingTreatment: "Sleeves, jacket or layer adjusted for action; keep palette/material coherence while changing the silhouette read.",
        composition: "Action creates a directional line across the frame and differs clearly from frames 01 and 02.",
      },
      narrativeRole: dynamic
        ? "Capture a real action in progress, with body, fabric and camera response making the campaign visibly alive rather than posed."
        : "Hold the subject in deliberate stillness and let posture, gaze, light geometry and spatial tension carry the moment.",
      visualDirection: `${visual.movementDirection} ${visual.stylingDirection}`,
    },
    {
      title: layered ? "Material layers" : "Essential detail",
      shotPlan: {
        purpose: "Create the unexpected editorial beat through detail, perspective, material interaction or visual tension.",
        framing: "Tight crop or unconventional close detail; hands, profile, partial figure or material relationship may lead.",
        bodyPosition: "Use a profile, cropped turn, seated shift or partially obscured body—not the prior standing orientation.",
        gestureAction: "Interact with one meaningful surface, tool, garment detail or environmental material in a precise non-literal way.",
        expression: "Reflective or observational; expression may be partially seen but must not repeat the direct portrait beat.",
        gaze: "Look away, down, or toward the material interaction.",
        movement: "Small tactile movement or suspended gesture at the decisive moment.",
        environmentUse: "Bring foreground material or architecture close to lens for depth, crop or tension.",
        stylingTreatment: "Feature a different material, accessory detail or layer configuration from the previous frames.",
        composition: layered ? "Use overlap, foreground interruption and an off-centre crop with controlled hierarchy." : "Use radical negative space or a precise crop around one essential detail.",
      },
      narrativeRole: layered
        ? "Move through overlapping foreground, body, object and surface detail so the frame rewards discovery without losing hierarchy."
        : "Isolate one exact material, gesture or architectural junction against clear negative space.",
      visualDirection: `${visual.textureMaterialDirection} ${visual.photographicLanguage}`,
    },
    {
      title: raw ? "An open ending" : "The resolved image",
      shotPlan: {
        purpose: "Close the campaign with a signature emotional beat that feels conclusive but not repetitive.",
        framing: "Distinct hero framing—three-quarter, seated full figure or strong asymmetrical medium-wide—different from the close portrait.",
        bodyPosition: raw ? "Body relaxing out of action, weight released and posture imperfectly alive." : "Body composed into a strong final silhouette with a new angle to camera.",
        gestureAction: raw ? "Capture the breath after action, a quiet release or transition away." : "Hold one intentional signature gesture that resolves the campaign's central tension.",
        expression: raw ? "Relaxed, reflective or a subtle unguarded smile as the story releases." : "Calm conviction with a distinct emotional register from the direct portrait and action frame.",
        gaze: raw ? "Gaze just past camera or downward in an observed closing moment." : "Gaze may meet lens or hold off-camera, whichever contrasts frame 02 most clearly.",
        movement: raw ? "Residual motion settling into stillness." : "Resolved stillness after the preceding variation.",
        environmentUse: "Return to the established world from a new zone or camera axis so the ending echoes without duplicating frame 01.",
        stylingTreatment: "Resolve with a coordinated secondary look or final layer configuration; no arbitrary costume change.",
        composition: "Create a decisive final silhouette and emotional cadence not used in any earlier frame.",
      },
      narrativeRole: raw
        ? "Close on an imperfect, breathing moment that feels observed just before or after the expected hero pose."
        : "Resolve the story in one exact, controlled hero composition where every line, surface and gesture feels intentional.",
      visualDirection: `${visual.emotionalRegister} ${visual.compositionDirection}`,
    },
  ];

  const frames = frameSeeds.map((frame, index): CreateFrame => {
    const prompt = [
      `Create frame ${index + 1} of 5 from one coherent editorial photoshoot titled “${promptTitle}”.`,
      `CREATIVE DIRECTION: ${synthesis.createPreparation.direction}`,
      `BUSINESS: ${handoff.brandContext.work ?? "the user's confirmed work and offer"}.`,
      `AUDIENCE: ${handoff.brandContext.audience ?? "the people this work is meant to reach"}.`,
      `SHOOT PURPOSE: ${handoff.shootContext?.shootPurpose ?? "one focused editorial brand shoot"}.`,
      `OBJECTIVE: ${handoff.shootContext?.objective?.join(", ") || "make the confirmed brand direction visible"}.`,
      "Make the photographed action, setting, styling and objects communicate this specific business and audience without becoming literal stock imagery.",
      `ATMOSPHERE: ${visual.emotionalRegister}.`,
      `COLOUR: ${concreteColour.join(" / ")}.`,
      `LIGHT: ${concreteLight}.`,
      `STYLING: ${concreteStyling}.`,
      `LOCATION: ${concreteLocation}.`,
      `COMPOSITION: ${visual.compositionDirection}; ${visual.intimacyDistance}.`,
      `MOVEMENT: ${visual.movementDirection}.`,
      `MATERIALS: ${visual.textureMaterialDirection}.`,
      `SHOT PURPOSE: ${frame.shotPlan.purpose}`,
      `FRAMING / CAMERA DISTANCE: ${frame.shotPlan.framing}`,
      `BODY POSITION: ${frame.shotPlan.bodyPosition}`,
      `GESTURE / ACTION: ${frame.shotPlan.gestureAction}`,
      `FACIAL EXPRESSION: ${frame.shotPlan.expression}`,
      `GAZE DIRECTION: ${frame.shotPlan.gaze}`,
      `FRAME MOVEMENT LEVEL: ${frame.shotPlan.movement}`,
      `ENVIRONMENT USE: ${frame.shotPlan.environmentUse}`,
      `FRAME STYLING TREATMENT: ${frame.shotPlan.stylingTreatment}`,
      `FRAME COMPOSITION: ${frame.shotPlan.composition}`,
      `FRAME ROLE: ${frame.narrativeRole}`,
      `FRAME DIRECTION: ${frame.visualDirection}`,
      `LOCKED CONTINUITY: ${continuityRules.join(" ")}`,
      `MUST INCLUDE: ${mustInclude.join("; ") || "the confirmed visual direction"}.`,
      `AVOID: ${avoid.join("; ") || "generic brand imagery"}.`,
      personalReference.provided
        ? "PERSONAL REFERENCE: use the separately supplied personal photo only to ground visible subject identity and appearance. Do not infer personality, psychology, health, attractiveness, behaviour or other sensitive traits from it, and do not copy its pose, expression or composition."
        : "PERSONAL REFERENCE: none supplied; follow the confirmed casting and campaign direction without inventing claims about the user.",
      "Photographic image only. No text, logos, captions, borders, collage treatment or watermark.",
    ].join("\n");
    return {
      id: `frame_${index + 1}`,
      number: index + 1,
      title: frame.title,
      narrativeRole: frame.narrativeRole,
      visualDirection: frame.visualDirection,
      shotPlan: frame.shotPlan,
      prompt: applyMariaLevel2CreateStyleLayer({ prompt, sceneIndex: index, mustInclude, avoid }),
    };
  });

  const sourceFingerprint = createHash("sha256").update(JSON.stringify({
    version: MIRA_LEVEL2_CREATE_VERSION,
    title: promptTitle,
    campaignLanguage: {
      colour: concreteColour,
      light: concreteLight,
      styling: concreteStyling,
      composition: `${visual.compositionDirection} ${visual.intimacyDistance}`,
      location: concreteLocation,
      materials: visual.textureMaterialDirection,
      movement: visual.movementDirection,
      atmosphere: visual.emotionalRegister,
    },
    continuityRules,
    mustInclude,
    avoid,
    personalReference,
    frames,
  })).digest("hex");

  return {
    schemaVersion: MIRA_LEVEL2_CREATE_VERSION,
    title,
    creativeDirection: synthesis.createPreparation.direction,
    rationale: handoff.createHandoff.rationale,
    confidence: handoff.createHandoff.confidence,
    shootContext: handoff.shootContext,
    campaignLanguage: {
      colour: concreteColour,
      light: concreteLight,
      styling: concreteStyling,
      composition: `${visual.compositionDirection} ${visual.intimacyDistance}`,
      location: concreteLocation,
      materials: visual.textureMaterialDirection,
      movement: visual.movementDirection,
      atmosphere: visual.emotionalRegister,
    },
    continuityRules,
    mustInclude,
    avoid,
    frames,
    evidenceUsed: handoff.createHandoff.strongestEvidence,
    personalReference,
    mariaStyle: { connected: true, styleVersion: MARIA_VISUAL_STYLE_VERSION, promptVersion: MARIA_VISUAL_PROMPT_VERSION },
    imageStatus: "structured_prompts",
    sourceFingerprint,
  };
}
