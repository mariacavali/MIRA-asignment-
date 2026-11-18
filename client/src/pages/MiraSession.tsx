import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { ArrowUpRight, Check, Mic, Pause, Phone, PhoneOff, Play, Sparkles, House, HandHeart, Upload, FileText, X, RefreshCw } from "lucide-react";
import { useMiraSession, type SessionScope } from "@/lib/useMiraSession";
import { useMiraVoice } from "@/lib/useMiraVoice";
import { INTERVIEW_AREA_LABELS } from "@shared/miraInterview";
import { DIRECTION_DIMENSION_LABELS } from "@shared/miraDirectionBrief";
import { directionBriefText } from "@shared/miraDirectionBriefText";
import "./mira-call-preview.css";

const clock = (ms: number) => `${Math.floor(ms / 60_000).toString().padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const themes = ["A little bloom", "Your constellation", "Colour reveal"];
export default function MiraSessionRoute() {
  const params = useParams<{ workspaceId?: string; conversationId?: string }>();
  const scope = params.workspaceId && params.conversationId ? { workspaceId: Number(params.workspaceId), conversationId: params.conversationId } : undefined;
  return <MiraSession localReview={false} initialScope={scope} />;
}
export function MiraSession({ localReview, initialScope }: { localReview: boolean; initialScope?: SessionScope }) {
  const session = useMiraSession(initialScope, localReview), data = session.data;
  const [screen, setScreen] = useState<"welcome" | "session" | "results">("welcome"), [theme, setTheme] = useState(0);
  const [permission, setPermission] = useState(false), [link, setLink] = useState(""), [referenceNote, setReferenceNote] = useState(""), [draft, setDraft] = useState("");
  const [voiceWanted, setVoiceWanted] = useState(false), [projection, setProjection] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null), log = useRef<HTMLDivElement>(null);
  const active = data?.clock?.state === "active", paused = data?.clock?.state === "paused", ended = data?.clock?.state === "ended" || data?.clock?.state === "exhausted";
  const voice = useMiraVoice({ scope: session.scope, active, enabled: !!data?.capabilities.voice, send: session.send,
    onFailure: message => { void session.command("pause").catch(() => {}).finally(() => session.setError(message)); } });
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [data?.messages.length, session.busy]);
  useEffect(() => {
    const started = performance.now(); setProjection(0); if (!active || !data?.clock) return;
    const timer = setInterval(() => setProjection(Math.max(0, performance.now() - started)), 250); return () => clearInterval(timer);
  }, [data?.clock]);
  useEffect(() => { if (data?.clock?.state === "active") setScreen("session"); }, [data?.clock?.state]);
  const safe = (action: () => Promise<unknown>) => { void action().catch(error => session.setError(error instanceof Error ? error.message : "Please try again.")); };
  const remaining = data?.clock ? Math.max(0, data.clock.remainingMs - (active ? Math.min(projection, Math.max(0, (data.clock.leaseUntilMs ?? 0) - data.clock.serverNowMs)) : 0)) : 3_600_000;
  const elapsed = (data?.clock?.allowanceMs ?? 3_600_000) - remaining;
  async function startCall(wantVoice = true) {
    if (!data) return;
    if (!data.capabilities.text && !data.capabilities.voice) throw new Error(data.capabilities.providerMessage);
    const voiceRequests = data.messages.length === 1 ? 4 : 3;
    if (wantVoice && data.capabilities.localReview && data.capabilities.trial && data.capabilities.trial.remainingRequests < voiceRequests) {
      throw new Error("This trial has too few requests left for a new voice exchange. Start or resume with text instead.");
    }
    setVoiceWanted(wantVoice); setScreen("session");
    if (!active) await session.command(paused ? "resume" : "start");
    if (wantVoice && data.capabilities.voice) {
      try { await voice.start(); if (data.messages.length === 1) await voice.say(null); }
      catch (error) { voice.stop(); try { await session.command("pause"); } catch {} throw error; }
    }
    else if (wantVoice) session.setError("Your saved session and timer are connected. Live AI and voice still need the bounded test to be enabled; there is no microphone recording yet.");
  }
  function navigate(next: typeof screen) {
    if (next === "session" && window.matchMedia("(max-width:640px)").matches && !data?.references.length) { session.setError("Please save a reference photo, PDF or text file before continuing."); setScreen("welcome"); return; }
    setScreen(next); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function downloadReflection() {
    if (!data?.reflection) return;
    const reflection = data.reflection, unique = reflection.answers.filter((answer, index, all) => all.findIndex(item => item.memoryId === answer.memoryId) === index);
    const text = [`MIRA — ${reflection.reviewed ? "Confirmed reflection" : "Draft reflection"}`, "", ...unique.flatMap(answer => [answer.kind === "interpreted" ? "MIRA’s interpretation:" : "From your conversation:", answer.text, ""]), "Still open:", ...reflection.unresolved.map(item => `- ${INTERVIEW_AREA_LABELS[item.area]}`)].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" })), anchor = document.createElement("a"); anchor.href = url; anchor.download = "mira-reflection.txt"; anchor.click(); URL.revokeObjectURL(url);
  }
  async function downloadDirectionBrief() {
    const brief = await session.readDirectionBrief();
    const text = directionBriefText(brief);
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" })), anchor = document.createElement("a");
    anchor.href = url; anchor.download = "mira-direction-brief.txt"; anchor.click(); URL.revokeObjectURL(url);
  }
  const reflectionAnswers = data?.reflection?.answers.filter((answer, index, all) => all.findIndex(item => item.memoryId === answer.memoryId) === index) ?? [];
  return <div className={`mira-call-draft call-connected mobile-${screen}`}>
    <header className="call-nav"><a href={localReview ? "/mira/coach-preview" : window.location.pathname} className="call-wordmark">MIRA<span>by Maria Cavali</span></a>
      <span className="call-preview-label">{localReview ? "LOCAL WORKING REVIEW" : "YOUR PRIVATE MIRA SPACE"}</span><span className="call-nav-note">A little space. A clearer brand.</span>
    </header>
    <nav className="call-desktop-nav" aria-label="Session navigation">{(["welcome", "session", "results"] as const).map(value => <button key={value} aria-current={screen === value ? "page" : undefined} onClick={() => navigate(value)}>{value === "welcome" ? "Home" : value === "session" ? "Talk to MIRA" : "Results"}</button>)}</nav>
    {localReview ? <details className="call-connections"><summary>{data ? "Saved session connected" : "Connecting your saved session…"} · view connections</summary>
      <ul><li>Session and timer: {data ? "connected to the local database" : "connecting"}</li><li>Reference storage: {data?.capabilities.uploads ? "connected" : "not connected"}</li><li>AI conversation: {data?.capabilities.text ? "enabled for the bounded test" : "not enabled"}</li><li>Voice: {data?.capabilities.voice ? "enabled; microphone starts only when you choose it" : "not enabled"}</li><li>Interview method: research-based adaptive method</li><li>Shared knowledge library: {data?.capabilities.publishedKnowledge ? "published library connected" : "no reviewed release published yet"}</li></ul>
      <p>{data?.capabilities.providerMessage}</p>
      {data?.capabilities.trial ? <p role="status">{data.capabilities.trial.state === "not_authorised" ? "Local trial: awaiting approval."
        : <>Local trial: {data.capabilities.trial.remainingRequests} of {data.capabilities.trial.maxRequests} requests remaining{data.capabilities.trial.expiresAt ? ` · ${data.capabilities.trial.state === "expired" ? "expired" : "expires"} ${new Date(data.capabilities.trial.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}. A text reply uses one request; a voice exchange uses up to three, plus the opening voice greeting.</>}</p> : null}
      {data?.clock && !active ? <button onClick={() => safe(async () => { await session.command(paused ? "resume" : "start"); setScreen("session"); })}>Test the timer without AI</button> : null}<button onClick={() => void session.refresh()}><RefreshCw size={13} />Refresh connections</button>
    </details> : null}
    {session.error ? <div className="call-connected-error" role="alert"><p>{session.error}</p><button aria-label="Dismiss message" onClick={() => session.setError("")}><X size={17} /></button></div> : null}
    {session.loading ? <p className="call-loading" role="status">Opening your saved MIRA session…</p> : null}
    {!localReview && !initialScope ? <p className="call-loading">Open your private session link to connect your brand workspace. <a href="/mira/coach">Choose your brand</a></p> : null}
    <main className="call-layout">
      <section className="call-welcome" aria-labelledby="welcome-title">
        <div className="call-host"><div className="call-photo-placeholder" role="img" aria-label="Placeholder for Maria’s profile photo">MC</div><div><strong>Maria Cavali</strong><span>The eye behind MIRA</span><small>Profile photo to be added</small></div></div>
        <p className="call-eyebrow">YOUR BRAND, IN YOUR OWN WORDS</p>
        <h1 id="welcome-title">Make yourself <br />comfortable.<br /><em>Let’s find your direction.</em></h1>
        <p className="call-intro">Sit comfortably and take a glass of water. Add your reference links and photos so MIRA can understand your world. Your conversation will follow what matters to you.</p>
        <div className="call-reference-note"><ArrowUpRight size={19} /><div><strong>Your inspiration belongs here.</strong><p>Photos, a website, a Pinterest board, or something you love.</p>
          <div className="call-mobile-references">
            <label className="call-reference-permission"><input type="checkbox" checked={permission} onChange={event => setPermission(event.target.checked)} /> I have permission for MIRA to use these references in my private session.</label>
            <label className={`call-file-label ${!permission ? "is-disabled" : ""}`}><span className="call-upload-heading"><Upload size={19} /> Upload your references</span><span className="call-upload-hint">JPG, PNG, WebP, PDF or text · up to 10 MB each</span>
              <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf,text/plain" disabled={!permission || session.busy || !data?.capabilities.uploads} onChange={event => { const files = Array.from(event.target.files ?? []); safe(() => session.upload(files, permission)); event.target.value = ""; }} />
            </label>
            <div className="call-reference-files" aria-label="Saved references">{data?.references.map(reference => <article key={reference.id}>
              {reference.mime.startsWith("image/") && session.scope ? <img alt={reference.name} src={`/api/mira-session/references/${reference.id}?workspaceId=${session.scope.workspaceId}&conversationId=${session.scope.conversationId}`} /> : <FileText size={21} />}
              <div><strong>{reference.name}</strong><small>{reference.note}</small>{reference.mime.startsWith("image/") && reference.status !== "text_ready" && data.capabilities.vision ? <button className="call-analyse-reference" disabled={session.busy} onClick={() => safe(() => session.analyse(reference.id))}>Let MIRA look at this</button> : null}</div><button type="button" aria-label={`Withdraw ${reference.name}`} disabled={session.busy} onClick={() => safe(() => session.withdraw(reference.id))}><X size={14} /></button>
            </article>)}</div>
            {Object.entries(session.uploadStatus).filter(([, value]) => value !== "Saved").map(([name, value]) => <p key={name} className="call-upload-status" role="status">{name}: {value}</p>)}
            <details className="call-link-details"><summary>Add a website or Pinterest link</summary><form className="call-link-form" onSubmit={event => { event.preventDefault(); safe(async () => { await session.addLink(link, referenceNote, permission); setLink(""); setReferenceNote(""); }); }}>
              <label className="call-link-label">Reference link<input type="url" value={link} onChange={event => setLink(event.target.value)} placeholder="https://…" required /></label>
              <label className="call-link-label">What draws you to it? <small>(optional)</small><textarea value={referenceNote} onChange={event => setReferenceNote(event.target.value)} placeholder="A detail, feeling or element you value" rows={2} /></label>
              <button type="submit" disabled={!permission || session.busy || !link.trim()}>Save link <ArrowUpRight size={13} /></button>
            </form></details>
            {data?.sources.filter(source => source.referenceUrl && source.status === "active").map(source => <p className="call-saved-link" key={source.id}><a href={source.referenceUrl!} target="_blank" rel="noreferrer">{source.referenceUrl}</a><small>Saved as a reference link. Page content has not been fetched.</small><button type="button" aria-label="Withdraw reference link" disabled={session.busy} onClick={() => safe(() => session.withdrawLink(source.id))}><X size={13} /></button></p>)}
            <span role="status">{data?.references.length ? `${data.references.length} reference file${data.references.length === 1 ? "" : "s"} saved privately.` : "Your files will appear here after they have been saved."} Images are saved; tell MIRA which details matter to you.</span>
          </div></div></div>
        <p className="call-ready"><span />MIRA is ready when you are.<br /><strong>You have an hour for your brand.</strong></p>
        <div className="call-mobile-footer"><button className="call-mobile-next" disabled={!data?.references.length || session.busy} onClick={() => navigate("session")}>Next <ArrowUpRight size={17} /></button></div>
      </section>
      <section className="call-experience" aria-label="MIRA session">
        <button className="call-mobile-back" disabled={active} onClick={() => navigate("welcome")}>← Your references</button>
        <div className="call-session-top"><span><span className="call-dot" />{active ? "IN CONVERSATION" : paused ? "SESSION PAUSED" : ended ? "SESSION ENDED" : "YOUR PRIVATE BRAND SESSION"}</span><span>01 / 01</span></div>
        <div className={`call-visual theme-${theme} ${active ? "is-active" : ""}`} aria-hidden="true"><div className="call-orbit orbit-one" /><div className="call-orbit orbit-two" /><div className="call-orbit orbit-three" /><div className="call-orb"><Sparkles size={29} strokeWidth={1} /></div><span className="call-star star-one">✦</span><span className="call-star star-two">✧</span></div>
        <div className="call-status"><p>{voice.state === "speaking" ? "MIRA is speaking" : voice.state === "listening" ? "MIRA is listening" : ["transcribing", "thinking"].includes(voice.state) || session.busy ? "MIRA is thinking" : paused ? "Take your time." : ended ? "A little more clarity. All yours." : "Good things start with a conversation."}</p>
          <span>{voice.connected ? "An AI voice conversation with MIRA" : active ? "Your saved conversation is open below." : paused ? data?.clock?.pauseReason === "connection_lost" ? "The connection was interrupted. Your timer has paused." : "Your remaining time is saved." : "One hour to explore what makes your brand yours."}</span></div>
        <div className="call-controls">{!active && !paused ? <button className="call-primary" disabled={!data || session.busy || data.clock?.state === "exhausted"} onClick={() => safe(() => startCall(true))}><Phone size={17} />Call MIRA<ArrowUpRight size={17} /></button>
          : <><button className="call-secondary" disabled={session.busy} onClick={() => safe(async () => { if (active) { voice.stop(); await session.command("pause"); } else await startCall(voiceWanted); })}>{active ? <Pause size={16} /> : <Play size={16} />}{active ? "Pause" : "Resume"}</button><button className="call-end" onClick={() => safe(async () => { voice.stop(); await session.command("end"); setScreen("results"); })}><PhoneOff size={17} />End session</button></>}
        </div>
        {active && data?.capabilities.voice && !voice.connected ? <button className="call-enable-mic" onClick={() => safe(() => startCall(true))}><Mic size={14} />Enable microphone</button> : null}
        {!active && data?.capabilities.text ? <button className="call-text-option" onClick={() => safe(() => startCall(false))}>{paused ? "Resume with text instead" : "Start with text instead"}</button> : null}
        <p className="call-demo-caption">{data?.capabilities.voice ? "Microphone access starts only when you choose a voice call." : "Voice is not enabled yet. The timer, references and saved-session controls are connected."}</p>
        <div className="call-wave" aria-label={voice.connected ? "Live audio activity" : "Microphone off"}>{Array.from({ length: 43 }, (_, index) => <span key={index} style={{ height: `${3 + voice.level * (12 + Math.sin(index * .7) ** 2 * 32)}px`, transform: "none", opacity: voice.connected ? .85 : .35 }} />)}</div>
        <div className="call-time"><span>{clock(elapsed)} <small>/ {clock(data?.clock?.allowanceMs ?? 3_600_000)}</small></span><span>{clock(remaining)} remaining</span></div>
        <progress className="call-time-track" value={elapsed} max={data?.clock?.allowanceMs ?? 3_600_000} aria-label="Session time elapsed" />
        {remaining <= 5 * 60_000 ? <p className="call-time-warning" role="status">{remaining ? "Let’s leave time to reflect before you finish." : "Your allowance is used. Your conversation and reflection stay saved."}</p> : null}
        <section className="call-progress-card" aria-label="Brand discovery progress"><div className="call-progress-heading"><div><span className="call-eyebrow">LITTLE STEPS, REAL CLARITY</span><h2>Your brand is taking shape.</h2></div><strong>{data?.coverage?.progressPercent ?? 10}<small>%</small></strong></div>
          <progress value={data?.coverage?.progressPercent ?? 10} max={100} aria-label="Reviewed discovery progress" className="call-task-track" />
          <p className="call-milestone">MIRA follows your conversation. Progress reflects reviewed meaning, not minutes or a fixed questionnaire.</p>
        </section>
        <section className="call-conversation" aria-label="Your conversation"><div ref={log} className="call-message-log" role="log" aria-live="polite">{data?.messages.map((message, index) => <article key={index} className={message.role}><small>{message.role === "client" ? "YOU" : "MIRA"}</small><p>{message.content}</p></article>)}</div>
          <form onSubmit={event => { event.preventDefault(); if (!draft.trim()) return; safe(async () => { const result = await session.send(draft.trim()); setDraft(""); if (voice.connected) await voice.say(result.requestId); }); }}>
            <label>Your message<textarea ref={input} value={draft} onChange={event => setDraft(event.target.value)} maxLength={8000} disabled={session.busy || !active || !data?.capabilities.text || voice.connected} placeholder={!data?.capabilities.text ? "Live AI is waiting to be enabled." : "Talk naturally, or write to MIRA…"} /></label>
            <button type="submit" disabled={session.busy || !active || !draft.trim() || !data?.capabilities.text || voice.connected}>{session.busy ? "MIRA is thinking…" : "Send"}<ArrowUpRight size={14} /></button>
          </form>
        </section>
      </section>
      <section className="call-results-preview call-connected-results" aria-label="Your results"><HandHeart size={36} strokeWidth={1.2} /><h1>Your brand, coming together.</h1>
        {reflectionAnswers.length ? <><h2>What MIRA understands so far</h2>{reflectionAnswers.map(answer => <article key={answer.memoryId}><small>{answer.kind === "interpreted" ? "MIRA’s interpretation — please check" : "From what you shared"}</small><p>{answer.text}</p></article>)}
          <div className="call-results-actions"><button disabled={session.busy || data?.reflection?.reviewed} onClick={() => safe(() => session.confirmReflection())}>{data?.reflection?.reviewed ? "Reflection confirmed" : "This reflects what I meant"}</button><button onClick={() => { setScreen("session"); setDraft("I’d like to change this: "); setTimeout(() => input.current?.focus(), 0); }}>I’d like to change something</button><button onClick={downloadReflection}>Download reflection</button></div>
          {data?.reflection?.unresolved.length ? <details><summary>What is still open</summary><p>{data.reflection.unresolved.map(item => INTERVIEW_AREA_LABELS[item.area]).join(" · ")}</p></details> : null}
          {data?.directionBrief && data.directionBrief.reflectionFingerprint === data.reflection?.fingerprint && data.directionBrief.revision === data.revision ? <section aria-label="Your direction brief"><h2>Your direction brief</h2>
            {data.directionBrief.state === "needs_confirmation" ? <p>Confirm your reflection first. MIRA will carry only the meaning you reviewed into your direction brief.</p>
              : data.directionBrief.state !== "unavailable" ? <><p>{data.directionBrief.statements.length} confirmed statement{data.directionBrief.statements.length === 1 ? "" : "s"} carried forward. Unanswered areas stay open.</p>
                <details><summary>What is ready for the next step</summary>{data.directionBrief.dimensions.map(item => <p key={item.dimension}><strong>{DIRECTION_DIMENSION_LABELS[item.dimension]}:</strong> {item.ready ? "Confirmed inputs are available for a provisional draft." : `Still open: ${item.missing.map(area => INTERVIEW_AREA_LABELS[area]).join(" · ")}.`}</p>)}</details>
                {data.directionBrief.statements.length ? <button disabled={session.busy} onClick={() => safe(downloadDirectionBrief)}>Download direction brief</button> : null}</> : null}
          </section> : null}
          <p>Your brand direction has its own review. {data?.directionCount ? "An approved direction is saved." : "It has not been generated or approved yet."}</p></> : <><p>Your saved reflection and reviewed direction will appear here as your conversation develops.</p><p>No results have been generated yet.</p><button onClick={() => navigate("session")}>Talk to MIRA</button></>}
      </section>
    </main>
    <nav className="call-bottom-nav" aria-label="Main navigation"><button aria-current={screen === "welcome" ? "page" : undefined} onClick={() => navigate("welcome")}><House size={21} strokeWidth={1.5} /><span>Home</span></button><button aria-current={screen === "session" ? "page" : undefined} onClick={() => navigate("session")}><Phone size={21} strokeWidth={1.5} /><span>Talk to MIRA</span></button><button aria-current={screen === "results" ? "page" : undefined} onClick={() => navigate("results")}><HandHeart size={22} strokeWidth={1.5} /><span>Results</span></button></nav>
    <section className="call-draft-options" aria-label="Your visual preference"><div><span className="call-eyebrow">A LITTLE DELIGHT</span><p>Choose a mood</p></div><div className="call-theme-options">{themes.map((name, index) => <button key={name} aria-pressed={theme === index} onClick={() => setTheme(index)}><span>{["✿", "✧", "◒"][index]}</span>{name}</button>)}</div></section>
  </div>;
}
