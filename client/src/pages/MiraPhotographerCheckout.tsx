import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Check, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

export default function MiraPhotographerCheckout() {
  const [, navigate] = useLocation();
  const [complete, setComplete] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const purchase = trpc.miraCore.completeLocalPurchase.useMutation({ onSuccess: result => { if (result.mode === "stripe") window.location.assign(result.redirectUrl); else navigate("/mira/payment-success"); } });
  const cancelled = new URLSearchParams(window.location.search).get("cancelled") === "true";

  if (complete) return null;
 
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !email.trim()) { setError("Enter your name and email to continue."); return; }
    setError(null);
    purchase.mutate({ name: name.trim(), email: email.trim() });
  };
  return <Frame>
    {cancelled ? <p role="status" className="mb-8 border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-[#c9c3b7]">Payment was not completed. Your photographer account remains safe and unpaid. You can retry checkout below.</p> : null}
    <form onSubmit={submit} className="grid gap-8 lg:grid-cols-2 lg:items-start">
      <section className="mira-dark-panel p-8 sm:p-10">
        <p className="mira-dark-kicker">Your plan</p>
        <h1 className="mira-dark-display mt-6 text-5xl">MIRA Studio</h1>
        <p className="mt-6 text-base leading-7 text-[#c9c3b7]">A private preparation room for every remote photography shoot.</p>
        <ul className="mt-8 grid gap-4 border-t border-white/10 pt-8 text-base text-[#c9c3b7]">
          <li className="flex gap-3">
            <Check className="size-5 text-[#d2b98b] flex-shrink-0 mt-0.5" />
            <span>Private client preparation room</span>
          </li>
          <li className="flex gap-3">
            <Check className="size-5 text-[#d2b98b] flex-shrink-0 mt-0.5" />
            <span>Creative and practical preparation</span>
          </li>
          <li className="flex gap-3">
            <Check className="size-5 text-[#d2b98b] flex-shrink-0 mt-0.5" />
            <span>Photographer review and control</span>
          </li>
        </ul>
        <p className="mt-10 border-t border-white/10 pt-8 text-xl text-[#f1eadc]">Founding access</p>
      </section>
      <section className="mira-dark-panel p-8 sm:p-10">
        <p className="mira-dark-kicker">Complete your subscription</p>
        <h2 className="mira-dark-display mt-6 text-5xl">MIRA Studio access</h2>
        <p className="mt-6 text-base leading-7 text-[#c9c3b7]">Enter your account details to continue.</p>
        <div className="mt-8 grid gap-6">
          <Field label="Name">
            <Input 
              required 
              value={name} 
              onChange={event => setName(event.target.value)} 
              placeholder="Your name"
              className="h-12 text-base"
            />
          </Field>
          <Field label="Email address">
            <Input 
              required 
              type="email" 
              value={email} 
              onChange={event => setEmail(event.target.value)} 
              placeholder="you@example.com"
              className="h-12 text-base"
            />
          </Field>
        </div>
        <p className="mt-8 flex gap-3 text-sm leading-6 text-[#9e978b]">
          <LockKeyhole className="size-4 flex-shrink-0 mt-0.5" />
          <span>This activates test access without processing a card.</span>
        </p>
        <Button 
          type="submit" 
          disabled={purchase.isPending} 
          className="mt-8 h-12 w-full rounded-full bg-[#d2b98b] text-[#171613] text-base font-medium hover:bg-[#e0c99e]"
        >
          Activate test access <ArrowRight className="ml-2 size-5" />
        </Button>
        {error || purchase.error ? <p role="alert" className="mt-4 text-base text-red-200">{error || "Access could not be activated."}</p> : null}
      </section>
    </form>
  </Frame>;
}

function Frame({ children }: { children: React.ReactNode }) { 
  return (
    <main className="mira-dark-surface min-h-screen overflow-x-hidden px-5 py-8 text-[#f1eadc] sm:px-10 sm:py-12">
      <div className="mx-auto" style={{ maxWidth: "950px" }}>
        <header className="flex items-center justify-between border-b border-white/10 pb-6 mb-10">
          <a href="/mira" className="mira-dark-display text-2xl">MIRA</a>
          <span className="text-[10px] uppercase tracking-[0.24em] text-[#b7a98f]">Photographer purchase</span>
        </header>
        <div className="py-10">{children}</div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { 
  return (
    <label className="grid gap-3">
      <span className="text-sm uppercase tracking-[0.18em] text-[#b7a98f]">{label}</span>
      {children}
    </label>
  );
}
