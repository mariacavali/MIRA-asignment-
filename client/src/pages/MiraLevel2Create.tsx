import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { deriveCreateGenerationUiState } from "@/lib/miraCreateGenerationState";
import { ArrowLeft, ImageIcon, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { Mira123Shell } from "./MiraLevel1";

function CreateNav() {
  return (
    <nav className="mira-l123-topnav" aria-label="Mira levels">
      <span className="mira-l123-topnav-item is-future">01 DISCOVER</span>
      <span className="mira-l123-topnav-item is-future">02 DEEPER</span>
      <span className="mira-l123-topnav-item is-active">03 CREATE</span>
    </nav>
  );
}

export default function MiraLevel2Create() {
  const { journeyId: journeyIdRaw } = useParams<{ journeyId: string }>();
  const journeyId = Number(journeyIdRaw);
  const [, navigate] = useLocation();
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });
  const utils = trpc.useUtils();
  const direction = trpc.miraV4.getLevel2CreateDirection.useQuery(
    { journeyId },
    { enabled: Boolean(user) && Number.isInteger(journeyId) && journeyId > 0, retry: false },
  );
  const generate = trpc.miraV4.generateLevel2CreateFrames.useMutation({
    onSuccess: async () => utils.miraV4.getLevel2CreateDirection.invalidate({ journeyId }),
    onSettled: async () => utils.miraV4.getLevel2CreateDirection.invalidate({ journeyId }),
  });
  const [generatingCampaign, setGeneratingCampaign] = useState(false);

  const waitForFrameToSettle = async (frameId: "frame_1" | "frame_2" | "frame_3" | "frame_4" | "frame_5") => {
    for (let attempt = 0; attempt < 45; attempt += 1) {
      const refreshed = await direction.refetch();
      const status = refreshed.data?.frameStates.find(frame => frame.id === frameId)?.status;
      if (status !== "generating") return;
      await new Promise(resolve => window.setTimeout(resolve, 2_000));
    }
  };

  const generateRemaining = async (onlyFrameId?: "frame_1" | "frame_2" | "frame_3" | "frame_4" | "frame_5") => {
    if (!direction.data || generatingCampaign) return;
    setGeneratingCampaign(true);
    try {
      const incomplete = direction.data.frameStates.filter(frame => frame.status !== "complete").map(frame => frame.id as "frame_1" | "frame_2" | "frame_3" | "frame_4" | "frame_5");
      const ordered = onlyFrameId ? [onlyFrameId] : [...incomplete].sort((a, b) => a === "frame_2" ? -1 : b === "frame_2" ? 1 : a.localeCompare(b));
      for (const frameId of ordered) {
        try {
          await generate.mutateAsync({ journeyId, frameIds: [frameId] });
        } catch {
          // A request-level provider, gateway, or network failure belongs only
          // to this frame. If the server kept working after a gateway timeout,
          // wait for its persisted result before starting the next frame.
          await waitForFrameToSettle(frameId);
        } finally {
          await direction.refetch();
        }
      }
    } finally {
      setGeneratingCampaign(false);
      const refreshed = await direction.refetch();
      if (refreshed.data && !deriveCreateGenerationUiState(refreshed.data.frameStates).showFailureUi) generate.reset();
    }
  };

  useEffect(() => {
    if (!generate.isPending && !generatingCampaign) return;
    const poll = window.setInterval(() => void direction.refetch(), 2_000);
    return () => window.clearInterval(poll);
  }, [direction.refetch, generate.isPending, generatingCampaign]);

  if (loading || direction.isLoading) {
    return <Mira123Shell><Loader2 className="size-5 animate-spin text-amber-100/80" /></Mira123Shell>;
  }

  if (!direction.data) {
    return (
      <Mira123Shell>
        <section className="mira-l123-panel max-w-2xl">
          <CreateNav />
          <p className="mira-l123-kicker mt-9">CREATE unavailable</p>
          <h1 className="mira-display mt-5 text-4xl text-amber-50">Complete DEEPER before opening the shoot world.</h1>
          <Button onClick={() => navigate(`/mira-1/journey/${journeyId}/deeper`)} className="mira-l123-ghost mt-8 rounded-full px-6 text-amber-50">
            <ArrowLeft className="mr-2 size-4" /> Return to DEEPER
          </Button>
        </section>
      </Mira123Shell>
    );
  }

  const create = direction.data;
  const frameState = new Map(create.frameStates.map(frame => [frame.id, frame]));
  const generationUi = deriveCreateGenerationUiState(create.frameStates);
  const { completedFrames } = generationUi;
  const support = [
    ["Colour", create.campaignLanguage.colour.join(" · ")],
    ["Light", create.campaignLanguage.light],
    ["Styling", create.campaignLanguage.styling],
    ["Location", create.campaignLanguage.location],
    ["Composition", create.campaignLanguage.composition],
    ["Movement", create.campaignLanguage.movement],
  ];

  return (
    <Mira123Shell>
      <main className="mira-create-shell w-full">
        <CreateNav />
        <header className="mira-create-header">
          <div>
            <p className="mira-l123-kicker">Shoot visual direction · Structured production preview</p>
            <h1 className="mira-display mt-4 max-w-4xl text-[clamp(3rem,8vw,7rem)] leading-[0.88] text-amber-50">{create.title}</h1>
          </div>
          <div>
            <p className="max-w-xl text-base leading-7 text-stone-300">{create.creativeDirection}</p>
            <Button
              type="button"
              onClick={() => void generateRemaining()}
              disabled={generatingCampaign || completedFrames === 5}
              className="mira-l123-cta mt-7 rounded-full px-7 text-amber-50"
            >
              {generatingCampaign ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ImageIcon className="mr-2 size-4" />}
              {generatingCampaign ? `Creating campaign frame ${Math.min(completedFrames + 1, 5)} of 5…` : completedFrames === 5 ? "Five frames complete" : completedFrames ? "Continue creating the campaign" : "Generate five campaign frames"}
            </Button>
            {generationUi.showFailureUi ? <p className="mt-3 text-sm text-red-300">Image generation paused. Completed frames are safe; retry the failed frame below.</p> : null}
          </div>
        </header>

        <section className="mira-create-story" aria-label="Five-frame campaign story">
          {create.frames.map((frame, index) => (
            <article key={frame.id} className={`mira-create-frame frame-${index + 1}`}>
              <div className="mira-create-frame-visual" aria-label={`Campaign frame for ${frame.title}`}>
                {frameState.get(frame.id)?.url ? <img src={frameState.get(frame.id)?.url} alt={`${frame.title} — frame ${frame.number} of the same editorial campaign`} className="h-full w-full object-cover" /> : null}
                {!frameState.get(frame.id)?.url ? <span className="mira-create-frame-number">0{frame.number}</span> : null}
                <span className="mira-create-frame-status">
                  {generatingCampaign && frameState.get(frame.id)?.status !== "complete" ? "CREATING" : frameState.get(frame.id)?.status === "complete" ? "CAMPAIGN FRAME" : frameState.get(frame.id)?.status === "failed" ? "READY TO RESUME" : frameState.get(frame.id)?.status === "generating" ? "CREATING" : "READY TO GENERATE"}
                </span>
              </div>
              <div className="mira-create-frame-copy">
                <p className="mira-l123-kicker">Frame 0{frame.number}</p>
                <h2 className="mira-display mt-2 text-3xl text-amber-50">{frame.title}</h2>
                <p className="mt-3 text-sm leading-6 text-stone-300">{frame.narrativeRole}</p>
                <p className="mt-3 text-xs leading-5 text-stone-400">{frame.visualDirection}</p>
                {frameState.get(frame.id)?.status === "failed" ? (
                  <Button type="button" onClick={() => void generateRemaining(frame.id as "frame_1" | "frame_2" | "frame_3" | "frame_4" | "frame_5")} disabled={generatingCampaign} className="mira-l123-ghost mt-4 rounded-full px-5 text-amber-50">
                    <RefreshCw className="mr-2 size-3.5" /> Retry this frame
                  </Button>
                ) : null}
              </div>
            </article>
          ))}
        </section>

        <section className="mira-create-direction-grid">
          {support.map(([label, value]) => (
            <article key={label} className="mira-create-direction-item">
              <p className="mira-l123-kicker">{label}</p>
              <p className="mt-3 text-sm leading-6 text-stone-200">{value}</p>
            </article>
          ))}
        </section>

        <section className="mira-create-evidence">
          <div>
            <p className="mira-l123-kicker">Must remain visible</p>
            <div className="mt-4 flex flex-wrap gap-2">{create.mustInclude.map(item => <span key={item} className="mira-l123-chip">{item}</span>)}</div>
          </div>
          <div>
            <p className="mira-l123-kicker">Never reintroduce</p>
            <div className="mt-4 flex flex-wrap gap-2">{create.avoid.map(item => <span key={item} className="mira-l123-chip">{item}</span>)}</div>
          </div>
        </section>

        <footer className="mt-10 flex items-center justify-between border-t border-amber-100/20 pt-7">
          <Button onClick={() => navigate(`/mira-1/journey/${journeyId}/deeper`)} className="mira-l123-ghost rounded-full px-6 text-amber-50">
            <ArrowLeft className="mr-2 size-4" /> Back to DEEPER
          </Button>
          <p className="text-right text-[11px] uppercase tracking-[0.18em] text-stone-500">Maria visual style {create.mariaStyle.styleVersion}<br />Five generation prompts prepared</p>
        </footer>
      </main>
    </Mira123Shell>
  );
}
