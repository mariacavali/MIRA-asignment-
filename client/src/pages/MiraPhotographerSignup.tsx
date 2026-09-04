import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";

export default function MiraPhotographerSignup() {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "", confirmPassword: "", consent: false });
  const [error, setError] = useState<string | null>(null);
  const create = trpc.miraCore.createLocalPhotographerAccount.useMutation({
    onSuccess: () => window.location.assign("/mira/checkout"),
    onError: mutationError => {
      if (/already exists/i.test(mutationError.message)) {
        window.sessionStorage.setItem("mira_purchase_return_to", "/mira/checkout");
        const params = new URLSearchParams({ returnTo: "/mira/checkout", email: form.email });
        window.location.assign(`/mira/login?${params.toString()}`);
      }
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!form.consent) return setError("Please accept the Terms and Privacy Policy to continue.");
    if (form.password !== form.confirmPassword) return setError("The passwords do not match.");
    create.mutate({ firstName: form.firstName, lastName: form.lastName, email: form.email, password: form.password });
  };

  return (
    <main className="mira-dark-surface min-h-screen px-5 py-8 text-[#f1eadc] sm:px-10 sm:py-12">
      <div className="mx-auto max-w-xl">
        <header className="flex items-center justify-between border-b border-white/10 pb-6">
          <a href="/mira" className="mira-dark-display text-2xl">MIRA</a>
          <span className="text-[10px] uppercase tracking-[0.24em] text-[#b7a98f]">Photographer account</span>
        </header>
        <section className="mira-dark-panel mt-12">
          <p className="mira-dark-kicker">Begin your workspace</p>
          <h1 className="mira-dark-display mt-5 text-5xl">Create your MIRA account.</h1>
          <p className="mt-5 text-sm leading-7 text-[#c9c3b7]">Create your photographer account first. You will stay signed in and continue securely to Stripe checkout.</p>
          <form onSubmit={submit} className="mt-8 grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="First name"><Input required value={form.firstName} onChange={event => setForm({ ...form, firstName: event.target.value })} /></Field>
              <Field label="Last name"><Input required value={form.lastName} onChange={event => setForm({ ...form, lastName: event.target.value })} /></Field>
            </div>
            <Field label="Email address"><Input required type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></Field>
            <Field label="Password"><Input required type="password" minLength={8} value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></Field>
            <Field label="Confirm password"><Input required type="password" minLength={8} value={form.confirmPassword} onChange={event => setForm({ ...form, confirmPassword: event.target.value })} /></Field>
            <label className="flex gap-3 text-sm leading-6 text-[#c9c3b7]"><input required type="checkbox" checked={form.consent} onChange={event => setForm({ ...form, consent: event.target.checked })} className="mt-1 accent-[#d2b98b]" />I agree to the <span className="text-[#d2b98b]">Terms</span> and <span className="text-[#d2b98b]">Privacy Policy</span>.</label>
            <Button disabled={create.isPending} className="mt-2 h-11 rounded-full bg-[#d2b98b] text-[#171613]">Create account and continue <ArrowRight className="ml-2 size-4" /></Button>
            {error || create.error ? <p role="alert" className="text-sm text-red-200">{error || create.error?.message}</p> : null}
          </form>
          <div className="mt-7 flex items-center gap-2 border-t border-white/10 pt-5 text-xs text-[#9e978b]"><LockKeyhole className="size-3.5" />Your password is protected and never stored as plain text.</div>
          <p className="mt-6 text-center text-sm text-[#bdb6a9]">Already have an account? <a href="/mira/login?returnTo=/mira/checkout" onClick={() => window.sessionStorage.setItem("mira_purchase_return_to", "/mira/checkout")} className="text-[#d2b98b] underline underline-offset-4">Log in</a></p>
        </section>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2"><span className="text-[10px] uppercase tracking-[0.18em] text-[#b7a98f]">{label}</span>{children}</label>;
}
