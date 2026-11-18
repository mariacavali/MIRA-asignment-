import { describe, expect, it } from "vitest";
import { brandConfigurationSchema, directionPolicy } from "../../shared/miraBrandDirection";
describe("segment policies", () => {
  const base = { accessMethod: "paid_shoot", discoveryDepth: "light", brandStage: "established", shootId: 10, shootFormat: "remote" };
  it.each(["personal", "personal_brand", "small_business"] as const)("keeps %s distinct", segment => {
    const policy = directionPolicy(brandConfigurationSchema.parse({ ...base, segment }));
    expect(policy.voice).toBe(segment !== "personal");
    expect(policy.posing).toBe(segment !== "small_business");
    expect(policy.moodboard).toBe(segment !== "small_business");
    expect(policy.preserveExistingIdentity).toBe(segment === "small_business");
  });
  it("has no booking effects for standalone or unbooked social access", () => {
    for (const accessMethod of ["standalone_brand", "social_plan"]) {
      const config = brandConfigurationSchema.parse({ ...base, segment: "personal_brand", accessMethod, shootId: null, shootFormat: null });
      expect(directionPolicy(config)).toMatchObject({ posing: false, bookingEmails: false, voice: true });
    }
    expect(brandConfigurationSchema.safeParse({ ...base, segment: "personal", accessMethod: "standalone_brand" }).success).toBe(false);
    expect(brandConfigurationSchema.safeParse({ ...base, segment: "personal", shootId: null }).success).toBe(false);
  });
});
