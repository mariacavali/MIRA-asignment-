import { Button } from "@/components/ui/button";
import { ArrowRight, Check } from "lucide-react";
import { useLocation } from "wouter";

const plans = [
  { name: "Studio Test", description: "Development and testing only.", detail: "No production billing", featured: true },
  { name: "Independent", description: "For a focused monthly shoot practice.", detail: "Limited monthly shoots" },
  { name: "Studio", description: "For a growing studio workflow.", detail: "Higher shoot allowance; team-ready positioning is future" },
];

export default function MiraPhotographerPricing() {
  const [, navigate] = useLocation();
  return <main className="mira-dark-surface min-h-screen px-5 py-8 text-[#f1eadc] sm:px-10 sm:py-12"><div className="mx-auto max-w-6xl">
    <header className="flex items-center justify-between border-b border-white/10 pb-6"><a href="/" className="mira-dark-display text-2xl">MIRA</a><span className="text-[10px] uppercase tracking-[0.24em] text-[#b7a98f]">Photographer account</span></header>
    <section className="py-16"><p className="mira-dark-kicker">For photographers</p><h1 className="mira-dark-display mt-5 max-w-3xl text-6xl sm:text-8xl">Choose the room your studio needs.</h1><p className="mt-6 max-w-xl text-sm leading-7 text-[#c9c3b7]">Test plans are provisional for this MVP. Checkout below is local simulation only; no payment is created.</p>
      <div className="mt-12 grid gap-px bg-white/10 md:grid-cols-3">{plans.map(plan => <article key={plan.name} className={`bg-[#171716] p-7 ${plan.featured ? "border-t-2 border-[#d2b98b]" : ""}`}><p className="mira-dark-kicker">{plan.featured ? "Recommended for this POC" : "Provisional plan"}</p><h2 className="mira-dark-display mt-6 text-3xl">{plan.name}</h2><p className="mt-4 min-h-12 text-sm leading-6 text-[#c9c3b7]">{plan.description}</p><p className="mt-7 flex items-start gap-2 border-t border-white/10 pt-5 text-xs text-[#bdb6a9]"><Check className="mt-0.5 size-4 text-[#d2b98b]" />{plan.detail}</p><Button onClick={() => navigate(`/mira/photographer/checkout?plan=${encodeURIComponent(plan.name)}`)} className="mt-8 w-full rounded-full bg-[#d2b98b] text-[#171613]">Select plan <ArrowRight className="ml-2 size-4" /></Button></article>)}</div>
    </section>
  </div></main>;
}