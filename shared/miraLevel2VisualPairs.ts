import { z } from "zod";

export const VISUAL_PAIR_MANIFEST_VERSION = "mira_visual_pairs_v1" as const;
export const VISUAL_REASON_TAGS = [
  "light", "colour", "mood", "movement", "styling", "framing", "intimacy",
  "location", "texture", "attitude", "simplicity", "unexpectedness",
] as const;
export const VISUAL_CHOICES = ["A", "B", "both", "neither", "not_sure"] as const;

export const visualPairSchema = z.object({
  pairId: z.string().min(1),
  pairVersion: z.string().min(1),
  primaryDimension: z.enum(["proximity", "light", "environment", "movement", "density", "finish"]),
  secondaryVariables: z.array(z.string()),
  assetAId: z.string().min(1),
  assetBId: z.string().min(1),
  assetVersion: z.string().min(1),
  assetAPath: z.string().startsWith("/mira/level2/visual-pairs/"),
  assetBPath: z.string().startsWith("/mira/level2/visual-pairs/"),
  valueA: z.string().min(1),
  valueB: z.string().min(1),
  rightsStatus: z.literal("mira_owned_generated"),
  contextTags: z.array(z.string()),
});

export type MiraVisualPair = z.infer<typeof visualPairSchema>;

export const MIRA_LEVEL2_VISUAL_PAIRS: MiraVisualPair[] = [
  ["proximity", "intimate", "environmental"],
  ["light", "soft", "graphic"],
  ["environment", "architectural", "organic"],
  ["movement", "still", "dynamic"],
  ["density", "minimal", "layered"],
  ["finish", "raw", "polished"],
].map(([dimension, valueA, valueB]) => visualPairSchema.parse({
  pairId: `mira_${dimension}_01`,
  pairVersion: VISUAL_PAIR_MANIFEST_VERSION,
  primaryDimension: dimension,
  secondaryVariables: ["subject", "wardrobe_family", "warm_neutral_palette"],
  assetAId: `${dimension}_${valueA}_v1`,
  assetBId: `${dimension}_${valueB}_v1`,
  assetVersion: "1.0.0",
  assetAPath: `/mira/level2/visual-pairs/v1/${dimension}-${valueA}.png`,
  assetBPath: `/mira/level2/visual-pairs/v1/${dimension}-${valueB}.png`,
  valueA,
  valueB,
  rightsStatus: "mira_owned_generated",
  contextTags: ["editorial_portrait", "personal_brand", dimension],
}));

export function deterministicShownOrder(journeyId: number, pairId: string): ["A", "B"] | ["B", "A"] {
  const checksum = `${journeyId}:${pairId}`.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return checksum % 2 === 0 ? ["A", "B"] : ["B", "A"];
}
