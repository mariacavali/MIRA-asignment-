import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routerSource = readFileSync(new URL("./miraCore/router.ts", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("./miraCore/emailOutboxWorker.ts", import.meta.url), "utf8");

describe("MIRA adaptive email scheduling wiring", () => {
  it("records the immediate invitation and queues the remaining sequence at send time", () => {
    const sendBlock = routerSource.slice(routerSource.indexOf("sendInvitation:"), routerSource.indexOf("openInvitation:"));
    expect(sendBlock).toContain("recordImmediateInvitationAsSent");
    expect(sendBlock).toContain("scheduleMiraEmailMilestones");
    expect(sendBlock).toContain("shoot.shoot.scheduledAt");
  });

  it("does not run a scheduler merely because the web server started", () => {
    expect(workerSource).toContain("it never claims");
    expect(workerSource).toContain("never sends anything on its own");
    expect(workerSource).not.toContain("setInterval(");
    expect(workerSource).not.toContain("node-cron");
  });
});
