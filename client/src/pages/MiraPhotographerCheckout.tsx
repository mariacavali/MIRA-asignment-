import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Check, Loader2, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

export default function MiraPhotographerCheckout() {
  const [, navigate] = useLocation();
  const recordingDemo = trpc.recordingDemo.status.useQuery(undefined, { retry: false });
  const isRecordingDemo = recordingDemo.data?.enabled === true;
  const { user, loading, error: authError } = useAuth({ redirectOnUnauthenticated: !isRecordingDemo, redirectPath: "/mira/signup" });
  const [error, setError] = useState<string | null>(null);
  const purchase = trpc.miraCore.completeLocalPurchase.useMutation({ onSuccess: result => { if (result.mode === "stripe") window.location.assign(result.redirectUrl); else navigate("/mira/payment-success"); } });
  const activateDemo = trpc.recordingDemo.activate.useMutation({ onSuccess: () => navigate("/mira/dashboard") });
  const cancelled = new URLSearchParams(window.location.search).get("cancelled") === "true";
  const purchaseEmail = window.sessionStorage.getItem("mira_purchase_email") ?? undefined;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) { setError("Create or sign in to your photographer account first."); return; }
    setError(null);
    purchase.mutate({ email: purchaseEmail });
  };

  // Recording demo mode: no Stripe, no real account required beforehand -
  // "Activate demo photographer workspace" both seeds and logs in the
  // fixture account (server/miraCore/recordingDemoRouter.ts, activate).
  if (isRecordingDemo) {
    return <Frame>
      <section className="mira-dark-panel p-8 sm:p-10">
        <p className="mira-dark-kicker">MIRA for photographers</p>
        <h1 className="mira-dark-display mt-6 text-5xl">Prepare every client before the shoot begins.</h1>
        <p className="mt-6 text-base leading-7 text-[#c9c3b7]">Create private preparation rooms, collect creative direction and references, and arrive at every shoot with greater clarity.</p>
        <div className="mt-10 border-t border-white/10 pt-8">
          <p className="text-4xl font-semibold tracking-[-0.03em] text-[#d2b98b]">€33.33<span className="text-base font-normal tracking-normal text-[#b7a98f]"> one-time</span></p>
        </div>
      </section>
      <section className="mira-dark-panel p-8 sm:p-10">
        <p className="mira-dark-kicker">Demo checkout — no payment will be processed.</p>
        <h2 className="mira-dark-display mt-6 text-5xl">Activate your demo workspace.</h2>
        <p className="mt-6 text-base leading-7 text-[#c9c3b7]">This seeds one fictional photographer account and one fictional shoot in local storage. No Stripe, no charge, no external call.</p>
        <Button
          type="button"
          disabled={activateDemo.isPending}
          onClick={() => activateDemo.mutate()}
          className="mt-8 h-12 w-full rounded-full bg-[#d2b98b] text-[#171613] text-base font-medium hover:bg-[#e0c99e]"
        >
          {activateDemo.isPending ? <Loader2 className="mr-2 size-5 animate-spin" /> : null} Activate demo photographer workspace
        </Button>
        {activateDemo.error ? <p role="alert" className="mt-4 text-base text-red-200">{activateDemo.error.message}</p> : null}
      </section>
    </Frame>;
  }

  if (loading) return <Frame><section className="mira-dark-panel p-10" role="status"><Loader2 className="size-6 animate-spin text-[#d2b98b]" /><p className="mt-5 text-sm text-[#c9c3b7]">Confirming your photographer account…</p></section></Frame>;
  if (!user) return <Frame><section className="mira-dark-panel p-10"><p className="text-sm text-[#c9c3b7]">Redirecting to photographer signup…</p>{authError ? <p role="alert" className="mt-4 text-sm text-red-200">Your account session could not be confirmed.</p> : null}</section></Frame>;
  return <Frame>
    {cancelled ? <p role="status" className="mb-8 border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-[#c9c3b7]">Payment was not completed. Your photographer account remains safe and unpaid. You can retry checkout below.</p> : null}
    <form onSubmit={submit} className="grid gap-8 lg:grid-cols-2 lg:items-start">
      <section className="mira-dark-panel p-8 sm:p-10">
        <p className="mira-dark-kicker">MIRA for photographers</p>
        <h1 className="mira-dark-display mt-6 text-5xl">Prepare every client before the shoot begins.</h1>
        <p className="mt-6 text-base leading-7 text-[#c9c3b7]">Create private preparation rooms, collect creative direction and references, and arrive at every shoot with greater clarity.</p>
        <ul className="mt-8 grid gap-4 border-t border-white/10 pt-8 text-base text-[#c9c3b7]">
          <li className="flex gap-3">
            <Check className="size-5 text-[#d2b98b] flex-shrink-0 mt-0.5" />
            <span>Private preparation rooms for your clients</span>
          </li>
          <li className="flex gap-3">
            <Check className="size-5 text-[#d2b98b] flex-shrink-0 mt-0.5" />
            <span>AI-assisted creative preparation</span>
          </li>
          <li className="flex gap-3">
            <Check className="size-5 text-[#d2b98b] flex-shrink-0 mt-0.5" />
            <span>Clearer shoot direction before the session</span>
          </li>
        </ul>
        <div className="mt-10 border-t border-white/10 pt-8">
          <p className="text-4xl font-semibold tracking-[-0.03em] text-[#d2b98b]">€33.33<span className="text-base font-normal tracking-normal text-[#b7a98f]"> one-time</span></p>
          <p className="mt-2 text-sm text-[#b7a98f]">One payment. No recurring charges.</p>
        </div>
      </section>
      <section className="mira-dark-panel p-8 sm:p-10">
        <p className="mira-dark-kicker">Secure purchase</p>
        <h2 className="mira-dark-display mt-6 text-5xl">Continue to Stripe checkout.</h2>
        <p className="mt-6 text-base leading-7 text-[#c9c3b7]">Your photographer account is ready. Continue to Stripe to complete the verified purchase.</p>
        <div className="mt-8 border-y border-white/10 py-5 text-sm leading-6 text-[#c9c3b7]">
          <p className="font-medium text-[#f1eadc]">{user.name || "MIRA Photographer"}</p>
          <p>{user.email || purchaseEmail}</p>
        </div>
        <Button 
          type="submit" 
          disabled={purchase.isPending} 
          className="mt-8 h-12 w-full rounded-full bg-[#d2b98b] text-[#171613] text-base font-medium hover:bg-[#e0c99e]"
        >
          BUY MIRA <ArrowRight className="ml-2 size-5" />
        </Button>
        <p className="mt-4 flex items-center justify-center gap-2 text-xs text-[#9e978b]">
          <LockKeyhole className="size-3.5" /> Secure checkout powered by Stripe
        </p>
        {error || purchase.error ? <p role="alert" className="mt-4 text-base text-red-200">{error || "Secure checkout is temporarily unavailable."}</p> : null}
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
          <span className="text-[10px] uppercase tracking-[0.24em] text-[#b7a98f]">Secure photographer purchase</span>
        </header>
        <div className="py-10">{children}</div>
      </div>
    </main>
  );
}
