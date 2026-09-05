// Scripted fictional conversation used only by MIRA_RECORDING_DEMO mode
// (see docs/MIRA_RECORDING_DEMO.md). Shared between client and server so the
// on-screen script and any server-side reference to it never drift.
// No microphone, no OpenAI Realtime call, no external service - this is a
// fixed, staged sequence of lines that plays entirely client-side.
export const RECORDING_DEMO_SCRIPTED_CONVERSATION: Array<{ speaker: "mira" | "elena"; line: string }> = [
  { speaker: "mira", line: "Hi Elena — before we shoot, tell me: what feeling do you want to carry in these images?" },
  { speaker: "elena", line: "Quiet confidence. Not a posed, corporate look." },
  { speaker: "mira", line: "What kind of light feels right to you?" },
  { speaker: "elena", line: "Natural window light — nothing artificial." },
  { speaker: "mira", line: "Any colours or textures you're drawn to?" },
  { speaker: "elena", line: "Olive, cream, and tactile fabrics." },
  { speaker: "mira", line: "Where will we shoot, and will anyone be with you?" },
  { speaker: "elena", line: "My small apartment. No assistant — just me." },
  { speaker: "mira", line: "Is there anything you'd like to avoid?" },
  { speaker: "elena", line: "Please, no corporate laptop poses." },
  { speaker: "mira", line: "Understood. I have everything I need to prepare your Creative DNA and moodboard." },
];
