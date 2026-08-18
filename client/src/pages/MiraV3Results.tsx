import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Check, Download, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";
import { MiraShell } from "./MiraV3";

type DeliverableKind = "mirror" | "brand_soul" | "visual_direction";
type MoodBoardMode = "brand" | "project";
type ProjectBrief = { purpose?: string; audience?: string; platform?: string; location?: string; desiredFeeling?: string; clothingIdeas?: string; references?: string; practicalConstraints?: string };
const emptyProjectBrief: ProjectBrief = {};

export default function MiraV3Results() {
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });
  const params = useParams<{ journeyId: string }>();
  const journeyId = Number(params.journeyId);
  const [, navigate] = useLocation();
  const [moodBoardMode, setMoodBoardMode] = useState<MoodBoardMode>("brand");
  const [briefDraft, setBriefDraft] = useState<ProjectBrief>(emptyProjectBrief);
  const [appliedBrief, setAppliedBrief] = useState<ProjectBrief>(emptyProjectBrief);
  const moodBoardRequest = useMemo(() => moodBoardMode === "brand" ? { mode: "brand" as const } : { mode: "project" as const, brief: appliedBrief }, [moodBoardMode, appliedBrief]);
  const result = trpc.miraV3.getDeliverables.useQuery(
    { journeyId, moodBoard: moodBoardRequest },
    { enabled: Boolean(user) && Number.isInteger(journeyId) && journeyId > 0, retry: false },
  );
  const download = trpc.miraV3.downloadDeliverablePdf.useMutation({
    onSuccess: file => {
      const bytes = Uint8Array.from(atob(file.base64), character => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    },
    onError: error => toast.error(error.message),
  });
  const downloadPdf = (deliverable: DeliverableKind) => download.mutate({ journeyId, deliverable, moodBoard: deliverable === "visual_direction" ? moodBoardRequest : undefined });
  const isDownloading = (deliverable: DeliverableKind) => download.isPending && download.variables?.deliverable === deliverable;

  if (loading || result.isLoading) return <MiraShell><div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="size-5 animate-spin text-stone-500" /></div></MiraShell>;
  if (!result.data) return <MiraShell><div className="mira-panel p-8"><p className="mira-kicker">Documents unavailable</p><h1 className="mira-display mt-4 text-4xl">Your Brand Soul is still waiting for your recognition.</h1><Button onClick={() => navigate(`/mira-v3/journey/${journeyId}`)} className="mt-6 rounded-full"><ArrowLeft className="mr-2 size-4" /> Return to what Mira heard</Button></div></MiraShell>;

  const { mirror, brandSoul, visualDirection } = result.data.deliverables;
  return <MiraShell><div className="mx-auto max-w-5xl py-8 sm:py-14">
    <header className="mb-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-end"><div><button onClick={() => navigate(`/mira-v3/journey/${journeyId}`)} className="mb-7 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-500"><ArrowLeft className="size-3.5" /> Your Brand Soul</button><p className="mira-kicker">Your private collection</p><h1 className="mira-display mt-4 text-5xl sm:text-6xl">Three expressions of what Mira came to understand.</h1></div><div className="flex items-center gap-2 text-xs text-emerald-800"><Check className="size-4" /> Translated from your confirmed Brand Soul</div></header>
    <Tabs defaultValue="mirror" className="space-y-6">
      <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-full bg-stone-200/60 p-1"><TabsTrigger value="mirror" className="rounded-full px-5">Brand Soul File</TabsTrigger><TabsTrigger value="soul" className="rounded-full px-5">Brand Expression Guide</TabsTrigger><TabsTrigger value="visual" className="rounded-full px-5">Shoot Mood Board</TabsTrigger></TabsList>
      <TabsContent value="mirror"><DocumentShell title={mirror.title} subtitle={mirror.subtitle} onDownload={() => downloadPdf("mirror")} downloading={isDownloading("mirror")}><blockquote className="border-y border-stone-200 py-9 text-center"><p className="mira-display text-3xl italic sm:text-4xl">“{mirror.returningSentence}”</p></blockquote>{mirror.sections.map(section => <TextSection key={section.heading} {...section} />)}<Evidence items={mirror.evidence} /></DocumentShell></TabsContent>
      <TabsContent value="soul"><DocumentShell title={brandSoul.title} subtitle={brandSoul.subtitle} onDownload={() => downloadPdf("brand_soul")} downloading={isDownloading("brand_soul")}>{brandSoul.sections.map(section => <TextSection key={section.heading} {...section} />)}<section><p className="mira-kicker">Voice qualities</p><div className="mt-3 flex flex-wrap gap-2">{brandSoul.voiceQualities.map(item => <span key={item} className="rounded-full bg-stone-100 px-4 py-2 text-sm text-stone-700">{item}</span>)}</div></section><Evidence items={brandSoul.evidence} /></DocumentShell></TabsContent>
      <TabsContent value="visual"><DocumentShell title={visualDirection.title} subtitle={visualDirection.subtitle} onDownload={() => downloadPdf("visual_direction")} downloading={isDownloading("visual_direction")}>
        <MoodBoardControls mode={moodBoardMode} onModeChange={setMoodBoardMode} brief={briefDraft} onBriefChange={setBriefDraft} onApply={() => { setAppliedBrief({ ...briefDraft }); toast.success("Your project direction is now held inside the same visual identity."); }} />
        <div className="rounded-2xl bg-stone-50 p-5"><p className="mira-kicker">{visualDirection.modeLabel}</p><p className="mira-display mt-3 text-2xl italic">“{visualDirection.identityAnchor}”</p><p className="mt-2 text-sm leading-6 text-stone-600">The execution can change. This remains the identity underneath it.</p></div>
        <TextSection heading="Atmosphere" body={visualDirection.atmosphere} />
        <section><p className="mira-kicker">Palette</p><div className="mt-4 grid gap-3 sm:grid-cols-3">{visualDirection.palette.map(color => <div key={color.name} className="overflow-hidden rounded-xl border border-stone-200"><div className="h-24" style={{ backgroundColor: color.hex }} /><div className="p-4"><p className="font-medium text-stone-900">{color.name}</p><p className="mt-1 font-mono text-xs text-stone-500">{color.hex}</p><p className="mt-3 text-xs leading-5 text-stone-600">{color.rationale}</p></div></div>)}</div></section>
        <section><p className="mira-kicker">Textures and styling</p><ul className="mt-3 space-y-3">{visualDirection.materialCues.map((item, index) => <li key={`${index}-${item}`} className="text-sm leading-6 text-stone-700">{item}</li>)}</ul></section>
        <TextSection heading="Lighting and photography" body={visualDirection.photographicDirection.body} />
        <section><p className="mira-kicker">Composition and architecture</p><ul className="mt-3 space-y-3">{visualDirection.compositionPrinciples.map(item => <li key={item.text} className="text-sm leading-6 text-stone-700">{item.text}</li>)}</ul></section>
        <section><p className="mira-kicker">Shoot list</p><ol className="mt-3 space-y-3">{visualDirection.shootList.map(item => <li key={item.text} className="text-sm leading-6 text-stone-700">{item.text}</li>)}</ol></section><Evidence items={visualDirection.evidence} />
      </DocumentShell></TabsContent>
    </Tabs>
  </div></MiraShell>;
}

