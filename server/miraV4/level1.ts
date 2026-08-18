export const LEVEL1_SEGMENTS = ["discover", "deeper", "create"] as const;

export const LEVEL1_QUESTION_ORDER = [
  "brand_season",
  "work_anchor",
  "desired_audience_response",
  "social_presence",
  "expressive_energies",
  "visual_ingredients",
  "protected_tension",
  "anti_signals",
] as const;

export type MiraLevel1QuestionKey = (typeof LEVEL1_QUESTION_ORDER)[number];

export const BRAND_SEASON_VALUES = [
  "getting_visible",
  "growing_into_more",
  "changing_direction",
  "making_signal_clearer",
  "returning_differently",
] as const;

export const DESIRED_AUDIENCE_RESPONSE_VALUES = [
  "understands_my_need",
  "knows_what_she_is_doing",
  "i_could_trust_her",
  "real_point_of_view",
  "i_want_to_work_with_her",
  "there_is_a_place_for_me",
  "something_is_possible",
] as const;

export const SOCIAL_PRESENCE_VALUES = [
  "people_relax",
  "clearest_point_of_view",
  "room_more_interesting",
  "conversation_nobody_expected",
  "world_people_stay_in",
  "halfway_into_next_thing",
] as const;

export const EXPRESSIVE_ENERGY_VALUES = [
  "warm",
  "precise",
  "playful",
  "sensual",
  "rebellious",
  "calm",
  "bold",
  "strange",
  "intellectual",
  "romantic",
  "expansive",
  "grounded",
] as const;

export const VISUAL_INGREDIENT_VALUES = [
  "strong_colour",
  "deep_shadow",
  "daylight",
  "texture",
  "clean_space",
  "layered_detail",
  "human_closeness",
  "open_air",
  "built_structure",
  "objects_with_story",
  "movement",
  "surprise_contrast",
] as const;

export const PROTECTED_TENSION_VALUES = [
  "warm_precise",
  "playful_powerful",
  "soft_direct",
  "refined_alive",
  "intimate_expansive",
  "strange_clear",
  "grounded_electric",
] as const;

export const ANTI_SIGNAL_VALUES = [
  "generic_interchangeable",
  "too_polished",
  "cold_corporate",
  "influencer_perfect",
  "safe_expected",
  "overly_serious",
  "too_soft",
  "loud_for_sake",
  "trend_led",
  "luxury_costume",
  "chaotic_without_purpose",
  "too_mystical",
] as const;

export type BrandSeason = (typeof BRAND_SEASON_VALUES)[number];
export type DesiredAudienceResponse = (typeof DESIRED_AUDIENCE_RESPONSE_VALUES)[number];
export type SocialPresence = (typeof SOCIAL_PRESENCE_VALUES)[number];
export type ExpressiveEnergy = (typeof EXPRESSIVE_ENERGY_VALUES)[number];
export type VisualIngredient = (typeof VISUAL_INGREDIENT_VALUES)[number];
export type ProtectedTension = (typeof PROTECTED_TENSION_VALUES)[number];
export type AntiSignal = (typeof ANTI_SIGNAL_VALUES)[number];

export type MiraLevel1Answers = {
  brand_season: {
    rawSelection: string;
    derived: {
      brand_season: BrandSeason;
    };
  };
  work_anchor: {
    rawText: string | null;
    rawAudience?: string | null;
    stillFindingWords: boolean;
    derived: {
      work_anchor: string | null;
      audience?: string | null;
      work_anchor_confidence: "clear" | "finding_words";
    };
  };
  desired_audience_response: {
    rawSelections: string[];
    derived: {
      desired_audience_response: DesiredAudienceResponse[];
    };
  };
  social_presence: {
    rawSelection: string;
    derived: {
      social_presence: SocialPresence;
    };
  };
  expressive_energies: {
    rawSelections: string[];
    rawOther: string | null;
    derived: {
      expressive_energies: ExpressiveEnergy[];
      expressive_energy_other: string | null;
    };
  };
  visual_ingredients: {
    rawSelections: string[];
    derived: {
      visual_ingredients: VisualIngredient[];
    };
  };
  protected_tension: {
    rawSelection: string;
    derived: {
      protected_tension: ProtectedTension;
    };
  };
  anti_signals: {
    rawSelections: string[];
    rawOther: string | null;
    derived: {
      anti_signals: AntiSignal[];
      anti_signal_other: string | null;
    };
  };
};

