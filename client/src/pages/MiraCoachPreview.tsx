import { MiraSession } from "./MiraSession";
// The agreed green layout now uses the same connected session as the live route.
export default function MiraCoachPreview() {
  if (new URLSearchParams(window.location.search).get("phone") === "1") return <div style={{ minHeight: "100vh", background: "#e7e8df", display: "grid", placeItems: "center", padding: 16 }}><iframe title="MIRA phone preview" src="/mira/coach-preview?device=phone" style={{ width: 390, maxWidth: "100%", height: "min(844px, calc(100dvh - 32px))", border: "1px solid #d1d5c8", borderRadius: 24, boxShadow: "0 15px 60px #173e3c20", background: "#f7f5ee" }} /></div>;
  return <MiraSession localReview />;
}
