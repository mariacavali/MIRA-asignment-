import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { readJourneyStepIndex, writeJourneyStep } from "@/lib/miraJourneyStepHistory";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { Mira123Shell } from "./MiraLevel1";
import { deterministicShownOrder, MIRA_LEVEL2_VISUAL_PAIRS, VISUAL_REASON_TAGS } from "../../../shared/miraLevel2VisualPairs";

type Level2Key =
  | "core_tension_probe"
  | "ab_visual_calibration"
  | "reference_interpretation"
  | "create_preparation";

type FixtureProfile = "editorial_founder" | "quiet_luxury" | "playful_operator";

const ORDER: Level2Key[] = [
  "core_tension_probe",
  "ab_visual_calibration",
  "reference_interpretation",
  "create_preparation",
];

const TITLES: Record<Level2Key, { title: string; helper: string }> = {
  core_tension_probe: {
    title: "What should we never lose?",
    helper: "As your brand grows, what quality should always remain?",
  },
  ab_visual_calibration: {
    title: "Which world feels more like you?",
    helper: "Choose instinctively. You can pick both, neither, or not sure.",
  },
  reference_interpretation: {
    title: "What do you like about this image?",
    helper: "Add an inspiration image and choose what catches your eye.",
  },
  create_preparation: {
    title: "This is what I’m seeing.",
    helper: "MIRA has brought your business, instincts and visual choices together.",
  },
};

const REFERENCE_SIGNALS = ["the light", "the colour", "the composition", "the environment", "the movement", "the styling", "the texture / finish"];
const EXPERIMENT_OPTIONS = ["Include one image with movement", "Include one quiet close portrait", "Include one wider location image", "Include one tactile detail", "No extra variation — keep it focused"];

function customerError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (/too large|8 mb|jpeg|png|webp|image/i.test(message)) return "Please choose a JPEG, PNG or WebP image up to 8 MB.";
  if (/five inspiration|up to five/i.test(message)) return "You can add up to five inspiration images.";
  if (/already complete|locked/i.test(message)) return "This step is already complete. Refresh to continue.";
  return fallback;
}

function uniqueShort(values: Array<string | null | undefined>, limit = 4) {
  return Array.from(new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value)))).slice(0, limit);
}

function discoverOptions(result: { contrastToKeep?: string; visualInstinct?: string } | null | undefined) {
  if (!result) return [];
  const contrast = result.contrastToKeep
    ?.replace(/^You do not need to choose between\s+/i, "")
    .replace(/\.\s*The work.*$/i, "")
    .replace(/\s+and\s+/i, " + ");
  const instincts = result.visualInstinct?.split(" - ").filter(part => part.includes("+")).map(part => part.trim()) ?? [];
  return uniqueShort([contrast, ...instincts], 3);
}

function lines(value: string) {
  return value.split("\n").map(item => item.trim()).filter(Boolean);
}

function toggleLine(value: string, item: string) {
  const current = lines(value);
  return (current.includes(item) ? current.filter(entry => entry !== item) : [...current, item]).join("\n");
}

function TopNav() {
  return (
    <nav className="mira-l123-topnav" aria-label="Mira levels">
      <span className="mira-l123-topnav-item is-future">01 DISCOVER</span>
      <span className="mira-l123-topnav-item is-active">02 DEEPER</span>
      <span className="mira-l123-topnav-item is-future">03 CREATE</span>
    </nav>
  );
}

