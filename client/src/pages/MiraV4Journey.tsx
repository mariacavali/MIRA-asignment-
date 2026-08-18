import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ArrowRight, Check, CornerDownLeft, ImagePlus, Loader2, MapPin, Orbit } from "lucide-react";
import { ChangeEvent, FormEvent, type ReactNode, useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { MiraShell } from "./MiraV3";

const QUICK_CONTEXT_FIELDS = [
  { key: "building", label: "What is your work or brand about?", hint: "The work, offer, practice, or idea taking shape." },
  { key: "currentPosition", label: "What is your current relationship to it?", hint: "Name the honest point you are beginning from." },
  { key: "needMost", label: "How do you want people to feel?", hint: "The emotional response you hope your work can create." },
  { key: "firstCreation", label: "What do you hope this Moodboard helps you create?", hint: "The first place this Brand World needs to become visible." },
] as const;

type QuickContext = Record<(typeof QUICK_CONTEXT_FIELDS)[number]["key"], string>;

const CHOICE_FIELDS = {
  texture: ["Polished", "Tactile", "Organic", "Architectural"],
  colorAttraction: ["Earthy", "Luminous", "Monochrome", "Saturated"],
  typography: ["Editorial serif", "Quiet sans", "Expressive display", "Humanist"],
  imageryWorld: ["Portrait-led", "Objects and detail", "Atmospheric spaces", "Abstract and symbolic"],
} as const;

const TYPOGRAPHY_SAMPLES: Record<(typeof CHOICE_FIELDS)["typography"][number], string> = {
  "Editorial serif": "font-serif text-3xl tracking-tight",
  "Quiet sans": "font-sans text-xl font-medium uppercase tracking-[0.16em]",
  "Expressive display": "mira-display text-3xl leading-none",
  Humanist: "font-sans text-2xl font-light tracking-wide",
};

type CreativeBrief = {
  warmth: number;
  structure: number;
  expression: number;
  texture: string;
  colorAttraction: string;
  typography: string;
  imageryWorld: string;
};

type VisualReference = {
  id: string;
  url: string;
  direction: string;
  prompt: string;
};

type BrandBlueprintPreview = {
  yourWords: string[];
  miraSees: string;
  signaturePatterns: string[];
  definingTensions: string[];
  brandWorld: {
    atmosphere: string;
    colour: string;
    light: string;
    materials: string;
    environmentArchitecture: string;
    styling: string;
    movement: string;
    composition: string;
  };
  presence: {
    expression: string;
    bodyLanguage: string;
    movement: string;
    relationshipToCamera: string;
  };
  creativeRules: {
    belongs: string[];
    avoid: string[];
  };
  suggestedCreativeBrief: CreativeBrief;
};

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

export default function MiraV4Journey() {
  const params = useParams<{ journeyId: string }>();
  const journeyId = Number(params.journeyId);
  const [, navigate] = useLocation();
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });
  const utils = trpc.useUtils();
  const [quickContext, setQuickContext] = useState<QuickContext>({
    building: "",
    currentPosition: "",
    needMost: "",
    firstCreation: "",
  });
  const [birthDetails, setBirthDetails] = useState({
    birthDate: "",
    birthTime: "",
    birthTimeUnknown: false,
    birthCity: "",
    birthPlaceId: "",
  });
  const [debouncedBirthCityQuery, setDebouncedBirthCityQuery] = useState("");
  const [creativeBrief, setCreativeBrief] = useState<CreativeBrief>({
    warmth: 50,
    structure: 50,
    expression: 50,
    texture: "",
    colorAttraction: "",
    typography: "",
    imageryWorld: "",
  });
  const [creativeAnswer, setCreativeAnswer] = useState("");
  const [inspirationExplanation, setInspirationExplanation] = useState("");
  const [inspirationError, setInspirationError] = useState("");

  const journey = trpc.miraV4.getJourney.useQuery(
    { journeyId },
    { enabled: Boolean(user) && Number.isInteger(journeyId) && journeyId > 0, retry: false },
  );
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedBirthCityQuery(birthDetails.birthCity.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [birthDetails.birthCity]);
  const citySearch = trpc.miraV4.searchBirthCities.useQuery(
    { query: debouncedBirthCityQuery },
    {
      enabled:
        Boolean(user) &&
        journey.data?.currentStep === "birth_details" &&
        !birthDetails.birthPlaceId &&
        debouncedBirthCityQuery.length >= 2,
      retry: false,
      staleTime: 30_000,
    },
  );
  const saveQuickContext = trpc.miraV4.saveQuickContext.useMutation({
    onSuccess: async () => {
      await utils.miraV4.getJourney.invalidate({ journeyId });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });
  const saveBirthDetails = trpc.miraV4.saveBirthDetails.useMutation({
    onSuccess: async () => {
      await utils.miraV4.getJourney.invalidate({ journeyId });
      startRecognition.mutate({ journeyId });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });
  const recognitionEnabled = journey.data?.currentStep === "recognition";
  const recognition = trpc.miraV4.getRecognitionState.useQuery(
    { journeyId },
    { enabled: Boolean(user) && recognitionEnabled, retry: false },
  );
  const [recognitionAnswer, setRecognitionAnswer] = useState("");
  const startRecognition = trpc.miraV4.startRecognition.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.miraV4.getJourney.invalidate({ journeyId }),
        utils.miraV4.getRecognitionState.invalidate({ journeyId }),
      ]);
    },
  });
  const submitRecognitionAnswer = trpc.miraV4.submitRecognitionAnswer.useMutation({
    onSuccess: async () => {
      setRecognitionAnswer("");
      await Promise.all([
        utils.miraV4.getJourney.invalidate({ journeyId }),
        utils.miraV4.getRecognitionState.invalidate({ journeyId }),
      ]);
    },
  });
  const creativeEnabled = journey.data?.currentStep === "creative_discovery";
  const creative = trpc.miraV4.getCreativeState.useQuery(
    { journeyId },
    { enabled: Boolean(user) && creativeEnabled, retry: false },
  );
  const blueprintPreview = trpc.miraV4.getBrandBlueprintPreview.useQuery(
    { journeyId },
    {
      enabled: Boolean(user) && journey.data?.currentStep === "creative_brief",
      retry: false,
      staleTime: 60_000,
    },
  );
  const saveCreativeBrief = trpc.miraV4.saveCreativeBrief.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.miraV4.getJourney.invalidate({ journeyId }),
        utils.miraV4.getCreativeState.invalidate({ journeyId }),
      ]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });
  const submitCreativeAnswer = trpc.miraV4.submitCreativeAnswer.useMutation({
    onSuccess: async () => {
      setCreativeAnswer("");
      await Promise.all([
        utils.miraV4.getJourney.invalidate({ journeyId }),
        utils.miraV4.getCreativeState.invalidate({ journeyId }),
      ]);
    },
  });
  const uploadInspiration = trpc.miraV4.uploadInspirationImage.useMutation({
    onSuccess: async () => {
      setInspirationError("");
      await utils.miraV4.getJourney.invalidate({ journeyId });
    },
    onError: error => setInspirationError(error.message),
  });
  const completeInspiration = trpc.miraV4.completeInspiration.useMutation({
    onSuccess: async () => {
      await utils.miraV4.getJourney.invalidate({ journeyId });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });
  const visualEnabled = ["visual_discovery", "visual_refinement", "moodboard"].includes(journey.data?.currentStep ?? "");
  const moodboard = trpc.miraV4.getMoodboardState.useQuery(
    { journeyId },
    { enabled: Boolean(user) && visualEnabled, retry: false },
  );
  const invalidateVisualState = async () => {
    await Promise.all([
      utils.miraV4.getJourney.invalidate({ journeyId }),
      utils.miraV4.getMoodboardState.invalidate({ journeyId }),
    ]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const synthesizeCreativeDna = trpc.miraV4.synthesizeCreativeDna.useMutation({ onSuccess: invalidateVisualState });
  const generateVisualReferences = trpc.miraV4.generateVisualReferences.useMutation({ onSuccess: invalidateVisualState });
  const refineVisualReferences = trpc.miraV4.refineVisualReferences.useMutation({ onSuccess: invalidateVisualState });
  const generateFinalMoodboard = trpc.miraV4.generateFinalMoodboard.useMutation({ onSuccess: invalidateVisualState });

  useEffect(() => {
    if (!journey.data) return;
    setQuickContext({
      building: journey.data.building ?? "",
      currentPosition: journey.data.currentPosition ?? "",
      needMost: journey.data.needMost ?? "",
      firstCreation: journey.data.firstCreation ?? "",
    });
    setBirthDetails({
      birthDate: journey.data.birthDate ?? "",
      birthTime: journey.data.birthTime ?? "",
      birthTimeUnknown: Boolean(journey.data.birthTimeUnknown),
      birthCity: journey.data.birthCity ?? "",
      birthPlaceId: "",
    });
    const savedCreative = journey.data.creativeInputs as CreativeBrief | null;
    if (savedCreative) setCreativeBrief(savedCreative);
    setInspirationExplanation(journey.data.inspirationExplanation ?? "");
  }, [journey.data]);

  useEffect(() => {
    if (journey.data?.currentStep !== "creative_brief") return;
    if (journey.data.creativeInputs) return;
    if (!blueprintPreview.data?.suggestedCreativeBrief) return;
    setCreativeBrief(blueprintPreview.data.suggestedCreativeBrief);
  }, [journey.data?.currentStep, journey.data?.creativeInputs, blueprintPreview.data]);

  if (loading || journey.isLoading) {
    return <MiraShell><Loader2 className="size-5 animate-spin text-stone-400" /></MiraShell>;
  }

  if (!journey.data || journey.error) {
    return (
      <MiraShell>
        <section className="mira-panel max-w-xl text-center">
          <p className="mira-kicker">This Brand World is not available</p>
          <h1 className="mira-display mt-6 text-4xl">Return to your private Mira space.</h1>
          <Button variant="ghost" onClick={() => navigate("/mira-v4")} className="mt-8 rounded-full">
            <ArrowLeft className="mr-2 size-4" /> Return
          </Button>
        </section>
      </MiraShell>
    );
  }

  const submitQuickContext = (event: FormEvent) => {
    event.preventDefault();
    saveQuickContext.mutate({ journeyId, ...quickContext });
  };

  const submitBirthDetails = (event: FormEvent) => {
    event.preventDefault();
    saveBirthDetails.mutate({
      journeyId,
      birthDate: birthDetails.birthDate,
      birthTime: birthDetails.birthTimeUnknown ? null : birthDetails.birthTime || null,
      birthTimeUnknown: birthDetails.birthTimeUnknown,
      birthCity: birthDetails.birthCity,
      birthPlaceId: birthDetails.birthPlaceId,
    });
  };

  const quickContextValid = Object.values(quickContext).every(value => value.trim().length >= 2);
  const birthDetailsValid =
    Boolean(birthDetails.birthDate) &&
    birthDetails.birthCity.trim().length >= 2 &&
    Boolean(birthDetails.birthPlaceId) &&
    (birthDetails.birthTimeUnknown || Boolean(birthDetails.birthTime));

  return (
    <MiraShell>
      <section className="mira-panel w-full max-w-4xl overflow-hidden">
        {journey.data.currentStep === "quick_context" && (
          <form onSubmit={submitQuickContext}>
            <div className="grid gap-10 md:grid-cols-[0.72fr_1.28fr]">
              <div>
                <p className="mira-kicker">Quick Context</p>
                <h1 className="mira-display mt-6 text-5xl leading-[0.98] sm:text-6xl">Give Mira the first creative coordinates.</h1>
                <p className="mt-7 text-sm leading-7 text-stone-600">
                  Not a business plan. Not the polished version. Just enough truth for your Creative Director to understand what is asking to become visible.
                </p>
              </div>
              <div className="space-y-7">
                {QUICK_CONTEXT_FIELDS.map(field => (
                  <label key={field.key} className="block">
                    <span className="mira-display block text-2xl text-stone-900">{field.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-stone-500">{field.hint}</span>
                    <Textarea
                      value={quickContext[field.key]}
                      onChange={event => setQuickContext(current => ({ ...current, [field.key]: event.target.value }))}
                      maxLength={1200}
                      rows={3}
                      className="mt-3 resize-none rounded-2xl border-stone-200 bg-white/70 px-4 py-3 text-stone-900 focus-visible:ring-amber-700/30"
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-10 flex items-center justify-end border-t border-stone-200 pt-7">
              <Button disabled={!quickContextValid || saveQuickContext.isPending} className="rounded-full bg-stone-900 px-7 text-stone-50 hover:bg-stone-800">
                {saveQuickContext.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Let Mira hold this context <ArrowRight className="ml-2 size-4" />
              </Button>
            </div>
            {saveQuickContext.error && <p className="mt-5 text-right text-sm text-red-700">Mira could not hold this context just now. Please try once more.</p>}
          </form>
        )}

        {journey.data.currentStep === "birth_details" && (
          <form onSubmit={submitBirthDetails}>
            <div className="grid gap-10 md:grid-cols-[0.78fr_1.22fr] md:items-start">
              <div>
                <p className="mira-kicker">Birth Details</p>
                <h1 className="mira-display mt-6 text-5xl leading-[0.98] sm:text-6xl">Ground the direction in the details that belong only to you.</h1>
                <p className="mt-7 text-sm leading-7 text-stone-600">
                  Mira keeps these details private. Your selected city lets country and timezone be derived automatically, with no manual timezone entry.
                </p>
              </div>
              <div className="rounded-[2rem] bg-stone-100/80 p-6 sm:p-8">
                <label className="block">
                  <span className="text-sm font-medium text-stone-800">Birth date</span>
                  <Input
                    type="date"
                    value={birthDetails.birthDate}
                    onChange={event => setBirthDetails(current => ({ ...current, birthDate: event.target.value }))}
                    className="mt-3 rounded-xl border-stone-200 bg-white"
                  />
                </label>

                <div className="mt-6">
                  <label htmlFor="mira-v4-birth-city" className="text-sm font-medium text-stone-800">Birth city</label>
                  <div className="relative mt-3">
                    <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
                    <Input
                      id="mira-v4-birth-city"
                      value={birthDetails.birthCity}
                      onChange={event => setBirthDetails(current => ({ ...current, birthCity: event.target.value, birthPlaceId: "" }))}
                      placeholder="Start typing a city"
                      autoComplete="off"
                      aria-autocomplete="list"
                      aria-expanded={Boolean(citySearch.data?.length) && !birthDetails.birthPlaceId}
                      aria-controls="mira-v4-birth-city-options"
                      maxLength={255}
                      className="rounded-xl border-stone-200 bg-white pl-10"
                    />
                  </div>
                  {!birthDetails.birthPlaceId && citySearch.isFetching && <p className="mt-3 text-xs text-stone-500">Finding cities...</p>}
                  {!birthDetails.birthPlaceId && citySearch.data && citySearch.data.length > 0 && (
                    <ul id="mira-v4-birth-city-options" role="listbox" className="mt-3 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_18px_40px_rgba(70,52,31,0.08)]">
                      {citySearch.data.map(city => (
                        <li key={city.placeId} role="option" aria-selected={false}>
                          <button
                            type="button"
                            onClick={() => setBirthDetails(current => ({ ...current, birthCity: city.description, birthPlaceId: city.placeId }))}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-stone-700 transition hover:bg-stone-100 focus-visible:bg-stone-100 focus-visible:outline-none"
                          >
                            <MapPin className="size-4 shrink-0 text-amber-800" />
                            {city.description}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {citySearch.error && !birthDetails.birthPlaceId && <p className="mt-3 text-xs text-red-700">City search is unavailable just now. Please try again.</p>}
                  <p className="mt-3 text-xs leading-5 text-stone-500">
                    {birthDetails.birthPlaceId ? "Selected city. Mira will set country and timezone automatically when you continue." : "Choose a city from the suggested locations so Mira can set country and timezone automatically."}
                  </p>
                </div>

                <label className="mt-6 block">
                  <span className="text-sm font-medium text-stone-800">Birth time</span>
                  <Input
                    type="time"
                    value={birthDetails.birthTime}
                    disabled={birthDetails.birthTimeUnknown}
                    onChange={event => setBirthDetails(current => ({ ...current, birthTime: event.target.value }))}
                    className="mt-3 rounded-xl border-stone-200 bg-white disabled:opacity-50"
                  />
                  <span className="mt-2 block text-xs leading-5 text-stone-500">If you know it, this keeps the private calibration more precise. Otherwise, mark it unknown.</span>
                </label>

                <button
                  type="button"
                  aria-pressed={birthDetails.birthTimeUnknown}
                  onClick={() => setBirthDetails(current => ({ ...current, birthTimeUnknown: !current.birthTimeUnknown, birthTime: "" }))}
                  className="mt-4 flex items-center gap-3 text-left text-sm text-stone-600"
                >
                  <span className={`flex size-5 items-center justify-center rounded-md border ${birthDetails.birthTimeUnknown ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white"}`}>
                    {birthDetails.birthTimeUnknown && <Check className="size-3.5" />}
                  </span>
                  I do not know my exact birth time
                </button>
              </div>
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-7">
              <Button type="button" variant="ghost" onClick={() => navigate("/mira-v4")} className="rounded-full text-stone-500">
                <ArrowLeft className="mr-2 size-4" /> Save and return later
              </Button>
              <Button disabled={!birthDetailsValid || saveBirthDetails.isPending} className="rounded-full bg-stone-900 px-7 text-stone-50 hover:bg-stone-800">
                {saveBirthDetails.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Continue to creative direction <ArrowRight className="ml-2 size-4" />
              </Button>
            </div>
            {saveBirthDetails.error && <p className="mt-5 text-right text-sm text-red-700">{saveBirthDetails.error.message || "Mira could not hold these details just now. Please try once more."}</p>}
          </form>
        )}

        {journey.data.currentStep === "recognition_ready" && (
          <div className="py-6 text-center sm:py-12">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full border border-amber-700/25 bg-amber-50">
              <Orbit className="size-6 text-amber-800" />
            </div>
            <p className="mira-kicker mt-9">Creative direction is ready</p>
            <h1 className="mira-display mx-auto mt-6 max-w-2xl text-5xl leading-[0.98] sm:text-7xl">Mira is opening the creative premise of your Brand World.</h1>
            <p className="mx-auto mt-7 max-w-xl text-base leading-7 text-stone-600">
              Your private context is set. Mira now gathers the evidence that will shape Creative DNA, a Campaign Plan, a Moodboard, and your Brand World.
            </p>
            <Button
              onClick={() => startRecognition.mutate({ journeyId })}
              disabled={startRecognition.isPending}
              className="mt-10 rounded-full bg-stone-900 px-7 text-stone-50 hover:bg-stone-800"
            >
              {startRecognition.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              {startRecognition.isPending ? "Opening creative direction" : "Continue to creative direction"} <ArrowRight className="ml-2 size-4" />
            </Button>
            {startRecognition.error && <p className="mt-5 text-sm text-red-700">Mira could not open the conversation just now. Please try once more.</p>}
          </div>
        )}

        {journey.data.currentStep === "recognition" && (
          <ConversationPanel
            kicker="Creative Premise"
            heading="Mira is gathering the point of view your visual world needs to hold."
            messages={recognition.data?.messages ?? []}
            answer={recognitionAnswer}
            onAnswerChange={setRecognitionAnswer}
            onSubmit={() => {
              const answer = recognitionAnswer.trim();
              if (answer && !submitRecognitionAnswer.isPending) {
                submitRecognitionAnswer.mutate({ journeyId, answer });
              }
            }}
            pending={submitRecognitionAnswer.isPending || recognition.isLoading}
            error={submitRecognitionAnswer.error?.message}
          />
        )}

        {journey.data.currentStep === "creative_brief" && (
          <CreativeBriefStep
            preview={blueprintPreview.data as BrandBlueprintPreview | undefined}
            value={creativeBrief}
            onChange={setCreativeBrief}
            pending={saveCreativeBrief.isPending}
            loadingPreview={blueprintPreview.isLoading}
            error={Boolean(saveCreativeBrief.error)}
            onSubmit={() => saveCreativeBrief.mutate({ journeyId, ...creativeBrief })}
          />
        )}

        {journey.data.currentStep === "creative_discovery" && (
          <ConversationPanel
            kicker="Creative Discovery"
            heading="Each answer becomes usable evidence for the atmosphere, scenes, and visual rules ahead."
            messages={creative.data?.messages ?? []}
            answer={creativeAnswer}
            onAnswerChange={setCreativeAnswer}
            onSubmit={() => {
              const answer = creativeAnswer.trim();
              if (answer && !submitCreativeAnswer.isPending) submitCreativeAnswer.mutate({ journeyId, answer });
            }}
            pending={submitCreativeAnswer.isPending || creative.isLoading}
            error={submitCreativeAnswer.error?.message}
          />
        )}

        {journey.data.currentStep === "inspiration" && (
          <InspirationStep
            savedName={journey.data.inspirationOriginalName}
            explanation={inspirationExplanation}
            onExplanationChange={setInspirationExplanation}
            pending={uploadInspiration.isPending || completeInspiration.isPending}
            error={inspirationError || (completeInspiration.error ? "Mira could not save this step just now. Please try once more." : "")}
            onFile={async file => {
              if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
                setInspirationError("Choose a JPEG, PNG, or WebP image up to 8 MB.");
                return;
              }
              setInspirationError("");
              try {
                uploadInspiration.mutate({ journeyId, originalName: file.name, mimeType: file.type as "image/jpeg" | "image/png" | "image/webp", base64: await fileToBase64(file) });
              } catch {
                setInspirationError("Mira could not read this image. Please choose another file.");
              }
            }}
            onContinue={() => completeInspiration.mutate({ journeyId, explanation: inspirationExplanation.trim() || null })}
          />
        )}

        {journey.data.currentStep === "pre_generation_mirror" && (
          <PreGenerationMirror
            journey={journey.data}
            creativeBrief={creativeBrief}
            pending={synthesizeCreativeDna.isPending}
            error={synthesizeCreativeDna.error?.message}
            onSynthesize={() => synthesizeCreativeDna.mutate({ journeyId })}
            onReturn={() => navigate("/mira-v4")}
          />
        )}

        {journey.data.currentStep === "visual_discovery" && (
          <VisualDirectionStep
            pending={generateVisualReferences.isPending}
            error={generateVisualReferences.error?.message}
            onGenerate={() => generateVisualReferences.mutate({ journeyId })}
          />
        )}

        {["visual_refinement", "moodboard"].includes(journey.data.currentStep) && moodboard.data && (journey.data.currentStep === "visual_refinement" || (moodboard.data.moodboard?.referencesJson?.length ?? 0) !== 5) && (
          <VisualRefinementStep
            initialReferences={(moodboard.data.initial?.referencesJson ?? []) as VisualReference[]}
            refinedReferences={(moodboard.data.refined?.referencesJson ?? []) as VisualReference[]}
            refinedComplete={moodboard.data.refined?.status === "complete"}
            refinePending={refineVisualReferences.isPending}
            finalPending={generateFinalMoodboard.isPending}
            refineError={refineVisualReferences.error?.message}
            finalError={generateFinalMoodboard.error?.message}
            onRefine={input => refineVisualReferences.mutate({ journeyId, ...input })}
            onGenerateFinal={input => generateFinalMoodboard.mutate({ journeyId, ...input })}
          />
        )}

        {journey.data.currentStep === "moodboard" && moodboard.data && (moodboard.data.moodboard?.referencesJson?.length ?? 0) === 5 && (
          <FinalMoodboardStep
            references={(moodboard.data.moodboard?.referencesJson ?? []) as VisualReference[]}
            onReturn={() => navigate("/mira-v4")}
          />
        )}
      </section>
    </MiraShell>
  );
}

function ConversationPanel(props: {
  kicker: string;
  heading: string;
  messages: Array<{ id: number; role: "assistant" | "user"; content: string }>;
  answer: string;
  onAnswerChange: (answer: string) => void;
  onSubmit: () => void;
  pending: boolean;
  error?: string;
}) {
  const latestQuestion = [...props.messages].reverse().find(message => message.role === "assistant");
  const previousMessages = latestQuestion
    ? props.messages.filter(message => message.id !== latestQuestion.id)
    : props.messages;

  return (
    <div>
      <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <aside className="rounded-[2rem] bg-stone-100/75 p-6 sm:p-8">
          <p className="mira-kicker">{props.kicker}</p>
          <h1 className="mira-display mt-5 text-4xl leading-tight">{props.heading}</h1>
          <div className="mt-8 max-h-[28rem] space-y-5 overflow-y-auto pr-2">
            {previousMessages.length === 0 && (
              <p className="text-sm leading-7 text-stone-500">Mira will gather the creative evidence that matters most in your words.</p>
            )}
            {previousMessages.map(message => (
              <div key={message.id} className={message.role === "user" ? "ml-5" : "mr-5"}>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-stone-400">
                  {message.role === "assistant" ? "Mira" : "You"}
                </p>
                <p className="mt-2 whitespace-pre-line text-sm leading-7 text-stone-700">{message.content}</p>
              </div>
            ))}
          </div>
        </aside>

        <div className="flex min-h-[31rem] flex-col justify-between rounded-[2rem] border border-stone-200 bg-white/75 p-6 shadow-[0_28px_80px_rgba(70,52,31,0.08)] sm:p-9">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">Mira is listening</p>
            {props.pending && !latestQuestion ? (
              <Loader2 className="mt-8 size-5 animate-spin text-stone-400" />
            ) : (
              <p className="mira-display mt-7 whitespace-pre-line text-3xl leading-snug text-stone-900 sm:text-4xl">
                {latestQuestion?.content}
              </p>
            )}
          </div>

          <div className="mt-10">
            <Textarea
              value={props.answer}
              onChange={event => props.onAnswerChange(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  props.onSubmit();
                }
              }}
              placeholder="Share what feels true..."
              maxLength={4000}
              rows={5}
              disabled={props.pending || !latestQuestion}
              className="resize-none rounded-2xl border-stone-200 bg-stone-50/80 px-4 py-4 text-base leading-7 focus-visible:ring-amber-700/30"
            />
            <div className="mt-4 flex items-center justify-between gap-4">
              <p className="text-xs leading-5 text-stone-400">Enter sends · Shift + Enter adds a new line</p>
              <Button
                onClick={props.onSubmit}
                disabled={props.pending || !props.answer.trim() || !latestQuestion}
                className="rounded-full bg-stone-900 px-6 text-stone-50 hover:bg-stone-800"
              >
                {props.pending ? <Loader2 className="size-4 animate-spin" /> : <><span>Share this</span><CornerDownLeft className="ml-2 size-4" /></>}
              </Button>
            </div>
            {props.error && <p className="mt-4 text-sm text-red-700">Mira could not hold what you shared just now. Please try once more.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreativeBriefStep(props: {
  preview?: BrandBlueprintPreview;
  value: CreativeBrief;
  onChange: (value: CreativeBrief) => void;
  onSubmit: () => void;
  pending: boolean;
  loadingPreview: boolean;
  error: boolean;
}) {
  const complete = Boolean(props.value.texture && props.value.colorAttraction && props.value.typography && props.value.imageryWorld);
  return (
    <form onSubmit={event => { event.preventDefault(); props.onSubmit(); }}>
      <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
        <div>
          <p className="mira-kicker">Brand Blueprint preview</p>
          <h1 className="mira-display mt-6 text-5xl leading-[0.98] sm:text-6xl">Mira has translated your answers into a first brand world.</h1>
          <p className="mt-7 text-sm leading-7 text-stone-600">This preview is a derived reading of your evidence, not the source of truth itself. Your raw answers and later visual evidence still remain underneath the V4 system.</p>
        </div>
        <div className="space-y-8">
          {props.loadingPreview && (
            <div className="rounded-[2rem] bg-stone-100/75 p-8 text-sm text-stone-500">
              <Loader2 className="size-5 animate-spin text-stone-400" />
              <p className="mt-4">Mira is preparing the first Brand Blueprint preview.</p>
            </div>
          )}

          {props.preview && (
            <div className="space-y-5">
              <BlueprintCard title="Your words">
                <ul className="space-y-3 text-sm leading-7 text-stone-700">
                  {props.preview.yourWords.map(word => (
                    <li key={word} className="border-l border-amber-800/30 pl-4 italic">"{word}"</li>
                  ))}
                </ul>
              </BlueprintCard>

              <BlueprintCard title="Mira sees">
                <p className="text-sm leading-7 text-stone-700">{props.preview.miraSees}</p>
              </BlueprintCard>

              <div className="grid gap-5 lg:grid-cols-2">
                <BlueprintCard title="Signature patterns">
                  <ul className="space-y-3 text-sm leading-7 text-stone-700">
                    {props.preview.signaturePatterns.map(pattern => <li key={pattern}>{pattern}</li>)}
                  </ul>
                </BlueprintCard>
                <BlueprintCard title="Defining tensions">
                  {props.preview.definingTensions.length ? (
                    <ul className="space-y-3 text-sm leading-7 text-stone-700">
                      {props.preview.definingTensions.map(tension => <li key={tension}>{tension}</li>)}
                    </ul>
                  ) : (
                    <p className="text-sm leading-7 text-stone-500">No tension is being overstated here. Mira only includes it when the evidence supports it.</p>
                  )}
                </BlueprintCard>
              </div>

              <BlueprintCard title="Brand world">
                <div className="grid gap-4 sm:grid-cols-2">
                  {([
                    ["Atmosphere", props.preview.brandWorld.atmosphere],
                    ["Colour", props.preview.brandWorld.colour],
                    ["Light", props.preview.brandWorld.light],
                    ["Materials", props.preview.brandWorld.materials],
                    ["Environment / architecture", props.preview.brandWorld.environmentArchitecture],
                    ["Styling", props.preview.brandWorld.styling],
                    ["Movement", props.preview.brandWorld.movement],
                    ["Composition", props.preview.brandWorld.composition],
                  ] as const).map(([label, value]) => (
                    <div key={label}>
                      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-stone-400">{label}</p>
                      <p className="mt-2 text-sm leading-7 text-stone-700">{value}</p>
                    </div>
                  ))}
                </div>
              </BlueprintCard>

              <BlueprintCard title="Presence">
                <div className="grid gap-4 sm:grid-cols-2">
                  {([
                    ["Expression", props.preview.presence.expression],
                    ["Body language", props.preview.presence.bodyLanguage],
                    ["Movement", props.preview.presence.movement],
                    ["Relationship to camera", props.preview.presence.relationshipToCamera],
                  ] as const).map(([label, value]) => (
                    <div key={label}>
                      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-stone-400">{label}</p>
                      <p className="mt-2 text-sm leading-7 text-stone-700">{value}</p>
                    </div>
                  ))}
                </div>
              </BlueprintCard>

              <div className="grid gap-5 lg:grid-cols-2">
                <BlueprintCard title="Creative rules: belongs">
                  <ul className="space-y-3 text-sm leading-7 text-stone-700">
                    {props.preview.creativeRules.belongs.map(rule => <li key={rule}>{rule}</li>)}
                  </ul>
                </BlueprintCard>
                <BlueprintCard title="Creative rules: avoid">
                  <ul className="space-y-3 text-sm leading-7 text-stone-700">
                    {props.preview.creativeRules.avoid.map(rule => <li key={rule}>{rule}</li>)}
                  </ul>
                </BlueprintCard>
              </div>
            </div>
          )}

          <div className="rounded-[2rem] border border-stone-200 bg-white/70 p-6 sm:p-8">
            <p className="mira-display text-2xl text-stone-900">Optional visual calibration</p>
            <p className="mt-3 text-sm leading-7 text-stone-600">Mira has suggested visual defaults from your evidence. Adjust them only if they feel off before continuing into references and Creative DNA.</p>

            <div className="mt-8 space-y-8">
          {([
            ["warmth", "Warm", "Cool"],
            ["structure", "Structured", "Organic"],
            ["expression", "Expressive", "Restrained"],
          ] as const).map(([key, left, right]) => (
            <label key={key} className="block rounded-2xl bg-stone-100/75 p-5">
              <span className="flex justify-between text-xs font-semibold uppercase tracking-[0.14em] text-stone-500"><span>{left}</span><span>{right}</span></span>
              <input type="range" min="0" max="100" value={props.value[key]} onChange={event => props.onChange({ ...props.value, [key]: Number(event.target.value) })} className="mt-5 w-full accent-stone-900" />
            </label>
          ))}
          {(Object.entries(CHOICE_FIELDS) as Array<[keyof typeof CHOICE_FIELDS, readonly string[]]>).map(([key, choices]) => (
            <fieldset key={key}>
              <legend className="mira-display text-2xl capitalize text-stone-900">{key.replace(/([A-Z])/g, " $1")}</legend>
              {key === "typography" ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {choices.map(choice => (
                    <button key={choice} type="button" onClick={() => props.onChange({ ...props.value, [key]: choice })} className={`rounded-2xl border p-4 text-left transition ${props.value[key] === choice ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white/70 text-stone-600 hover:border-stone-400"}`}>
                      <span className={`${TYPOGRAPHY_SAMPLES[choice as keyof typeof TYPOGRAPHY_SAMPLES]} block ${props.value[key] === choice ? "text-white" : "text-stone-900"}`}>Mira Studio</span>
                      <span className={`mt-3 block text-xs font-medium uppercase tracking-[0.14em] ${props.value[key] === choice ? "text-stone-300" : "text-stone-500"}`}>{choice}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {choices.map(choice => (
                    <button key={choice} type="button" onClick={() => props.onChange({ ...props.value, [key]: choice })} className={`rounded-full border px-4 py-2 text-sm transition ${props.value[key] === choice ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white/70 text-stone-600 hover:border-stone-400"}`}>{choice}</button>
                  ))}
                </div>
              )}
            </fieldset>
          ))}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-10 flex justify-end border-t border-stone-200 pt-7">
        <Button disabled={!complete || props.pending} className="rounded-full bg-stone-900 px-7 text-stone-50 hover:bg-stone-800">
          {props.pending && <Loader2 className="mr-2 size-4 animate-spin" />}Continue to visual references <ArrowRight className="ml-2 size-4" />
        </Button>
      </div>
      {props.error && <p className="mt-5 text-right text-sm text-red-700">Mira could not hold this calibration just now. Please try once more.</p>}
    </form>
  );
}

function BlueprintCard(props: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[2rem] bg-stone-100/75 p-6 sm:p-8">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-amber-800">{props.title}</p>
      <div className="mt-4">{props.children}</div>
    </section>
  );
}

function InspirationStep(props: {
  savedName: string | null;
  explanation: string;
  onExplanationChange: (value: string) => void;
  onFile: (file: File) => void;
  onContinue: () => void;
  pending: boolean;
  error: string;
}) {
  return (
    <div className="grid gap-10 lg:grid-cols-[0.76fr_1.24fr]">
      <div>
        <p className="mira-kicker">Optional inspiration</p>
        <h1 className="mira-display mt-6 text-5xl leading-[0.98] sm:text-6xl">One reference can sometimes say what words cannot.</h1>
        <p className="mt-7 text-sm leading-7 text-stone-600">Upload one image only if it carries an atmosphere, texture, composition, or feeling that can sharpen the direction. It is stored privately as supporting reference and is not analysed in this stage.</p>
      </div>
      <div className="rounded-[2rem] border border-stone-200 bg-white/70 p-6 sm:p-8">
        {props.savedName ? (
          <div className="rounded-2xl bg-stone-100 p-5"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">Private reference saved</p><p className="mt-2 text-sm text-stone-700">{props.savedName}</p></div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-6 py-10 text-center hover:border-stone-500">
            <ImagePlus className="size-6 text-stone-500" />
            <span className="mira-display mt-4 text-2xl">Choose one private image</span>
            <span className="mt-2 text-xs text-stone-500">JPEG, PNG, or WebP · up to 8 MB</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={props.pending} onChange={(event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) props.onFile(file); }} />
          </label>
        )}
        {props.savedName && <label className="mt-6 block"><span className="text-sm font-medium text-stone-800">What draws you to it? <span className="font-normal text-stone-400">Optional</span></span><Textarea value={props.explanation} onChange={event => props.onExplanationChange(event.target.value)} maxLength={500} rows={3} className="mt-3 resize-none rounded-2xl border-stone-200 bg-white" /></label>}
        {props.error && <p className="mt-4 text-sm text-red-700">{props.error}</p>}
        <div className="mt-7 flex justify-end"><Button onClick={props.onContinue} disabled={props.pending} className="rounded-full bg-stone-900 px-7 text-stone-50 hover:bg-stone-800">{props.pending && <Loader2 className="mr-2 size-4 animate-spin" />}{props.savedName ? "Continue with this reference" : "Continue without an image"}<ArrowRight className="ml-2 size-4" /></Button></div>
      </div>
    </div>
  );
}

function PreGenerationMirror(props: {
  journey: { building: string | null; needMost: string | null; inspirationAssetId: string | null; inspirationExplanation: string | null };
  creativeBrief: CreativeBrief;
  onReturn: () => void;
  onSynthesize: () => void;
  pending: boolean;
  error?: string;
}) {
  const { journey, creativeBrief } = props;
  return (
    <div className="py-6 sm:py-10">
      <p className="mira-kicker">Direction held</p>
      <h1 className="mira-display mt-6 max-w-3xl text-5xl leading-[0.98] sm:text-7xl">Here is the evidence Mira will carry into Creative DNA.</h1>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <MirrorCard title="The identity" body={`${journey.building || "This work"} is seeking ${(journey.needMost || "greater clarity").toLowerCase()}, with a direction that stays true to where you are now.`} />
        <MirrorCard title="The atmosphere" body={`A ${creativeBrief.warmth < 40 ? "warmer" : creativeBrief.warmth > 60 ? "cooler" : "balanced"}, ${creativeBrief.structure < 40 ? "structured" : creativeBrief.structure > 60 ? "organic" : "considered"} world with ${creativeBrief.texture.toLowerCase()} texture and ${creativeBrief.colorAttraction.toLowerCase()} colour energy.`} />
        <MirrorCard title="The visual language" body={`${creativeBrief.typography} typography, ${creativeBrief.imageryWorld.toLowerCase()} imagery, and an expression that stays ${creativeBrief.expression < 40 ? "confidently expressive" : creativeBrief.expression > 60 ? "quietly restrained" : "poised between expression and restraint"}.`} />
        <MirrorCard title="The reference" body={journey.inspirationAssetId ? `One private visual reference is saved${journey.inspirationExplanation ? `: ${journey.inspirationExplanation}` : "."}` : "No image was needed. Mira will hold the creative choices and conversation as the reference."} />
      </div>
      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-stone-200 pt-8">
        <div><p className="max-w-2xl text-sm leading-7 text-stone-600">Mira will now turn this evidence into Creative DNA, a Campaign Plan, five bounded visual directions, one focused refinement round, and a final Moodboard of five connected editorial images.</p>{props.error && <p className="mt-3 text-sm text-red-700">{props.error}</p>}</div>
        <div className="flex gap-3"><Button variant="ghost" onClick={props.onReturn} className="rounded-full text-stone-600">Return later</Button><Button onClick={props.onSynthesize} disabled={props.pending} className="rounded-full bg-stone-900 px-7 text-stone-50 hover:bg-stone-800">{props.pending && <Loader2 className="mr-2 size-4 animate-spin" />}{props.pending ? "Building Creative DNA" : "Build Creative DNA"}<ArrowRight className="ml-2 size-4" /></Button></div>
      </div>
    </div>
  );
}

function VisualDirectionStep(props: { pending: boolean; error?: string; onGenerate: () => void }) {
  return <div className="py-6 sm:py-10"><p className="mira-kicker">Visual direction</p><h1 className="mira-display mt-6 max-w-3xl text-5xl leading-[0.98] sm:text-7xl">Build the visual evidence for your Brand World.</h1><p className="mt-7 max-w-2xl text-sm leading-7 text-stone-600">Mira will generate five distinct, bounded editorial references from your Creative DNA and Campaign Plan. They establish the visual evidence before the final campaign direction is selected.</p><div className="mt-10 rounded-[2rem] bg-stone-100/75 p-7 sm:p-9"><p className="mira-display max-w-xl text-3xl leading-snug">Five references. One coherent campaign world.</p><Button onClick={props.onGenerate} disabled={props.pending} className="mt-7 rounded-full bg-stone-900 px-7 text-stone-50 hover:bg-stone-800">{props.pending && <Loader2 className="mr-2 size-4 animate-spin" />}{props.pending ? "Generating visual directions" : "Generate five visual directions"}<ArrowRight className="ml-2 size-4" /></Button>{props.error && <p className="mt-4 text-sm text-red-700">{props.error}</p>}</div></div>;
}

function VisualRefinementStep(props: {
  initialReferences: VisualReference[];
  refinedReferences: VisualReference[];
  refinedComplete: boolean;
  refinePending: boolean;
  finalPending: boolean;
  refineError?: string;
  finalError?: string;
  onRefine: (input: { referenceId: string; reasons: string[]; note: string | null }) => void;
  onGenerateFinal: (input: { referenceId: string; preserve: string; avoid: string; note: string | null }) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [finalReferenceId, setFinalReferenceId] = useState<string | null>(null);
  const [preserve, setPreserve] = useState("");
  const [avoid, setAvoid] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => setSelectedId(current => props.initialReferences.some(reference => reference.id === current) ? current : null), [props.initialReferences]);
  useEffect(() => setFinalReferenceId(current => props.refinedReferences.some(reference => reference.id === current) ? current : null), [props.refinedReferences]);
  const canRefine = Boolean(selectedId) && reason.trim().length >= 2;
  const canGenerateFinal = Boolean(finalReferenceId) && preserve.trim().length >= 2 && avoid.trim().length >= 2;

  if (props.refinedComplete) {
    return (
      <div className="py-6 sm:py-10">
        <p className="mira-kicker">Refined direction</p>
        <h1 className="mira-display mt-6 max-w-3xl text-5xl leading-[0.98] sm:text-7xl">The visual language is now focused.</h1>
        <p className="mt-7 max-w-2xl text-sm leading-7 text-stone-600">Mira has completed the one approved refinement round. Choose the one refined direction that should guide the final campaign, then name what to preserve and avoid.</p>
        <VisualReferenceGrid references={props.refinedReferences} selectedIds={finalReferenceId ? [finalReferenceId] : []} onToggle={id => setFinalReferenceId(id)} />
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <label><span className="text-sm font-medium text-stone-800">What should Mira preserve?</span><Textarea value={preserve} onChange={event => setPreserve(event.target.value)} rows={3} maxLength={300} className="mt-3 resize-none rounded-xl border-stone-200 bg-white" /></label>
          <label><span className="text-sm font-medium text-stone-800">What should Mira avoid?</span><Textarea value={avoid} onChange={event => setAvoid(event.target.value)} rows={3} maxLength={300} className="mt-3 resize-none rounded-xl border-stone-200 bg-white" /></label>
        </div>
        <label className="mt-5 block"><span className="text-sm font-medium text-stone-800">One optional final note</span><Textarea value={note} onChange={event => setNote(event.target.value)} rows={2} maxLength={500} className="mt-3 resize-none rounded-xl border-stone-200 bg-white" /></label>
        <div className="mt-10 rounded-[2rem] bg-stone-100/75 p-7 sm:p-9">
          <p className="mira-display max-w-xl text-3xl leading-snug">Generate one final Moodboard of five connected images.</p>
          <p className="mt-3 max-w-xl text-sm leading-7 text-stone-600">Your Creative DNA, Campaign Plan, selected visual evidence, and Maria’s visual-direction framework will guide one connected five-image campaign.</p>
          <Button onClick={() => finalReferenceId && props.onGenerateFinal({ referenceId: finalReferenceId, preserve: preserve.trim(), avoid: avoid.trim(), note: note.trim() || null })} disabled={!canGenerateFinal || props.finalPending} className="mt-7 rounded-full bg-stone-900 px-7 text-stone-50 hover:bg-stone-800">{props.finalPending && <Loader2 className="mr-2 size-4 animate-spin" />}{props.finalPending ? "Composing Moodboard" : "Generate final Moodboard"}<ArrowRight className="ml-2 size-4" /></Button>
          {props.finalError && <p className="mt-4 text-sm text-red-700">{props.finalError}</p>}
        </div>
      </div>
    );
  }

  return <div className="py-6 sm:py-10"><p className="mira-kicker">Visual selection</p><h1 className="mira-display mt-6 max-w-3xl text-5xl leading-[0.98] sm:text-7xl">Select the direction that feels strongest, then sharpen it once.</h1><p className="mt-7 max-w-2xl text-sm leading-7 text-stone-600">Choose one reference and name what resonates. Mira will complete exactly one focused refinement round before the final Moodboard.</p><VisualReferenceGrid references={props.initialReferences} selectedIds={selectedId ? [selectedId] : []} onToggle={id => setSelectedId(id)} />{selectedId && <label className="mt-8 block rounded-2xl bg-stone-100/75 p-5"><span className="mira-display text-xl">What resonates in this direction?</span><Textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} maxLength={280} className="mt-3 resize-none rounded-xl border-stone-200 bg-white" /></label>}<div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-stone-200 pt-7"><p className="text-xs leading-5 text-stone-500">{selectedId ? "1/1 selected" : "Choose one direction"} · one refinement round only</p><Button onClick={() => selectedId && props.onRefine({ referenceId: selectedId, reasons: [reason.trim()], note: null })} disabled={!canRefine || props.refinePending} className="rounded-full bg-stone-900 px-7 text-stone-50 hover:bg-stone-800">{props.refinePending && <Loader2 className="mr-2 size-4 animate-spin" />}Refine this direction <ArrowRight className="ml-2 size-4" /></Button></div>{props.refineError && <p className="mt-4 text-sm text-red-700">{props.refineError}</p>}</div>;
}

function VisualReferenceGrid(props: { references: VisualReference[]; selectedIds: string[]; onToggle: (id: string) => void; readOnly?: boolean }) {
  return <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{props.references.map(reference => { const selected = props.selectedIds.includes(reference.id); return <button key={reference.id} type="button" disabled={props.readOnly} onClick={() => props.onToggle(reference.id)} className={`overflow-hidden rounded-[1.7rem] border text-left transition ${selected ? "border-stone-900 ring-2 ring-stone-900/15" : "border-stone-200 hover:border-stone-500"}`}><img src={reference.url} alt={`${reference.direction} visual direction`} className="aspect-[4/5] w-full object-cover" /><span className="flex items-center justify-between gap-3 p-4"><span className="mira-display text-xl capitalize text-stone-900">{reference.direction}</span>{selected && <Check className="size-4 text-amber-800" />}</span></button>; })}</div>;
}

function FinalMoodboardStep(props: { references: VisualReference[]; onReturn: () => void }) {
  return (
    <div className="py-6 sm:py-10">
      <p className="mira-kicker">Your Moodboard</p>
      <h1 className="mira-display mt-6 max-w-3xl text-5xl leading-[0.98] sm:text-7xl">Your Brand World now has a visual atmosphere.</h1>
      <p className="mt-7 max-w-2xl text-sm leading-7 text-stone-600">One final Moodboard. Five connected editorial images. Creative DNA, Campaign Plan, selected direction, and one refinement round held in the same visual world.</p>
      {props.references.length === 5 ? (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{props.references.map((reference, index) => <figure key={reference.id} className="overflow-hidden rounded-[1.7rem] border border-stone-200 bg-stone-100 shadow-[0_20px_52px_rgba(70,52,31,0.10)]"><img src={reference.url} alt={`Final Moodboard image ${index + 1}: ${reference.direction}`} className="aspect-[4/5] w-full object-cover" /><figcaption className="p-4"><p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-amber-800">Image {index + 1}</p><p className="mira-display mt-2 text-xl leading-tight text-stone-900">{reference.direction}</p></figcaption></figure>)}</div>
      ) : (
        <div className="mt-10 rounded-[2rem] bg-stone-100/75 p-8"><Loader2 className="size-5 animate-spin text-stone-400" /><p className="mt-4 text-sm text-stone-600">Preparing the five connected final images.</p></div>
      )}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs leading-5 text-stone-500">Built from your Creative DNA, Campaign Plan, refined evidence, and Maria’s visual-direction framework.</p>
        <Button variant="ghost" onClick={props.onReturn} className="rounded-full text-stone-600">Return to my Brand Worlds <ArrowRight className="ml-2 size-4" /></Button>
      </div>
    </div>
  );
}

function MirrorCard(props: { title: string; body: string }) {
  return <article className="rounded-[2rem] bg-stone-100/75 p-6 sm:p-8"><p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-amber-800">{props.title}</p><p className="mira-display mt-4 text-2xl leading-snug text-stone-900">{props.body}</p></article>;
}
