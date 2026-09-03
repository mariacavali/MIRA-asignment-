import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  Loader2,
  Mic,
  MicOff,
  Pause,
  PhoneOff,
  Play,
  Send,
  Type,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type CallState =
  | "idle"
  | "connecting"
  | "listening"
  | "speaking"
  | "paused"
  | "reconnecting"
  | "error"
  | "ended";

type ConversationMessage = { role: "client" | "assistant"; content: string };

type MiraClientCallProps = {
  token: string;
  consent: boolean;
  initialMode?: "voice" | "text";
  onSessionStart?: () => void;
  onSessionError?: (error: string) => void;
  onSessionEnd?: () => void;
};

// Handles the active call interface for a client in the shoot room.
// Receives token and consent as props from parent.
// Manages all WebRTC connection, call state, and interaction during the call.
export default function MiraClientCall({
  token,
  consent,
  initialMode = "voice",
  onSessionStart,
  onSessionError,
  onSessionEnd,
}: MiraClientCallProps) {
  const [state, setState] = useState<CallState>("connecting");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [muted, setMuted] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [text, setText] = useState("");
  const [conversationMode, setConversationMode] = useState<"voice" | "text">(initialMode);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const finalizedRef = useRef(false);
  const connectingRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const handledCallsRef = useRef(new Set<string>());
  const createCall = trpc.miraCore.createRealtimeCall.useMutation();
  const saveMemory = trpc.miraCore.applyRealtimeMemory.useMutation();
  const createSummary = trpc.miraCore.createRealtimeSummary.useMutation();
  const confirmSummary = trpc.miraCore.confirmRealtimeSummary.useMutation();
  const classifyInput = trpc.miraCore.classifyRealtimeInput.useMutation();
  const saveQaEvent = trpc.miraCore.appendRealtimeQaEvent.useMutation();
  const pauseCall = trpc.miraCore.setRealtimePaused.useMutation();
  const finalize = trpc.miraCore.finalizeRealtime.useMutation();
  const checkStatus = trpc.miraCore.checkPreparationStatus.useMutation();
  const startTextSession = trpc.miraCore.startTextTestSession.useMutation();
  const submitTextTurn = trpc.miraCore.submitTextTestTurn.useMutation();
  const endTextSession = trpc.miraCore.endTextTestSession.useMutation();

  const closeMedia = useCallback(() => {
    if (reconnectTimerRef.current)
      window.clearTimeout(reconnectTimerRef.current);
    dcRef.current?.close();
    pcRef.current?.close();
    streamRef.current?.getTracks().forEach(track => track.stop());
    dcRef.current = null;
    pcRef.current = null;
    streamRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
    }
  }, []);

  const endCall = useCallback(
    async (completed: boolean, reason: string) => {
      const activeSessionId = sessionIdRef.current;
      if (finalizedRef.current || !activeSessionId) return;
      finalizedRef.current = true;
      try {
        await finalize.mutateAsync({
          token,
          sessionId: activeSessionId,
          completed,
          reason,
        });
      } finally {
        closeMedia();
        setState("ended");
        onSessionEnd?.();
      }
    },
    [closeMedia, finalize, token, onSessionEnd]
  );

  const sendToolOutput = useCallback((callId: string, output: unknown) => {
    dcRef.current?.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(output),
        },
      })
    );
    dcRef.current?.send(JSON.stringify({ type: "response.create" }));
  }, []);

  const handleEvent = useCallback(
    async (raw: string) => {
      let event: any;
      try {
        event = JSON.parse(raw);
      } catch {
        return;
      }
      if (event.type === "input_audio_buffer.speech_started") {
        setState("listening");
        dcRef.current?.send(JSON.stringify({ type: "response.cancel" }));
        dcRef.current?.send(
          JSON.stringify({ type: "output_audio_buffer.clear" })
        );
      } else if (
        event.type === "output_audio_buffer.started" ||
        event.type === "response.output_audio.delta"
      )
        setState("speaking");
      else if (
        event.type === "output_audio_buffer.stopped" ||
        event.type === "response.done"
      )
        setState(current => (current === "paused" ? current : "listening"));
      else if (event.type === "error") {
        setError("The call was interrupted. MIRA is reconnecting.");
        setState("reconnecting");
      }
      const activeSessionId = sessionIdRef.current;
      if (
        activeSessionId &&
        event.type ===
          "conversation.item.input_audio_transcription.completed" &&
        event.transcript?.trim()
      ) {
        const transcript = event.transcript.trim();
        void saveQaEvent.mutateAsync({
          token,
          sessionId: activeSessionId,
          direction: "client",
          modality: "voice_transcript",
          content: transcript,
        });
        void classifyInput.mutateAsync({
          token,
          sessionId: activeSessionId,
          content: transcript,
          confidence: typeof event.confidence === "number" ? event.confidence : null,
        }).then(result => {
          if (result.meaningful && dcRef.current?.readyState === "open") {
            dcRef.current.send(JSON.stringify({ type: "response.create" }));
          }
        });
      }
      if (
        activeSessionId &&
        event.type === "response.output_audio_transcript.done" &&
        event.transcript?.trim()
      )
        void saveQaEvent.mutateAsync({
          token,
          sessionId: activeSessionId,
          direction: "assistant",
          modality: "voice_transcript",
          content: event.transcript.trim(),
        });
      if (
        event.type !== "response.function_call_arguments.done" ||
        !activeSessionId ||
        handledCallsRef.current.has(event.call_id)
      )
        return;
      handledCallsRef.current.add(event.call_id);
      try {
        const args = JSON.parse(event.arguments || "{}");
        if (event.name === "update_shoot_memory") {
          const result = await saveMemory.mutateAsync({
            token,
            sessionId: activeSessionId,
            input: args,
          });
          sendToolOutput(event.call_id, { saved: true, ...result });
        } else if (event.name === "create_discovery_summary") {
          sendToolOutput(
            event.call_id,
            await createSummary.mutateAsync({
              token,
              sessionId: activeSessionId,
              input: { summaryText: args.summaryText },
            })
          );
        } else if (event.name === "confirm_discovery_summary") {
          sendToolOutput(
            event.call_id,
            await confirmSummary.mutateAsync({
              token,
              sessionId: activeSessionId,
              input: { summaryId: args.summaryId, confirmed: true },
            })
          );
        } else if (event.name === "finalize_preparation") {
          const result = await finalize.mutateAsync({
            token,
            sessionId: activeSessionId,
            completed: true,
            reason: "preparation_complete",
            clientStatement: typeof args.clientStatement === "string" ? args.clientStatement : "",
          });
          sendToolOutput(event.call_id, result);
          if (result.completed) { finalizedRef.current = true; closeMedia(); setState("ended"); }
        } else if (event.name === "check_preparation_status") {
          sendToolOutput(event.call_id, await checkStatus.mutateAsync({ token }));
        }
      } catch {
        sendToolOutput(event.call_id, {
          saved: false,
          error:
            "The update could not be validated. Confirm the detail and try again.",
        });
      }
    },
    [checkStatus, classifyInput, closeMedia, confirmSummary, createSummary, finalize, saveMemory, saveQaEvent, sendToolOutput, token]
  );

  const connect = useCallback(
    async (reconnecting = false) => {
      if (connectingRef.current || finalizedRef.current) return;
      connectingRef.current = true;
      setConversationMode("voice");
      setError(null);
      setState(reconnecting ? "reconnecting" : "connecting");
      try {
        const stream =
          streamRef.current ??
          (await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          }));
        streamRef.current = stream;
        pcRef.current?.close();
        const pc = new RTCPeerConnection();
        pcRef.current = pc;
        const audio = audioRef.current ?? new Audio();
        audio.autoplay = true;
        audioRef.current = audio;
        pc.ontrack = e => {
          audio.srcObject = e.streams[0];
          void audio.play();
        };
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
        const dc = pc.createDataChannel("oai-events");
        let openingInstructions = "Continue naturally from the known room state and conversation memory without repeating answered questions.";
        dcRef.current = dc;
        dc.onmessage = e => void handleEvent(e.data);
        dc.onopen = () => {
          setState("listening");
          onSessionStart?.();
          dc.send(
            JSON.stringify({
              type: "response.create",
              response: {
                instructions:
                  openingInstructions,
              },
            })
          );
        };
        pc.onconnectionstatechange = () => {
          if (
            (pc.connectionState === "disconnected" ||
              pc.connectionState === "failed") &&
            !finalizedRef.current
          ) {
            setState("reconnecting");
            reconnectTimerRef.current = window.setTimeout(
              () => void connect(true),
              1500
            );
          }
        };
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const result = await createCall.mutateAsync({
          token,
          sdp: offer.sdp!,
          consentAcknowledged: true,
        });
        openingInstructions = result.roomState === "preparation_active" || result.roomState === "discovery_confirmed"
          ? "Welcome the client back briefly, invite their preparation question, and do not restart Discovery."
          : result.roomState === "discovery_offered"
            ? "Use the known client, photographer, and shoot context for a brief natural welcome, then offer deeper Discovery now or later without asking a form-like question."
            : "Continue Discovery from the supplied memory with one meaningful question and no repetition.";
        sessionIdRef.current = result.sessionId;
        setSessionId(result.sessionId);
        setRemaining(result.remainingSeconds);
        await pc.setRemoteDescription({
          type: "answer",
          sdp: result.answerSdp,
        });
      } catch (cause) {
        closeMedia();
        const errorMessage =
          cause instanceof DOMException && cause.name === "NotAllowedError"
            ? "Microphone access was declined. Allow access and try again."
            : "MIRA voice is unavailable right now. Please try again.";
        setError(errorMessage);
        setState("error");
        onSessionError?.(errorMessage);
      } finally {
        connectingRef.current = false;
      }
    },
    [closeMedia, createCall, handleEvent, token, consent, onSessionStart, onSessionError]
  );

  const startTextFallback = useCallback(async () => {
    if (startTextSession.isPending) return;
    closeMedia();
    setConversationMode("text");
    setTextOpen(true);
    setError(null);
    setState("connecting");
    try {
      const result = await startTextSession.mutateAsync({ token, consentAcknowledged: true });
      sessionIdRef.current = result.sessionId;
      setSessionId(result.sessionId);
      setRemaining(result.allowedSeconds);
      setMessages([{ role: "assistant", content: result.prompt }]);
      setState("listening");
      onSessionStart?.();
    } catch {
      const message = "Text preparation is unavailable right now. Please return to the Shoot Room and contact your photographer.";
      setError(message);
      setState("error");
      onSessionError?.(message);
    }
  }, [closeMedia, onSessionError, onSessionStart, startTextSession, token]);

  useEffect(() => {
    if (!sessionId || state === "ended") return;
    const timer = window.setInterval(
      () =>
        setRemaining(value => {
          if (value <= 1) {
            void endCall(false, "allowance_exhausted");
            return 0;
          }
          return value - 1;
        }),
      1000
    );
    return () => window.clearInterval(timer);
  }, [endCall, sessionId, state]);
  useEffect(() => closeMedia, [closeMedia]);

  // Start the mode selected in the Shoot Room (consent already obtained there).
  useEffect(() => {
    if (initialMode === "text") void startTextFallback();
    else void connect();
  }, []);

  const status = conversationMode === "text"
    ? state === "ended" ? "PREPARATION COMPLETE" : state === "connecting" ? "OPENING TEXT PREPARATION" : "TEXT PREPARATION"
    : state === "speaking"
      ? "SPEAKING"
      : state === "listening"
        ? "LISTENING"
        : state === "paused"
          ? "PAUSED"
          : state === "reconnecting"
            ? "RECONNECTING"
            : state === "error"
              ? "CONNECTION ERROR"
              : state === "ended"
                ? "CALL ENDED"
                : "CONNECTING";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171613]">
      <section className="flex w-full max-w-2xl flex-col items-center text-center px-4 py-8">
        <p className="mira-dark-kicker">MIRA · {status}</p>
        {conversationMode === "voice" ? <>
          <div
            className={`mira-call-orb mt-10 ${state === "listening" ? "is-listening" : ""}`}
            aria-hidden="true"
          >
            <span />
            <span />
            <span />
            <span />
          </div>
          <p className="mt-8 font-mono text-sm tabular-nums text-[#b7a98f]">
            {String(Math.floor(remaining / 60)).padStart(2, "0")}:
            {String(remaining % 60).padStart(2, "0")} remaining
          </p>
        </> : <p className="mt-4 max-w-lg text-sm leading-6 text-[#b7a98f]">Share your answers in writing. They stay connected to this private Shoot Room for your photographer.</p>}
        {error && (
          <p role="alert" className="mt-6 text-sm text-red-200">
            {error}
          </p>
        )}
        {state === "error" && conversationMode === "voice" && (
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button type="button" onClick={() => void startTextFallback()} className="rounded-full bg-[#d2b98b] text-[#171613]">
              <Type className="mr-2 size-4" /> Continue with text
            </Button>
            <Button type="button" variant="outline" onClick={() => void connect()} className="rounded-full border-white/20 text-[#f1eadc]">
              Try voice again
            </Button>
          </div>
        )}
        {conversationMode === "text" && messages.length > 0 && (
          <div aria-live="polite" className="mt-7 max-h-[42vh] w-full space-y-3 overflow-y-auto pr-1 text-left">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={message.role === "assistant" ? "mr-10 rounded-2xl border border-white/10 bg-white/5 p-4 text-[#eee5d5]" : "ml-10 rounded-2xl bg-[#d2b98b] p-4 text-[#171613]"}>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">{message.role === "assistant" ? "MIRA" : "You"}</p>
                <p className="mt-2 text-sm leading-6">{message.content}</p>
              </div>
            ))}
          </div>
        )}
        {textOpen && state !== "ended" && (
          <form
            className="mt-8 w-full"
            onSubmit={async e => {
              e.preventDefault();
              const message = text.trim();
              const activeSessionId = sessionIdRef.current;
              if (!message || !activeSessionId) return;
              if (conversationMode === "text") {
                setMessages(current => [...current, { role: "client", content: message }]);
                setText("");
                try {
                  const result = await submitTextTurn.mutateAsync({ token, sessionId: activeSessionId, answer: message });
                  setMessages(current => [...current, { role: "assistant", content: result.response }]);
                  if (result.complete) setState("ended");
                } catch {
                  setError("Your answer could not be saved. Please try once more.");
                }
                return;
              }
              if (dcRef.current?.readyState !== "open") return;
              dcRef.current.send(
                JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "message",
                    role: "user",
                    content: [{ type: "input_text", text: message }],
                  },
                })
              );
              dcRef.current.send(JSON.stringify({ type: "response.create" }));
              void saveQaEvent.mutateAsync({ token, sessionId: activeSessionId, direction: "client", modality: "text_fallback", content: message });
              setText("");
            }}
          >
            <Textarea
              aria-label="Text fallback"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Type to MIRA…"
              className="min-h-24 border-white/15 bg-white/5 text-[#f1eadc]"
            />
            <Button
              disabled={!text.trim() || submitTextTurn.isPending}
              className="mt-3 rounded-full bg-[#d2b98b] text-[#171613]"
            >
              <Send className="mr-2 size-4" /> Send
            </Button>
          </form>
        )}
        <div className="mt-10 flex gap-3">
          {conversationMode === "voice" && <><CallControl
            label={muted ? "Unmute" : "Mute"}
            onClick={() => {
              const next = !muted;
              setMuted(next);
              streamRef.current
                ?.getAudioTracks()
                .forEach(track => (track.enabled = !next));
            }}
          >
            {muted ? <MicOff /> : <Mic />}
          </CallControl>
          <CallControl
            label={state === "paused" ? "Resume" : "Pause"}
            onClick={() => {
              if (!sessionId) return;
              const paused = state !== "paused";
              streamRef.current
                ?.getAudioTracks()
                .forEach(track => (track.enabled = !paused && !muted));
              if (paused) {
                audioRef.current?.pause();
                setState("paused");
              } else {
                void audioRef.current?.play();
                setState("listening");
              }
              void pauseCall.mutateAsync({ token, sessionId, paused });
            }}
          >
            {state === "paused" ? <Play /> : <Pause />}
          </CallControl></>}
          <CallControl
            label={conversationMode === "text" ? "Text conversation" : "Text"}
            onClick={() => {
              if (conversationMode === "text" || dcRef.current?.readyState === "open") setTextOpen(value => !value);
              else void startTextFallback();
            }}
          >
            <Type />
          </CallControl>
          <CallControl
            label={state === "ended" ? "Return to room" : "End"}
            onClick={() => {
              const activeSessionId = sessionIdRef.current;
              if (conversationMode === "text") {
                const close = async () => {
                  if (state !== "ended" && activeSessionId) await endTextSession.mutateAsync({ token, sessionId: activeSessionId });
                  closeMedia();
                  onSessionEnd?.();
                };
                void close();
              } else void endCall(false, "client_ended");
            }}
            danger
          >
            <PhoneOff />
          </CallControl>
        </div>
      </section>
    </div>
  );
}

function CallControl({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex size-12 items-center justify-center rounded-full border ${danger ? "border-red-300/30 text-red-200" : "border-white/15 text-[#d2b98b]"}`}
    >
      {children}
    </button>
  );
}
