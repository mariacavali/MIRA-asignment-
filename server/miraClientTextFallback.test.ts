import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const callSource = readFileSync(new URL("../client/src/pages/MiraClientCall.tsx", import.meta.url), "utf8");
const roomSource = readFileSync(new URL("../client/src/pages/MiraShootRoom.tsx", import.meta.url), "utf8");
const dbSource = readFileSync(new URL("./miraCore/db.ts", import.meta.url), "utf8");
const localStoreSource = readFileSync(new URL("./localFileStore.ts", import.meta.url), "utf8");

describe("private Shoot Room text fallback", () => {
  it("keeps real voice as the primary path and exposes a clear text action after failure", () => {
    expect(callSource).toContain("createRealtimeCall");
    expect(callSource).toContain("Continue with text");
    expect(callSource).toContain("Try voice again");
    expect(roomSource).toContain("MiraClientCall");
    expect(roomSource).toContain('initialMode={conversationMode}');
  });

  it("uses the existing text-session procedures independently from the WebRTC data channel", () => {
    expect(callSource).toContain("startTextTestSession");
    expect(callSource).toContain("submitTextTestTurn");
    expect(callSource).toContain("endTextTestSession");
    expect(callSource).toContain('conversationMode === "text"');
  });

  it("persists the deterministic text flow in local preview without changing production DB behavior", () => {
    expect(dbSource).toContain("startLocalTextTestSession");
    expect(dbSource).toContain("submitLocalTextTestTurn");
    expect(dbSource).toContain("endLocalTextTestSession");
    expect(localStoreSource).toContain("textTestSessions");
    expect(localStoreSource).toContain('invitation.deliveryStatus = "completed"');
    expect(dbSource).toContain("listLocalTextTestSessions");
    expect(dbSource).toContain('modality: "text_fallback"');
  });
});
