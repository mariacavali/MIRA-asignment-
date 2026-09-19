import { z } from "zod";

export const BRAND_FEEL_OPTIONS = ["Warm & approachable", "Confident & clear", "Calm & considered", "Playful & energetic", "Expressive & artistic"] as const;
export const POSING_SUPPORT_OPTIONS = ["Guide me one step at a time", "I prefer seated or still poses", "I enjoy gentle movement", "Let my photographer guide me"] as const;

export function normalizeBrandUrl(value: string): string {
  const raw = value.trim();
  const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !url.hostname.includes(".")) {
    throw new Error("Use a public HTTPS website link without login details.");
  }
  url.hash = "";
  return url.toString();
}

export const brandUrlSchema = z.string().trim().min(1).max(1024).transform((value, ctx) => {
  try { return normalizeBrandUrl(value); }
  catch { ctx.addIssue({ code: "custom", message: "Use a public HTTPS website link, such as https://yourbrand.com." }); return z.NEVER; }
});
export const clientBriefInputSchema = z.object({
  brandFeel: z.array(z.enum(BRAND_FEEL_OPTIONS)).max(3),
  posingSupport: z.enum(POSING_SUPPORT_OPTIONS).nullable(),
  comfortNote: z.string().trim().max(300),
  brandUrls: z.array(brandUrlSchema).max(3),
}).strict();
export type ClientBriefInput = z.infer<typeof clientBriefInputSchema>;

export const brandPageSchema = z.object({
  url: brandUrlSchema,
  status: z.enum(["read", "unavailable"]),
  title: z.string().max(160),
  excerpt: z.string().max(3500),
  checkedAt: z.string().datetime(),
}).strict();
export type BrandPage = z.infer<typeof brandPageSchema>;
export const clientBriefSchema = clientBriefInputSchema.omit({ brandUrls: true }).extend({
  brandPages: z.array(brandPageSchema).max(3),
  savedAt: z.string().datetime(),
});
export type ClientBrief = z.infer<typeof clientBriefSchema>;

export const shootGuideSchema = z.object({
  title: z.string().max(100),
  purpose: z.string().max(600),
  steps: z.array(z.string().max(300)).min(1).max(4),
  hands: z.string().max(300),
  gaze: z.string().max(300),
  easierOption: z.string().max(300),
  photographerTip: z.string().max(500),
}).strict();
export type ShootGuide = z.infer<typeof shootGuideSchema>;
