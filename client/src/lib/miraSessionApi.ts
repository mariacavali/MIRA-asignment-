import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../server/routers";
export const sessionRpc = createTRPCProxyClient<AppRouter>({ links: [httpBatchLink({ url: "/api/trpc", transformer: superjson,
  fetch: (input, init) => fetch(input, { ...init, credentials: "include" }) })] });
export async function sessionRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/mira-session/${path}`, { credentials: "include", cache: "no-store", ...(body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
  if (!response.ok) { let message = "MIRA could not complete that action. Your saved session is still here."; try { message = (await response.json()).error || message; } catch {} throw Object.assign(new Error(message), { data: { code: ({ 401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND" } as Record<number, string>)[response.status] } }); }
  return response.json();
}
export const fileBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error("This file could not be read.")); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.readAsDataURL(blob); });
