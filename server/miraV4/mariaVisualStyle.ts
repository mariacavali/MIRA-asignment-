import { createHash } from "node:crypto";
import type { MiraV4CampaignPlan } from "../../shared/miraV4CampaignPlan";
import type { MiraV4CreativeDna } from "../../shared/miraV4CreativeDna";

/**
 * TypeScript runtime adapter for the user-supplied authoritative source:
 * `server/miraV4/authoritative/maria_visual_style.py`.
 *
 * The source file is preserved verbatim for traceability. This adapter keeps its
 * creative principles, grammar, experience library, versioning, and continuity
 * rules intact while making them available in the Node production runtime.
 */
export const MARIA_VISUAL_STYLE_VERSION = "maria-visual-style-v1.0";
export const MARIA_VISUAL_PROMPT_VERSION = "mira-moodboard-maria-style-v1.0";
export const MARIA_VISUAL_STYLE_SOURCE = "server/miraV4/authoritative/maria_visual_style.py";

const principles = [
  "Beauty without meaning is decoration.",
  "Begin with the human truth, never with an aesthetic trend.",
  "Every visual decision must express one clear idea.",
  "Use one dominant metaphor rather than many decorative symbols.",
  "Suggest enough for the viewer to complete the story; do not explain everything.",
  "Story comes before a fully visible face.",
  "The subject should inhabit a moment, not merely pose for a portrait.",
  "Every image should feel like a frame from a film with a before and an after.",
  "Ordinary life may become editorial through precise seeing, styling and composition.",
  "Confidence is calm, spacious and self-possessed, never aggressive or performative.",
  "Fashion supports identity and story; it must never become empty display.",
  "Use physical phenomena as storytelling devices: light, shadow, wind, water, glass, reflection, projection and motion.",
  "Preserve believable reality and introduce at most one impossible or surreal element when enchantment is needed.",
  "Maintain emotional precision, editorial restraint and visual curiosity.",
  "A five-image Moodboard is one campaign story, not five unrelated beautiful images.",
] as const;

const narrativeRules = [
  "cinematic moment",
  "visual sentence",
  "one meaningful action",
  "partial revelation",
  "viewer completes the story",
  "emotional continuity across scenes",
] as const;

const compositionRules = [
  "intentional negative space",
  "unexpected but controlled crop",
  "asymmetrical yet stable framing",
  "symmetry only when it communicates certainty, alignment or self-possession",
  "environmental framing through architecture, windows, cars, glass or foreground objects",
  "close detail balanced with wider contextual frames",
  "story-first sequencing",
] as const;

const subjectTreatmentRules = [
  "relaxed self-possession",
  "expressive eyes when the face is visible",
  "strong body language without forced power posing",
  "natural elegance",
  "presence over performance",
  "the subject engaged in a meaningful moment",
  "faces may be obscured, reflected, cropped or secondary when the story benefits",
] as const;

const lightRules = [
  "light used as narrative, not merely illumination",
  "window light",
  "hard geometric shadow",
  "soft directional light",
  "projection",
  "silhouette",
  "reflected light",
  "late-afternoon or cinematic ambient light",
] as const;

const physicalPhenomena = [
  "wind",
  "water",
  "shadow",
  "reflection",
  "glass and refraction",
  "projection",
  "smoke or mist",
  "motion blur",
  "silhouette",
  "negative space",
] as const;

const stylingRules = [
  "editorial but human",
  "fashion used as meaning",
  "tailoring contrasted with softness",
  "styled simplicity",
  "bare feet or one unpolished detail when it adds humanity",
  "unexpected prop with narrative purpose",
  "ordinary setting elevated into a set",
] as const;

const textureRules = [
  "linen", "silk", "paper", "glass", "water", "stone", "wood",
  "concrete", "leather", "smoke", "weathered metal", "natural skin",
] as const;

