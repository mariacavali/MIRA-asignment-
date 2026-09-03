import { describe, expect, it } from "vitest";
import { normalizeInstagramUsername, normalizeWebsiteUrl, photographerProfileInputSchema } from "../../shared/miraCore";

describe("MIRA photographer profile input", () => {
  it.each([
    ["mariacavali.com", "https://mariacavali.com"],
    ["www.mariacavali.com", "https://www.mariacavali.com"],
    ["https://mariacavali.com", "https://mariacavali.com"],
  ])("normalizes website %s", (input, expected) => {
    expect(normalizeWebsiteUrl(input)).toBe(expected);
  });

  it.each(["mariacavali", "@mariacavali", "instagram.com/mariacavali", "https://instagram.com/mariacavali"])("normalizes Instagram %s", input => {
    expect(normalizeInstagramUsername(input)).toBe("mariacavali");
  });

  it("normalizes at the server input boundary", () => {
    const result = photographerProfileInputSchema.parse({
      displayName: "Maria", businessName: null, bio: null, photographyStyle: null,
      areasOfExpertise: [], websiteUrl: "www.mariacavali.com", instagramUrl: "@mariacavali", timezone: "Europe/Amsterdam",
    });
    expect(result.websiteUrl).toBe("https://www.mariacavali.com");
    expect(result.instagramUrl).toBe("mariacavali");
  });
});