export type MiraLevel1Result = {
  firstPattern: string;
  whatLeads: Array<{
    cluster: string;
    note: string;
  }>;
  contrastToKeep: string;
  visualInstinct: string;
  notThis: string[];
  goDeeper: string;
  interpretationLabel: "MIRA interpretation";
  businessContext?: { work: string | null; audience: string | null };
};

function title(input: string) {
  return input
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function oneOf<T extends readonly string[]>(items: T, pick: string): T[number] {
  return (items.includes(pick as T[number]) ? pick : items[0]) as T[number];
}

const DESIRED_RESPONSE_LABELS: Record<DesiredAudienceResponse, string> = {
  understands_my_need: "attunement",
  knows_what_she_is_doing: "competence",
  i_could_trust_her: "trust",
  real_point_of_view: "distinct point of view",
  i_want_to_work_with_her: "desire to engage",
  there_is_a_place_for_me: "belonging",
  something_is_possible: "possibility",
};

const GENDER_NEUTRAL_AUDIENCE_COPY: Record<DesiredAudienceResponse, string> = {
  understands_my_need: "They understand what I need.",
  knows_what_she_is_doing: "They know exactly what they’re doing.",
  i_could_trust_her: "I could trust them with this.",
  real_point_of_view: "There is a real point of view here.",
  i_want_to_work_with_her: "I want to work with them.",
  there_is_a_place_for_me: "There is a place for me here.",
  something_is_possible: "Something is possible here.",
};

const SOCIAL_PRESENCE_PHRASE: Record<SocialPresence, string> = {
  people_relax: "a calming social presence",
  clearest_point_of_view: "clear conviction",
  room_more_interesting: "curious intrigue",
  conversation_nobody_expected: "provocative freshness",
  world_people_stay_in: "immersive atmosphere",
  halfway_into_next_thing: "forward motion",
};

const TENSION_PHRASE: Record<ProtectedTension, string> = {
  warm_precise: "warm and precise",
  playful_powerful: "playful and powerful",
  soft_direct: "soft and direct",
  refined_alive: "refined and alive",
  intimate_expansive: "intimate and expansive",
  strange_clear: "strange and clear",
  grounded_electric: "grounded and electric",
};

const VISUAL_INGREDIENT_LABELS: Record<VisualIngredient, string> = {
  strong_colour: "strong colour",
  deep_shadow: "deep shadow",
  daylight: "daylight",
  texture: "texture",
  clean_space: "clean space",
  layered_detail: "layered detail",
  human_closeness: "human closeness",
  open_air: "open air",
  built_structure: "built structure",
  objects_with_story: "objects with a story",
  movement: "movement",
  surprise_contrast: "surprise and contrast",
};

const ANTI_SIGNAL_LABELS: Record<AntiSignal, string> = {
  generic_interchangeable: "generic and interchangeable",
  too_polished: "too polished to feel real",
  cold_corporate: "cold and corporate",
  influencer_perfect: "influencer-perfect",
  safe_expected: "safe and expected",
  overly_serious: "overly serious",
  too_soft: "too soft to be taken seriously",
  loud_for_sake: "loud for the sake of it",
  trend_led: "trend-led",
  luxury_costume: "luxury costume",
  chaotic_without_purpose: "chaotic without purpose",
  too_mystical: "too mystical to be clear",
};

const SEASON_PATTERN: Record<BrandSeason, string> = {
  getting_visible: "The first pattern I see is a brand becoming more visible without wanting to become louder than necessary.",
  growing_into_more: "Right now, your brand is expanding in scope and asking for a stronger signal to match that growth.",
  changing_direction: "The first pattern I see is directional change: the work is moving, and the brand language needs to move with it.",
  making_signal_clearer: "Right now, your brand has real substance but needs sharper clarity so people recognize it faster.",
  returning_differently: "The first pattern I see is a return with new depth, where your presence is catching up to who you are now.",
};

export function normalizeLevel1Answer(
  key: MiraLevel1QuestionKey,
  rawValue: Record<string, unknown>,
): MiraLevel1Answers[MiraLevel1QuestionKey] {
  if (key === "brand_season") {
    const brandSeason = oneOf(BRAND_SEASON_VALUES, String(rawValue.brand_season ?? rawValue.choice ?? BRAND_SEASON_VALUES[0]));
    return {
      rawSelection: String(rawValue.rawSelection ?? brandSeason),
      derived: { brand_season: brandSeason },
    };
  }

  if (key === "work_anchor") {
    const text = typeof rawValue.work_anchor === "string" ? rawValue.work_anchor.trim() : "";
    const audience = typeof rawValue.audience === "string" ? rawValue.audience.trim() : "";
    const stillFindingWords = Boolean(rawValue.stillFindingWords);
    return {
      rawText: text || null,
      rawAudience: audience || null,
      stillFindingWords,
      derived: {
        work_anchor: text || null,
        audience: audience || null,
        work_anchor_confidence: stillFindingWords ? "finding_words" : "clear",
      },
    };
  }

  if (key === "desired_audience_response") {
    const chosen = Array.isArray(rawValue.desired_audience_response)
      ? rawValue.desired_audience_response.map(String)
      : Array.isArray(rawValue.choices)
        ? rawValue.choices.map(String)
        : [];
    const normalized = chosen
      .filter(value => DESIRED_AUDIENCE_RESPONSE_VALUES.includes(value as DesiredAudienceResponse))
      .slice(0, 2) as DesiredAudienceResponse[];
    return {
      rawSelections: chosen.slice(0, 2),
      derived: { desired_audience_response: normalized.length ? normalized : [DESIRED_AUDIENCE_RESPONSE_VALUES[0]] },
    };
  }

  if (key === "social_presence") {
    const socialPresence = oneOf(SOCIAL_PRESENCE_VALUES, String(rawValue.social_presence ?? rawValue.choice ?? SOCIAL_PRESENCE_VALUES[0]));
    return {
      rawSelection: String(rawValue.rawSelection ?? socialPresence),
      derived: { social_presence: socialPresence },
    };
  }

  if (key === "expressive_energies") {
    const selected = Array.isArray(rawValue.expressive_energies)
      ? rawValue.expressive_energies.map(String)
      : Array.isArray(rawValue.choices)
        ? rawValue.choices.map(String)
        : [];
    const other = typeof rawValue.expressive_energy_other === "string"
      ? rawValue.expressive_energy_other.trim()
      : typeof rawValue.other === "string"
        ? rawValue.other.trim()
        : "";
    const normalized = selected
      .filter(value => EXPRESSIVE_ENERGY_VALUES.includes(value as ExpressiveEnergy))
      .slice(0, 2) as ExpressiveEnergy[];
    return {
      rawSelections: selected.slice(0, 2),
      rawOther: other || null,
      derived: {
        expressive_energies: normalized,
        expressive_energy_other: other || null,
      },
    };
  }

  if (key === "visual_ingredients") {
    const selected = Array.isArray(rawValue.visual_ingredients)
      ? rawValue.visual_ingredients.map(String)
      : Array.isArray(rawValue.choices)
        ? rawValue.choices.map(String)
        : [];
    const normalized = selected
      .filter(value => VISUAL_INGREDIENT_VALUES.includes(value as VisualIngredient))
      .slice(0, 3) as VisualIngredient[];
    return {
      rawSelections: selected.slice(0, 3),
      derived: {
        visual_ingredients: normalized.length ? normalized : [VISUAL_INGREDIENT_VALUES[0]],
      },
    };
  }

  if (key === "protected_tension") {
    const tension = oneOf(PROTECTED_TENSION_VALUES, String(rawValue.protected_tension ?? rawValue.choice ?? PROTECTED_TENSION_VALUES[0]));
    return {
      rawSelection: String(rawValue.rawSelection ?? tension),
      derived: {
        protected_tension: tension,
      },
    };
  }

  const anti = Array.isArray(rawValue.anti_signals)
    ? rawValue.anti_signals.map(String)
    : Array.isArray(rawValue.choices)
      ? rawValue.choices.map(String)
      : [];
  const antiOther = typeof rawValue.anti_signal_other === "string"
    ? rawValue.anti_signal_other.trim()
    : typeof rawValue.other === "string"
      ? rawValue.other.trim()
      : "";
  const antiNormalized = anti
    .filter(value => ANTI_SIGNAL_VALUES.includes(value as AntiSignal))
    .slice(0, 2) as AntiSignal[];
  return {
    rawSelections: anti.slice(0, 2),
    rawOther: antiOther || null,
    derived: {
      anti_signals: antiNormalized.length ? antiNormalized : [ANTI_SIGNAL_VALUES[0]],
      anti_signal_other: antiOther || null,
    },
  };
}

/** Reads stable canonical Level 1 answers without normalizing them a second time. */
export function readStoredLevel1Answer(
  key: MiraLevel1QuestionKey,
  storedValue: Record<string, unknown>,
): MiraLevel1Answers[MiraLevel1QuestionKey] {
  if (storedValue.derived && typeof storedValue.derived === "object") {
    if (key === "desired_audience_response") {
      const stored = storedValue as MiraLevel1Answers["desired_audience_response"];
      return {
        ...stored,
        rawSelections: stored.derived.desired_audience_response.map(value => GENDER_NEUTRAL_AUDIENCE_COPY[value]),
      };
    }
    return storedValue as MiraLevel1Answers[MiraLevel1QuestionKey];
  }
  return normalizeLevel1Answer(key, storedValue);
}

function buildWhatLeads(answers: MiraLevel1Answers) {
  const primaryResponse = answers.desired_audience_response.derived.desired_audience_response
    .map(item => DESIRED_RESPONSE_LABELS[item])
    .slice(0, 2)
    .join(" and ");
  const socialPresence = SOCIAL_PRESENCE_PHRASE[answers.social_presence.derived.social_presence];
  const energies = answers.expressive_energies.derived.expressive_energies
    .map(item => item.charAt(0).toUpperCase() + item.slice(1))
    .join(" + ");

  const visualLead = answers.visual_ingredients.derived.visual_ingredients
    .slice(0, 2)
    .map(item => VISUAL_INGREDIENT_LABELS[item]);

  return [
    {
      cluster: `${title(answers.brand_season.derived.brand_season)} momentum with ${primaryResponse || "clear audience intent"}.`,
      note: "The way you want to be recognized is tied to the chapter your work is in now.",
    },
    {
      cluster: `${socialPresence} carried by ${energies || "distinct expressive range"}.`,
      note: "Your presence signal and energies point to a brand that should feel alive, not generic.",
    },
    {
      cluster: `${visualLead.join(" + ")} as first visual attractors.`,
      note: "Your visual attention is ingredient-led, which gives MIRA usable direction without locking a fixed style.",
    },
  ];
}

function buildVisualInstinct(answers: MiraLevel1Answers) {
  const social = SOCIAL_PRESENCE_PHRASE[answers.social_presence.derived.social_presence];
  const energies = answers.expressive_energies.derived.expressive_energies
    .slice(0, 2)
    .map(item => item.charAt(0).toUpperCase() + item.slice(1));
  const ingredients = answers.visual_ingredients.derived.visual_ingredients
    .slice(0, 2)
    .map(item => VISUAL_INGREDIENT_LABELS[item]);
  return [
    social,
    energies.join(" + "),
    ingredients.join(" + "),
  ]
    .filter(Boolean)
    .join(" - ");
}

export function synthesizeMiraLevel1Result(answers: MiraLevel1Answers): MiraLevel1Result {
  const firstPattern = SEASON_PATTERN[answers.brand_season.derived.brand_season];
  const whatLeads = buildWhatLeads(answers);
  const tensionLabel = TENSION_PHRASE[answers.protected_tension.derived.protected_tension];
  const contrastToKeep = `You do not need to choose between ${tensionLabel}. The work gets stronger when both stay visible.`;
  const antiSignals = answers.anti_signals.derived.anti_signals
    .slice(0, 2)
    .map(item => ANTI_SIGNAL_LABELS[item]);

  return {
    firstPattern,
    whatLeads,
    contrastToKeep,
    visualInstinct: buildVisualInstinct(answers),
    notThis: antiSignals,
    goDeeper:
      "There is a clearer visual system inside this. Go deeper to turn this first pattern into direction you can actually use.",
    interpretationLabel: "MIRA interpretation",
    businessContext: {
      work: answers.work_anchor.derived.work_anchor,
      audience: answers.work_anchor.derived.audience ?? null,
    },
  };
}

export function getNextLevel1QuestionKey(answers: Partial<MiraLevel1Answers>): MiraLevel1QuestionKey | null {
  for (const key of LEVEL1_QUESTION_ORDER) {
    if (!(key in answers)) return key;
  }
  return null;
}

export const LEVEL1_FIXTURE_PROFILES = [
  "playful_colourful",
  "intellectually_precise",
  "romantic_sensual",
  "rebellious_direct",
  "calm_minimal",
  "strange_experimental",
] as const;

export type MiraLevel1FixtureProfile = (typeof LEVEL1_FIXTURE_PROFILES)[number];

export function buildLevel1FixtureAnswers(profile: MiraLevel1FixtureProfile): MiraLevel1Answers {
  const fixtures: Record<MiraLevel1FixtureProfile, MiraLevel1Answers> = {
    playful_colourful: {
      brand_season: { rawSelection: "Growing into more", derived: { brand_season: "growing_into_more" } },
      work_anchor: { rawText: "I help creative teams turn bold ideas into campaigns people remember.", stillFindingWords: false, derived: { work_anchor: "I help creative teams turn bold ideas into campaigns people remember.", work_anchor_confidence: "clear" } },
      desired_audience_response: { rawSelections: ["Something is possible here.", "I want to work with them."], derived: { desired_audience_response: ["something_is_possible", "i_want_to_work_with_her"] } },
      social_presence: { rawSelection: "It makes the room more interesting.", derived: { social_presence: "room_more_interesting" } },
      expressive_energies: { rawSelections: ["Playful", "Bold"], rawOther: null, derived: { expressive_energies: ["playful", "bold"], expressive_energy_other: null } },
      visual_ingredients: { rawSelections: ["Strong colour", "Movement", "Surprise / contrast"], derived: { visual_ingredients: ["strong_colour", "movement", "surprise_contrast"] } },
      protected_tension: { rawSelection: "Playful + powerful", derived: { protected_tension: "playful_powerful" } },
      anti_signals: { rawSelections: ["Safe and expected", "Overly serious"], rawOther: null, derived: { anti_signals: ["safe_expected", "overly_serious"], anti_signal_other: null } },
    },
    intellectually_precise: {
      brand_season: { rawSelection: "Making the signal clearer", derived: { brand_season: "making_signal_clearer" } },
      work_anchor: { rawText: "I help experts structure complex ideas into decisions people can act on.", stillFindingWords: false, derived: { work_anchor: "I help experts structure complex ideas into decisions people can act on.", work_anchor_confidence: "clear" } },
      desired_audience_response: { rawSelections: ["They know exactly what they’re doing.", "There is a real point of view here."], derived: { desired_audience_response: ["knows_what_she_is_doing", "real_point_of_view"] } },
      social_presence: { rawSelection: "It sits down with the clearest point of view.", derived: { social_presence: "clearest_point_of_view" } },
      expressive_energies: { rawSelections: ["Precise", "Intellectual"], rawOther: null, derived: { expressive_energies: ["precise", "intellectual"], expressive_energy_other: null } },
      visual_ingredients: { rawSelections: ["Clean space", "Built structure", "Layered detail"], derived: { visual_ingredients: ["clean_space", "built_structure", "layered_detail"] } },
      protected_tension: { rawSelection: "Soft + direct", derived: { protected_tension: "soft_direct" } },
      anti_signals: { rawSelections: ["Chaotic without purpose", "Too mystical to be clear"], rawOther: null, derived: { anti_signals: ["chaotic_without_purpose", "too_mystical"], anti_signal_other: null } },
    },
    romantic_sensual: {
      brand_season: { rawSelection: "Returning differently", derived: { brand_season: "returning_differently" } },
      work_anchor: { rawText: "I help people create experiences that feel intimate, beautiful, and emotionally honest.", stillFindingWords: false, derived: { work_anchor: "I help people create experiences that feel intimate, beautiful, and emotionally honest.", work_anchor_confidence: "clear" } },
      desired_audience_response: { rawSelections: ["There is a place for me here.", "I could trust them with this."], derived: { desired_audience_response: ["there_is_a_place_for_me", "i_could_trust_her"] } },
      social_presence: { rawSelection: "It feels like a world people want to stay in.", derived: { social_presence: "world_people_stay_in" } },
      expressive_energies: { rawSelections: ["Romantic", "Sensual"], rawOther: null, derived: { expressive_energies: ["romantic", "sensual"], expressive_energy_other: null } },
      visual_ingredients: { rawSelections: ["Texture", "Human closeness", "Daylight"], derived: { visual_ingredients: ["texture", "human_closeness", "daylight"] } },
      protected_tension: { rawSelection: "Intimate + expansive", derived: { protected_tension: "intimate_expansive" } },
      anti_signals: { rawSelections: ["Cold and corporate", "Influencer-perfect"], rawOther: null, derived: { anti_signals: ["cold_corporate", "influencer_perfect"], anti_signal_other: null } },
    },
    rebellious_direct: {
      brand_season: { rawSelection: "Changing direction", derived: { brand_season: "changing_direction" } },
      work_anchor: { rawText: "I help founders challenge stale categories and launch work that cannot be ignored.", stillFindingWords: false, derived: { work_anchor: "I help founders challenge stale categories and launch work that cannot be ignored.", work_anchor_confidence: "clear" } },
      desired_audience_response: { rawSelections: ["There is a real point of view here.", "Something is possible here."], derived: { desired_audience_response: ["real_point_of_view", "something_is_possible"] } },
      social_presence: { rawSelection: "It starts the conversation nobody expected.", derived: { social_presence: "conversation_nobody_expected" } },
      expressive_energies: { rawSelections: ["Rebellious", "Direct"], rawOther: "Direct", derived: { expressive_energies: ["rebellious", "bold"], expressive_energy_other: "Direct" } },
      visual_ingredients: { rawSelections: ["Deep shadow", "Surprise / contrast", "Objects with a story"], derived: { visual_ingredients: ["deep_shadow", "surprise_contrast", "objects_with_story"] } },
      protected_tension: { rawSelection: "Strange + clear", derived: { protected_tension: "strange_clear" } },
      anti_signals: { rawSelections: ["Safe and expected", "Trend-led"], rawOther: null, derived: { anti_signals: ["safe_expected", "trend_led"], anti_signal_other: null } },
    },
    calm_minimal: {
      brand_season: { rawSelection: "Getting visible", derived: { brand_season: "getting_visible" } },
      work_anchor: { rawText: "I help teams simplify what matters so people can move with confidence.", stillFindingWords: false, derived: { work_anchor: "I help teams simplify what matters so people can move with confidence.", work_anchor_confidence: "clear" } },
      desired_audience_response: { rawSelections: ["I could trust them with this.", "They understand what I need."], derived: { desired_audience_response: ["i_could_trust_her", "understands_my_need"] } },
      social_presence: { rawSelection: "People relax before it says much.", derived: { social_presence: "people_relax" } },
      expressive_energies: { rawSelections: ["Calm", "Grounded"], rawOther: null, derived: { expressive_energies: ["calm", "grounded"], expressive_energy_other: null } },
      visual_ingredients: { rawSelections: ["Clean space", "Daylight", "Open air"], derived: { visual_ingredients: ["clean_space", "daylight", "open_air"] } },
      protected_tension: { rawSelection: "Grounded + electric", derived: { protected_tension: "grounded_electric" } },
      anti_signals: { rawSelections: ["Loud for the sake of it", "Chaotic without purpose"], rawOther: null, derived: { anti_signals: ["loud_for_sake", "chaotic_without_purpose"], anti_signal_other: null } },
    },
    strange_experimental: {
      brand_season: { rawSelection: "Returning differently", derived: { brand_season: "returning_differently" } },
      work_anchor: { rawText: "I help artists and founders build formats that feel unfamiliar but coherent.", stillFindingWords: false, derived: { work_anchor: "I help artists and founders build formats that feel unfamiliar but coherent.", work_anchor_confidence: "clear" } },
      desired_audience_response: { rawSelections: ["Something is possible here.", "There is a place for me here."], derived: { desired_audience_response: ["something_is_possible", "there_is_a_place_for_me"] } },
      social_presence: { rawSelection: "It is already halfway into the next thing.", derived: { social_presence: "halfway_into_next_thing" } },
      expressive_energies: { rawSelections: ["Strange", "Expansive"], rawOther: null, derived: { expressive_energies: ["strange", "expansive"], expressive_energy_other: null } },
      visual_ingredients: { rawSelections: ["Surprise / contrast", "Layered detail", "Movement"], derived: { visual_ingredients: ["surprise_contrast", "layered_detail", "movement"] } },
      protected_tension: { rawSelection: "Refined + alive", derived: { protected_tension: "refined_alive" } },
      anti_signals: { rawSelections: ["Generic and interchangeable", "Too polished to feel real"], rawOther: null, derived: { anti_signals: ["generic_interchangeable", "too_polished"], anti_signal_other: null } },
    },
  };

  return fixtures[profile];
}
