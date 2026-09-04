import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { PhotographerShell } from "./MiraPhotographerOnboarding";

export default function MiraDashboard() {
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();
  const profile = trpc.miraCore.getPhotographerProfile.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const access = trpc.miraCore.getPhotographerAccess.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const shoots = trpc.miraCore.listShoots.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const [creating, setCreating] = useState(false);
  const [brandingDialogOpen, setBrandingDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: "", shootType: "", clientName: "", clientEmail: "", clientPhone: "", invitationMessage: "", scheduledAt: "", location: "", intendedUse: "", durationMinutes: "60", photographerNotes: "", callAllowanceMinutes: 20 });
  const portal = trpc.miraCore.createCustomerPortalSession.useMutation({ onSuccess: result => window.location.assign(result.portalUrl) });
  const create = trpc.miraCore.createShoot.useMutation({
    onSuccess: result => navigate(`/mira/shoots/${result.shoot.id}`),
  });

  if (loading || profile.isLoading || shoots.isLoading || access.isLoading) return <PhotographerShell><Loader2 className="size-5 animate-spin" /></PhotographerShell>;
  if (!user) return <PhotographerShell><section className="mira-dark-panel text-center"><h1 className="mira-dark-display text-4xl">Log in to your photographer account.</h1><Button asChild className="mt-7 rounded-full bg-[#d2b98b] text-[#171613]"><a href="/mira/login">Photographer login</a></Button></section></PhotographerShell>;
  if (access.data?.paymentStatus === "unpaid") return <PhotographerShell><section className="mira-dark-panel text-center"><h1 className="mira-dark-display text-4xl">Choose your MIRA plan first.</h1><Button asChild className="mt-7 rounded-full bg-[#d2b98b] text-[#171613]"><a href="/mira/photographer/checkout?plan=Studio%20Test">Open checkout</a></Button></section></PhotographerShell>;
  if (!profile.data || profile.data.onboardingStatus !== "complete") return <PhotographerShell>
    <section className="mira-dark-panel max-w-2xl text-center"><p className="mira-dark-kicker">One step first</p><h1 className="mira-dark-display mt-5 text-5xl">Set up your photographer profile.</h1><Button asChild className="mt-8 rounded-full bg-[#d2b98b] text-[#171613]"><a href="/mira/onboarding">Begin onboarding <ArrowRight className="ml-2 size-4" /></a></Button></section>
  </PhotographerShell>;

  const timezone = profile.data.timezone;
  return <PhotographerShell>
    <div className="w-full xl:-mx-10 xl:w-[calc(100%+5rem)]">
      <div className="flex flex-col justify-between gap-5 border-b border-white/10 pb-7 sm:flex-row sm:items-end">
        <div><p className="mira-dark-kicker">Photographer dashboard</p><h1 className="mira-dark-display mt-3 text-5xl sm:text-6xl">Your shoots.</h1><p className="mt-3 max-w-2xl text-sm text-[#bdb6a9]">One shared preparation flow, from client invitation to READY TO SHOOT.</p></div>
        <Button onClick={() => setCreating(value => !value)} className="h-11 rounded-full bg-[#d2b98b] px-6 text-[#171613] hover:bg-[#e0c99e]"><Plus className="mr-2 size-4" /> {creating ? "Back to shoots" : "Create new shoot"}</Button>
      </div>

      {creating ? <form className="mira-dark-panel mt-6 grid gap-4" onSubmit={event => {
        event.preventDefault();
        create.mutate({
          title: form.title,
          shootType: form.shootType.trim() || null,
          clientName: form.clientName.trim() || null,
          clientEmail: form.clientEmail.trim() || null,
          clientPhone: form.clientPhone.trim() || null,
          invitationMessage: form.invitationMessage.trim() || null,
          scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
          timezone,
          intendedUse: form.intendedUse.trim() || null,
          location: form.location.trim() || null,
          durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : null,
          photographerNotes: form.photographerNotes.trim() || null,
          callAllowanceMinutes: form.callAllowanceMinutes,
        });
      }}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Shoot title"><Input required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></Field>
          <Field label="Shoot type"><Input value={form.shootType} onChange={event => setForm({ ...form, shootType: event.target.value })} /></Field>
          <Field label="Client name · required"><Input required value={form.clientName} onChange={event => setForm({ ...form, clientName: event.target.value })} /></Field>
          <Field label="Client email · required"><Input required type="email" value={form.clientEmail} onChange={event => setForm({ ...form, clientEmail: event.target.value })} /></Field>
          <Field label="Client phone · optional"><Input type="tel" value={form.clientPhone} onChange={event => setForm({ ...form, clientPhone: event.target.value })} /></Field>
          <Field label="Shoot date and time · required"><Input required type="datetime-local" value={form.scheduledAt} onChange={event => setForm({ ...form, scheduledAt: event.target.value })} /></Field>
          <Field label="Location"><Input value={form.location} onChange={event => setForm({ ...form, location: event.target.value })} /></Field>
          <Field label="Duration · minutes"><Input type="number" min={1} max={1440} value={form.durationMinutes} onChange={event => setForm({ ...form, durationMinutes: event.target.value })} /></Field>
          <Field label="Call allowance · minutes"><Input type="number" min={5} max={60} value={form.callAllowanceMinutes} onChange={event => setForm({ ...form, callAllowanceMinutes: Number(event.target.value) })} /></Field>
        </div>
        <div className="grid gap-4 lg:grid-cols-3"><Field label="Invitation message"><Textarea className="min-h-24" maxLength={800} value={form.invitationMessage} onChange={event => setForm({ ...form, invitationMessage: event.target.value })} placeholder="A short personal note for your client…" /></Field><Field label="Intended image use"><Textarea className="min-h-24" value={form.intendedUse} onChange={event => setForm({ ...form, intendedUse: event.target.value })} /></Field><Field label="Photographer notes"><Textarea className="min-h-24" value={form.photographerNotes} onChange={event => setForm({ ...form, photographerNotes: event.target.value })} /></Field></div>
        <Button disabled={create.isPending} className="w-fit rounded-full bg-[#d2b98b] px-7 text-[#171613]">{create.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null} Create shoot</Button>
        {create.error ? <p className="text-sm text-red-300">{create.error.message}</p> : null}
      </form> : null}

      <section className="mt-7 rounded-sm border border-[#d2b98b]/25 bg-[#121211] p-5 sm:p-6">
        <div className="mb-5 flex items-end justify-between gap-4"><div><p className="mira-dark-kicker">Your shoots</p><p className="mt-2 text-xs text-[#9e978b]">Open an active shoot or create the next one.</p></div><span className="text-sm text-[#d2b98b]">{(shoots.data ?? []).filter(shoot => shoot.status !== "draft").length} active</span></div>
        {(shoots.data ?? []).length === 0 ? <p className="py-10 text-center text-sm text-[#9e978b]">No shoots yet. Create the first one when you are ready.</p> : <div className="grid gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-2 xl:grid-cols-3">
          {(shoots.data ?? []).filter(shoot => shoot.status !== "draft").map(shoot => <button key={shoot.id} onClick={() => navigate(`/mira/shoots/${shoot.id}`)} className="group bg-[#151514] p-5 text-left hover:bg-[#1b1a18]">
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#b7a98f]">{shoot.status.replaceAll("_", " ")}</span>
            <span className="mira-dark-display mt-4 block text-3xl">{shoot.title}</span>
            <span className="mt-3 block text-sm text-[#a9a296]">{shoot.clientName || "Client not named"}</span>
            <span className="mt-5 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-[#d2b98b]">Open shoot <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></span>
          </button>)}
        </div>}
        {(shoots.data ?? []).some(shoot => shoot.status === "draft") ? <details className="mt-5"><summary className="cursor-pointer text-xs uppercase tracking-[0.18em] text-[#9e978b]">Drafts</summary><div className="mt-2 grid gap-2 sm:grid-cols-2">{(shoots.data ?? []).filter(shoot => shoot.status === "draft").map(shoot => <button key={shoot.id} onClick={() => navigate(`/mira/shoots/${shoot.id}`)} className="border-t border-white/10 py-2 text-left text-sm text-[#bdb6a9]">{shoot.title}</button>)}</div></details> : null}
      </section>

      <BillingSection access={access.data} portalPending={portal.isPending} portalError={portal.error?.message} onManage={() => portal.mutate({})} />

      <section className="mt-9 border-t border-white/10 pt-7">
        <p className="mira-dark-kicker">Branding &amp; emails</p>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <BrandingOption
            eyebrow="Option 1"
            title="Custom email domain"
            description="Send client invitations from your own studio email address."
            price="€12/month"
            action="Add my domain"
            onOpen={() => setBrandingDialogOpen(true)}
          />
          <BrandingOption
            eyebrow="Option 2"
            title="White-label Studio"
            description="Add your studio name, logo and brand colours across the client Shoot Room and emails. Your custom email domain is included."
            price="€24/month"
            action="Brand my studio"
            onOpen={() => setBrandingDialogOpen(true)}
          />
        </div>
      </section>

      <Dialog open={brandingDialogOpen} onOpenChange={setBrandingDialogOpen}>
        <DialogContent className="border-white/10 bg-[#171613] text-[#f1eadc] sm:max-w-md">
          <DialogTitle className="mira-dark-display text-3xl">Branded client experiences are coming soon.</DialogTitle>
          <DialogDescription className="pt-2 text-sm leading-6 text-[#c9c3b7]">We’re preparing secure custom domains and white-label studio branding. No payment has been taken.</DialogDescription>
          <DialogFooter className="pt-4">
            <Button onClick={() => setBrandingDialogOpen(false)} className="rounded-full bg-[#d2b98b] text-[#171613] hover:bg-[#e0c99e]">Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  </PhotographerShell>;
}

