import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { readJourneyStepIndex, writeJourneyStep } from "@/lib/miraJourneyStepHistory";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { Mira123Shell } from "./MiraLevel1";

type QuestionKey =
  | "brand_season"
  | "work_anchor"
  | "desired_audience_response"
  | "social_presence"
  | "expressive_energies"
  | "visual_ingredients"
  | "protected_tension"
  | "anti_signals";

type FixtureProfile =
  | "playful_colourful"
  | "intellectually_precise"
  | "romantic_sensual"
  | "rebellious_direct"
  | "calm_minimal"
  | "strange_experimental";

const QUESTION_ORDER: QuestionKey[] = [
  "brand_season",
  "work_anchor",
  "desired_audience_response",
  "social_presence",
  "expressive_energies",
  "visual_ingredients",
  "protected_tension",
  "anti_signals",
];

function customerSaveError() {
  return "We couldn’t save that yet. Please check this step and try again.";
}

const BRAND_SEASONS = [
  {
    value: "getting_visible",
    title: "Getting visible",
    copy: "I am ready to be seen more clearly.",
  },
  {
    value: "growing_into_more",
    title: "Growing into more",
    copy: "My work, standards or ambition have expanded.",
  },
  {
    value: "changing_direction",
    title: "Changing direction",
    copy: "Something in my work or offer has shifted.",
  },
  {
    value: "making_signal_clearer",
    title: "Making the signal clearer",
    copy: "It works, but it is too diffuse or familiar.",
  },
  {
    value: "returning_differently",
    title: "Returning differently",
    copy: "I have changed, and my presence needs to catch up.",
  },
] as const;

const AUDIENCE_RESPONSES = [
  { value: "understands_my_need", label: "They understand what I need." },
  { value: "knows_what_she_is_doing", label: "They know exactly what they’re doing." },
  { value: "i_could_trust_her", label: "I could trust them with this." },
  { value: "real_point_of_view", label: "There is a real point of view here." },
  { value: "i_want_to_work_with_her", label: "I want to work with them." },
  { value: "there_is_a_place_for_me", label: "There is a place for me here." },
  { value: "something_is_possible", label: "Something is possible here." },
] as const;

const SOCIAL_PRESENCE_OPTIONS = [
  { value: "people_relax", label: "People relax before it says much." },
  { value: "clearest_point_of_view", label: "It sits down with the clearest point of view." },
  { value: "room_more_interesting", label: "It makes the room more interesting." },
  { value: "conversation_nobody_expected", label: "It starts the conversation nobody expected." },
  { value: "world_people_stay_in", label: "It feels like a world people want to stay in." },
  { value: "halfway_into_next_thing", label: "It is already halfway into the next thing." },
] as const;

