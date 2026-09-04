import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export default function MiraPhotographerLogin() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState(() => new URLSearchParams(window.location.search).get("email") ?? "");
  const returnToCheckout = new URLSearchParams(window.location.search).get("returnTo") === "/mira/checkout" || window.sessionStorage.getItem("mira_purchase_return_to") === "/mira/checkout";
  const login = trpc.miraCore.localPhotographerLogin.useMutation({ onSuccess: () => { if (returnToCheckout) window.sessionStorage.setItem("mira_purchase_email", email.trim().toLowerCase()); window.sessionStorage.removeItem("mira_purchase_return_to"); window.location.assign(returnToCheckout ? "/mira/checkout" : "/mira/account"); } });
  return <main className="mira-dark-surface min-h-screen px-5 py-8 text-[#f1eadc] sm:px-10 sm:py-12"><div className="mx-auto max-w-xl"><header className="flex items-center justify-between border-b border-white/10 pb-6"><a href="/mira" className="mira-dark-display text-2xl">MIRA</a><span className="text-[10px] uppercase tracking-[0.24em] text-[#b7a98f]">Photographer login</span></header><section className="mira-dark-panel mt-12"><p className="mira-dark-kicker">Welcome back</p><h1 className="mira-dark-display mt-5 text-5xl">Return to your studio.</h1><p className="mt-5 text-sm leading-7 text-[#c9c3b7]">Sign in with the email you used for your MIRA purchase.</p><form onSubmit={event => { event.preventDefault(); login.mutate({ email }); }} className="mt-8 grid gap-5"><label className="grid gap-2"><span className="text-[10px] uppercase tracking-[0.18em] text-[#b7a98f]">Email address</span><Input required type="email" value={email} onChange={event => setEmail(event.target.value)} /></label><Button disabled={login.isPending} className="h-11 rounded-full bg-[#d2b98b] text-[#171613]">Log in <ArrowRight className="ml-2 size-4" /></Button>{login.error ? <p role="alert" className="text-sm text-red-200">{login.error.message}</p> : null}</form></section></div></main>;
}
