import { describe, expect, it } from "vitest";
import { isLocalFileStoreEnabled } from "./localFileStore";

describe("photographer payment access boundary", () => {
  it("allows the local payment adapter only in explicit development/test mode", () => {
    expect(isLocalFileStoreEnabled("development", "true")).toBe(true);
    expect(isLocalFileStoreEnabled("test", "true")).toBe(true);
    expect(isLocalFileStoreEnabled("production", "true")).toBe(false);
    expect(isLocalFileStoreEnabled("development", "false")).toBe(false);
  });
});