const EXPRESSIVE_ENERGIES = [
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

const VISUAL_INGREDIENTS = [
  { value: "strong_colour", label: "Strong colour" },
  { value: "deep_shadow", label: "Deep shadow" },
  { value: "daylight", label: "Daylight" },
  { value: "texture", label: "Texture" },
  { value: "clean_space", label: "Clean space" },
  { value: "layered_detail", label: "Layered detail" },
  { value: "human_closeness", label: "Human closeness" },
  { value: "open_air", label: "Open air" },
  { value: "built_structure", label: "Built structure" },
  { value: "objects_with_story", label: "Objects with a story" },
  { value: "movement", label: "Movement" },
  { value: "surprise_contrast", label: "Surprise / contrast" },
] as const;

const PROTECTED_TENSIONS = [
  { value: "warm_precise", label: "Warm + precise" },
  { value: "playful_powerful", label: "Playful + powerful" },
  { value: "soft_direct", label: "Soft + direct" },
  { value: "refined_alive", label: "Refined + alive" },
  { value: "intimate_expansive", label: "Intimate + expansive" },
  { value: "strange_clear", label: "Strange + clear" },
  { value: "grounded_electric", label: "Grounded + electric" },
] as const;

const ANTI_SIGNALS = [
  { value: "generic_interchangeable", label: "Generic and interchangeable" },
  { value: "too_polished", label: "Too polished to feel real" },
  { value: "cold_corporate", label: "Cold and corporate" },
  { value: "influencer_perfect", label: "Influencer-perfect" },
  { value: "safe_expected", label: "Safe and expected" },
  { value: "overly_serious", label: "Overly serious" },
  { value: "too_soft", label: "Too soft to be taken seriously" },
  { value: "loud_for_sake", label: "Loud for the sake of it" },
  { value: "trend_led", label: "Trend-led" },
  { value: "luxury_costume", label: "Luxury costume" },
  { value: "chaotic_without_purpose", label: "Chaotic without purpose" },
  { value: "too_mystical", label: "Too mystical to be clear" },
] as const;

const QUESTION_META: Record<QuestionKey, { title: string; helper: string; stage: "DISCOVER" | "DEEPER" | "CREATE" }> = {
  brand_season: {
    title: "Which chapter are you in?",
    helper: "Choose the one that feels closest - not the one that sounds most impressive.",
    stage: "DISCOVER",
  },
  work_anchor: {
    title: "What do you do — and who is it for?",
    helper: "Two short lines. No polished pitch required.",
    stage: "DISCOVER",
  },
  desired_audience_response: {
    title: "When the right person finds you, what should land first?",
    helper: "Choose up to two.",
    stage: "DISCOVER",
  },
  social_presence: {
    title: "Your brand walks into a dinner. What happens?",
    helper: "Choose the moment that feels most familiar.",
    stage: "DEEPER",
  },
  expressive_energies: {
    title: "Choose two energies you never want flattened out.",
    helper: "There is no correct combination.",
    stage: "DEEPER",
  },
  visual_ingredients: {
    title: "What do you notice first in an image you save?",
    helper: "Choose up to three ingredients - not a finished look.",
    stage: "DEEPER",
  },
  protected_tension: {
    title: "Good brands are not one note. Which contrast should MIRA protect?",
    helper: "Choose the one you do not want simplified away.",
    stage: "DISCOVER",
  },
  anti_signals: {
    title: "The fastest way to get your brand wrong?",
    helper: "Choose up to two. MIRA will keep them out of the room.",
    stage: "DISCOVER",
  },
};

function rotateBySeed<T>(items: readonly T[], seed: number) {
  if (!items.length) return [...items];
  const shift = Math.abs(seed) % items.length;
  return [...items.slice(shift), ...items.slice(0, shift)];
}

function hashSeed(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0;
  }
  return hash;
}

function SegmentHeader({ stage }: { stage: "DISCOVER" | "DEEPER" | "CREATE" }) {
  const nav = ["DISCOVER", "DEEPER", "CREATE"] as const;
  return (
    <nav className="mira-l123-topnav" aria-label="Mira Levels">
      {nav.map((item, index) => (
        <span key={item} className={`mira-l123-topnav-item ${item === stage ? "is-active" : "is-future"}`}>
          {String(index + 1).padStart(2, "0")} {item}
        </span>
      ))}
    </nav>
  );
}

function OptionRow({ selected, label, onClick }: { selected: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`mira-l123-row ${selected ? "is-selected" : ""}`}>
      <span className="mira-l123-indicator" aria-hidden="true">{selected ? <Check className="size-3" /> : null}</span>
      <span>{label}</span>
    </button>
  );
}

function Chip({ selected, label, onClick }: { selected: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`mira-l123-chip ${selected ? "mira-l123-chip-active" : ""}`}>
      <span className="mira-l123-chip-marker" aria-hidden="true">{selected ? "●" : "○"}</span>
      <span>{label}</span>
    </button>
  );
}

