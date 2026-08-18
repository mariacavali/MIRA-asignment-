import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("private staging entry route", () => {
  it("mounts the real Mira V3 experience at both root and its explicit alias", () => {
    const appSource = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");

    expect(appSource).toContain('<Route path={"/"} component={MiraV3} />');
    expect(appSource).toContain('<Route path={"/mira-v3"} component={MiraV3} />');
    expect(appSource).not.toContain('component={Home}');
    expect(appSource).not.toContain('import Home from "./pages/Home"');
  });

  it("keeps the Mira masthead inside the connected private staging entry", () => {
    const pageSource = readFileSync(resolve(process.cwd(), "client/src/pages/MiraV3.tsx"), "utf8");

    expect(pageSource).toContain('window.location.assign("/")');
    expect(pageSource).not.toContain("Example Page");
    expect(pageSource).not.toContain("Example Button");
  });

  it("refreshes the active journey after every saved conversational response", () => {
    const journeySource = readFileSync(resolve(process.cwd(), "client/src/pages/MiraV3Journey.tsx"), "utf8");

    expect(journeySource).toContain("await state.refetch()");
    expect(journeySource).toContain("Mira is taking a moment with what you said.");
    expect(journeySource).toContain('role="status"');
    expect(journeySource).not.toContain("Preparing next question");
    expect(journeySource).not.toContain("<Loader2 className=\"mr-2 size-4 animate-spin\" /> Listening");
  });
});