const colourRules = [
  "colour must carry emotional meaning",
  "prefer a disciplined palette with one intentional accent",
  "red may signal courage, life force, feminine power or danger",
  "deep blue may signal mystery, intelligence, distance or calm",
  "black may signal depth, restraint and self-possession",
  "warm neutrals may signal intimacy, groundedness and quiet elegance",
  "avoid random brightness or trend palettes disconnected from the story",
] as const;

const sceneRoles = [
  "Opening world — establish the emotional and visual universe.",
  "Presence — reveal the subject's energy, styling and body language.",
  "Meaning — express the central human truth through one metaphor or visual sentence.",
  "Environment or detail — deepen the story through architecture, material, object, texture or intimate observation.",
  "Closing movement — leave transformation, invitation or an unresolved cinematic after-feeling.",
] as const;

const requiredContinuity = [
  "one coherent editorial campaign",
  "same production world",
  "consistent subject/casting treatment where relevant",
  "locked colour grammar",
  "locked lighting language",
  "locked styling language",
  "locked environment or architecture",
  "locked material and texture family",
  "locked emotional register",
  "no unrelated visual styles between scenes",
] as const;

const signatureAvoid = [
  "generic luxury",
  "boss-babe clichés",
  "stock photography",
  "therapy-app aesthetics",
  "random Pinterest collage",
  "obvious symbolism",
  "over-explained concepts",
  "trend-led styling without meaning",
  "visual clutter",
  "forced confidence",
  "perfect but emotionally empty imagery",
] as const;

type ExperienceProfile = {
  definition: string;
  visualMeaning: readonly string[];
  preferredDevices: readonly string[];
  avoid: readonly string[];
};

const experienceLibrary: Record<string, ExperienceProfile> = {
  "Quiet Authority": {
    definition: "Calm power that does not need to prove itself.",
    visualMeaning: ["self-possession", "clarity", "competence", "emotional steadiness"],
    preferredDevices: ["restrained tailoring", "architectural framing", "clean negative space", "stable posture", "minimal symbolic prop"],
    avoid: ["corporate headshot", "arms-crossed stock pose", "status luxury"],
  },
  Freedom: {
    definition: "Expansion beyond restriction; the body and world open outward.",
    visualMeaning: ["release", "possibility", "movement", "permission", "openness"],
    preferredDevices: ["wind through hair or fabric", "open arms", "wide sky, road, sea or rooftop", "unexpected angles", "fences or walls dissolving"],
    avoid: ["tourism cliché", "generic beach happiness", "escape without meaning"],
  },
  Enchantment: {
    definition: "Believable reality touched by one impossible, magical element.",
    visualMeaning: ["awe", "wonder", "possibility", "the world feels alive"],
    preferredDevices: ["giant moon", "portal", "glowing light", "floating", "enchanted nature", "cosmic scale"],
    avoid: ["fantasy costume", "dragons", "unicorn cliché", "multiple competing surreal effects"],
  },
  Connection: {
    definition: "Alignment without losing individuality.",
    visualMeaning: ["belonging", "recognition", "shared rhythm", "emotional safety"],
    preferredDevices: ["touch", "pattern alignment", "mirrored gesture", "shared movement", "proximity without posing"],
    avoid: ["posed group portrait", "forced romance", "performative togetherness"],
  },
  Transformation: {
    definition: "The version already inside begins to become visible.",
    visualMeaning: ["becoming", "integration", "awakening", "inner expansion"],
    preferredDevices: ["threshold", "light emerging from within", "reflection", "layers", "reconstruction", "nature through cracks", "motion blur"],
    avoid: ["makeover before-and-after", "literal butterfly overload", "broken-person narrative"],
  },
  Calling: {
    definition: "A quiet inner knowing that life has a direction worth following.",
    visualMeaning: ["soul mission", "guidance", "intuition", "service", "divine timing"],
    preferredDevices: ["path", "threshold", "light in heart or hands", "receiving signal", "hourglass", "one person moving against the crowd"],
    avoid: ["achievement trophy", "hustle imagery", "literal destiny text"],
  },
  Mystery: {
    definition: "An invitation to discover what remains hidden.",
    visualMeaning: ["curiosity", "selective visibility", "unknown depth", "secret knowledge"],
    preferredDevices: ["door", "key", "mask", "partial face", "shadow", "glass", "book or archive"],
    avoid: ["horror", "threat", "opaque darkness with no invitation"],
  },
  Playfulness: {
    definition: "Permission to be delightfully imperfect and creatively alive.",
    visualMeaning: ["joy", "curiosity", "spontaneity", "rule-breaking", "humour"],
    preferredDevices: ["genuine laughter", "unexpected gesture", "fashion with wit", "unusual use of an ordinary object", "movement"],
    avoid: ["childish styling", "forced comedy", "loud novelty for attention"],
  },
  Resilience: {
    definition: "Life may bend the person, but growth quietly continues.",
    visualMeaning: ["continuation", "adaptation", "healing", "soft strength"],
    preferredDevices: ["flower through concrete", "tree through stone", "golden repair", "carrying weight gracefully", "walking toward light"],
    avoid: ["battle imagery", "victory pose", "aggression", "trauma spectacle"],
  },
  Being: {
    definition: "Nothing needs to change for this moment to be complete.",
    visualMeaning: ["presence", "self-return", "timelessness", "union with nature"],
    preferredDevices: ["still observation", "water", "open sky", "hand on heart", "suspended time", "simple natural gesture"],
    avoid: ["wellness stock image", "guided meditation cliché", "empty passivity"],
  },
  "Leap of Faith": {
    definition: "Moving before certainty exists because the inner yes is stronger.",
    visualMeaning: ["courage", "trust", "risk", "threshold", "heart before proof"],
    preferredDevices: ["crossing a gap", "approaching the unknown", "edge used carefully", "open door", "step into light"],
    avoid: ["recklessness", "sports victory", "battle bravery"],
  },
  "Creative Flow": {
    definition: "Inspiration moves through the person and becomes something new.",
    visualMeaning: ["receiving", "embodied creation", "imagination", "world-making"],
    preferredDevices: ["beam of light", "hands holding energy", "halo or moon", "painting the world", "water and feminine movement", "idea becoming tangible"],
    avoid: ["generic artist-at-desk", "productivity imagery", "random sparkles without meaning"],
  },
};

