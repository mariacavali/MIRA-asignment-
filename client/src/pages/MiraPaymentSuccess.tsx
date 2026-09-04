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
  const destination = paymentReturnDestination(paymentState, profile.data?.onboardingStatus ?? null, access.data?.paymentStatus);
  const retryVerification = () => {
    setTimedOut(false);
    setRetryCount(value => value + 1);
    void access.refetch();
  };

  useEffect(() => {
    if (!user || paid || blocked) return;
    return startPaymentConfirmationPoll(() => { void access.refetch(); }, () => setTimedOut(true));
  }, [access.refetch, blocked, paid, retryCount, user]);

  if (loading) return <ReturnShell><VerificationLoading title="Preparing payment verification…" body="Connecting your photographer session securely." /></ReturnShell>;
  if (!user) return <ReturnShell><ReturnPanel kicker="Payment verification" title="We could not verify your photographer session." body="No access was granted. Return to Buy MIRA and complete account creation before opening checkout." action="Return to Buy MIRA" onAction={() => navigate("/for-photographers")} /></ReturnShell>;
  if (access.isLoading || (paid && profile.isLoading)) return <ReturnShell><VerificationLoading title="Confirming your payment…" body="We are checking the verified payment status stored by MIRA. This page cannot activate access by itself." /></ReturnShell>;
  if (access.error || profile.error) return <ReturnShell><ReturnPanel kicker="Payment verification" title="We could not verify your payment yet." body="No access was granted. Check again, or return to checkout if the issue continues." action="Check again" onAction={retryVerification} secondaryAction="Return to checkout" onSecondaryAction={() => navigate("/mira/checkout")} /></ReturnShell>;
  if (paid && destination) return <ReturnShell><ReturnPanel kicker="Payment confirmed" title="Your MIRA access is ready." body="Continue to your photographer dashboard. If your profile is incomplete, MIRA will guide you through the existing onboarding first." action="Continue to your dashboard" onAction={() => navigate(destination)} icon={<Check className="size-7 text-[#d2b98b]" />} /></ReturnShell>;
  if (blocked) return <ReturnShell><ReturnPanel kicker="Payment verification" title={paymentState === "past_due" ? "Payment needs attention." : "Payment is not active."} body="No access was granted. Return to checkout to review or retry the payment." action="Return to checkout" onAction={() => navigate("/mira/checkout")} /></ReturnShell>;
  if (!timedOut) return <ReturnShell><VerificationLoading title="Confirming your payment…" body="We are checking the verified payment status stored by MIRA. This page cannot activate access by itself." /></ReturnShell>;
  return <ReturnShell><ReturnPanel kicker="Payment verification" title="Confirmation is taking longer than expected." body="No access was granted. Check again shortly, or return to checkout to retry safely." action="Check again" onAction={retryVerification} secondaryAction="Return to checkout" onSecondaryAction={() => navigate("/mira/checkout")} /></ReturnShell>;
}

function ReturnShell({ children }: { children: React.ReactNode }) {
  return <main className="mira-dark-surface min-h-screen px-5 py-8 text-[#f1eadc] sm:px-10 sm:py-12"><div className="mx-auto max-w-2xl">{children}</div></main>;
}

function VerificationLoading({ title, body }: { title: string; body: string }) {
  return <section className="mira-dark-panel border-[#d2b98b]/30" role="status" aria-live="polite"><Loader2 className="size-7 animate-spin text-[#d2b98b]" /><p className="mira-dark-kicker mt-6">Payment verification</p><h1 className="mira-dark-display mt-4 text-4xl">{title}</h1><p className="mt-4 text-base leading-7 text-[#c9c3b7]">{body}</p></section>;
}

function ReturnPanel({ kicker, title, body, action, onAction, secondaryAction, onSecondaryAction, icon }: { kicker: string; title: string; body: string; action?: string; onAction?: () => void; secondaryAction?: string; onSecondaryAction?: () => void; icon?: React.ReactNode }) {
  return <section className="mira-dark-panel border-[#d2b98b]/30">{icon}<p className="mira-dark-kicker mt-6">{kicker}</p><h1 className="mira-dark-display mt-4 text-4xl">{title}</h1><p className="mt-4 text-base leading-7 text-[#c9c3b7]">{body}</p>{action && onAction ? <div className="mt-8 flex flex-wrap gap-3"><Button onClick={onAction} className="rounded-full bg-[#d2b98b] text-[#171613]">{action}<ArrowRight className="ml-2 size-4" /></Button>{secondaryAction && onSecondaryAction ? <Button onClick={onSecondaryAction} variant="outline" className="rounded-full border-white/15 bg-transparent text-[#ded5c5]">{secondaryAction}</Button> : null}</div> : null}</section>;
}
