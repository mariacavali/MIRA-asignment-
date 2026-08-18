import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Image, Loader2, Pencil, PlayCircle, RefreshCw, ShieldCheck, Sparkles, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useParams } from "wouter";
import { MiraShell } from "./MiraV3";

export default function MiraV3Journey() {
  const params = useParams<{ journeyId: string }>();
  const journeyId = Number(params.journeyId);
  const [, navigate] = useLocation();
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });
  const [answer, setAnswer] = useState("");
  const [rephrasedQuestion, setRephrasedQuestion] = useState<string | null>(null);
  const [birthContextNotice, setBirthContextNotice] = useState<string | null>(null);
  const [birthData, setBirthData] = useState({
    fullNameAtBirth: "",
    birthDate: "",
    birthTime: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    birthCity: "",
    birthCountry: "",
  });
  const [editing, setEditing] = useState(false);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mirrorFields, setMirrorFields] = useState({
    whatHasAlwaysBeenTrue: "",
    thread: "",
    whoThisIsFor: "",
    returningSentence: "",
    recognition: "",
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const state = trpc.miraV3.getJourney.useQuery(
    { journeyId },
    { enabled: Boolean(user) && Number.isInteger(journeyId) && journeyId > 0, retry: false },
  );
  const birthState = trpc.miraV3.getBirthData.useQuery(
    { journeyId },
    { enabled: Boolean(user) && Number.isInteger(journeyId) && journeyId > 0, retry: false },
  );
  const mediaState = trpc.miraV3.getMediaState.useQuery(
    { journeyId },
    { enabled: Boolean(user) && Number.isInteger(journeyId) && journeyId > 0, retry: false },
  );
  const saveBirthData = trpc.miraV3.saveBirthData.useMutation({
    onSuccess: async result => {
      if (!result?.output?.contextualSignalAvailable) {
        setBirthContextNotice(result?.output?.statusMessage || "Your details were saved, but optional personalisation is temporarily unavailable. Mira will continue from your own words.");
      } else {
        setBirthContextNotice(null);
      }
      await Promise.all([
        utils.miraV3.getBirthData.invalidate({ journeyId }),
        utils.miraV3.getJourney.invalidate({ journeyId }),
      ]);
    },
  });
  const setMediaConsent = trpc.miraV3.setMediaConsent.useMutation({
    onSuccess: async () => {
      setReferenceFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await utils.miraV3.getMediaState.invalidate({ journeyId });
    },
  });
  const uploadReferenceImage = trpc.miraV3.uploadReferenceImage.useMutation({
    onSuccess: async () => {
      setReferenceFile(null);
      setMediaError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await utils.miraV3.getMediaState.invalidate({ journeyId });
    },
  });
  const removeReferenceImage = trpc.miraV3.removeReferenceImage.useMutation({
    onSuccess: () => utils.miraV3.getMediaState.invalidate({ journeyId }),
  });
  const analyzeReferenceImage = trpc.miraV3.analyzeReferenceImage.useMutation({
    onSuccess: () => utils.miraV3.getMediaState.invalidate({ journeyId }),
  });
  const submit = trpc.miraV3.submitReflectionTurn.useMutation({
    onSuccess: async result => {
      setAnswer("");
      if ("rephrased" in result && result.rephrased) {
        setRephrasedQuestion(result.question);
      } else {
        setRephrasedQuestion(null);
      }
      await state.refetch();
      textareaRef.current?.focus();
    },
  });
  const rephraseQuestion = trpc.miraV3.rephraseReflectionQuestion.useMutation({
    onSuccess: result => setRephrasedQuestion(result.question),
  });
  const generateMirror = trpc.miraV3.generateMirrorDraft.useMutation({
    onSuccess: () => utils.miraV3.getJourney.invalidate({ journeyId }),
  });
  const regenerateMirror = trpc.miraV3.regenerateMirrorDraft.useMutation({
    onSuccess: () => utils.miraV3.getJourney.invalidate({ journeyId }),
  });
  const saveEdit = trpc.miraV3.saveMirrorEdit.useMutation({
    onSuccess: async () => {
      setEditing(false);
      await utils.miraV3.getJourney.invalidate({ journeyId });
    },
  });
  const confirmMirror = trpc.miraV3.confirmMirror.useMutation({
    onSuccess: () => utils.miraV3.getJourney.invalidate({ journeyId }),
  });

  const messages = state.data?.messages ?? [];
  const latestQuestion = useMemo(
    () => [...messages].reverse().find(message => message.role === "assistant"),
    [messages],
  );
  const previousMessages = latestQuestion ? messages.filter(message => message.id !== latestQuestion.id) : messages;
  const turnCount = state.data?.journey.turnCount ?? 0;
  const showBirthInterlude = state.data?.journey.currentStep === "birth_context" && turnCount === 0;
  const reflectionComplete = turnCount >= 8;
  const latestRevision = state.data?.revisions[0];
  const bundle = latestRevision?.bundle && typeof latestRevision.bundle === "object"
    ? latestRevision.bundle as {
        mirror: typeof mirrorFields;
        essence: {
          coreTruth: string;
          naturalGift: string;
          feltExperience: string;
          peoplePortrait: string;
          direction: string;
          voiceQualities: string[];
          currentChapter: string;
          strengths: string[];
          zoneOfGenius: string;
          shadows: string[];
          decisionCompass: string;
          naturalContribution: string;
          growthEdge: string;
        };
        visualDirection: {
          atmosphere: string;
          colorIntentions: string[];
          materialCues: string[];
          compositionPrinciples: string[];
          photographicDirection: string;
        };
        evidence: Array<{ turn: number; quote: string; supports: string[] }>;
        generation: {
          model: string;
          fallback: boolean;
          promptTokens: number | null;
          completionTokens: number | null;
          totalTokens: number | null;
        };
      }
    : undefined;
  const isConfirmed = latestRevision?.status === "confirmed" || state.data?.journey.status === "mirror_confirmed";
  const savedBirthResult = birthState.data?.module as
    | { output?: { saved?: boolean; contextualSignalAvailable?: boolean; statusMessage?: string } }
    | null
    | undefined;

  useEffect(() => {
    if (bundle?.mirror && !editing) setMirrorFields(bundle.mirror);
  }, [bundle, editing]);

  if (loading || state.isLoading) {
    return <MiraShell><Loader2 className="size-5 animate-spin text-stone-400" /></MiraShell>;
  }

  if (!user) return null;

  if (!state.data || state.error) {
    return (
      <MiraShell>
        <section className="mira-panel max-w-xl text-center">
          <p className="mira-kicker">Reflection unavailable</p>
          <h1 className="mira-display mt-5 text-4xl">This private reflection could not be found.</h1>
          <Button variant="ghost" onClick={() => navigate("/mira-v3")} className="mt-8 rounded-full"><ArrowLeft className="mr-2 size-4" /> Return to Mira</Button>
        </section>
      </MiraShell>
    );
  }

  return (
    <MiraShell>
      <section className="w-full max-w-4xl py-4 sm:py-8">
        <div className="flex items-center justify-between gap-4 px-1">
          <button type="button" onClick={() => navigate("/mira-v3")} className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-900"><ArrowLeft className="size-4" /> Leave and resume later</button>
          <p className="text-xs text-stone-500">Your private conversation with Mira</p>
        </div>

        {isConfirmed && <details className="mt-8 rounded-2xl border border-stone-200 bg-stone-50/70 p-5 open:bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-stone-900">
            <span className="flex items-center gap-3">
              <Image className="size-4 text-amber-800" />
              <span>
                <span className="block">Optional image references</span>
                <span className="mt-0.5 block text-xs font-normal text-stone-500">Private · consent required · up to six images</span>
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-stone-900 px-4 py-2 text-xs font-medium text-stone-50">
              {(mediaState.data?.assets.length ?? 0) > 0 ? `${mediaState.data?.assets.length} added` : "Add image"}
            </span>
          </summary>
          <div className="mt-6 space-y-5">
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm leading-6 text-stone-600">
              <p className="flex items-center gap-2 font-medium text-stone-900"><ShieldCheck className="size-4 text-emerald-700" /> Your images remain optional and private.</p>
              <p className="mt-1">Upload and AI analysis require separate consent. Files are limited to JPEG, PNG, or WebP up to 8 MB. Mira lists only metadata here and never exposes a permanent image link.</p>
            </div>
            <ConsentRow title="Allow private image upload" description="Store reference images for this journey. Revoking removes every active image reference and its analysis." granted={mediaState.data?.consents.image_upload === "granted"} disabled={setMediaConsent.isPending} onChange={granted => setMediaConsent.mutate({ journeyId, scope: "image_upload", granted })} />
            <ConsentRow title="Allow non-judgmental AI analysis" description="Describe visual patterns only. Mira will not infer identity, health, ethnicity, emotion, attractiveness, or other sensitive traits." granted={mediaState.data?.consents.image_analysis === "granted"} disabled={setMediaConsent.isPending} onChange={granted => setMediaConsent.mutate({ journeyId, scope: "image_analysis", granted })} />

            {mediaState.data?.consents.image_upload === "granted" && (
              <form
                className="rounded-xl border border-dashed border-stone-300 p-4"
                onSubmit={async event => {
                  event.preventDefault();
                  if (!referenceFile || uploadReferenceImage.isPending) return;
                  if (referenceFile.size > 8 * 1024 * 1024) return setMediaError("Choose an image smaller than 8 MB.");
                  if (!["image/jpeg", "image/png", "image/webp"].includes(referenceFile.type)) return setMediaError("Choose a JPEG, PNG, or WebP image.");
                  const base64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onerror = () => reject(new Error("The image could not be read"));
                    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
                    reader.readAsDataURL(referenceFile);
                  });
                  uploadReferenceImage.mutate({ journeyId, originalName: referenceFile.name, mimeType: referenceFile.type as "image/jpeg" | "image/png" | "image/webp", base64 });
                }}
              >
                <label className="block text-sm font-medium text-stone-900" htmlFor="mira-reference-image">Choose a private reference image</label>
                <input ref={fileInputRef} id="mira-reference-image" type="file" accept="image/jpeg,image/png,image/webp" className="mt-3 block w-full text-sm text-stone-600 file:mr-4 file:rounded-full file:border-0 file:bg-stone-900 file:px-4 file:py-2 file:text-sm file:text-stone-50" onChange={event => { setMediaError(null); setReferenceFile(event.target.files?.[0] ?? null); }} />
                <Button type="submit" disabled={!referenceFile || uploadReferenceImage.isPending || (mediaState.data?.assets.length ?? 0) >= 6} className="mt-4 rounded-full bg-stone-900 text-stone-50 hover:bg-stone-800">{uploadReferenceImage.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />} Upload privately</Button>
                {(mediaState.data?.assets.length ?? 0) >= 6 && <p className="mt-3 text-sm text-stone-500">This journey has reached the six-image private reference limit.</p>}
                {(mediaError || uploadReferenceImage.error) && <p className="mt-3 text-sm text-red-700">{mediaError || uploadReferenceImage.error?.message}</p>}
              </form>
            )}

            {mediaState.data?.assets.length ? (
              <div className="space-y-2">
                <p className="mira-kicker">Stored references</p>
                {mediaState.data.assets.map(asset => (
                  <div key={asset.id} className="rounded-xl bg-stone-50 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0"><p className="truncate text-sm font-medium text-stone-900">{asset.originalName || "Private reference"}</p><p className="mt-1 text-xs text-stone-500">{asset.mimeType} · {(asset.byteSize / 1024).toFixed(1)} KB · {asset.status}</p></div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-2">
                        {mediaState.data.consents.image_analysis === "granted" && asset.status !== "analyzed" && (
                          <Button variant="outline" size="sm" disabled={analyzeReferenceImage.isPending} onClick={() => analyzeReferenceImage.mutate({ journeyId, assetId: asset.id })} className="rounded-full border-stone-300 bg-white text-stone-800">{analyzeReferenceImage.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />} Analyze privately</Button>
                        )}
                        <Button variant="ghost" size="sm" disabled={removeReferenceImage.isPending} onClick={() => removeReferenceImage.mutate({ journeyId, assetId: asset.id })} className="rounded-full text-red-700 hover:bg-red-50 hover:text-red-800"><Trash2 className="mr-2 size-4" /> Remove</Button>
                      </div>
                    </div>
                    {getPrivateAnalysisSummary(asset.analysis) && <p className="mt-3 border-t border-stone-200 pt-3 text-sm leading-6 text-stone-600">{getPrivateAnalysisSummary(asset.analysis)}</p>}
                  </div>
                ))}
                {analyzeReferenceImage.error && <p className="text-sm text-red-700">{analyzeReferenceImage.error.message}</p>}
              </div>
            ) : <p className="text-sm text-stone-500">No private reference images are attached to this journey.</p>}
          </div>
        </details>}

        <div className="mt-10 grid gap-8 lg:grid-cols-[0.72fr_1.28fr]">
          <aside className="order-2 max-h-[36rem] overflow-y-auto pr-3 lg:order-1">
            <p className="mira-kicker mb-5">The conversation so far</p>
            {previousMessages.length === 0 ? (
              <p className="text-sm leading-6 text-stone-500">Your words will gather here as Mira begins to understand you.</p>
            ) : (
              <div className="space-y-5">
                {previousMessages.map(message => (
                  <div key={message.id} className={message.role === "user" ? "border-l-2 border-amber-700/35 pl-4" : "pl-4"}>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-stone-400">{message.role === "user" ? "You" : "Mira"}</p>
                    <p className="mt-2 text-sm leading-6 text-stone-600">{message.content}</p>
                  </div>
                ))}
              </div>
            )}
          </aside>

          <div className="order-1 lg:order-2">
            <div className="mira-panel min-h-[30rem]">
              {showBirthInterlude ? (
                <form
                  className="flex min-h-[23rem] flex-col"
                  onSubmit={event => {
                    event.preventDefault();
                    if (!saveBirthData.isPending) saveBirthData.mutate({ journeyId, birthData });
                  }}
                >
                  <div className="flex size-11 items-center justify-center rounded-full bg-amber-50 text-amber-800"><CalendarDays className="size-5" /></div>
                  <p className="mira-kicker mt-7">Before we begin</p>
                  <h1 className="mira-display mt-4 max-w-2xl text-4xl leading-tight sm:text-5xl">Let this conversation begin with you.</h1>
                  <p className="mt-5 max-w-xl text-sm leading-7 text-stone-600">Share the details you arrived with. Mira keeps them private and uses them quietly, only where they help her understand the patterns already present in your own words.</p>
                  {birthState.data?.enabled ? (
                    <div className="mt-8 grid gap-4 sm:grid-cols-2">
                      <BirthField label="Full name at birth"><input required autoComplete="name" maxLength={160} value={birthData.fullNameAtBirth} onChange={event => setBirthData(current => ({ ...current, fullNameAtBirth: event.target.value }))} className="mira-input" /></BirthField>
                      <BirthField label="Date of birth"><input required type="date" value={birthData.birthDate} max={new Date().toISOString().slice(0, 10)} onChange={event => setBirthData(current => ({ ...current, birthDate: event.target.value }))} className="mira-input" /></BirthField>
                      <BirthField label="Birth place"><input required maxLength={120} value={birthData.birthCity} placeholder="City" onChange={event => setBirthData(current => ({ ...current, birthCity: event.target.value }))} className="mira-input" /></BirthField>
                      <BirthField label="Birth country"><input required maxLength={120} value={birthData.birthCountry} onChange={event => setBirthData(current => ({ ...current, birthCountry: event.target.value }))} className="mira-input" /></BirthField>
                      <BirthField label="Birth time · optional"><input type="time" value={birthData.birthTime} onChange={event => setBirthData(current => ({ ...current, birthTime: event.target.value }))} className="mira-input" /></BirthField>
                      <BirthField label="Timezone"><input required maxLength={80} value={birthData.timezone} onChange={event => setBirthData(current => ({ ...current, timezone: event.target.value }))} className="mira-input" /></BirthField>
                    </div>
                  ) : <p className="mt-7 rounded-xl bg-stone-50 p-4 text-sm leading-6 text-stone-600">This private opening is temporarily unavailable. Please return when it is ready.</p>}
                  <div className="mt-8 flex flex-wrap items-center gap-3">
                    {birthState.data?.enabled && <Button type="submit" disabled={saveBirthData.isPending} className="rounded-full bg-stone-900 px-6 text-stone-50 hover:bg-stone-800">{saveBirthData.isPending && <Loader2 className="mr-2 size-4 animate-spin" />} Begin with Mira</Button>}
                  </div>
                  {saveBirthData.error && <p className="mt-4 text-sm text-red-700">Mira could not hold these details just now. Nothing was lost; please try again.</p>}
                </form>
              ) : reflectionComplete && !bundle ? (
                <div className="flex min-h-[23rem] flex-col items-center justify-center text-center">
                  <div className="flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-800"><Check className="size-5" /></div>
                  <p className="mira-kicker mt-8">Mira has been listening</p>
                  <h1 className="mira-display mt-5 max-w-lg text-4xl sm:text-5xl">There is enough here now to reflect you back to yourself.</h1>
                  <p className="mt-5 max-w-md text-sm leading-6 text-stone-600">Your Brand Soul will be drawn first from what you said here. You will decide what is true before anything visual is translated from it.</p>
                  <Button onClick={() => generateMirror.mutate({ journeyId })} disabled={generateMirror.isPending} className="mt-8 rounded-full bg-stone-900 px-7 text-stone-50 hover:bg-stone-800">
                    {generateMirror.isPending ? <><Loader2 className="mr-2 size-4 animate-spin" /> Preparing your reflection</> : <><Sparkles className="mr-2 size-4" /> Show me what you heard</>}
                  </Button>
                  {generateMirror.error && <p className="mt-4 text-sm text-red-700">Your Brand Soul could not be prepared just now. Please try again.</p>}
                </div>
              ) : reflectionComplete && bundle ? (
                <div className="space-y-8">
                  <div className="flex items-start justify-between gap-5">
                    <div><p className="mira-kicker">Brand Soul</p><h1 className="mira-display mt-4 text-4xl sm:text-5xl">This is what Mira heard.</h1></div>
                    {isConfirmed && <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-800"><Check className="size-4" /></div>}
                  </div>
                  {editing ? (
                    <div className="space-y-5">
                      {Object.entries(mirrorFields).map(([key, value]) => (
                        <label key={key} className="block">
                          <span className="mira-kicker">{key.replace(/([A-Z])/g, " $1")}</span>
                          <Textarea value={value} onChange={event => setMirrorFields(current => ({ ...current, [key]: event.target.value }))} className="mt-2 min-h-24 rounded-xl bg-stone-50" maxLength={1600} />
                        </label>
                      ))}
                      <div className="flex flex-wrap gap-3">
                        <Button variant="outline" onClick={() => { setMirrorFields(bundle.mirror); setEditing(false); }} className="rounded-full">Cancel</Button>
                        <Button onClick={() => saveEdit.mutate({ journeyId, bundle: { ...bundle, mirror: mirrorFields } })} disabled={saveEdit.isPending || Object.values(mirrorFields).some(value => !value.trim())} className="rounded-full bg-stone-900 text-stone-50">
                          {saveEdit.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null} Keep these words
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {bundle.generation.fallback && !isConfirmed && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 text-sm leading-6 text-stone-700">
                          <p className="font-medium text-stone-900">A simpler reflection was prepared from your own words.</p>
                          <p className="mt-1">The richer synthesis was temporarily unavailable. You can retry without losing this version.</p>
                        </div>
                      )}
                      <MirrorSection label="What has always been true" text={bundle.mirror.whatHasAlwaysBeenTrue} />
                      <MirrorSection label="The thread" text={bundle.mirror.thread} />
                      <MirrorSection label="Who this is for" text={bundle.mirror.whoThisIsFor} />
                      <blockquote className="border-y border-stone-200 py-8 text-center"><p className="mira-display text-3xl italic sm:text-4xl">“{bundle.mirror.returningSentence}”</p></blockquote>
                      <MirrorSection label="Recognition" text={bundle.mirror.recognition} />
                      <MirrorSection label="Current chapter" text={bundle.essence.currentChapter} />
                      <MirrorList label="Strengths" items={bundle.essence.strengths} />
                      <MirrorSection label="Zone of genius" text={bundle.essence.zoneOfGenius} />
                      <MirrorList label="Shadows" items={bundle.essence.shadows} />
                      <MirrorSection label="Decision compass" text={bundle.essence.decisionCompass} />
                      <MirrorSection label="Natural contribution" text={bundle.essence.naturalContribution} />
                      <MirrorSection label="Growth edge" text={bundle.essence.growthEdge} />
                      {!isConfirmed ? (
                        <div className="flex flex-wrap items-center gap-3 pt-2">
                          {bundle.generation.fallback && (
                            <Button variant="outline" onClick={() => regenerateMirror.mutate({ journeyId })} disabled={regenerateMirror.isPending} className="rounded-full">
                              {regenerateMirror.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />} Listen again
                            </Button>
                          )}
                          <Button variant="outline" onClick={() => setEditing(true)} className="rounded-full"><Pencil className="mr-2 size-4" /> Edit what does not feel true</Button>
                          <Button onClick={() => latestRevision && confirmMirror.mutate({ journeyId, revisionId: latestRevision.id })} disabled={confirmMirror.isPending || regenerateMirror.isPending} className="rounded-full bg-stone-900 px-6 text-stone-50 hover:bg-stone-800">
                            {confirmMirror.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />} This feels true
                          </Button>
                        </div>
                      ) : (
                        <div className="rounded-2xl bg-stone-900 p-6 text-stone-50"><p className="mira-kicker text-stone-400">Held as true</p><p className="mt-3 text-sm leading-6">Mira can now translate this confirmed Brand Soul into your Brand Expression Guide and Shoot Mood Board.</p><Button onClick={() => navigate(`/mira-v3/results/${journeyId}`)} className="mt-5 rounded-full bg-stone-50 text-stone-900 hover:bg-stone-200">Open my three documents <ArrowRight className="ml-2 size-4" /></Button></div>
                      )}
                      {regenerateMirror.error && <p className="text-sm text-red-700">The richer Mirror is still unavailable. This version remains safe; please try again.</p>}
                      {(saveEdit.error || confirmMirror.error) && <p className="text-sm text-red-700">That change could not be saved. Refresh and try again.</p>}
                    </>
                  )}
                </div>
              ) : (
                <form
                  onSubmit={event => {
                    event.preventDefault();
                    const trimmed = answer.trim();
                    if (trimmed && !submit.isPending) submit.mutate({ journeyId, answer: trimmed });
                  }}
                  className="flex min-h-[23rem] flex-col"
                >
                  {turnCount === 0 && (
                    <div className="mb-7 rounded-2xl border border-stone-200 bg-stone-50/80 p-5">
                      <div className="flex items-start gap-4">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-stone-900 text-stone-50"><PlayCircle className="size-5" /></div>
                        <div>
                          <p className="mira-kicker">Welcome video · placeholder</p>
                          <p className="mt-2 text-sm leading-6 text-stone-600">A short private welcome will appear here before the reflection begins.</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {birthContextNotice && (
                    <div role="status" className="mb-7 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm leading-6 text-stone-700">
                      <p className="font-medium text-stone-900">Optional personalisation was not added.</p>
                      <p className="mt-1">{birthContextNotice}</p>
                    </div>
                  )}
                  <p className="mira-kicker">Mira is listening</p>
                  <h1 className="mira-display mt-7 text-4xl leading-tight sm:text-5xl">{rephrasedQuestion ?? latestQuestion?.content}</h1>
                  <div className="mt-auto pt-10">
                    <label htmlFor="mira-answer" className="sr-only">Your reflection</label>
                    <Textarea
                      ref={textareaRef}
                      id="mira-answer"
                      value={answer}
                      onChange={event => setAnswer(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          event.currentTarget.form?.requestSubmit();
                        }
                      }}
                      disabled={submit.isPending}
                      placeholder="Write what feels true, not what sounds right…"
                      className="min-h-32 resize-none rounded-2xl border-stone-200 bg-stone-50 p-5 text-base leading-7 shadow-none focus-visible:ring-amber-700/30"
                      maxLength={4000}
                    />
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                      <Button type="button" variant="ghost" size="sm" disabled={submit.isPending || rephraseQuestion.isPending} onClick={() => rephraseQuestion.mutate({ journeyId })} className="rounded-full px-0 text-xs text-stone-500 hover:bg-transparent hover:text-stone-900">
                        {rephraseQuestion.isPending ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <RefreshCw className="mr-2 size-3.5" />} I don't understand—rephrase
                      </Button>
                      <Button type="submit" disabled={!answer.trim() || submit.isPending} className="rounded-full bg-stone-900 px-6 text-stone-50 hover:bg-stone-800">
                        {submit.isPending ? <><Loader2 className="mr-2 size-4 animate-spin" /> Mira is listening</> : <>Share this <ArrowRight className="ml-2 size-4" /></>}
                      </Button>
                    </div>
                    {submit.isPending && <p role="status" className="mt-4 text-sm leading-6 text-stone-500">Mira is taking a moment with what you said.</p>}
                    {submit.error && <p className="mt-4 text-sm text-red-700">Mira could not hold what you shared just now. Please try once more.</p>}
                    {rephraseQuestion.error && <p className="mt-4 text-sm text-red-700">Mira could not say that more simply just now. Nothing you shared was lost.</p>}
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </MiraShell>
  );
}

function MirrorSection({ label, text }: { label: string; text: string }) {
  return <section><p className="mira-kicker">{label}</p><p className="mt-3 text-base leading-7 text-stone-700">{text}</p></section>;
}

function MirrorList({ label, items }: { label: string; items: string[] }) {
  return <section><p className="mira-kicker">{label}</p><ul className="mt-3 space-y-2 text-base leading-7 text-stone-700">{items.map(item => <li key={item}>— {item}</li>)}</ul></section>;
}

function BirthField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mira-kicker">{label}</span>{children}</label>;
}

function ConsentRow({ title, description, granted, disabled, onChange }: { title: string; description: string; granted: boolean; disabled: boolean; onChange: (granted: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-5 rounded-xl border border-stone-200 p-4">
      <span><span className="block text-sm font-medium text-stone-900">{title}</span><span className="mt-1 block text-xs leading-5 text-stone-500">{description}</span></span>
      <input type="checkbox" checked={granted} disabled={disabled} onChange={event => onChange(event.target.checked)} className="mt-1 size-4 shrink-0 accent-stone-900" />
    </label>
  );
}

function getPrivateAnalysisSummary(value: unknown) {
  if (!value || typeof value !== "object" || !("summary" in value)) return null;
  const summary = (value as { summary?: unknown }).summary;
  return typeof summary === "string" ? summary : null;
}