export type CompiledMariaVisualDirection = {
  styleVersion: string;
  promptVersion: string;
  signature: string;
  selectedExperiences: string[];
  experienceDirection: Array<{ name: string; definition: string; visualMeaning: readonly string[]; preferredDevices: readonly string[]; avoid: readonly string[] }>;
  principles: readonly string[];
  narrativeRules: readonly string[];
  compositionRules: readonly string[];
  subjectTreatmentRules: readonly string[];
  lightRules: readonly string[];
  stylingRules: readonly string[];
  physicalPhenomena: readonly string[];
  textureRules: readonly string[];
  colourRules: readonly string[];
  sceneRoles: readonly string[];
  requiredContinuity: readonly string[];
  mustInclude: string[];
  avoid: string[];
  inspirationHandling: string;
  sourceFingerprint: string;
};

function cleanStrings(values: readonly string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = value.trim();
    const key = text.toLocaleLowerCase();
    if (text && !seen.has(key)) {
      seen.add(key);
      result.push(text);
    }
  }
  return result;
}

function extractHumanExperiences(creativeDna: MiraV4CreativeDna) {
  const available = new Map(Object.keys(experienceLibrary).map(label => [label.toLocaleLowerCase(), label]));
  const candidates = cleanStrings([
    ...creativeDna.creativeEssence.energy,
    ...creativeDna.creativeEssence.atmosphere,
    ...creativeDna.creativeDirection.keywords,
    ...creativeDna.renderTokens.mood,
    creativeDna.creativeEssence.emotionalSignature,
    creativeDna.creativeEssence.desiredImpact,
    creativeDna.identity.becomingIdentity,
  ]);
  return candidates
    .map(value => available.get(value.toLocaleLowerCase()))
    .filter((value): value is string => Boolean(value))
    .slice(0, 5);
}