function MoodBoardControls({ mode, onModeChange, brief, onBriefChange, onApply }: { mode: MoodBoardMode; onModeChange: (mode: MoodBoardMode) => void; brief: ProjectBrief; onBriefChange: (brief: ProjectBrief) => void; onApply: () => void }) {
  const update = (field: keyof ProjectBrief, value: string) => onBriefChange({ ...brief, [field]: value || undefined });
  return <section className="rounded-2xl border border-stone-200 p-5 sm:p-6"><p className="mira-kicker">Choose how this visual world is expressed</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><ModeButton active={mode === "brand"} title="Brand Mood Board" description="Your timeless, long-term visual language." onClick={() => onModeChange("brand")} /><ModeButton active={mode === "project"} title="Project Mood Board" description="The same identity, adapted to one creative project." onClick={() => onModeChange("project")} /></div>{mode === "project" ? <div className="mt-6 space-y-4"><p className="text-sm leading-6 text-stone-600">Share as much or as little as is useful. Mira will keep your established identity intact.</p><div className="grid gap-3 sm:grid-cols-2"><BriefInput label="Purpose" value={brief.purpose} onChange={value => update("purpose", value)} placeholder="Book launch, retreat, photoshoot…" /><BriefInput label="Audience" value={brief.audience} onChange={value => update("audience", value)} /><BriefInput label="Platform" value={brief.platform} onChange={value => update("platform", value)} placeholder="Website, print, social…" /><BriefInput label="Location" value={brief.location} onChange={value => update("location", value)} /></div><BriefArea label="Desired feeling" value={brief.desiredFeeling} onChange={value => update("desiredFeeling", value)} /><BriefArea label="Clothing ideas" value={brief.clothingIdeas} onChange={value => update("clothingIdeas", value)} /><BriefArea label="References" value={brief.references} onChange={value => update("references", value)} placeholder="Describe references or use the existing private image upload before opening your documents." /><BriefArea label="Practical constraints" value={brief.practicalConstraints} onChange={value => update("practicalConstraints", value)} /><Button type="button" onClick={onApply} className="rounded-full">Let Mira hold this project</Button></div> : null}</section>;
}

