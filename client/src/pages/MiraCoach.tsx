import { CallSessionPanel } from "@/components/mira/CallSessionPanel";
import { CALL_HEARTBEAT_MS, type CallClockCommand } from "@shared/miraCallClock";
import { useState, useRef, useEffect, type ReactNode } from "react";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatDetails, DirectionPanel, CoachError, ConversationPanel, MemoryPanel, SourcesPanel, coachButton, coachField, coachOutline } from "@/components/mira/CoachPanels";
import { coachConversationInputSchema, type CoachTurnInput } from "@shared/miraCoach";
import { InterviewReflection } from "@/components/mira/InterviewReflection";
import type { AddCoachSourceInput } from "@shared/miraSources";

const privateQuery = { retry: false, staleTime: 0, gcTime: 0, refetchOnMount: "always" as const, refetchOnWindowFocus: false };
function messageFor(error: { data?: { code?: string } | null } | null | undefined) {
  if (!error) return undefined;
  switch (error.data?.code) {
    case "FORBIDDEN": return "Coaching access is not active for this brand workspace. Please contact MIRA to arrange access.";
    case "UNAUTHORIZED": return "Your session has ended. Sign in again to continue.";
    case "NOT_FOUND": return "This conversation is unavailable, or you no longer have access.";
    case "CONFLICT": return "Something changed while you were working. Refresh this conversation and review it before trying again.";
    case "BAD_REQUEST": return "Please check the information you entered and try again.";
    default: return "MIRA is temporarily unavailable. Your draft is still here. Please try again.";
  }
}
function usePages<T>() {
  const [cursors, setCursors] = useState<T[]>([]);
  return { cursor: cursors.at(-1), back: cursors.length ? () => setCursors(c => c.slice(0, -1)) : undefined,
    next: (cursor: T) => setCursors(c => [...c, cursor]) };
}
function Pages({ back, next, disabled }: { back?: () => void; next?: () => void; disabled?: boolean }) {
  if (!back && !next) return null;
  return <nav aria-label="Pagination" className="mt-5 flex gap-3">
    {back ? <Button type="button" variant="outline" className={coachOutline} disabled={disabled} onClick={back}>Previous page</Button> : null}
    {next ? <Button type="button" variant="outline" className={coachOutline} disabled={disabled} onClick={next}>Next page</Button> : null}
  </nav>;
}
export function CoachShell({ children, onLogout }: { children: ReactNode; onLogout?: () => void }) {
  return <div className="mira-dark-shell min-h-screen bg-[#121211] text-[#f1eadc]">
    <header className="flex items-center justify-between border-b border-white/10 px-5 py-6 sm:px-10"><a href="/mira/coach" className="mira-dark-display text-3xl tracking-widest">MIRA</a><div className="flex items-center gap-5"><span className="text-xs tracking-widest text-[#d2b98b]">CHAT WITH MIRA</span>{onLogout ? <button type="button" onClick={onLogout} className="text-xs text-[#c9c3b7] underline underline-offset-4">Sign out</button> : null}</div></header>
    <main className="mx-auto max-w-5xl px-5 py-6 sm:px-10 sm:py-8">{children}</main>
  </div>;
}
export default function MiraCoach() {
  const auth = useAuth();
  const [logoutError, setLogoutError] = useState<string>();
  const params = useParams<{ workspaceId?: string; conversationId?: string }>();
  if (auth.loading) return <CoachShell><p role="status">Opening your brand space…</p></CoachShell>;
  if (!auth.user) return <CoachShell><h1 className="mira-dark-display text-5xl">A space for your brand.</h1><p className="mt-5 text-[#c9c3b7]">Sign in to continue your private conversations with MIRA.</p><Button className={`${coachButton} mt-7`} onClick={() => startLogin()}>Sign in</Button></CoachShell>;
  return <CoachShell onLogout={() => { setLogoutError(undefined); void auth.logout().catch(() => setLogoutError("Sign out could not be completed. Please try again.")); }}><CoachError message={logoutError} /><CoachAccess key={auth.user.id} workspaceId={params.workspaceId} conversationId={params.conversationId} /></CoachShell>;
}
function CoachAccess({ workspaceId, conversationId }: { workspaceId?: string; conversationId?: string }) {
  const availability = trpc.miraCoach.availability.useQuery(undefined, privateQuery);
  if (availability.isFetching) return <p role="status">Opening your brand space…</p>;
  if (availability.error) return <CoachError message={messageFor(availability.error)} retry={() => void availability.refetch()} />;
  if (!availability.data?.enabled) return <><p className="mira-dark-kicker">Your brand, at your pace</p><h1 className="mira-dark-display mt-5 text-5xl">Your coach space is being prepared.</h1><p className="mt-5 max-w-xl leading-7 text-[#c9c3b7]">Private brand coaching is not available here yet. Please come back when your MIRA access is ready.</p></>;
  if (workspaceId && (!/^\d+$/.test(workspaceId) || !Number.isSafeInteger(Number(workspaceId)) || Number(workspaceId) < 1)) return <CoachError message="This brand workspace link is invalid." />;
  if (conversationId && !coachConversationInputSchema.safeParse({ workspaceId: Number(workspaceId), conversationId }).success) return <CoachError message="This conversation link is invalid." />;
  return <BrandWorkspaces workspaceId={workspaceId ? Number(workspaceId) : undefined} conversationId={conversationId} />;
}
function BrandWorkspaces({ workspaceId, conversationId }: { workspaceId?: number; conversationId?: string }) {
  const [, navigate] = useLocation(); const page = usePages<number>(); const [name, setName] = useState("");
  const brands = trpc.miraWorkspace.list.useQuery({ beforeId: page.cursor }, privateQuery);
  const create = trpc.miraWorkspace.create.useMutation();
  return <>
    <h1 className="sr-only">Chat with MIRA</h1>
    <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside aria-label="Brand workspaces"><h2 className="text-sm text-[#d2b98b]">Your brands</h2>
        <CoachError message={messageFor(brands.error)} retry={() => void brands.refetch()} />
        {brands.isFetching ? <p className="mt-4 text-sm" role="status">Loading brands…</p> : !brands.error ? <ul className="mt-4 space-y-2">{brands.data?.map(brand => <li key={brand.id}><button className={`w-full break-words rounded border px-3 py-3 text-left text-sm ${workspaceId === brand.id ? "border-[#d2b98b] bg-[#23211d]" : "border-white/15"}`} aria-current={workspaceId === brand.id ? "page" : undefined} onClick={() => navigate(`/mira/coach/${brand.id}`)}>{brand.name}{brand.status === "archived" ? " · Archived" : ""}</button></li>)}</ul> : null}
        <Pages back={page.back} next={brands.data?.length === 50 ? () => page.next(brands.data![49].id) : undefined} disabled={brands.isFetching} />
        <form className="mt-6 space-y-3" onSubmit={async e => { e.preventDefault(); if (!name.trim() || create.isPending) return;
          try { const brand = await create.mutateAsync({ name: name.trim() }); setName(""); void brands.refetch(); navigate(`/mira/coach/${brand.id}`); } catch { /* shown below */ }
        }}><label className="block text-sm">New brand name<Input value={name} onChange={e => setName(e.target.value)} className={`${coachField} mt-2`} maxLength={200} required disabled={create.isPending} /></label><Button className={coachButton} disabled={create.isPending || !name.trim()}>Create brand</Button><p className="text-xs leading-5 text-[#c9c3b7]">Coaching access is arranged separately for each brand.</p></form>
        <CoachError message={messageFor(create.error)} />
      </aside>
      {workspaceId ? <BrandConversations key={workspaceId} workspaceId={workspaceId} conversationId={conversationId} /> : <section className="border-t border-white/15 py-8"><h2 className="mira-dark-display text-4xl">Begin with your brand.</h2><p className="mt-5 text-sm leading-7 text-[#c9c3b7]">Choose a brand, or create a space for the one you’re building.</p></section>}
    </div>
  </>;
}
function BrandConversations({ workspaceId, conversationId }: { workspaceId: number; conversationId?: string }) {
  const [, navigate] = useLocation(); const page = usePages<string>();
  const brand = trpc.miraWorkspace.get.useQuery({ id: workspaceId }, privateQuery);
  const conversations = trpc.miraCoach.listConversations.useQuery({ workspaceId, beforeId: page.cursor }, privateQuery);
  const create = trpc.miraCoach.createConversation.useMutation();
  if (brand.isFetching || conversations.isFetching) return <p role="status">Loading your conversations…</p>;
  if (brand.error || conversations.error) return <CoachError message={messageFor(brand.error ?? conversations.error)} retry={() => { void brand.refetch(); void conversations.refetch(); }} />;
  return <section className="min-w-0">
    <div className="mb-7 border-b border-white/15 pb-6"><p className="mira-dark-kicker">{brand.data?.name}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3"><label className="min-w-0 flex-1 text-xs text-[#c9c3b7]">Your conversations<select aria-label="Choose conversation" value={conversationId ?? ""} className={`${coachField} mt-2 block w-full rounded border p-3 text-sm`} onChange={e => navigate(e.target.value ? `/mira/coach/${workspaceId}/${e.target.value}` : `/mira/coach/${workspaceId}`)}>
        <option value="">Choose a conversation</option>{conversationId && !conversations.data?.conversations.some(c => c.id === conversationId) ? <option value={conversationId}>Current conversation</option> : null}
        {conversations.data?.conversations.map(c => <option key={c.id} value={c.id}>Conversation {c.id.slice(0, 8)} · {new Date(c.updatedAt).toLocaleDateString()}</option>)}
      </select></label><Button className={`${coachButton} mt-5`} disabled={create.isPending} onClick={async () => { try { const result = await create.mutateAsync({ workspaceId }); void conversations.refetch(); navigate(`/mira/coach/${workspaceId}/${result.conversationId}`); } catch { /* shown below */ } }}>New conversation</Button></div>
      <Pages back={page.back} next={conversations.data?.nextCursor ? () => page.next(conversations.data!.nextCursor!) : undefined} /><CoachError message={messageFor(create.error)} />
    </div>
    {conversationId ? <CoachConversation key={conversationId} workspaceId={workspaceId} conversationId={conversationId} /> : <p className="py-10 text-sm text-[#c9c3b7]">Open a conversation, or start a new one with the question on your mind.</p>}
  </section>;
}
function CoachConversation({ workspaceId, conversationId }: { workspaceId: number; conversationId: string }) {
  const utils = trpc.useUtils();
  const scope = { workspaceId, conversationId }; const memoryPage = usePages<string>(); const sourcePage = usePages<string>();
  const [tab, setTab] = useState<"memory" | "sources" | "direction">("memory");
  const [error, setError] = useState<string>(); const loaded = useRef(false); const attempt = useRef<CoachTurnInput | null>(null);
  const conversation = trpc.miraCoach.getConversation.useQuery(scope, privateQuery);
  const memory = trpc.miraCoach.listMemory.useQuery({ ...scope, beforeId: memoryPage.cursor }, privateQuery);
  const sources = trpc.miraCoach.listSources.useQuery({ ...scope, beforeId: sourcePage.cursor }, privateQuery);
  const direction = trpc.miraCoach.readDirection.useQuery(scope, privateQuery);
  const interview = trpc.miraCoach.readInterview.useQuery(scope, privateQuery);
  const callClock = trpc.miraCoach.readCallClock.useQuery(scope, { ...privateQuery, refetchInterval: query => query.state.data ? 5000 : false });
  const callControl = trpc.miraCoach.controlCallClock.useMutation({ retry: false });
  const callTurn = trpc.miraCoach.callTurn.useMutation({ retry: false });
  const clockRef = useRef(callClock.data);
  clockRef.current = callClock.data;
  const timerCommandBusy = useRef(false);
  async function controlTimer(action: CallClockCommand["action"]) {
    const current = clockRef.current;
    if (!current || timerCommandBusy.current) return;
    timerCommandBusy.current = true;
    try {
      const updated = await callControl.mutateAsync({ ...scope, action, expectedRevision: current.revision, requestId: crypto.randomUUID() });
      clockRef.current = updated; utils.miraCoach.readCallClock.setData(scope, updated);
      if (action !== "heartbeat") setError(undefined);
    } catch { if (action !== "heartbeat") setError("The timer changed. Refresh it and try again."); await callClock.refetch(); }
    finally { timerCommandBusy.current = false; }
  }
  useEffect(() => {
    if (callClock.data?.state !== "active" || callClock.data.conversationId !== conversationId) return;
    const timer = setInterval(() => void controlTimer("heartbeat"), CALL_HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [callClock.data?.state, callClock.data?.conversationId, conversationId]);
  const confirmReflection = trpc.miraCoach.confirmInterviewReflection.useMutation({ retry: false });
  const [correctionRequest, setCorrectionRequest] = useState(0);
  const reviewDirection = trpc.miraCoach.reviewDirection.useMutation({ retry: false });
  const saveDirection = trpc.miraCoach.saveDirection.useMutation({ retry: false });
  const approveDirection = trpc.miraCoach.approveDirection.useMutation({ retry: false });
  const turn = trpc.miraCoach.turn.useMutation({ retry: false });
  const decide = trpc.miraCoach.decideMemory.useMutation({ retry: false });
  const add = trpc.miraCoach.addSource.useMutation({ retry: false });
  const withdraw = trpc.miraCoach.withdrawSource.useMutation({ retry: false });
  const busy = callTurn.isPending || confirmReflection.isPending || reviewDirection.isPending || saveDirection.isPending || approveDirection.isPending || turn.isPending || decide.isPending || add.isPending || withdraw.isPending;
  const fetching = interview.isFetching || direction.isFetching || conversation.isFetching || memory.isFetching || sources.isFetching;
  const queryError = callClock.error ?? interview.error ?? direction.error ?? conversation.error ?? memory.error ?? sources.error;
  const revision = conversation.data?.revision;
  async function refresh() { await Promise.all([conversation.refetch(), memory.refetch(), sources.refetch(), direction.refetch(), interview.refetch(), callClock.refetch()]); }
  async function send(message: string) {
    if (busy || revision === undefined) return false;
    setError(undefined);
    if (attempt.current?.message !== message) attempt.current = { ...scope, message, requestId: crypto.randomUUID() };
    try { const timed = clockRef.current?.conversationId === conversationId && ["active", "paused", "exhausted"].includes(clockRef.current.state);
      if (timed) await callTurn.mutateAsync(attempt.current); else await turn.mutateAsync(attempt.current); attempt.current = null; await refresh(); return true; }
    catch (error) { setError(messageFor(error as Parameters<typeof messageFor>[0])); return false; }
  }
  async function change(operation: (expectedRevision: number) => Promise<unknown>) {
    if (busy || revision === undefined || fetching || queryError) return false;
    setError(undefined);
    try { await operation(revision); await refresh(); return true; }
    catch (error) { setError(messageFor(error as Parameters<typeof messageFor>[0])); return false; }
  }
  // Hide cached private data until a fresh authenticated read completes, and on any access error.
  if (!loaded.current && fetching) return <p role="status">Opening your conversation…</p>;
  if (queryError) return <CoachError message={messageFor(queryError)} retry={() => void refresh()} />;
  if (!conversation.data || !memory.data || !sources.data || !direction.data || !interview.data) return null;
  loaded.current = true;
  return <>
    {fetching ? <p role="status">Refreshing your conversation…</p> : null}
    <div hidden={fetching}>
    <CoachError message={error} retry={() => void refresh()} />
    <div className="mx-auto max-w-3xl">
      {callClock.data ? <a className="mb-6 inline-block rounded-full border border-[#b4c2a5] bg-[#e8eddf] px-5 py-3 text-sm text-[#173e3c]" href={`/mira/session/${workspaceId}/${conversationId}`}>Open your MIRA session ↗</a> : null}
      {callClock.data ? <CallSessionPanel clock={callClock.data} conversationId={conversationId} busy={callControl.isPending || busy} onCommand={controlTimer} /> : null}
      <div><ConversationPanel messages={conversation.data.messages} busy={turn.isPending || callTurn.isPending} locked={busy || (callClock.data?.conversationId === conversationId && ["paused", "exhausted"].includes(callClock.data.state))} onSend={send} correctionRequest={correctionRequest} /><p className="mt-4 text-xs text-[#aaa295]">Showing your most recent 50 completed exchanges.</p></div>
      {interview.data.reflection ? <InterviewReflection reflection={interview.data.reflection} busy={busy || fetching}
        onConfirm={fingerprint => change(expectedRevision => confirmReflection.mutateAsync({ ...scope, expectedRevision, fingerprint }))}
        onCorrect={() => setCorrectionRequest(previous => previous + 1)} /> : null}
      <ChatDetails pendingCount={interview.data.reflection ? 0 : memory.data.proposals.filter(item => item.status === "pending_confirmation").length}>
        <div role="tablist" aria-label="Brand context" className="mb-7 flex flex-wrap gap-3">{(["memory", "sources", "direction"] as const).map(value => <button key={value} role="tab" aria-selected={tab === value} aria-controls={`coach-${value}`} id={`tab-${value}`} className={`border-b-2 px-2 py-3 text-sm ${tab === value ? "border-[#d2b98b] text-[#d2b98b]" : "border-transparent text-[#c9c3b7]"}`} onClick={() => setTab(value)}>{value === "memory" ? "Brand memory" : value === "sources" ? "Sources" : "Your direction"}</button>)}</div>
        <div role="tabpanel" id="coach-memory" aria-labelledby="tab-memory" hidden={tab !== "memory"}><MemoryPanel items={memory.data.proposals} busy={busy} onDecide={(proposalId, decision) => void change(expectedRevision => decide.mutateAsync({ ...scope, proposalId, decision, expectedRevision }))} /><Pages back={memoryPage.back} next={memory.data.nextCursor ? () => memoryPage.next(memory.data!.nextCursor!) : undefined} disabled={busy} /></div>
        <div role="tabpanel" id="coach-sources" aria-labelledby="tab-sources" hidden={tab !== "sources"}><SourcesPanel items={sources.data.sources} busy={busy} onAdd={(source: AddCoachSourceInput["source"]) => change(expectedRevision => add.mutateAsync({ ...scope, source, expectedRevision }))} onWithdraw={sourceId => void change(expectedRevision => withdraw.mutateAsync({ ...scope, sourceId, expectedRevision }))} /><Pages back={sourcePage.back} next={sources.data.nextCursor ? () => sourcePage.next(sources.data!.nextCursor!) : undefined} disabled={busy} /></div>
        <div role="tabpanel" id="coach-direction" aria-labelledby="tab-direction" hidden={tab !== "direction"}>
          <DirectionPanel records={direction.data.records} busy={busy}
            onReview={(directionId, decisionId, action, reason) => change(expectedRevision => reviewDirection.mutateAsync({ ...scope, expectedRevision, directionId, decisionId, action, reason, requestId: crypto.randomUUID() }))}
            onCorrect={(parentId, draft) => change(expectedRevision => saveDirection.mutateAsync({ ...scope, expectedRevision, parentId, draft }))}
            onApprove={directionId => void change(expectedRevision => approveDirection.mutateAsync({ ...scope, expectedRevision, directionId }))} />
        </div>
      </ChatDetails>
    </div>
    </div>
  </>;
}
