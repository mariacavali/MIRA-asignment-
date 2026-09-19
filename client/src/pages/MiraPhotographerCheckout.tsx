import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Loader2, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

export default function MiraPhotographerCheckout() {
  const [, navigate] = useLocation();
  const {
    user,
    loading,
    error: authError,
  } = useAuth({
    redirectOnUnauthenticated: true,
    redirectPath: "/mira/signup",
  });
  const [error, setError] = useState<string | null>(null);
  const purchase = trpc.miraCore.completeLocalPurchase.useMutation({
    onSuccess: result => {
      if (result.mode === "stripe") window.location.assign(result.redirectUrl);
      else navigate("/mira/payment-success");
    },
  });
  const cancelled =
    new URLSearchParams(window.location.search).get("cancelled") === "true";
  const purchaseEmail =
    window.sessionStorage.getItem("mira_purchase_email") ?? undefined;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) {
      setError("Create or sign in to your photographer account first.");
      return;
    }
    setError(null);
    purchase.mutate({ email: purchaseEmail });
  };
  if (loading)
    return (
      <Frame>
        <section className="mira-dark-panel p-10" role="status">
          <Loader2 className="size-6 animate-spin text-[#d2b98b]" />
          <p className="mt-5 text-sm text-[#c9c3b7]">
            Confirming your photographer account…
          </p>
        </section>
      </Frame>
    );
  if (!user)
    return (
      <Frame>
        <section className="mira-dark-panel p-10">
          <p className="text-sm text-[#c9c3b7]">
            Redirecting to photographer signup…
          </p>
          {authError ? (
            <p role="alert" className="mt-4 text-sm text-red-200">
              Your account session could not be confirmed.
            </p>
          ) : null}
        </section>
      </Frame>
    );
  return (
    <Frame>
      {cancelled ? (
        <p
          role="status"
          className="mb-8 border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-[#c9c3b7]"
        >
          Payment was not completed. Your photographer account remains safe and
          unpaid. You can retry checkout below.
        </p>
      ) : null}
      <form
        onSubmit={submit}
        className="mira-dark-panel mx-auto max-w-lg p-6 sm:p-8"
      >
        <p className="mira-dark-kicker">Your account is ready</p>
        <h1 className="mira-dark-display mt-4 text-4xl">Get MIRA.</h1>
        <p className="mt-4 text-sm leading-6 text-[#c9c3b7]">
          Private Shoot Rooms, guided client preparation and a shared moodboard.
        </p>
        <p className="mt-6 text-4xl text-[#d2b98b]">
          €33.33 <span className="text-base text-[#b7a98f]">one-time</span>
        </p>
        <p className="mt-2 text-sm text-[#c9c3b7]">
          One payment. No recurring charges.
        </p>
        <div className="mt-6 border-y border-white/10 py-4 text-sm leading-6 text-[#c9c3b7]">
          <p className="font-medium text-[#f1eadc]">
            {user.name || "MIRA Photographer"}
          </p>
          <p className="break-words">{user.email || purchaseEmail}</p>
        </div>
        <Button
          type="submit"
          disabled={purchase.isPending}
          className="mt-6 min-h-12 w-full rounded-full bg-[#d2b98b] text-base text-[#171613] hover:bg-[#e0c99e]"
        >
          {purchase.isPending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Opening checkout…
            </>
          ) : (
            <>
              Continue to payment <ArrowRight className="ml-2 size-4" />
            </>
          )}
        </Button>
        <p className="mt-3 flex items-center justify-center gap-2 text-xs text-[#b7a98f]">
          <LockKeyhole className="size-3.5" />
          Secure payment with Stripe
        </p>
        {error || purchase.error ? (
          <p role="alert" className="mt-4 text-sm text-red-200">
            {error ||
              "Secure checkout is temporarily unavailable. Please try again."}
          </p>
        ) : null}
        <a
          href="/mira/dashboard"
          className="mt-6 block py-2 text-center text-sm text-[#ded5c5] underline underline-offset-4"
        >
          Back to my account
        </a>
      </form>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="mira-dark-surface min-h-screen overflow-x-hidden px-5 py-8 text-[#f1eadc] sm:px-10 sm:py-12">
      <div className="mx-auto" style={{ maxWidth: "950px" }}>
        <header className="flex items-center justify-between border-b border-white/10 pb-6 mb-10">
          <a href="/mira/dashboard" className="mira-dark-display text-2xl">
            MIRA
          </a>
          <span className="text-[10px] uppercase tracking-[0.24em] text-[#b7a98f]">
            Secure photographer purchase
          </span>
        </header>
        <div className="py-2">{children}</div>
      </div>
    </main>
  );
}
