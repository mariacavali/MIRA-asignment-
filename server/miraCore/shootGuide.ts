import type { ClientBrief, ShootGuide } from "../../shared/miraClientBrief";
import { shootGuideSchema } from "../../shared/miraClientBrief";
import type { MiraV4CreativeDna } from "../../shared/miraV4CreativeDna";
import { miraV4CampaignPlanSchema, type MiraV4CampaignPlan } from "../../shared/miraV4CampaignPlan";
import { compileCampaignPlan, buildCompositeImagePrompt } from "../miraV4/campaignCompiler";

// Original, plain-language starting points. No third-party card images or
// copied pose catalogue. The same instructions drive image prompts and UI.
export function buildBrandShotGuides(dna: MiraV4CreativeDna, brief?: ClientBrief): ShootGuide[] {
  const seated = brief?.posingSupport === "I prefer seated or still poses";
  const restrictions = [brief?.comfortNote ?? "", ...dna.identity.creativeBoundaries, ...dna.creativeDirection.creativeRules.avoid, ...dna.implementationHints.practicalNotes].join(" ");
  const still = seated || /\b(no|avoid|cannot|can't|unable to)\s+(walking|walk|movement|standing|stand)\b/i.test(restrictions);
  const move = brief?.posingSupport === "I enjoy gentle movement" && !still;
  const avoidEyes = /\b(no|avoid)\s+(direct\s+)?(eye contact|looking (at|into) (the )?(lens|camera))\b/i.test(restrictions);
  const avoidHands = /\b(no|avoid|hide)\s+(visible\s+)?hands\b/i.test(restrictions);
  const brand = dna.creativeEssence.desiredImpact.slice(0, 350);
  const warm = brief?.brandFeel.includes("Warm & approachable");
  const base = still ? "Choose a comfortable, supported seated position." : "Choose a comfortable position, seated or standing.";
  const restHands = avoidHands ? "Let your hands rest comfortably outside the crop." : "Rest your hands where they feel natural; leave your fingers loose.";
  const portraitGaze = avoidEyes ? "Look toward a comfortable point beside the camera." : "Look toward the lens if that feels comfortable, or just beside it.";
  const easier = "Keep your usual comfortable position. Ask your photographer to change the camera angle instead.";
  const common = { hands: restHands, gaze: portraitGaze, easierOption: easier };
  return [
    {
      ...common, title: "A portrait that introduces you", purpose: `Introduce the person behind the brand. Confirmed aim: ${brand}`,
      steps: [base, "Release your shoulders and breathe out normally.", warm ? "Think of greeting someone you enjoy talking to; let your expression arrive naturally." : "Keep your expression natural. Pause while your photographer finds the frame."],
      photographerTip: `Begin with an easy portrait. Give one cue at a time; use the confirmed light: ${dna.visualWorld.light.quality.slice(0, 220)}.`,
    },
    {
      ...common, title: "A moment in conversation", purpose: `Show a human connection within this direction: ${brand}`,
      steps: [base, "Turn slightly toward the person speaking, only as far as feels easy.", "Answer a simple question about something you enjoy in your work."],
      gaze: "Look toward the person speaking, just beside the camera.",
      photographerTip: "Use a slightly different crop from the first portrait. Photograph the pauses between words; do not ask for a held smile.",
    },
    {
      ...common, title: "Show what you do", purpose: "Make the brand tangible through one real part of your work, using what you already have.",
      steps: [base, "Choose one familiar action from your work with your photographer.", "Do that action slowly once; pause wherever it feels natural."],
      hands: avoidHands ? restHands : "Let the real task give your hands a job. No prop is needed if it does not belong to your work.",
      gaze: "Follow the action rather than looking for the camera.",
      easierOption: "Describe the action from your comfortable position while your photographer makes a portrait.",
      photographerTip: "Confirm the action and any object first. Do not invent products, tools or professional activities. Use the actual outfit and available space.",
    },
    {
      ...common, title: move ? "A little movement in your space" : "You in your space", purpose: "Connect you with the shoot location and leave room for the brand's story.",
      steps: move ? ["Choose a clear, comfortable path with your photographer.", "Take one or two slow steps at your own pace.", "Pause naturally; your photographer will capture the transition."] : [base, "Keep your body at ease while your photographer includes more of the room.", "Make one small change of gaze if you want a variation."],
      gaze: "Look toward something that belongs in the scene; your photographer will suggest a point.",
      photographerTip: `Use a wider view of the actual location. Keep the same palette and wardrobe. ${move ? "Keep the route clear; offer the still version first if needed." : "No movement is required from the client."}`,
    },
    {
      ...common, title: "One meaningful detail", purpose: "Finish with a close detail from the outfit, setting or a real object that supports the brand.",
      steps: ["Choose one detail you and your photographer agree belongs to your story.", "Leave it where it naturally sits; no pose is required.", "Your photographer moves closer and adjusts the framing."],
      hands: avoidHands ? "Keep hands outside this frame." : "If hands are included, let them rest. Otherwise keep them outside the frame.",
      gaze: "Your face does not need to be in this image.",
      easierOption: "Photograph a detail of the setting on its own.",
      photographerTip: "Make this a close detail, visibly different from the portraits. Follow the confirmed colours, texture and light; do not add unrelated decorative props.",
    },
  ].map(guide => shootGuideSchema.parse(guide));
}

export function compileGuidedShootCampaign(dna: MiraV4CreativeDna, brief?: ClientBrief) {
  const plan = compileCampaignPlan(dna);
  const guides = buildBrandShotGuides(dna, brief);
  const keys = ["scene_1", "scene_2", "scene_3", "scene_4", "scene_5"] as const;
  keys.forEach((key, index) => {
    const guide = guides[index];
    // Retain the original compiler's palette, light, wardrobe and location.
    // Replace abstract scene roles with achievable shoot-day actions.
    plan[key] = {
      ...plan.scene_2,
      name: guide.title, narrativeRole: guide.purpose,
      subject: index === 4 ? "An agreed detail from the actual outfit or location" : dna.identity.brandRole,
      movement: [...guide.steps, guide.hands, guide.gaze].join(" ").slice(0, 900),
      composition: index === 4 ? "A close detail within the same visual world" : index === 3 ? "A wider environmental portrait in the same visual world" : plan.scene_2.composition,
    };
  });
  const campaignPlan: MiraV4CampaignPlan = miraV4CampaignPlanSchema.parse(plan);
  return { campaignPlan, compositeImagePrompt: buildCompositeImagePrompt(campaignPlan), guides };
}
