import { useEffect, useRef, useState } from "react";
import type { CoachMessage } from "@shared/miraCoach";
import type { CallClockCommand, CallClockStatus } from "@shared/miraCallClock";
import type { InterviewCoverage, InterviewReflection } from "@shared/miraInterview";
import type { SessionCapabilities, SessionReference } from "@shared/miraSession";
import type { DirectionBrief } from "@shared/miraDirectionBrief";
import { sessionRpc as rpc, sessionRequest, fileBase64 } from "./miraSessionApi";

export type SessionScope = { workspaceId: number; conversationId: string };
type Snapshot = { revision: number; messages: CoachMessage[]; clock: CallClockStatus | null; coverage: InterviewCoverage | null; reflection: InterviewReflection | null;
  references: SessionReference[]; sources: { id: string; title: string; referenceUrl: string | null; status: string }[]; capabilities: SessionCapabilities; directionCount: number; directionBrief: DirectionBrief };
const errorText = (error: unknown) => {
  if (!(error instanceof Error)) return "This action could not be completed. Please try again.";
  if (error.message.trim().startsWith("[")) return "The session connection changed. Refresh this page and try again.";
  return error.message;
};
export function useMiraSession(initialScope?: SessionScope, localReview = false) {
  const [scope, setScope] = useState<SessionScope | undefined>(initialScope), [data, setData] = useState<Snapshot>(), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [uploadStatus, setUploadStatus] = useState<Record<string, string>>({});
  const current = useRef(data); current.current = data;
  const alive = useRef(true), mutation = useRef(false), heartbeat = useRef(false), loadCounter = useRef(0);
  const attempt = useRef<{ text: string; requestId: string } | undefined>(undefined);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (!localReview) return; void sessionRequest<SessionScope>("bootstrap").then(value => { if (alive.current) setScope({ workspaceId: value.workspaceId, conversationId: value.conversationId }); }).catch(value => { setError(errorText(value)); setLoading(false); }); }, [localReview]);
  async function refresh() {
    if (!scope) return;
    const serial = ++loadCounter.current, query = new URLSearchParams({ workspaceId: String(scope.workspaceId), conversationId: scope.conversationId });
    try {
      const [conversation, clock, interview, references, sources, capabilities, direction, directionBrief] = await Promise.all([
        rpc.miraCoach.getConversation.query(scope), rpc.miraCoach.readCallClock.query(scope), rpc.miraCoach.readInterview.query(scope),
        sessionRequest<SessionReference[]>(`references?${query}`), rpc.miraCoach.listSources.query(scope), sessionRequest<SessionCapabilities>(`capabilities?${query}`), rpc.miraCoach.readDirection.query(scope),
        rpc.miraCoach.readDirectionBrief.query(scope),
      ]);
      if (alive.current && serial === loadCounter.current) setData({ revision: conversation.revision, messages: conversation.messages, clock, coverage: interview.coverage, reflection: interview.reflection,
        references, sources: sources.sources, capabilities, directionBrief, directionCount: direction.records.filter(record => record.state === "approved" && !record.stale).length });
    } catch (value) { if (alive.current && serial === loadCounter.current) { setError(errorText(value)); if (["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"].includes((value as { data?: { code?: string } }).data?.code ?? "")) { current.current = undefined; setData(undefined); } } }
    finally { if (alive.current) setLoading(false); }
  }
  useEffect(() => { if (!scope) return; void refresh(); const timer = setInterval(() => void refresh(), 5000); return () => clearInterval(timer); }, [scope?.workspaceId, scope?.conversationId]);
  async function control(action: CallClockCommand["action"]) {
    if (!scope || !current.current?.clock) throw new Error("The session timer is not ready.");
    const result = await rpc.miraCoach.controlCallClock.mutate({ ...scope, expectedRevision: current.current.clock.revision, requestId: crypto.randomUUID(), action });
    if (alive.current) { current.current = { ...current.current, clock: result }; setData(current.current); }
    return result;
  }
  useEffect(() => {
    if (!scope || data?.clock?.state !== "active" || data.clock.conversationId !== scope.conversationId) return;
    const timer = setInterval(() => { if (heartbeat.current) return; heartbeat.current = true; void control("heartbeat").catch(() => refresh()).finally(() => { heartbeat.current = false; }); }, 10_000);
    return () => clearInterval(timer);
  }, [scope?.conversationId, data?.clock?.state]);
  async function change<T>(run: () => Promise<T>) {
    if (mutation.current) throw new Error("Please wait for the current action to finish.");
    mutation.current = true; setBusy(true); setError("");
    try { const value = await run(); await refresh(); return value; }
    catch (value) { setError(errorText(value)); await refresh(); throw value; }
    finally { mutation.current = false; if (alive.current) setBusy(false); }
  }
  return { scope, data, loading, error, busy, uploadStatus, refresh, setError,
    async readDirectionBrief() {
      if (!scope) throw new Error("The session is not ready.");
      return rpc.miraCoach.readDirectionBrief.query(scope);
    },
    command: (action: CallClockCommand["action"]) => change(() => control(action)),
    async send(text: string) {
      if (!scope || !data) throw new Error("The session is not ready.");
      if (!data.capabilities.text) throw new Error(data.capabilities.providerMessage);
      return change(async () => {
        if (attempt.current?.text !== text) attempt.current = { text, requestId: crypto.randomUUID() };
        const requestId = attempt.current.requestId;
        let result;
        try { result = await rpc.miraCoach.callTurn.mutate({ ...scope, requestId, message: text }); }
        catch (error) { if (current.current?.clock?.state === "active") { try { await control("pause"); } catch {} } throw error; }
        attempt.current = undefined;
        return { ...result, requestId };
      });
    },
    async upload(files: File[], permission: boolean) {
      if (!scope || !permission) throw new Error("Please confirm permission to use these references in your private session.");
      return change(async () => {
        for (const file of files) {
          setUploadStatus(previous => ({ ...previous, [file.name]: "Saving…" }));
          try {
            if (file.size > 10 * 1024 * 1024) throw new Error("Choose a file up to 10 MB.");
            await sessionRequest("references", { ...scope, requestId: crypto.randomUUID(), name: file.name, mime: file.type || (file.name.endsWith(".txt") ? "text/plain" : "application/octet-stream"), base64: await fileBase64(file), approvedForCoaching: true, description: "" });
            setUploadStatus(previous => ({ ...previous, [file.name]: "Saved" }));
          } catch (value) { setUploadStatus(previous => ({ ...previous, [file.name]: errorText(value) })); }
        }
      });
    },
    async addLink(link: string, description: string, permission: boolean) {
      if (!scope || !data || !permission) throw new Error("Please confirm permission to use this reference.");
      return change(() => rpc.miraCoach.addSource.mutate({ ...scope, expectedRevision: current.current!.revision, source: { title: "Your reference link", referenceUrl: link,
        text: description.trim() || "Client-supplied reference link. The page has not been fetched; ask what the client values in this reference.", rightsBasis: "permission_granted", approvedForCoaching: true } }));
    },
    async analyse(id: string) { if (!scope) return; return change(() => sessionRequest(`references/${id}/analyse`, scope)); },
    async withdrawLink(sourceId: string) { if (!scope) return; return change(() => rpc.miraCoach.withdrawSource.mutate({ ...scope, sourceId, expectedRevision: current.current!.revision })); },
    async withdraw(id: string) { if (!scope) return; return change(() => sessionRequest(`references/${id}/withdraw`, scope)); },
    async confirmReflection() {
      if (!scope || !data?.reflection) return;
      return change(() => rpc.miraCoach.confirmInterviewReflection.mutate({ ...scope, expectedRevision: current.current!.revision, fingerprint: current.current!.reflection!.fingerprint }));
    },
  };
}
