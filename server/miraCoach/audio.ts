import { TRPCError } from "@trpc/server";
import { z } from "zod";

// Official API contracts checked 26 Oct 2026: file transcription and audio/speech.
// No provider request occurs until these functions are explicitly invoked.
export function createSessionAudio(options: { apiKey: string; fetch?: typeof fetch; transcriptionModel?: string; speechModel?: string; voice?: string }) {
  const request = options.fetch ?? fetch;
  async function send(path: string, init: RequestInit, signal?: AbortSignal) {
    if (!options.apiKey) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Voice is not connected yet." });
    let response: Response;
    try { response = await request(`https://api.openai.com/v1/audio/${path}`, { ...init, redirect: "error", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000), headers: { authorization: `Bearer ${options.apiKey}`, ...init.headers } }); }
    catch { throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Voice could not connect. Your text conversation is still available." }); }
    if (!response.ok) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "The voice provider could not complete this request. No automatic retry was made." });
    return response;
  }
  return {
    async transcribe(bytes: Buffer, mime: string, signal?: AbortSignal) {
      if (!bytes.length || bytes.length > 2 * 1024 * 1024 || !["audio/webm", "audio/mp4", "audio/wav"].includes(mime)) throw new TRPCError({ code: "BAD_REQUEST", message: "Use a short WebM, MP4 or WAV recording up to 2 MB." });
      const form = new FormData();
      form.set("file", new Blob([new Uint8Array(bytes)], { type: mime }), `utterance.${mime.split("/")[1]}`);
      form.set("model", options.transcriptionModel ?? "gpt-transcribe");
      const response = await send("transcriptions", { method: "POST", body: form }, signal);
      return z.object({ text: z.string().trim().min(1).max(8000) }).parse(await response.json()).text;
    },
    async speak(text: string, signal?: AbortSignal) {
      if (!text.trim() || text.length > 4096) throw new TRPCError({ code: "BAD_REQUEST", message: "This reply is available as text; it is too long for one voice response." });
      const response = await send("speech", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: options.speechModel ?? "gpt-4o-mini-tts", voice: options.voice ?? "marin", input: text, response_format: "mp3" }) }, signal);
      const declared = Number(response.headers.get("content-length") ?? 0);
      if (declared > 8 * 1024 * 1024) throw new Error("Voice response exceeds limit");
      const reader = response.body?.getReader(), chunks: Uint8Array[] = []; let size = 0;
      if (!reader) throw new Error("Voice response unavailable");
      while (true) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new Error("Voice response exceeds limit"); } chunks.push(item.value); }
      return Buffer.concat(chunks);
    },
  };
}