function mapCreativeDnaForMaria(creativeDna: MiraV4CreativeDna) {
  return {
    identity: {
      core: creativeDna.identity.coreValues,
      tensions: creativeDna.identity.coreTensions,
      becoming: creativeDna.identity.becomingIdentity,
    },
    creativeEssence: creativeDna.creativeEssence,
    creativeDirection: creativeDna.creativeDirection,
    visualWorld: creativeDna.visualWorld,
    creativeRules: creativeDna.creativeDirection.creativeRules,
    creativeBoundaries: creativeDna.identity.creativeBoundaries,
    implementationHints: creativeDna.implementationHints,
    renderTokens: creativeDna.renderTokens,
    inspiration: {
      influenceRule: creativeDna.inspiration.influenceRule,
      userExplanation: creativeDna.inspiration.userExplanation,
    },
  };
}

function bullets(values: readonly string[]) {
  return values.map(value => `- ${value}`).join("\n");
}

export function compileMariaVisualDirection(params: {
  creativeDna: MiraV4CreativeDna;
  campaignPlan: MiraV4CampaignPlan;
}) : CompiledMariaVisualDirection {
  const { creativeDna, campaignPlan } = params;
  const selectedExperiences = extractHumanExperiences(creativeDna);
  const experienceDirection = selectedExperiences.map(name => ({ name, ...experienceLibrary[name] }));
  const inspirationHandling = creativeDna.inspiration.userExplanation
    ? `Interpretive evidence only: use the customer's stated inspiration meaning for emotional, tonal, material, or compositional logic. Do not reproduce literal people, objects, scenes, poses, or composition from the source image. ${creativeDna.inspiration.userExplanation}`
    : "No explicit inspiration explanation was supplied; follow the Creative DNA and Campaign Plan only.";
  const mustInclude = cleanStrings([
    ...campaignPlan.overallConsistencyRules.mustInclude,
    ...creativeDna.creativeDirection.creativeRules.mustInclude,
    campaignPlan.creativeThesis,
    inspirationHandling,
  ]);
  const avoid = cleanStrings([
    ...signatureAvoid,
    ...campaignPlan.overallConsistencyRules.avoid,
    ...creativeDna.creativeDirection.creativeRules.avoid,
    ...creativeDna.identity.creativeBoundaries,
  ]);
  const mappedCreativeDna = mapCreativeDnaForMaria(creativeDna);
  const sourceFingerprint = createHash("sha256")
    .update(JSON.stringify({
      styleVersion: MARIA_VISUAL_STYLE_VERSION,
      promptVersion: MARIA_VISUAL_PROMPT_VERSION,
      creativeDna: mappedCreativeDna,
      selectedExperiences,
      mustInclude,
      avoid,
    }))
    .digest("hex");

  return {
    styleVersion: MARIA_VISUAL_STYLE_VERSION,
    promptVersion: MARIA_VISUAL_PROMPT_VERSION,
    signature: "Unexpected symbolism with emotional precision.",
    selectedExperiences,
    experienceDirection,
    principles,
    narrativeRules,
    compositionRules,
    subjectTreatmentRules,
    lightRules,
    stylingRules,
    physicalPhenomena,
    textureRules,
    colourRules,
    sceneRoles,
    requiredContinuity,
    mustInclude,
    avoid,
    inspirationHandling,
    sourceFingerprint,
  };
}

