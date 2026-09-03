import { Button } from "@/components/ui/button";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { isBlockedPaymentState, isPaidPaymentState, paymentReturnDestination, resolvePaymentState, startPaymentConfirmationPoll } from "@shared/paymentReturn";

export default function MiraPaymentSuccess() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const access = trpc.miraCore.getPhotographerAccess.useQuery(undefined, { enabled: Boolean(user), retry: false, refetchInterval: false });
  const profile = trpc.miraCore.getPhotographerProfile.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const [timedOut, setTimedOut] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const paymentState = resolvePaymentState(access.data);
  const paid = isPaidPaymentState(paymentState, access.data?.paymentStatus);
  const blocked = isBlockedPaymentState(paymentState);

  useEffect(() => {
    if (!user || paid || blocked) return;
    return startPaymentConfirmationPoll(() => { void access.refetch(); }, () => setTimedOut(true));
  }, [access.refetch, blocked, paid, retryCount, user]);

  useEffect(() => {
    if (!user || !paid || profile.isLoading) return;
    navigate(paymentReturnDestination(paymentState, profile.data?.onboardingStatus ?? null, access.data?.paymentStatus) ?? "/mira/onboarding");
  }, [access.data?.paymentStatus, navigate, paid, paymentState, profile.data?.onboardingStatus, profile.isLoading, user]);

  if (loading) return <ReturnShell><Loader2 className="size-5 animate-spin text-[#d2b98b]" /></ReturnShell>;
  if (!user) return <ReturnShell><ReturnPanel kicker="Photographer access" title="Sign in to confirm your payment." body="Payment confirmation is tied to your photographer session. Sign in to continue." action="Photographer login" onAction={() => navigate("/mira/login")} /></ReturnShell>;
  if (paid) return <ReturnShell><ReturnPanel kicker="Payment confirmed" title="Welcome to MIRA." body="Your access is active. Taking you to your photographer setup." icon={<Check className="size-7 text-[#d2b98b]" />} /></ReturnShell>;
  if (blocked) return <ReturnShell><ReturnPanel kicker="Billing status" title={paymentState === "past_due" ? "Payment needs attention." : "Payment is not active."} body="Your MIRA access is not active. You can return to checkout to try again." action="Return to checkout" onAction={() => navigate("/mira/checkout")} /></ReturnShell>;
  return <ReturnShell><ReturnPanel kicker="Payment confirmation" title={timedOut ? "Confirmation is taking a moment." : "Confirming your payment…"} body={timedOut ? "Your payment may still be processing. Check again shortly or return to checkout to retry safely." : "We are checking your stored payment status. This page does not activate payment."} action={timedOut ? "Check again" : "Return to checkout"} onAction={timedOut ? () => { setTimedOut(false); setRetryCount(value => value + 1); void access.refetch(); } : () => navigate("/mira/checkout")} secondaryAction={timedOut ? "Return to checkout" : undefined} onSecondaryAction={timedOut ? () => navigate("/mira/checkout") : undefined} /></ReturnShell>;
}

function ReturnShell({ children }: { children: React.ReactNode }) {
  return <main className="mira-dark-surface min-h-screen px-5 py-8 text-[#f1eadc] sm:px-10 sm:py-12"><div className="mx-auto max-w-2xl">{children}</div></main>;
}

function ReturnPanel({ kicker, title, body, action, onAction, secondaryAction, onSecondaryAction, icon }: { kicker: string; title: string; body: string; action?: string; onAction?: () => void; secondaryAction?: string; onSecondaryAction?: () => void; icon?: React.ReactNode }) {
  return <section className="mira-dark-panel border-[#d2b98b]/30">{icon}<p className="mira-dark-kicker mt-6">{kicker}</p><h1 className="mira-dark-display mt-4 text-4xl">{title}</h1><p className="mt-4 text-base leading-7 text-[#c9c3b7]">{body}</p>{action && onAction ? <div className="mt-8 flex flex-wrap gap-3"><Button onClick={onAction} className="rounded-full bg-[#d2b98b] text-[#171613]">{action}<ArrowRight className="ml-2 size-4" /></Button>{secondaryAction && onSecondaryAction ? <Button onClick={onSecondaryAction} variant="outline" className="rounded-full border-white/15 bg-transparent text-[#ded5c5]">{secondaryAction}</Button> : null}</div> : null}</section>;
}