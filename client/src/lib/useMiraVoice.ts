import { useEffect, useRef, useState } from "react";
import { fileBase64 } from "./miraSessionApi";
import type { SessionScope } from "./useMiraSession";

type VoiceState = "off" | "connecting" | "listening" | "transcribing" | "thinking" | "speaking" | "error";
export function useMiraVoice(options: { scope?: SessionScope; active: boolean; enabled: boolean; send: (text: string) => Promise<{ requestId: string }>; onFailure: (message: string) => void }) {
  const [state, setState] = useState<VoiceState>("off"), [level, setLevel] = useState(0);
  const stream = useRef<MediaStream | undefined>(undefined), context = useRef<AudioContext | undefined>(undefined), recorder = useRef<MediaRecorder | undefined>(undefined), playback = useRef<HTMLAudioElement | undefined>(undefined), abort = useRef<AbortController | undefined>(undefined);
  const enabled = useRef(false), inFlight = useRef(false), optionsRef = useRef(options); optionsRef.current = options;
  const frame = useRef(0), generation = useRef(0), speaking = useRef(false), utterance = useRef({ voiceAt: 0, started: 0, heard: false });
  const request = async (path: string, body: unknown) => {
    const response = await fetch(`/api/mira-session/${path}`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: abort.current?.signal });
    if (!response.ok) { let message = "Voice could not complete this turn."; try { message = (await response.json()).error || message; } catch {} throw new Error(message); } return response;
  };
  function stop() {
    generation.current++; enabled.current = false; cancelAnimationFrame(frame.current); abort.current?.abort(); playback.current?.pause();
    if (recorder.current?.state === "recording") { recorder.current.onstop = null; recorder.current.stop(); }
    stream.current?.getTracks().forEach(track => track.stop()); void context.current?.close(); context.current = undefined;
    stream.current = undefined; inFlight.current = false; speaking.current = false; setLevel(0); setState("off");
  }
  async function say(sourceRequestId: string | null) {
    const scope = optionsRef.current.scope; if (!scope || !enabled.current) return;
    const epoch = generation.current; speaking.current = true; setState("thinking");
    const response = await request("speak", { ...scope, requestId: crypto.randomUUID(), sourceRequestId }), blob = await response.blob();
    if (!enabled.current || generation.current !== epoch) return;
    const url = URL.createObjectURL(blob), audio = new Audio(url); playback.current = audio;
    try {
      const source = context.current!.createMediaElementSource(audio), analyser = context.current!.createAnalyser(); analyser.fftSize = 256;
      source.connect(analyser); analyser.connect(context.current!.destination);
      const bytes = new Uint8Array(analyser.frequencyBinCount);
      const observe = () => { if (!enabled.current || audio.paused) return; analyser.getByteFrequencyData(bytes); setLevel(bytes.reduce((sum, value) => sum + value, 0) / bytes.length / 255); frame.current = requestAnimationFrame(observe); };
      await new Promise<void>((resolve, reject) => { audio.onended = audio.onpause = () => resolve(); audio.onerror = () => reject(new Error("The voice response could not play.")); void audio.play().then(() => { if (generation.current === epoch) { setState("speaking"); observe(); } }).catch(reject); });
    } finally { URL.revokeObjectURL(url); if (generation.current === epoch) { playback.current = undefined; speaking.current = false; if (enabled.current) { setLevel(0); setState("listening"); utterance.current = { voiceAt: 0, started: 0, heard: false }; } } }
  }
  async function start() {
    if (!optionsRef.current.enabled || !optionsRef.current.scope) throw new Error("Voice is not enabled yet. You can still use the text conversation.");
    stop(); const epoch = generation.current; setState("connecting"); abort.current = new AbortController();
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (generation.current !== epoch) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media; enabled.current = true; const audioContext = new AudioContext(); context.current = audioContext; await audioContext.resume();
      const analyser = audioContext.createAnalyser(); analyser.fftSize = 256; audioContext.createMediaStreamSource(media).connect(analyser);
      const bytes = new Uint8Array(analyser.fftSize);
      const mime = ["audio/webm;codecs=opus", "audio/mp4"].find(value => MediaRecorder.isTypeSupported(value));
      if (!mime) throw new Error("This browser cannot record the supported voice format. Please use the text conversation.");
      const listen = () => {
        if (!enabled.current) return;
        if (speaking.current || inFlight.current) { frame.current = requestAnimationFrame(listen); return; }
        analyser.getByteTimeDomainData(bytes); const rms = Math.sqrt(bytes.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / bytes.length);
        setLevel(Math.min(1, rms * 6)); const now = performance.now();
        if (rms > .025) { utterance.current.voiceAt = now; utterance.current.heard = true; }
        if (!recorder.current || recorder.current.state === "inactive") {
          const recording = new MediaRecorder(media, { mimeType: mime, audioBitsPerSecond: 32_000 }), chunks: Blob[] = []; recorder.current = recording;
          utterance.current = { voiceAt: 0, started: now, heard: false };
          recording.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
          recording.onstop = () => {
            if (!enabled.current || !utterance.current.heard) return;
            inFlight.current = true; setState("transcribing"); const blob = new Blob(chunks, { type: mime });
            void (async () => {
              try {
                const response = await request("transcribe", { ...optionsRef.current.scope, requestId: crypto.randomUUID(), mime: mime.split(";")[0], base64: await fileBase64(blob) });
                const transcript = await response.json(); if (!enabled.current || generation.current !== epoch) return;
                setState("thinking"); const result = await optionsRef.current.send(transcript.text); if (enabled.current && generation.current === epoch) await say(result.requestId);
              } catch (error) { if (enabled.current) { const message = error instanceof Error ? error.message : "Voice disconnected."; stop(); setState("error"); optionsRef.current.onFailure(message); } }
              finally { if (generation.current === epoch) inFlight.current = false; }
            })();
          };
          recording.start(); setState("listening");
        }
        if (recorder.current?.state === "recording" && (now - utterance.current.started >= 20_000 || (utterance.current.heard && now - utterance.current.voiceAt > 1000))) recorder.current.stop();
        frame.current = requestAnimationFrame(listen);
      };
      frame.current = requestAnimationFrame(listen);
      media.getTracks().forEach(track => { track.onended = () => { if (enabled.current) { stop(); optionsRef.current.onFailure("The microphone disconnected. Resume when you’re ready."); } }; });
    } catch (error) { stop(); setState("error"); throw error; }
  }
  useEffect(() => { if (!options.active) stop(); }, [options.active]);
  useEffect(() => () => stop(), []);
  return { state, level, start, stop, say, connected: !["off", "error"].includes(state) };
}
