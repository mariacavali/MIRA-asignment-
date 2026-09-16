import { describe, expect, it } from "vitest";
import { hashLocalPassword, verifyLocalPassword } from "./localFileStore";

// hashLocalPassword/verifyLocalPassword back both the local-file-store
// photographer signup and the new database-mode signup (createDbPhotographerAccount/
// verifyDbPhotographerPassword in server/db.ts) - the same salted-scrypt
// primitive is reused rather than reinvented for the database-mode path.
describe("MIRA photographer password hashing (shared by local-file-store and database-mode signup)", () => {
  it("never stores the password in plain text", () => {
    const stored = hashLocalPassword("correct horse battery staple");
    expect(stored).not.toContain("correct horse battery staple");
  });

  it("salts each hash independently, so the same password never produces the same stored value twice", () => {
    const first = hashLocalPassword("same-password-123");
    const second = hashLocalPassword("same-password-123");
    expect(first).not.toBe(second);
  });

  it("verifies the correct password and rejects an incorrect one", () => {
    const stored = hashLocalPassword("correct horse battery staple");
    expect(verifyLocalPassword("correct horse battery staple", stored)).toBe(true);
    expect(verifyLocalPassword("wrong password", stored)).toBe(false);
  });

  it("rejects rather than throws on a malformed stored value", () => {
    expect(verifyLocalPassword("anything", "not-a-valid-stored-hash")).toBe(false);
    expect(verifyLocalPassword("anything", "")).toBe(false);
  });
});
