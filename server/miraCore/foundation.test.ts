import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hashClientInvitationToken } from "./db";

const appSource = readFileSync(new URL("../../client/src/App.tsx", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../../drizzle/schema.ts", import.meta.url), "utf8");
const coreDbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const clientSource = readFileSync(new URL("../../client/src/pages/MiraClientCall.tsx", import.meta.url), "utf8");
const roomSource = readFileSync(new URL("../../client/src/pages/MiraShootRoom.tsx", import.meta.url), "utf8");
const visualUploadSource = readFileSync(new URL("../../client/src/components/mira/VisualReferenceUpload.tsx", import.meta.url), "utf8");

describe("shared MIRA core foundation", () => {
  it("mounts one photographer entry and one shared client preparation route without replacing V3 or V4", () => {
    expect(appSource).toContain('path={"/mira"}');
    expect(appSource).toContain('path={"/prepare/:token"}');
    expect(appSource).toContain('path={"/mira-v3"}');
    expect(appSource).toContain('path={"/mira-v4"}');
  });

  it("uses one canonical shoot table with source mode as creation metadata", () => {
    expect(schemaSource.match(/"mira_shoots"/g)).toHaveLength(1);
    expect(schemaSource).toContain('["maria_photography", "mira_saas"]');
    expect(coreDbSource).toContain("createCanonicalShoot");
    expect(coreDbSource).not.toContain("createMariaPhotographyWorkflow");
    expect(coreDbSource).not.toContain("createSaasWorkflow");
  });

  it("hashes invitation tokens and never stores the clear value", () => {
    const token = "private-client-token-with-enough-entropy";
    const hash = hashClientInvitationToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(token);
    expect(hashClientInvitationToken(token)).toBe(hash);
    expect(schemaSource).toContain('tokenHash: varchar("tokenHash"');
    expect(schemaSource).not.toContain('token: varchar("token"');
  });

  it("keeps the client interface minimal and does not render a transcript", () => {
    expect(clientSource).toContain("Call MIRA");
    expect(clientSource).toContain("Text fallback");
    expect(clientSource).toContain("remaining");
    expect(clientSource).toContain('MIRA · {status}');
    expect(clientSource).not.toMatch(/MARIA CAVALI/i);
    expect(clientSource).not.toContain("Start preparation test");
    expect(clientSource).not.toContain("TEXT-ONLY DETERMINISTIC FOUNDATION");
    expect(clientSource).not.toContain("messages.map");
    expect(clientSource).not.toContain("qaEvents.data");
  });

  it("keeps visual reference upload as its own module, presented before Call MIRA", () => {
    // Upload/evidence logic must not live inside the Discovery conversation
    // module - it's a standalone component the Shoot Room mounts.
    expect(clientSource).not.toContain("VisualReferenceForm");
    expect(clientSource).not.toContain("uploadClientVisualReference");
    const uploadIndex = roomSource.indexOf("<VisualReferenceUpload");
    const callIndex = roomSource.indexOf("<MiraClientCall");
    expect(uploadIndex).toBeGreaterThan(-1);
    expect(callIndex).toBeGreaterThan(-1);
    expect(uploadIndex).toBeLessThan(callIndex);
    expect(visualUploadSource).toContain("referencePurpose");
    expect(visualUploadSource).toContain("What should MIRA notice about this reference?");
  });

  it("scopes the deterministic preparation-status read to the requesting shoot only", () => {
    const statusFn = coreDbSource.slice(coreDbSource.indexOf("export async function getShootPreparationStatusForRealtime"));
    const body = statusFn.slice(0, statusFn.indexOf("\n}\n") + 3);
    expect(body).toContain("eq(miraShoots.id, shootId)");
    expect(body).toContain("eq(miraShootCreativeDna.shootId, shootId)");
    expect(body).toContain("eq(miraShootMoodboard.shootId, shootId)");
  });
});
