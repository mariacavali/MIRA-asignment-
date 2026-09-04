import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Express } from "express";

const mocks = vi.hoisted(() => ({
  env: {
    isProduction: false,
    forgeApiUrl: "",
    forgeApiKey: "",
    allowLocalStorageInProduction: false,
  },
}));

vi.mock("./env", () => ({ ENV: mocks.env }));

import { registerStorageProxy } from "./storageProxy";
import { LOCAL_STORAGE_ROOT } from "../storage";

const fixtureDir = join(LOCAL_STORAGE_ROOT, "test-storage-proxy-fixtures");
const existingKey = "test-storage-proxy-fixtures/existing.svg";

type FakeResponse = {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  redirected?: { code: number; url: string };
  sentFile?: string;
  status(code: number): FakeResponse;
  send(body: unknown): FakeResponse;
  set(name: string, value: string): FakeResponse;
  redirect(code: number, url: string): FakeResponse;
  sendFile(path: string): FakeResponse;
};

function fakeApp() {
  let handler: (req: unknown, res: FakeResponse) => unknown = async () => undefined;
  const app = { get: (_path: string, fn: typeof handler) => { handler = fn; } } as unknown as Express;
  async function invoke(req: unknown): Promise<FakeResponse> {
    const res: FakeResponse = {
      statusCode: 200,
      body: undefined,
      headers: {},
      status(code) { this.statusCode = code; return this; },
      send(body) { this.body = body; return this; },
      set(name, value) { this.headers[name] = value; return this; },
      redirect(code, url) { this.redirected = { code, url }; return this; },
      sendFile(path) { this.sentFile = path; return this; },
    };
    await handler(req, res);
    return res;
  }
  return { app, invoke };
}

beforeAll(async () => {
  await mkdir(fixtureDir, { recursive: true });
  await writeFile(join(fixtureDir, "existing.svg"), "<svg>fixture</svg>");
});

afterAll(async () => {
  await rm(fixtureDir, { recursive: true, force: true });
});

beforeEach(() => {
  mocks.env.isProduction = false;
  mocks.env.forgeApiUrl = "";
  mocks.env.forgeApiKey = "";
  mocks.env.allowLocalStorageInProduction = false;
  vi.unstubAllGlobals();
});

describe("registerStorageProxy MIRA_ALLOW_LOCAL_STORAGE_IN_PRODUCTION opt-in", () => {
  it("uses Forge (307 redirect) when configured, regardless of the flag", async () => {
    mocks.env.isProduction = true;
    mocks.env.forgeApiUrl = "https://forge.example";
    mocks.env.forgeApiKey = "forge-key";
    mocks.env.allowLocalStorageInProduction = true;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ url: "https://s3.example/signed" }), { status: 200 })),
    );

    const { app, invoke } = fakeApp();
    registerStorageProxy(app);
    const res = await invoke({ params: { 0: existingKey } });

    expect(res.redirected).toEqual({ code: 307, url: "https://s3.example/signed" });
  });

  it("production + Forge missing + flag disabled fails closed with 500", async () => {
    mocks.env.isProduction = true;

    const { app, invoke } = fakeApp();
    registerStorageProxy(app);
    const res = await invoke({ params: { 0: existingKey } });

    expect(res.statusCode).toBe(500);
    expect(String(res.body)).not.toMatch(/private|tmp|mira-local-storage/);
  });

  it("production + Forge missing + flag enabled serves an existing allowed asset", async () => {
    mocks.env.isProduction = true;
    mocks.env.allowLocalStorageInProduction = true;

    const { app, invoke } = fakeApp();
    registerStorageProxy(app);
    const res = await invoke({ params: { 0: existingKey } });

    expect(res.statusCode).toBe(200);
    expect(res.sentFile).toBe(join(LOCAL_STORAGE_ROOT, existingKey));
    expect(res.headers["Cache-Control"]).toBe("no-store");
  });

  it("returns 404 for a missing file without leaking the filesystem path", async () => {
    mocks.env.isProduction = true;
    mocks.env.allowLocalStorageInProduction = true;

    const { app, invoke } = fakeApp();
    registerStorageProxy(app);
    const res = await invoke({ params: { 0: "test-storage-proxy-fixtures/does-not-exist.svg" } });

    expect(res.statusCode).toBe(404);
    expect(res.sentFile).toBeUndefined();
    expect(String(res.body)).not.toMatch(/private|tmp|mira-local-storage/);
  });

  it("rejects a traversal attempt without leaking the filesystem path", async () => {
    mocks.env.isProduction = true;
    mocks.env.allowLocalStorageInProduction = true;

    const { app, invoke } = fakeApp();
    registerStorageProxy(app);
    const res = await invoke({ params: { 0: "../../etc/passwd" } });

    expect(res.statusCode).toBe(400);
    expect(res.sentFile).toBeUndefined();
    expect(String(res.body)).not.toMatch(/private|tmp|mira-local-storage|etc\/passwd/);
  });

  it("rejects an absolute-path escape attempt", async () => {
    mocks.env.isProduction = true;
    mocks.env.allowLocalStorageInProduction = true;

    const { app, invoke } = fakeApp();
    registerStorageProxy(app);
    const res = await invoke({ params: { 0: "/etc/passwd" } });

    expect(res.statusCode).toBe(400);
    expect(res.sentFile).toBeUndefined();
  });

  it("keeps development behaviour unchanged: serves local storage without the flag", async () => {
    // isProduction stays false (the beforeEach default) - the pre-existing dev fallback path.
    const { app, invoke } = fakeApp();
    registerStorageProxy(app);
    const res = await invoke({ params: { 0: existingKey } });

    expect(res.statusCode).toBe(200);
    expect(res.sentFile).toBe(join(LOCAL_STORAGE_ROOT, existingKey));
  });
});