function BillingSection({ access, portalPending, portalError, onManage }: { access: { paymentStatus: string; paymentState?: string; cancelAtPeriodEnd?: boolean; currentPeriodEnd?: Date | null } | undefined; portalPending: boolean; portalError?: string; onManage: () => void }) {
  const localTest = access?.paymentStatus === "test_active";
  const oneTimePaid = access?.paymentStatus === "paid";
  const state = access?.paymentState ?? (localTest ? "test_active" : "unavailable");
  const status = localTest ? "Test access" : oneTimePaid ? "Paid · active" : state === "active" ? access?.cancelAtPeriodEnd ? "Cancels at the end of the billing period" : "Active" : state === "past_due" ? "Payment needs attention" : state === "cancelled" ? "Cancelled" : "Not active";
  return <section className="mt-8 border-t border-white/10 pt-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="mira-dark-kicker">Billing</p><h2 className="mira-dark-display mt-2 text-2xl">MIRA Studio · €33.33 one-time</h2><p className="mt-2 text-xs text-[#9e978b]">Status: {status}</p></div>
      {localTest ? <p className="text-xs text-[#9e978b]">Customer Portal is available for live subscriptions.</p> : state === "active" ? <Button onClick={onManage} disabled={portalPending} variant="outline" className="border-white/15 bg-transparent text-[#ded5c5]">{portalPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null} Manage subscription</Button> : null}
    </div>
    {access?.cancelAtPeriodEnd && access.currentPeriodEnd ? <p className="mt-3 text-xs text-[#b7a98f]">Your access remains active through {new Date(access.currentPeriodEnd).toLocaleDateString()}.</p> : null}
    {portalError ? <p role="alert" className="mt-4 text-sm text-red-200">Subscription management is temporarily unavailable. Please try again.</p> : null}
  </section>;
}

function BrandingOption({ eyebrow, title, description, price, action, onOpen }: { eyebrow: string; title: string; description: string; price: string; action: string; onOpen: () => void }) {
  return <article className="border border-white/10 bg-[#151514] p-4">
    <p className="text-[10px] uppercase tracking-[0.18em] text-[#9e978b]">{eyebrow}</p>
    <h2 className="mira-dark-display mt-3 text-2xl text-[#ded5c5]">{title}</h2>
    <p className="mt-3 text-sm leading-6 text-[#9e978b]">{description}</p>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4">
      <p className="text-sm text-[#d2b98b]">{price}</p>
      <Button onClick={onOpen} variant="outline" className="border-white/15 bg-transparent text-xs uppercase tracking-[0.14em] text-[#ded5c5]">{action}</Button>
    </div>
  </article>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-2 text-[10px] uppercase tracking-[0.18em] text-[#b7a98f]">{label}{children}</label>; }