export default function MiraLevel2Journey() {
  const { journeyId: journeyIdRaw } = useParams<{ journeyId: string }>();
  const journeyId = Number(journeyIdRaw);
  const [location, navigate] = useLocation();
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });
  const utils = trpc.useUtils();

  const queryString = typeof window !== "undefined" ? window.location.search : "";
  const hasDevTools = import.meta.env.DEV && new URLSearchParams(queryString).get("devTools") === "1";

  const [activeIndex, setActiveIndex] = useState(0);
  const [anchorLine, setAnchorLine] = useState("");
  const [shootPurpose, setShootPurpose] = useState("");
  const [objectives, setObjectives] = useState<string[]>([]);
  const [usageChannels, setUsageChannels] = useState<string[]>([]);
  const [constraints, setConstraints] = useState<string[]>([]);
  const [practicalNote, setPracticalNote] = useState("");

  const [visualChoices, setVisualChoices] = useState<Record<string, { chosen: "A" | "B" | "both" | "neither" | "not_sure"; reasonTags: string[] }>>({});

  const [showCustomAnchor, setShowCustomAnchor] = useState(false);
  const [referenceSignals, setReferenceSignals] = useState<string[]>([]);
  const [referenceSelections, setReferenceSelections] = useState<Record<string, string[]>>({});
  const [showCustomReference, setShowCustomReference] = useState(false);
  const [skipReference, setSkipReference] = useState(false);
  const [referenceSignal, setReferenceSignal] = useState("");
  const [referenceSupports, setReferenceSupports] = useState(true);

  const uploadReference = trpc.miraV4.uploadLevel2Inspiration.useMutation({
    onSuccess: async () => {
      setSkipReference(false);
      await utils.miraV4.getLevel2State.invalidate({ journeyId });
    },
  });

  const uploadPersonalReference = trpc.miraV4.uploadLevel2PersonalReference.useMutation({
    onSuccess: async () => {
      await utils.miraV4.getLevel2State.invalidate({ journeyId });
    },
  });

  const handleReferenceFiles = async (files: FileList | null) => {
    if (!files?.length || uploadReference.isPending) return;
    const remaining = Math.max(0, 5 - (level2State.data?.inspirations.length ?? 0));
    for (const file of Array.from(files).slice(0, remaining)) {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      await uploadReference.mutateAsync({ journeyId, originalName: file.name, mimeType: file.type as "image/jpeg" | "image/png" | "image/webp", base64 });
    }
  };

  const handlePersonalReferenceFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || uploadPersonalReference.isPending || level2State.data?.personal_reference_image) return;
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    await uploadPersonalReference.mutateAsync({
      journeyId,
      originalName: file.name,
      mimeType: file.type as "image/jpeg" | "image/png" | "image/webp",
      base64,
    });
  };

  const [direction, setDirection] = useState("");
  const [showCustomDirection, setShowCustomDirection] = useState(false);
  const [directionResponse, setDirectionResponse] = useState<"yes" | "almost" | "not_quite" | "">("");
  const [guardrails, setGuardrails] = useState("");
  const [experiments, setExperiments] = useState("");

  const showInteraction = (index: number, mode: "push" | "replace" = "push") => {
    const bounded = Math.max(0, Math.min(index, ORDER.length - 1));
    setActiveIndex(bounded);
    writeJourneyStep("interaction", ORDER[bounded], mode);
  };

  const level2State = trpc.miraV4.getLevel2State.useQuery(
    { journeyId },
    { enabled: Boolean(user) && Number.isInteger(journeyId) && journeyId > 0, retry: false },
  );

  const saveLevel2Answer = trpc.miraV4.saveLevel2Answer.useMutation({
    onSuccess: async response => {
      showInteraction(Math.min(activeIndex + 1, ORDER.length - 1));
      await utils.miraV4.getLevel2State.invalidate({ journeyId });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });

  const loadFixture = trpc.miraV4.loadLevel2Fixture.useMutation({
    onSuccess: async () => {
      await utils.miraV4.getLevel2State.invalidate({ journeyId });
    },
  });

  useEffect(() => {
    const onPopState = () => {
      const index = readJourneyStepIndex("interaction", ORDER);
      if (index !== null) setActiveIndex(index);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!level2State.data?.answers) return;
    const answers = level2State.data.answers as Record<string, any>;
    if (answers.core_tension_probe?.derived?.anchorLine) {
      setAnchorLine(answers.core_tension_probe.derived.anchorLine);
      setShowCustomAnchor(!discoverOptions(level2State.data.discoverResult).includes(answers.core_tension_probe.derived.anchorLine));
    }
    const shoot = answers.core_tension_probe?.shootContext;
    if (shoot?.shootPurpose) setShootPurpose(shoot.shootPurpose);
    if (shoot?.objective?.length) setObjectives(shoot.objective);
    if (shoot?.usageChannels?.length) setUsageChannels(shoot.usageChannels);
    if (shoot?.practicalConstraints) setConstraints(shoot.practicalConstraints);
    if (answers.ab_visual_calibration?.rawPairs?.length) {
      setVisualChoices(Object.fromEntries(answers.ab_visual_calibration.rawPairs.map((pair: any) => [pair.pairId, { chosen: pair.chosen, reasonTags: pair.reasonTags ?? [] }])));
    }
    if (answers.reference_interpretation?.rawReferences?.[0]) {
      const reference = answers.reference_interpretation.rawReferences[0];
      const knownSignals = REFERENCE_SIGNALS.filter(signal => reference.observedSignal.includes(signal));
      setReferenceSignals(knownSignals);
      setReferenceSignal(knownSignals.length ? "" : reference.observedSignal);
      setShowCustomReference(knownSignals.length === 0);
      setReferenceSupports(reference.supportsDirection);
    } else if (answers.reference_interpretation) {
      setSkipReference(true);
    }
    if (answers.create_preparation?.derived?.direction) {
      setDirection(answers.create_preparation.derived.direction);
      setGuardrails(answers.create_preparation.derived.guardrails.join("\n"));
      setExperiments(answers.create_preparation.derived.experiments.join("\n"));
    } else if (level2State.data.discoverResult?.notThis?.length) {
      setGuardrails(level2State.data.discoverResult.notThis.map((item: string) => `Avoid ${item.toLowerCase()}`).join("\n"));
    }

    if (level2State.data.nextKey) {
      const visibleNextKey = level2State.data.nextKey === "notion_intelligence" ? "create_preparation" : level2State.data.nextKey;
      const idx = ORDER.indexOf(visibleNextKey as Level2Key);
      const historyIndex = readJourneyStepIndex("interaction", ORDER);
      if (historyIndex !== null) setActiveIndex(historyIndex);
      else if (idx >= 0) showInteraction(idx, "replace");
    }
  }, [level2State.data]);

  const currentKey = ORDER[Math.max(0, Math.min(activeIndex, ORDER.length - 1))];
  const currentMeta = TITLES[currentKey];
  const anchorOptions = discoverOptions(level2State.data?.discoverResult);
  const referenceAnswer = uniqueShort([...referenceSignals, referenceSignal]).join(", ");
  const directionOptions = uniqueShort([
    anchorLine && referenceAnswer ? `${anchorLine}. ${referenceSupports ? "Keep" : "Reject"} ${referenceAnswer}.` : null,
    anchorLine,
    referenceAnswer ? `${referenceSupports ? "Keep" : "Reject"} ${referenceAnswer}` : null,
  ], 3);
  const discoverGuardrails = uniqueShort([
    ...(level2State.data?.discoverResult?.notThis ?? []).map(item => `Avoid ${item.toLowerCase()}`),
    !referenceSupports && referenceAnswer ? `Avoid ${referenceAnswer}` : null,
  ]);

  const canContinue = useMemo(() => {
    if (currentKey === "core_tension_probe") return anchorLine.trim().length >= 8 && objectives.length > 0 && usageChannels.length > 0;
    if (currentKey === "ab_visual_calibration") return MIRA_LEVEL2_VISUAL_PAIRS.every(pair => visualChoices[pair.pairId]);
    if (currentKey === "reference_interpretation") {
      if (skipReference) return true;
      if (level2State.data?.inspirations.length) return level2State.data.inspirations.every(image => (referenceSelections[image.id] ?? []).length > 0);
      return referenceAnswer.length > 1;
    }
    return directionResponse === "yes" ? direction.trim().length >= 8 : Boolean(directionResponse) && direction.trim().length >= 2;
  }, [anchorLine, currentKey, direction, directionResponse, level2State.data?.inspirations, objectives.length, referenceAnswer, referenceSelections, skipReference, usageChannels.length, visualChoices]);

  const toggle = (value: string, setValues: (next: string[]) => void, current: string[]) =>
    setValues(current.includes(value) ? current.filter(item => item !== value) : [...current, value]);

  const persistAnswer = () => {
    if (saveLevel2Answer.isPending) return;

    if (currentKey === "core_tension_probe") {
      saveLevel2Answer.mutate({
        journeyId,
        key: "core_tension_probe",
        value: {
          anchorLine: anchorLine.trim(),
          shootContext: { shootPurpose, objective: objectives, usageChannels, practicalConstraints: [...constraints, ...(practicalNote.trim() ? [`Other: ${practicalNote.trim()}`] : [])] },
        },
      });
      return;
    }

    if (currentKey === "ab_visual_calibration") {
      saveLevel2Answer.mutate({
        journeyId,
        key: "ab_visual_calibration",
        value: {
          pairs: MIRA_LEVEL2_VISUAL_PAIRS.map(pair => {
            const response = visualChoices[pair.pairId];
            const shownOrder = deterministicShownOrder(journeyId, pair.pairId);
            return {
              ...pair,
              optionA: pair.valueA,
              optionB: pair.valueB,
              shownOrder,
              chosen: response.chosen,
              reasonTags: response.reasonTags,
              rationale: response.reasonTags.join(", "),
              confidence: response.chosen === "A" || response.chosen === "B" ? 3 : 1,
            };
          }),
        },
      });
      return;
    }

    if (currentKey === "reference_interpretation") {
      saveLevel2Answer.mutate({
        journeyId,
        key: "reference_interpretation",
        value: {
          references: skipReference ? [] : level2State.data?.inspirations.length
            ? level2State.data.inspirations.map(image => ({
              referenceId: image.id,
              observedSignal: (referenceSelections[image.id] ?? []).join(", ") || referenceAnswer,
              supportsDirection: true,
              confidence: 4,
            }))
            : [{ referenceId: "customer_reference", observedSignal: referenceAnswer, supportsDirection: referenceSupports, confidence: 4 }],
        },
      });
      return;
    }

    if (currentKey === "create_preparation") {
      saveLevel2Answer.mutate({
        journeyId,
        key: "create_preparation",
        value: {
          direction: direction.trim(),
          guardrails: guardrails.split("\n").map(item => item.trim()).filter(Boolean),
          experiments: experiments.split("\n").map(item => item.trim()).filter(Boolean),
        },
      });
    }
  };

  if (loading || level2State.isLoading) {
    return <Mira123Shell><Loader2 className="size-5 animate-spin text-amber-100/80" /></Mira123Shell>;
  }

  if (!level2State.data || level2State.error) {
    return (
      <Mira123Shell>
        <section className="mira-l123-panel max-w-2xl text-center">
          <p className="mira-l123-kicker">Level 2 unavailable</p>
          <h1 className="mira-display mt-6 text-4xl text-amber-50">This DEEPER journey could not be loaded.</h1>
          <Button onClick={() => navigate(`/mira-1/journey/${journeyId}`)} className="mira-l123-cta mt-8 rounded-full px-6 text-amber-50">
            <ArrowLeft className="mr-2 size-4" /> Back to Discover
          </Button>
        </section>
      </Mira123Shell>
    );
  }

  if (level2State.data.synthesis) {
    const synthesis = level2State.data.synthesis;
    return (
      <Mira123Shell>
        <section className="mira-l123-panel mira-l123-narrow">
          <TopNav />
          <p className="mira-l123-progress mt-8">DEEPER COMPLETE</p>
          <h1 className="mira-display mt-4 text-[clamp(1.8rem,3.8vw,2.5rem)] leading-[1.08] text-amber-50">Preparation for CREATE is ready.</h1>

          <article className="mira-l123-result-block mt-7">
            <p className="mira-l123-kicker">Your direction</p>
            <div className="mt-2 space-y-2">
              {synthesis.calibrationInsights.map((line: string) => <p key={line} className="text-sm text-stone-200">{line}</p>)}
            </div>
          </article>

          <article className="mira-l123-result-block mt-4">
            <p className="mira-l123-kicker">CREATE direction</p>
            <p className="mt-2 text-sm text-stone-200">{synthesis.createPreparation.direction}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {synthesis.createPreparation.guardrails.map((item: string) => <span key={item} className="mira-l123-chip">{item}</span>)}
            </div>
          </article>

          <div className="mt-8 flex items-center justify-between">
            <Button type="button" onClick={() => navigate(`/mira-1/journey/${journeyId}`)} className="mira-l123-ghost rounded-full px-6 text-amber-50">
              <ArrowLeft className="mr-2 size-4" /> Back to Discover
            </Button>
            <Button type="button" onClick={() => window.location.assign(`/mira-1/journey/${journeyId}/create`)} className="mira-l123-cta rounded-full px-7 text-amber-50">
              Continue to CREATE <ArrowRight className="ml-2 size-4" />
            </Button>
          </div>
        </section>
      </Mira123Shell>
    );
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    persistAnswer();
  };

  return (
    <Mira123Shell>
      <section className="mira-l123-panel mira-l123-narrow">
        <TopNav />
        <p className="mira-l123-progress mt-8">INTERACTION {String(activeIndex + 1).padStart(2, "0")} / 04</p>
        <h1 className="mira-display mt-4 text-[clamp(1.7rem,4vw,2.4rem)] leading-[1.08] text-amber-50">{currentMeta.title}</h1>
        <p className="mt-3 text-[14px] leading-7 text-stone-300">{currentMeta.helper}</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {currentKey === "core_tension_probe" ? (
            <div className="space-y-5">
              <div>
                <p className="text-xs text-stone-300">Based on DISCOVER — choose one to confirm</p>
                <div className="mira-l2-choices mt-2">{anchorOptions.map(item => <button key={item} type="button" onClick={() => { setAnchorLine(item); setShowCustomAnchor(false); }} className={`mira-l123-chip ${anchorLine === item && !showCustomAnchor ? "mira-l123-chip-active" : ""}`}>{item}</button>)}</div>
                <button type="button" onClick={() => { setShowCustomAnchor(true); setAnchorLine(""); }} className={`mira-l123-chip mt-2 ${showCustomAnchor ? "mira-l123-chip-active" : ""}`}>Something else</button>
                {showCustomAnchor ? <Input autoFocus value={anchorLine} onChange={event => setAnchorLine(event.target.value.slice(0, 260))} placeholder="A short quality or contrast" className="mt-3 h-11 border-amber-100/20 bg-black/35 text-stone-100" /> : null}
              </div>
              <div className="border-t border-amber-100/15 pt-5"><p className="text-xs text-stone-300">What is the main goal of this shoot?</p><div className="mira-l2-choices mt-2">{["website", "launch", "campaign", "personal brand refresh", "social content", "press/speaking", "editorial portrait", "product/service launch", "other"].map(item => <button key={item} type="button" onClick={() => setShootPurpose(item)} className={`mira-l123-chip ${shootPurpose === item ? "mira-l123-chip-active" : ""}`}>{item}</button>)}</div></div>
              <div><p className="text-xs text-stone-300">What should the images do?</p><div className="mira-l2-choices mt-2">{["build trust", "create desire", "show expertise", "feel premium", "feel human", "differentiate", "communicate transformation", "tell a visual story", "create a versatile image library"].map(item => <button key={item} type="button" onClick={() => toggle(item, setObjectives, objectives)} className={`mira-l123-chip ${objectives.includes(item) ? "mira-l123-chip-active" : ""}`}>{item}</button>)}</div></div>
              <div><p className="text-xs text-stone-300">Where will you use the images?</p><div className="mira-l2-choices mt-2">{["website", "Instagram", "LinkedIn", "press", "ads", "email", "course/program", "print", "vertical video", "other"].map(item => <button key={item} type="button" onClick={() => toggle(item, setUsageChannels, usageChannels)} className={`mira-l123-chip ${usageChannels.includes(item) ? "mira-l123-chip-active" : ""}`}>{item}</button>)}</div></div>
              <div><p className="text-xs text-stone-300">What is realistic for this shoot?</p><p className="mt-1 text-xs text-stone-500">Choose anything MIRA should know when building the shoot.</p><div className="mira-l2-choices mt-2">{["indoors", "outdoors", "studio is possible", "I already have a location", "keep production simple", "I have a team", "I’ll be doing this mostly myself", "products need to appear", "I need help with wardrobe"].map(item => <button key={item} type="button" onClick={() => toggle(item, setConstraints, constraints)} className={`mira-l123-chip ${constraints.includes(item) ? "mira-l123-chip-active" : ""}`}>{item}</button>)}</div><Input value={practicalNote} onChange={event => setPracticalNote(event.target.value.slice(0, 80))} placeholder="Anything else MIRA should know? (optional)" className="mt-3 h-11 border-amber-100/20 bg-black/35 text-stone-100" /></div>
            </div>
          ) : null}

          {currentKey === "ab_visual_calibration" ? (
            <div className="space-y-7">
              {MIRA_LEVEL2_VISUAL_PAIRS.map(pair => {
                const shownOrder = deterministicShownOrder(journeyId, pair.pairId);
                const current = visualChoices[pair.pairId];
                const cards = shownOrder.map(side => ({ side, path: side === "A" ? pair.assetAPath : pair.assetBPath, label: side === "A" ? pair.valueA : pair.valueB }));
                return <fieldset key={pair.pairId} className="mira-l123-result-block"><legend className="mira-l123-kicker">{pair.primaryDimension}</legend>
                  <div className="mt-3 grid grid-cols-2 gap-3">{cards.map(card => <button key={card.side} type="button" onClick={() => setVisualChoices(old => ({ ...old, [pair.pairId]: { chosen: card.side, reasonTags: old[pair.pairId]?.reasonTags ?? [] } }))} className={`overflow-hidden rounded-xl border ${current?.chosen === card.side ? "border-amber-200" : "border-amber-100/20"}`}><img src={card.path} alt={`${pair.primaryDimension}: ${card.label}`} className="aspect-square w-full object-cover" /><span className="block p-2 text-xs text-stone-200">{card.label}</span></button>)}</div>
                  <div className="mira-l2-choices mt-3">{(["both", "neither", "not_sure"] as const).map(choice => <button key={choice} type="button" onClick={() => setVisualChoices(old => ({ ...old, [pair.pairId]: { chosen: choice, reasonTags: old[pair.pairId]?.reasonTags ?? [] } }))} className={`mira-l123-chip ${current?.chosen === choice ? "mira-l123-chip-active" : ""}`}>{choice.replace("_", " ")}</button>)}</div>
                  {current ? <div className="mt-3"><p className="text-sm text-stone-200">What made you choose it?</p><p className="mt-1 text-xs leading-5 text-stone-400">Pick anything that caught your eye — the light, colour, mood, movement, styling, or simply the feeling. There’s no right answer.</p><div className="mira-l2-choices mt-3">{VISUAL_REASON_TAGS.map(tag => <button key={tag} type="button" onClick={() => setVisualChoices(old => ({ ...old, [pair.pairId]: { ...old[pair.pairId], reasonTags: old[pair.pairId].reasonTags.includes(tag) ? old[pair.pairId].reasonTags.filter(item => item !== tag) : [...old[pair.pairId].reasonTags, tag] } }))} className={`mira-l123-chip ${current.reasonTags.includes(tag) ? "mira-l123-chip-active" : ""}`}>{tag}</button>)}</div></div> : null}
                </fieldset>;
              })}
            </div>
          ) : null}

          {currentKey === "reference_interpretation" ? (
            <div className="space-y-3">
              {!level2State.data.inspirations.length ? <p className="text-sm leading-6 text-stone-400">Upload a JPG, PNG or WebP. Screenshots and Pinterest images work best when saved in a smaller size.</p> : null}
              <div className="grid gap-4 sm:grid-cols-2">
                {level2State.data.inspirations.map(image => <figure key={image.id} className="overflow-hidden rounded-xl border border-amber-100/20 bg-black/20"><img src={image.url} alt="Your inspiration" className="aspect-[4/3] w-full object-cover" /><figcaption className="space-y-3 p-3"><p className="text-sm text-stone-200">What do you love about this image?</p><div className="mira-l2-choices">{REFERENCE_SIGNALS.map(signal => <button key={signal} type="button" onClick={() => setReferenceSelections(current => ({ ...current, [image.id]: (current[image.id] ?? []).includes(signal) ? current[image.id].filter(item => item !== signal) : [...(current[image.id] ?? []), signal] }))} className={`mira-l123-chip ${(referenceSelections[image.id] ?? []).includes(signal) ? "mira-l123-chip-active" : ""}`}>{signal.replace(/^the /, "")}</button>)}</div></figcaption></figure>)}
                {level2State.data.inspirations.length < 5 ? <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-amber-100/30 text-center text-xs text-stone-300">
                  {uploadReference.isPending ? <Loader2 className="mb-2 size-5 animate-spin" /> : <ImagePlus className="mb-2 size-5" />}
                  Add inspiration
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={event => void handleReferenceFiles(event.target.files)} />
                </label> : null}
              </div>
              {!level2State.data.inspirations.length ? <><p className="text-sm text-stone-400">Inspiration is optional. Add up to five images, or continue without one.</p><div className="mira-l2-choices">{REFERENCE_SIGNALS.map(signal => <button key={signal} type="button" onClick={() => { setSkipReference(false); setReferenceSignals(current => current.includes(signal) ? current.filter(item => item !== signal) : [...current, signal]); }} className={`mira-l123-chip ${referenceSignals.includes(signal) && !skipReference ? "mira-l123-chip-active" : ""}`}>{signal.replace(/^the /, "")}</button>)}</div></> : null}
              <button type="button" onClick={() => setShowCustomReference(value => !value)} className={`mira-l123-chip ${showCustomReference ? "mira-l123-chip-active" : ""}`}>Something else</button>
              {showCustomReference ? <Input autoFocus value={referenceSignal} onChange={event => setReferenceSignal(event.target.value.slice(0, 220))} placeholder="Add one short visual detail" className="h-11 border-amber-100/20 bg-black/35 text-stone-100" /> : null}
              <button type="button" onClick={() => { setSkipReference(true); setReferenceSignals([]); setReferenceSignal(""); setShowCustomReference(false); }} className={`mira-l123-chip ${skipReference ? "mira-l123-chip-active" : ""}`}>No reference to add</button>
              {!skipReference && !level2State.data.inspirations.length ? <div className="mira-l2-choices">
                <button type="button" className={`mira-l123-chip ${referenceSupports ? "mira-l123-chip-active" : ""}`} onClick={() => setReferenceSupports(true)}>Keep this</button>
                <button type="button" className={`mira-l123-chip ${!referenceSupports ? "mira-l123-chip-active" : ""}`} onClick={() => setReferenceSupports(false)}>Avoid this</button>
              </div> : null}
              <section className="mira-l123-result-block mt-6 space-y-3" aria-labelledby="personal-reference-title">
                <div>
                  <h3 id="personal-reference-title" className="text-base font-medium text-stone-100">Want the moodboard to feel more like you?</h3>
                  <p className="mt-2 text-sm font-medium text-stone-200">Upload a photo of yourself — optional</p>
                  <p className="mt-2 text-sm leading-6 text-stone-400">A simple recent photo is enough. It doesn’t need to be professional.</p>
                  <p className="mt-1 text-sm leading-6 text-stone-400">MIRA can use it as visual reference when creating your moodboard, so the person in the visual direction feels closer to you.</p>
                </div>
                {level2State.data.personal_reference_image ? (
                  <figure className="flex items-center gap-3 rounded-xl border border-amber-100/20 bg-black/20 p-3">
                    <img src={level2State.data.personal_reference_image.url} alt="Your personal reference" className="size-20 rounded-lg object-cover" />
                    <figcaption className="text-sm text-stone-300">Photo added for appearance reference</figcaption>
                  </figure>
                ) : (
                  <label className="mira-l123-chip inline-flex cursor-pointer items-center gap-2">
                    {uploadPersonalReference.isPending ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                    Upload my photo
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event => void handlePersonalReferenceFile(event.target.files)} />
                  </label>
                )}
              </section>
            </div>
          ) : null}

          {currentKey === "create_preparation" ? (
            <div className="space-y-5">
              <p className="mira-l123-result-block text-sm leading-7 text-stone-200">{`${anchorLine || "Your world should feel human and distinctive"}. ${referenceAnswer ? `${referenceSupports ? "The images should preserve" : "They should move away from"} ${referenceAnswer}.` : "The images should feel considered without becoming generic or distant."}`}</p>
              <div><p className="text-sm text-stone-200">Does this feel right?</p><div className="mira-l2-choices mt-2">{[["yes", "Yes, this feels like me"], ["almost", "Almost — I want to adjust something"], ["not_quite", "Not quite"]].map(([value, label]) => <button key={value} type="button" onClick={() => { setDirectionResponse(value as typeof directionResponse); if (value === "yes") { setDirection(directionOptions[0] ?? anchorLine); setShowCustomDirection(false); } else { setDirection(""); setShowCustomDirection(true); } }} className={`mira-l123-chip ${directionResponse === value ? "mira-l123-chip-active" : ""}`}>{label}</button>)}</div></div>
              {showCustomDirection ? <Input autoFocus value={direction} onChange={event => setDirection(event.target.value.slice(0, 280))} placeholder="Tell MIRA what feels off." className="h-11 border-amber-100/20 bg-black/35 text-stone-100" /> : null}
              <div><p className="text-xs text-stone-300">Keep out <span className="text-stone-500">(optional)</span></p><div className="mira-l2-choices mt-2">{uniqueShort([...discoverGuardrails, "Avoid generic cues", "Avoid over-polish"]).map(item => <button key={item} type="button" onClick={() => setGuardrails(value => toggleLine(value, item))} className={`mira-l123-chip ${lines(guardrails).includes(item) ? "mira-l123-chip-active" : ""}`}>{item.replace(/^Avoid /, "")}</button>)}</div></div>
              <div><p className="text-xs text-stone-300">One optional variation</p><div className="mira-l2-choices mt-2">{EXPERIMENT_OPTIONS.map(item => <button key={item} type="button" onClick={() => setExperiments(item === "No extra variation — keep it focused" ? "" : item)} className={`mira-l123-chip ${(item === "No extra variation — keep it focused" ? !experiments : lines(experiments).includes(item)) ? "mira-l123-chip-active" : ""}`}>{item}</button>)}</div></div>
            </div>
          ) : null}

          <div className="mt-6 flex items-center justify-between border-t border-amber-100/20 pt-5">
            <button type="button" onClick={() => showInteraction(activeIndex - 1)} disabled={activeIndex === 0 || saveLevel2Answer.isPending} className="mira-l123-back">
              <ArrowLeft className="size-4" /> Back
            </button>

              <Button type="submit" disabled={!canContinue || saveLevel2Answer.isPending} className="mira-l123-cta rounded-full px-7 text-amber-50">
                {saveLevel2Answer.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Continue
                {!saveLevel2Answer.isPending ? <ArrowRight className="ml-2 size-4" /> : null}
              </Button>
          </div>

          {hasDevTools ? (
            <div className="mira-l123-devpanel">
              <p className="text-[11px] uppercase tracking-[0.2em] text-amber-100/70">Development fixtures</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["editorial_founder", "quiet_luxury", "playful_operator"] as FixtureProfile[]).map(profile => (
                  <button key={profile} type="button" onClick={() => loadFixture.mutate({ journeyId, profile })} className="mira-l123-devchip" disabled={loadFixture.isPending}>
                    {profile}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {saveLevel2Answer.error ? <p className="text-sm text-red-300">{customerError(saveLevel2Answer.error, "We couldn’t save that yet. Please check this step and try again.")}</p> : null}
          {uploadReference.error ? <p className="text-sm text-red-300">We couldn’t add this image. Try a JPG, PNG or WebP, or save the image/screenshot in a smaller size and upload it again.</p> : null}
          {uploadPersonalReference.error ? <p className="text-sm text-red-300">{customerError(uploadPersonalReference.error, "We couldn’t add your photo. Please try another one.")}</p> : null}
          {loadFixture.error ? <p className="text-sm text-red-300">Development data could not be loaded.</p> : null}
        </form>
      </section>
    </Mira123Shell>
  );
}
