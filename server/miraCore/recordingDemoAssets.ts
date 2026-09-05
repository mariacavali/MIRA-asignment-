import { createHash } from "node:crypto";
import { buildDemoMiraV4CreativeDna } from "./demoCreativeDna";
import { buildShootPreparationBrief, type ShootPreparationBrief } from "./preparationBrief";
import type { MiraV4CreativeDnaSource } from "../miraV4/creativeDna";
import type { MiraV4CreativeDna } from "../../shared/miraV4CreativeDna";

// Deterministic, offline, no network/storage call - unlike
// createLocalPlaceholderImage (server/_core/imageGeneration.ts) this returns
// an inline data: URI directly rather than writing through the storage
// layer, so the recording demo never depends on disk/S3/Forge availability.
// Same MIRA visual language (dark ground, gold accent) as the rest of the app.
function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function demoSvgDataUri(params: { label: string; title: string; subtitle: string; seed: string }): string {
  const hash = createHash("sha256").update(params.seed).digest("hex");
  const primary = `#${hash.slice(0, 6)}`;
  const secondary = `#${hash.slice(6, 12)}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000" role="img">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${primary}" /><stop offset="100%" stop-color="${secondary}" />
    </linearGradient></defs>
    <rect width="800" height="1000" fill="#171613" />
    <rect x="24" y="24" width="752" height="952" rx="18" fill="url(#g)" />
    <rect x="24" y="24" width="752" height="952" rx="18" fill="none" stroke="#d2b98b" stroke-width="2" opacity="0.6" />
    <text x="400" y="120" text-anchor="middle" fill="#171613" font-size="26" font-family="Arial, sans-serif" letter-spacing="0.24em" font-weight="700">${escapeXml(params.label)}</text>
    <text x="400" y="520" text-anchor="middle" fill="#171613" font-size="42" font-family="Georgia, serif" font-weight="700">${escapeXml(params.title)}</text>
    <text x="400" y="570" text-anchor="middle" fill="#171613" font-size="22" font-family="Arial, sans-serif">${escapeXml(params.subtitle)}</text>
    <text x="400" y="930" text-anchor="middle" fill="#171613" font-size="18" font-family="Arial, sans-serif" opacity="0.85">DEMO-LOCAL VISUAL ASSET · NOT REAL AI IMAGE GENERATION</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export type RecordingDemoReferenceFixture = { purpose: string; description: string; dataUrl: string };

const REFERENCE_FIXTURES: Array<{ label: string; title: string; subtitle: string; purpose: string; description: string }> = [
  { label: "REFERENCE 1 · LIKE", title: "Natural window light", subtitle: "Soft daylight, no flash", purpose: "like", description: "Natural window light, soft and directional." },
  { label: "REFERENCE 2 · LIKE", title: "Olive, cream & tactile fabrics", subtitle: "Quiet, grounded palette", purpose: "like", description: "Olive, cream and tactile fabrics." },
  { label: "REFERENCE 3 · CONTEXT", title: "Small apartment interior", subtitle: "Amsterdam, quiet corner", purpose: "location", description: "A small apartment interior in Amsterdam." },
  { label: "REFERENCE 4 · DIRECTION", title: "Quiet confidence, not corporate", subtitle: "Founder editorial, not stock", purpose: "direction_to_explore", description: "Quiet confidence rather than a posed corporate look." },
  { label: "REFERENCE 5 · DISLIKE", title: "Corporate laptop pose", subtitle: "Avoid: staged desk shot", purpose: "dislike", description: "Avoid a staged corporate laptop pose." },
];

export function buildRecordingDemoReferences(shootId: number): RecordingDemoReferenceFixture[] {
  return REFERENCE_FIXTURES.map((fixture, index) => ({
    purpose: fixture.purpose,
    description: fixture.description,
    dataUrl: demoSvgDataUri({ label: fixture.label, title: fixture.title, subtitle: fixture.subtitle, seed: `ref-${shootId}-${index}` }),
  }));
}

const MOODBOARD_SCENES = [
  { direction: "DEMO: Arrival & natural light", title: "Arrival & Light" },
  { direction: "DEMO: Quiet confidence portrait", title: "Quiet Confidence" },
  { direction: "DEMO: Working hands, tactile detail", title: "Working Detail" },
  { direction: "DEMO: Window silhouette, olive & cream", title: "Window Silhouette" },
  { direction: "DEMO: Founder presence, wide frame", title: "Founder Presence" },
];

export function buildRecordingDemoMoodboard(shootId: number): Array<{ id: string; direction: string; url: string }> {
  return MOODBOARD_SCENES.map((scene, index) => ({
    id: `recording-demo-scene-${shootId}-${index}`,
    direction: scene.direction,
    url: demoSvgDataUri({ label: `MOODBOARD SCENE ${index + 1} OF 5`, title: scene.title, subtitle: "Demo-local visual asset", seed: `scene-${shootId}-${index}` }),
  }));
}

const RECORDING_DEMO_CREATIVE_DNA_SOURCE: MiraV4CreativeDnaSource = {
  journey: {
    building: "Founder Editorial Portrait for a personal-brand campaign",
    currentPosition: "Preparing a remote shoot with MIRA",
    needMost: "Quiet confidence, not a corporate stock look",
    firstCreation: null,
    birthDate: null,
    birthTime: null,
    birthTimeUnknown: 1,
    birthCity: null,
    creativeInputs: null,
  },
  conversation: [
    { phase: "recognition", role: "assistant", content: "What feeling do you want this shoot to carry?" },
    { phase: "recognition", role: "user", content: "Elena wants quiet confidence, not a posed corporate look." },
    { phase: "creative_discovery", role: "assistant", content: "What light and colours feel right?" },
    { phase: "creative_discovery", role: "user", content: "Natural window light. Olive, cream and tactile fabrics." },
    { phase: "creative_discovery", role: "user", content: "A small apartment in Amsterdam, no assistant, avoid corporate laptop poses." },
  ],
  inspiration: { imageReference: null, userExplanation: null, influenceRule: "supporting_evidence_only" },
};

export function buildRecordingDemoCreativeDna(): MiraV4CreativeDna {
  return buildDemoMiraV4CreativeDna(RECORDING_DEMO_CREATIVE_DNA_SOURCE);
}

export function buildRecordingDemoPreparationBrief(params: { location: string | null; scheduledAt: Date | null; timezone: string }): ShootPreparationBrief {
  return buildShootPreparationBrief({ creativeDna: buildRecordingDemoCreativeDna(), shoot: params });
}
