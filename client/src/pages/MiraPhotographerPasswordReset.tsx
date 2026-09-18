import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";

export default function MiraPhotographerPasswordReset() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  return token ? <SetNewPassword token={token} /> : <RequestReset />;
}

function Shell({ children, kicker, title }: { children: React.ReactNode; kicker: string; title: string }) {
  return <main className="mira-dark-surface min-h-screen px-5 py-8 text-[#f1eadc] sm:px-10 sm:py-12"><div className="mx-auto max-w-xl"><header className="flex items-center justify-between border-b border-white/10 pb-6"><a href="/mira" className="mira-dark-display text-2xl">MIRA</a><span className="text-[10px] uppercase tracking-[0.24em] text-[#b7a98f]">Password reset</span></header><section className="mira-dark-panel mt-12"><p className="mira-dark-kicker">{kicker}</p><h1 className="mira-dark-display mt-5 text-5xl">{title}</h1>{children}</section></div></main>;
}

function RequestReset() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const request = trpc.miraCore.requestPhotographerPasswordReset.useMutation({ onSuccess: () => setSent(true) });
  return <Shell kicker="Account access" title="Reset your password."><p className="mt-5 text-sm leading-7 text-[#c9c3b7]">Enter your photographer account email. If a MIRA password account exists, we will send a secure link that expires in 30 minutes.</p>{sent ? <div className="mt-8 rounded-2xl border border-white/10 p-5 text-sm leading-7 text-[#c9c3b7]">Check your email for the reset link. <a className="text-[#d2b98b] underline underline-offset-4" href="/mira/login">Return to login</a>.</div> : <form className="mt-8 grid gap-5" onSubmit={event => { event.preventDefault(); request.mutate({ email }); }}><Field label="Email address"><Input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></Field><Button disabled={request.isPending} className="h-11 rounded-full bg-[#d2b98b] text-[#171613]">Send reset link <ArrowRight className="ml-2 size-4" /></Button>{request.error ? <p role="alert" className="text-sm text-red-200">We could not send the reset email. Please try again.</p> : null}</form>}</Shell>;
}

function SetNewPassword({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const reset = trpc.miraCore.resetPhotographerPassword.useMutation({
    onSuccess: () => window.location.assign("/mira/dashboard"),
    onError: mutationError => setError(mutationError.message),
  });
  return <Shell kicker="Secure link" title="Choose a new password."><p className="mt-5 text-sm leading-7 text-[#c9c3b7]">Your new password must contain at least eight characters.</p><form className="mt-8 grid gap-5" onSubmit={event => { event.preventDefault(); setError(null); if (password !== confirmPassword) return setError("The passwords do not match."); reset.mutate({ token, password }); }}><Field label="New password"><Input required type="password" minLength={8} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></Field><Field label="Confirm new password"><Input required type="password" minLength={8} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></Field><Button disabled={reset.isPending} className="h-11 rounded-full bg-[#d2b98b] text-[#171613]">Set password and continue <ArrowRight className="ml-2 size-4" /></Button>{error ? <p role="alert" className="text-sm text-red-200">{error}</p> : null}</form><div className="mt-7 flex items-center gap-2 border-t border-white/10 pt-5 text-xs text-[#9e978b]"><LockKeyhole className="size-3.5" />The link expires after 30 minutes and stops working after your password changes.</div></Shell>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2"><span className="text-[10px] uppercase tracking-[0.18em] text-[#b7a98f]">{label}</span>{children}</label>;
}