export default function MiraLevel1Journey() {
  const { journeyId: journeyIdRaw } = useParams<{ journeyId: string }>();
  const journeyId = Number(journeyIdRaw);
  const [location, navigate] = useLocation();
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });
  const utils = trpc.useUtils();

  const queryString = typeof window !== "undefined" ? window.location.search : "";
  const hasDevTools = import.meta.env.DEV && new URLSearchParams(queryString).get("devTools") === "1";

  const [activeIndex, setActiveIndex] = useState(0);
  const [brandSeason, setBrandSeason] = useState<(typeof BRAND_SEASONS)[number]["value"] | "">("");
  const [brandSeasonLabel, setBrandSeasonLabel] = useState("");
  const [workAnchor, setWorkAnchor] = useState("");
  const [audience, setAudience] = useState("");
  const [stillFindingWords, setStillFindingWords] = useState(false);
  const [desiredResponses, setDesiredResponses] = useState<Array<(typeof AUDIENCE_RESPONSES)[number]["value"]>>([]);
  const [desiredResponseLabels, setDesiredResponseLabels] = useState<string[]>([]);
  const [socialPresence, setSocialPresence] = useState<(typeof SOCIAL_PRESENCE_OPTIONS)[number]["value"] | "">("");
  const [socialPresenceLabel, setSocialPresenceLabel] = useState("");
  const [expressiveEnergies, setExpressiveEnergies] = useState<Array<(typeof EXPRESSIVE_ENERGIES)[number]>>([]);
  const [expressiveOther, setExpressiveOther] = useState("");
  const [visualIngredients, setVisualIngredients] = useState<Array<(typeof VISUAL_INGREDIENTS)[number]["value"]>>([]);
  const [visualIngredientLabels, setVisualIngredientLabels] = useState<string[]>([]);
  const [protectedTension, setProtectedTension] = useState<(typeof PROTECTED_TENSIONS)[number]["value"] | "">("");
  const [protectedTensionLabel, setProtectedTensionLabel] = useState("");
  const [antiSignals, setAntiSignals] = useState<Array<(typeof ANTI_SIGNALS)[number]["value"]>>([]);
  const [antiSignalLabels, setAntiSignalLabels] = useState<string[]>([]);
  const [antiSignalOther, setAntiSignalOther] = useState("");

  const showQuestion = (index: number, mode: "push" | "replace" = "push") => {
    const bounded = Math.max(0, Math.min(index, QUESTION_ORDER.length - 1));
    setActiveIndex(bounded);
    writeJourneyStep("question", QUESTION_ORDER[bounded], mode);
  };

  const level1State = trpc.miraV4.getLevel1State.useQuery(
    { journeyId },
    { enabled: Boolean(user) && Number.isInteger(journeyId) && journeyId > 0, retry: false },
  );

  const syncIndexFromState = (nextKey: string | null | undefined, isComplete: boolean | undefined) => {
    const historyIndex = readJourneyStepIndex("question", QUESTION_ORDER);
    if (historyIndex !== null) {
      setActiveIndex(historyIndex);
      return;
    }
    if (isComplete) {
      showQuestion(QUESTION_ORDER.length - 1, "replace");
      return;
    }
    const idx = nextKey ? QUESTION_ORDER.indexOf(nextKey as QuestionKey) : QUESTION_ORDER.length - 1;
    showQuestion(idx >= 0 ? idx : 0, "replace");
  };

  const saveAnswer = trpc.miraV4.saveLevel1Answer.useMutation({
    onSuccess: async response => {
      showQuestion(Math.min(activeIndex + 1, QUESTION_ORDER.length - 1));
      await utils.miraV4.getLevel1State.invalidate({ journeyId });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });

  const loadFixture = trpc.miraV4.loadLevel1Fixture.useMutation({
    onSuccess: async response => {
      syncIndexFromState(response.nextKey, response.isComplete);
      await utils.miraV4.getLevel1State.invalidate({ journeyId });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });

  useEffect(() => {
    const onPopState = () => {
      const index = readJourneyStepIndex("question", QUESTION_ORDER);
      if (index !== null) setActiveIndex(index);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!level1State.data?.answers) return;
    const answers = level1State.data.answers as Record<string, any>;

    if (answers.brand_season?.derived?.brand_season) {
      setBrandSeason(answers.brand_season.derived.brand_season);
      setBrandSeasonLabel(answers.brand_season.rawSelection ?? "");
    }

    if (answers.work_anchor?.derived) {
      setWorkAnchor(answers.work_anchor.derived.work_anchor ?? "");
      setAudience(answers.work_anchor.derived.audience ?? "");
      setStillFindingWords(answers.work_anchor.derived.work_anchor_confidence === "finding_words");
    }

    if (answers.desired_audience_response?.derived?.desired_audience_response) {
      setDesiredResponses(answers.desired_audience_response.derived.desired_audience_response);
      setDesiredResponseLabels(answers.desired_audience_response.rawSelections ?? []);
    }

    if (answers.social_presence?.derived?.social_presence) {
      setSocialPresence(answers.social_presence.derived.social_presence);
      setSocialPresenceLabel(answers.social_presence.rawSelection ?? "");
    }

    if (answers.expressive_energies?.derived?.expressive_energies) {
      setExpressiveEnergies(answers.expressive_energies.derived.expressive_energies);
      setExpressiveOther(answers.expressive_energies.derived.expressive_energy_other ?? "");
    }

    if (answers.visual_ingredients?.derived?.visual_ingredients) {
      setVisualIngredients(answers.visual_ingredients.derived.visual_ingredients);
      setVisualIngredientLabels(answers.visual_ingredients.rawSelections ?? []);
    }

    if (answers.protected_tension?.derived?.protected_tension) {
      setProtectedTension(answers.protected_tension.derived.protected_tension);
      setProtectedTensionLabel(answers.protected_tension.rawSelection ?? "");
    }

    if (answers.anti_signals?.derived?.anti_signals) {
      setAntiSignals(answers.anti_signals.derived.anti_signals);
      setAntiSignalLabels(answers.anti_signals.rawSelections ?? []);
      setAntiSignalOther(answers.anti_signals.derived.anti_signal_other ?? "");
    }

    syncIndexFromState(level1State.data.nextKey, level1State.data.isComplete);
  }, [level1State.data]);

  const orderedAudience = useMemo(
    () => rotateBySeed(AUDIENCE_RESPONSES, hashSeed(`${journeyId}:q3`)),
    [journeyId],
  );

  const orderedExpressive = useMemo(
    () => rotateBySeed(EXPRESSIVE_ENERGIES, hashSeed(`${journeyId}:q5`)),
    [journeyId],
  );

  const orderedVisual = useMemo(
    () => rotateBySeed(VISUAL_INGREDIENTS, hashSeed(`${journeyId}:q6`)),
    [journeyId],
  );

  const currentKey = QUESTION_ORDER[Math.max(0, Math.min(activeIndex, QUESTION_ORDER.length - 1))];
  const currentMeta = QUESTION_META[currentKey];

  const persistCurrentAnswer = () => {
    if (saveAnswer.isPending) return;

    if (currentKey === "brand_season" && brandSeason) {
      saveAnswer.mutate({
        journeyId,
        key: "brand_season",
        value: {
          brand_season: brandSeason,
          rawSelection: brandSeasonLabel || BRAND_SEASONS.find(item => item.value === brandSeason)?.title || "",
        },
      });
      return;
    }

    if (currentKey === "work_anchor") {
      const text = workAnchor.trim();
      if (!stillFindingWords && !text) return;
      saveAnswer.mutate({
        journeyId,
        key: "work_anchor",
        value: {
          work_anchor: stillFindingWords ? null : text,
          audience: stillFindingWords ? null : audience.trim(),
          stillFindingWords,
        },
      });
      return;
    }

    if (currentKey === "desired_audience_response") {
      if (!desiredResponses.length || desiredResponses.length > 2) return;
      saveAnswer.mutate({
        journeyId,
        key: "desired_audience_response",
        value: {
          desired_audience_response: desiredResponses,
          rawSelections: desiredResponseLabels,
        },
      });
      return;
    }

    if (currentKey === "social_presence" && socialPresence) {
      saveAnswer.mutate({
        journeyId,
        key: "social_presence",
        value: {
          social_presence: socialPresence,
          rawSelection: socialPresenceLabel || SOCIAL_PRESENCE_OPTIONS.find(item => item.value === socialPresence)?.label || "",
        },
      });
      return;
    }

    if (currentKey === "expressive_energies") {
      if (expressiveEnergies.length !== 2) return;
      saveAnswer.mutate({
        journeyId,
        key: "expressive_energies",
        value: {
          expressive_energies: expressiveEnergies,
          expressive_energy_other: expressiveOther.trim() ? expressiveOther.trim() : null,
          rawSelections: expressiveEnergies.map(value => value.charAt(0).toUpperCase() + value.slice(1)),
        },
      });
      return;
    }

    if (currentKey === "visual_ingredients") {
      if (!visualIngredients.length || visualIngredients.length > 3) return;
      saveAnswer.mutate({
        journeyId,
        key: "visual_ingredients",
        value: {
          visual_ingredients: visualIngredients,
          rawSelections: visualIngredientLabels,
        },
      });
      return;
    }

    if (currentKey === "protected_tension" && protectedTension) {
      saveAnswer.mutate({
        journeyId,
        key: "protected_tension",
        value: {
          protected_tension: protectedTension,
          rawSelection: protectedTensionLabel || PROTECTED_TENSIONS.find(item => item.value === protectedTension)?.label || "",
        },
      });
      return;
    }

    if (currentKey === "anti_signals") {
      if (!antiSignals.length || antiSignals.length > 2) return;
      saveAnswer.mutate({
        journeyId,
        key: "anti_signals",
        value: {
          anti_signals: antiSignals,
          anti_signal_other: antiSignalOther.trim() ? antiSignalOther.trim() : null,
          rawSelections: antiSignalLabels,
        },
      });
    }
  };

  const canContinue = useMemo(() => {
    if (currentKey === "brand_season") return Boolean(brandSeason);
    if (currentKey === "work_anchor") return stillFindingWords || (workAnchor.trim().length > 0 && audience.trim().length > 0);
    if (currentKey === "desired_audience_response") return desiredResponses.length >= 1 && desiredResponses.length <= 2;
    if (currentKey === "social_presence") return Boolean(socialPresence);
    if (currentKey === "expressive_energies") return expressiveEnergies.length === 2;
    if (currentKey === "visual_ingredients") return visualIngredients.length >= 1 && visualIngredients.length <= 3;
    if (currentKey === "protected_tension") return Boolean(protectedTension);
    if (currentKey === "anti_signals") return antiSignals.length >= 1 && antiSignals.length <= 2;
    return false;
  }, [
    antiSignals.length,
    brandSeason,
    currentKey,
    desiredResponses.length,
    expressiveEnergies.length,
    protectedTension,
    socialPresence,
    stillFindingWords,
    visualIngredients.length,
    workAnchor,
    audience,
  ]);

  const result = level1State.data?.result;
  const safeResult = result
    ? {
        firstPattern: typeof result.firstPattern === "string" ? result.firstPattern : "The first pattern I see is still being prepared.",
        whatLeads: Array.isArray(result.whatLeads) ? result.whatLeads : [],
        contrastToKeep: typeof result.contrastToKeep === "string" ? result.contrastToKeep : "Your strongest contrast will appear here after completion.",
        visualInstinct: typeof result.visualInstinct === "string" ? result.visualInstinct : "Your visual instinct will appear here after completion.",
        notThis: Array.isArray(result.notThis) ? result.notThis : [],
        goDeeper: typeof result.goDeeper === "string" ? result.goDeeper : "There is a clearer visual system inside this. Go deeper to continue.",
      }
    : null;

  if (loading || level1State.isLoading) {
    return <Mira123Shell><Loader2 className="size-5 animate-spin text-amber-100/80" /></Mira123Shell>;
  }

  if (!level1State.data || level1State.error) {
    return (
      <Mira123Shell>
        <section className="mira-l123-panel max-w-2xl text-center">
          <p className="mira-l123-kicker">Level 1 unavailable</p>
          <h1 className="mira-display mt-6 text-4xl text-amber-50">This Discover journey could not be loaded.</h1>
          <Button onClick={() => navigate("/mira-1")} className="mira-l123-cta mt-8 rounded-full px-6 text-amber-50">
            <ArrowLeft className="mr-2 size-4" /> Back to Level 1
          </Button>
        </section>
      </Mira123Shell>
    );
  }

  if (safeResult) {
    return (
      <Mira123Shell>
        <section className="mira-l123-panel mira-l123-narrow">
          <SegmentHeader stage="DISCOVER" />
          <p className="mira-l123-progress mt-8">BRAND MIRROR</p>
          <h1 className="mira-display mt-4 text-[clamp(1.8rem,3.8vw,2.5rem)] leading-[1.08] text-amber-50">Your first pattern is visible.</h1>

          <article className="mira-l123-result-block mt-8">
            <p className="mira-l123-kicker">1. The first pattern</p>
            <p className="mt-3 text-base leading-7 text-stone-200">{safeResult.firstPattern}</p>
          </article>

          <article className="mira-l123-result-block mt-4">
            <p className="mira-l123-kicker">2. What leads</p>
            <div className="mt-3 space-y-4 text-sm text-stone-200">
              {safeResult.whatLeads.map((item: { cluster: string; note: string }) => (
                <div key={item.cluster}>
                  <p className="font-medium text-amber-50">{item.cluster}</p>
                  <p className="mt-1 leading-6 text-stone-300">{item.note}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="mira-l123-result-block mt-4">
            <p className="mira-l123-kicker">3. The contrast to keep</p>
            <p className="mt-3 text-sm leading-7 text-stone-200">{safeResult.contrastToKeep}</p>
          </article>

          <article className="mira-l123-result-block mt-4">
            <p className="mira-l123-kicker">4. Your visual instinct</p>
            <p className="mt-3 text-sm leading-7 text-stone-200">{safeResult.visualInstinct}</p>
          </article>

          <article className="mira-l123-result-block mt-4">
            <p className="mira-l123-kicker">5. Not this</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {safeResult.notThis.map((item: string) => <span key={item} className="mira-l123-chip">{item}</span>)}
            </div>
          </article>

          <article className="mira-l123-result-block mt-4">
            <p className="mira-l123-kicker">6. Go deeper</p>
            <p className="mt-3 text-sm leading-7 text-stone-200">{safeResult.goDeeper}</p>
          </article>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => navigate(`/mira-1/journey/${journeyId}/deeper`)}
              className="mira-l123-cta rounded-full px-7 text-amber-50"
            >
              Continue to DEEPER <ArrowRight className="ml-2 size-4" />
            </Button>
          </div>
        </section>
      </Mira123Shell>
    );
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    persistCurrentAnswer();
  };

  return (
    <Mira123Shell>
      <section className="mira-l123-panel mira-l123-narrow">
        <SegmentHeader stage={currentMeta.stage} />
        <p className="mira-l123-progress mt-8">QUESTION {String(activeIndex + 1).padStart(2, "0")} / 08</p>
        <h1 className="mira-display mt-4 text-[clamp(1.7rem,4vw,2.4rem)] leading-[1.08] text-amber-50">
          {currentMeta.title}
        </h1>
        <p className="mt-3 text-[14px] leading-7 text-stone-300">{currentMeta.helper}</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {currentKey === "brand_season" ? (
            <div className="space-y-2">
              {BRAND_SEASONS.map(option => (
                <OptionRow
                  key={option.value}
                  selected={brandSeason === option.value}
                  label={`${option.title} - ${option.copy}`}
                  onClick={() => {
                    setBrandSeason(option.value);
                    setBrandSeasonLabel(`${option.title} - ${option.copy}`);
                  }}
                />
              ))}
            </div>
          ) : null}

          {currentKey === "work_anchor" ? (
            <div className="space-y-3">
              <Textarea
                value={workAnchor}
                maxLength={140}
                onChange={event => {
                  setStillFindingWords(false);
                  setWorkAnchor(event.target.value.slice(0, 140));
                }}
                placeholder="I help..."
                className="min-h-[92px] border-amber-100/20 bg-black/35 text-stone-100 placeholder:text-stone-500"
              />
              <Input
                value={audience}
                maxLength={140}
                onChange={event => {
                  setStillFindingWords(false);
                  setAudience(event.target.value.slice(0, 140));
                }}
                placeholder="The people or clients I serve are..."
                className="h-11 border-amber-100/20 bg-black/35 text-stone-100 placeholder:text-stone-500"
              />
              <p className="text-xs text-stone-400">{workAnchor.length}/140</p>
              <button
                type="button"
                onClick={() => {
                  setStillFindingWords(true);
                  setWorkAnchor("");
                  setAudience("");
                  persistCurrentAnswer();
                }}
                className={`mira-l123-inline-link ${stillFindingWords ? "is-selected" : ""}`}
              >
                {stillFindingWords ? "Selected: " : ""}I’m still finding the words.
              </button>
            </div>
          ) : null}

          {currentKey === "desired_audience_response" ? (
            <div className="flex flex-wrap gap-2.5">
              {orderedAudience.map(option => {
                const selected = desiredResponses.includes(option.value);
                return (
                  <Chip
                    key={option.value}
                    selected={selected}
                    label={option.label}
                    onClick={() => {
                      setDesiredResponses(current => {
                        if (current.includes(option.value)) {
                          setDesiredResponseLabels(labels => labels.filter(item => item !== option.label));
                          return current.filter(item => item !== option.value);
                        }
                        if (current.length >= 2) return current;
                        setDesiredResponseLabels(labels => [...labels, option.label]);
                        return [...current, option.value];
                      });
                    }}
                  />
                );
              })}
            </div>
          ) : null}

          {currentKey === "social_presence" ? (
            <div className="space-y-2">
              {SOCIAL_PRESENCE_OPTIONS.map(option => (
                <OptionRow
                  key={option.value}
                  selected={socialPresence === option.value}
                  label={option.label}
                  onClick={() => {
                    setSocialPresence(option.value);
                    setSocialPresenceLabel(option.label);
                  }}
                />
              ))}
            </div>
          ) : null}

          {currentKey === "expressive_energies" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2.5">
                {orderedExpressive.map(option => {
                  const selected = expressiveEnergies.includes(option);
                  return (
                    <Chip
                      key={option}
                      selected={selected}
                      label={option.charAt(0).toUpperCase() + option.slice(1)}
                      onClick={() => {
                        setExpressiveEnergies(current => {
                          if (current.includes(option)) return current.filter(item => item !== option);
                          if (current.length >= 2) return current;
                          return [...current, option];
                        });
                      }}
                    />
                  );
                })}
              </div>
              <Input
                value={expressiveOther}
                onChange={event => setExpressiveOther(event.target.value.slice(0, 80))}
                placeholder="Other (optional, one short phrase)"
                className="h-11 border-amber-100/20 bg-black/35 text-stone-100 placeholder:text-stone-500"
              />
            </div>
          ) : null}

          {currentKey === "visual_ingredients" ? (
            <div className="flex flex-wrap gap-2.5">
              {orderedVisual.map(option => {
                const selected = visualIngredients.includes(option.value);
                return (
                  <Chip
                    key={option.value}
                    selected={selected}
                    label={option.label}
                    onClick={() => {
                      setVisualIngredients(current => {
                        if (current.includes(option.value)) {
                          setVisualIngredientLabels(labels => labels.filter(item => item !== option.label));
                          return current.filter(item => item !== option.value);
                        }
                        if (current.length >= 3) return current;
                        setVisualIngredientLabels(labels => [...labels, option.label]);
                        return [...current, option.value];
                      });
                    }}
                  />
                );
              })}
            </div>
          ) : null}

          {currentKey === "protected_tension" ? (
            <div className="space-y-2">
              {PROTECTED_TENSIONS.map(option => (
                <OptionRow
                  key={option.value}
                  selected={protectedTension === option.value}
                  label={option.label}
                  onClick={() => {
                    setProtectedTension(option.value);
                    setProtectedTensionLabel(option.label);
                  }}
                />
              ))}
            </div>
          ) : null}

          {currentKey === "anti_signals" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2.5">
                {ANTI_SIGNALS.map(option => {
                  const selected = antiSignals.includes(option.value);
                  return (
                    <Chip
                      key={option.value}
                      selected={selected}
                      label={option.label}
                      onClick={() => {
                        setAntiSignals(current => {
                          if (current.includes(option.value)) {
                            setAntiSignalLabels(labels => labels.filter(item => item !== option.label));
                            return current.filter(item => item !== option.value);
                          }
                          if (current.length >= 2) return current;
                          setAntiSignalLabels(labels => [...labels, option.label]);
                          return [...current, option.value];
                        });
                      }}
                    />
                  );
                })}
              </div>
              <Input
                value={antiSignalOther}
                onChange={event => setAntiSignalOther(event.target.value.slice(0, 140))}
                placeholder="Something else (optional, one short line)"
                className="h-11 border-amber-100/20 bg-black/35 text-stone-100 placeholder:text-stone-500"
              />
            </div>
          ) : null}

          <div className="mt-6 flex items-center justify-between border-t border-amber-100/20 pt-5">
            <button
              type="button"
              onClick={() => showQuestion(activeIndex - 1)}
              disabled={activeIndex === 0 || saveAnswer.isPending}
              className="mira-l123-back"
            >
              <ArrowLeft className="size-4" /> Back
            </button>

            <Button
              type="submit"
              disabled={!canContinue || saveAnswer.isPending}
              className="mira-l123-cta rounded-full px-7 text-amber-50"
            >
              {saveAnswer.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Continue
              {!saveAnswer.isPending ? <ArrowRight className="ml-2 size-4" /> : null}
            </Button>
          </div>

          <p className="text-xs text-stone-400">
            Your answers are private. <a href="#" onClick={event => event.preventDefault()} className="underline">Learn about data use</a>.
          </p>

          {hasDevTools ? (
            <div className="mira-l123-devpanel">
              <p className="text-[11px] uppercase tracking-[0.2em] text-amber-100/70">Development fixtures</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["playful_colourful", "intellectually_precise", "romantic_sensual", "rebellious_direct", "calm_minimal", "strange_experimental"] as FixtureProfile[]).map(profile => (
                  <button
                    key={profile}
                    type="button"
                    onClick={() => loadFixture.mutate({ journeyId, profile })}
                    className="mira-l123-devchip"
                    disabled={loadFixture.isPending}
                  >
                    {profile}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {saveAnswer.error ? <p className="text-sm text-red-300">{customerSaveError()}</p> : null}
          {loadFixture.error ? <p className="text-sm text-red-300">Development data could not be loaded.</p> : null}
        </form>
      </section>
    </Mira123Shell>
  );
}