function ModeButton({ active, title, description, onClick }: { active: boolean; title: string; description: string; onClick: () => void }) { return <button type="button" onClick={onClick} aria-pressed={active} className={`rounded-2xl border p-4 text-left transition-colors ${active ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-800 hover:border-stone-400"}`}><span className="block font-medium">{title}</span><span className={`mt-1 block text-xs leading-5 ${active ? "text-stone-300" : "text-stone-500"}`}>{description}</span></button>; }
function BriefInput({ label, value, onChange, placeholder }: { label: string; value?: string; onChange: (value: string) => void; placeholder?: string }) { return <label className="text-xs font-medium uppercase tracking-[0.12em] text-stone-500">{label}<Input value={value ?? ""} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="mt-2 normal-case tracking-normal" /></label>; }
function BriefArea({ label, value, onChange, placeholder }: { label: string; value?: string; onChange: (value: string) => void; placeholder?: string }) { return <label className="block text-xs font-medium uppercase tracking-[0.12em] text-stone-500">{label}<Textarea value={value ?? ""} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="mt-2 min-h-20 normal-case tracking-normal" /></label>; }

function DocumentShell({ title, subtitle, onDownload, downloading, children }: { title: string; subtitle: string; onDownload: () => void; downloading: boolean; children: React.ReactNode }) { return <article className="mira-panel p-7 sm:p-12"><div className="flex flex-col justify-between gap-5 border-b border-stone-200 pb-8 sm:flex-row sm:items-start"><div><p className="mira-kicker">Held as true</p><h2 className="mira-display mt-3 text-4xl sm:text-5xl">{title}</h2><p className="mt-3 max-w-xl text-sm leading-6 text-stone-600">{subtitle}</p></div><Button onClick={onDownload} disabled={downloading} variant="outline" className="rounded-full">{downloading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />} {downloading ? "Preparing…" : "Download PDF"}</Button></div><div className="mt-9 space-y-9">{children}</div></article>; }
function TextSection({ heading, body, sourceTurn }: { heading: string; body: string; sourceTurn?: number }) { return <section><p className="mira-kicker">{heading}</p><p className="mt-3 max-w-3xl text-base leading-7 text-stone-700">{body}</p>{sourceTurn ? <Source /> : null}</section>; }
function Source() { return <span className="mt-2 block text-[10px] font-medium uppercase tracking-[0.14em] text-stone-400">From your conversation</span>; }
function Evidence({ items }: { items: Array<{ turn: number; quote: string }> }) { return <details className="rounded-xl bg-stone-50 p-5"><summary className="cursor-pointer text-sm font-medium text-stone-700">See the words Mira heard</summary><div className="mt-4 space-y-3">{items.map(item => <blockquote key={`${item.turn}-${item.quote}`} className="border-l border-stone-300 pl-4 text-sm italic leading-6 text-stone-600">“{item.quote}”</blockquote>)}</div></details>; }