export function applyAuthoritativeMariaVisualStyleLayer(params: {
  prompt: string;
  direction: CompiledMariaVisualDirection;
  sceneIndex: number;
}) {
  const { prompt, direction, sceneIndex } = params;
  const experienceLines = direction.experienceDirection.length
    ? direction.experienceDirection.map(experience => `- ${experience.name}: ${experience.definition} Preferred devices: ${experience.preferredDevices.join(", ")}. Avoid: ${experience.avoid.join(", ")}.`).join("\n")
    : "- Do not force a Human Experience label. Follow the Creative DNA evidence.";
  return [
    "AUTHORITATIVE MARIA VISUAL-DIRECTION LAYER",
    `SOURCE OF TRUTH: ${MARIA_VISUAL_STYLE_SOURCE}.`,
    `STYLE VERSION: ${direction.styleVersion}. PROMPT VERSION: ${direction.promptVersion}.`,
    `MARIA SIGNATURE: ${direction.signature}`,
    "",
    "MARIA CREATIVE PRINCIPLES",
    bullets(direction.principles),
    "",
    "SUPPORTED HUMAN EXPERIENCES",
    experienceLines,
    "",
    "LOCKED CAMPAIGN CONTINUITY",
    bullets(direction.requiredContinuity),
    "",
    "NARRATIVE GRAMMAR",
    bullets(direction.narrativeRules),
    "",
    "COMPOSITION GRAMMAR",
    bullets(direction.compositionRules),
    "",
    "SUBJECT / CASTING LOGIC",
    bullets(direction.subjectTreatmentRules),
    "",
    "LIGHTING LANGUAGE",
    bullets(direction.lightRules),
    "",
    "STYLING LANGUAGE",
    bullets(direction.stylingRules),
    "",
    "PHYSICAL STORYTELLING DEVICES",
    bullets(direction.physicalPhenomena),
    "",
    "TEXTURE LANGUAGE",
    bullets(direction.textureRules),
    "",
    "COLOUR GRAMMAR",
    bullets(direction.colourRules),
    "",
    `FIVE-SCENE ROLE ${sceneIndex + 1}: ${direction.sceneRoles[sceneIndex] ?? direction.sceneRoles.at(-1)}`,
    "",
    "INSPIRATION-IMAGE HANDLING",
    direction.inspirationHandling,
    "",
    "MARIA MUST INCLUDE",
    bullets(direction.mustInclude),
    "",
    "MARIA AVOID",
    bullets(direction.avoid),
    "",
    "FINAL GENERATION BRIEF",
    prompt,
  ].join("\n");
}

/**
 * The documented V4 connection point. The name is retained for traceability
 * with the implementation specification; it now delegates directly to the
 * authoritative Maria layer rather than providing any temporary style logic.
 */
export function applyTemporaryMariaVisualStylePlaceholder(params: {
  prompt: string;
  direction: CompiledMariaVisualDirection;
  sceneIndex: number;
}) {
  return applyAuthoritativeMariaVisualStyleLayer(params);
}

export function applyMariaLevel2CreateStyleLayer(params: {
  prompt: string;
  sceneIndex: number;
  mustInclude: string[];
  avoid: string[];
}) {
  return [
    "MIRA CREATE — MARIA VISUAL-DIRECTION BIAS",
    `STYLE VERSION: ${MARIA_VISUAL_STYLE_VERSION}. PROMPT VERSION: ${MARIA_VISUAL_PROMPT_VERSION}.`,
    "USER EVIDENCE IS THE CREATIVE AUTHORITY. Maria's visual language may sharpen execution but must never override explicit or repeated user choices.",
    `MARIA SIGNATURE: Unexpected symbolism with emotional precision.`,
    `FIVE-SCENE ROLE ${params.sceneIndex + 1}: ${sceneRoles[params.sceneIndex] ?? sceneRoles.at(-1)}.`,
    `CONTINUITY: ${requiredContinuity.join("; ")}.`,
    `PHOTOGRAPHIC BIAS: ${compositionRules.slice(0, 3).join("; ")}; ${lightRules.slice(0, 2).join("; ")}.`,
    `MUST INCLUDE FROM USER EVIDENCE: ${params.mustInclude.join("; ") || "Follow the confirmed visual direction"}.`,
    `NEVER REINTRODUCE: ${params.avoid.join("; ") || "No rejected direction"}.`,
    "FINAL GENERATION BRIEF",
    params.prompt,
  ].join("\n");
}
