import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Check, Copy, ImagePlus, Link2, Loader2, RefreshCw, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { EmailSequencePreview } from "@/components/mira/EmailSequencePreview";
import { PhotographerShell } from "./MiraPhotographerOnboarding";

export default function MiraShoot() {
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });
  const recordingDemo = trpc.recordingDemo.status.useQuery(undefined, { retry: false });
  const isRecordingDemo = recordingDemo.data?.enabled === true;
  const params = useParams<{ shootId: string }>();
  const shootId = Number(params.shootId);
  const [, navigate] = useLocation();
  const state = trpc.miraCore.getShoot.useQuery({ shootId }, { enabled: Boolean(user) && Number.isInteger(shootId), retry: false });
  const qaEvents = trpc.miraCore.listRealtimeQaEvents.useQuery({ shootId }, { enabled: Boolean(user) && Number.isInteger(shootId), retry: false });
  const creativeDna = trpc.miraCore.getShootCreativeDna.useQuery({ shootId }, { enabled: Boolean(user) && Number.isInteger(shootId), retry: false });
  const moodboard = trpc.miraCore.getShootMoodboard.useQuery({ shootId }, { enabled: Boolean(user) && Number.isInteger(shootId), retry: false });
  const inspection = trpc.miraCore.getShootQaInspection.useQuery({ shootId }, { enabled: Boolean(user) && Number.isInteger(shootId), retry: false });
  const deleteQaEvents = trpc.miraCore.deleteRealtimeQaEvents.useMutation({ onSuccess: () => qaEvents.refetch() });
  const [link, setLink] = useState<string | null>(null);
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referenceDescription, setReferenceDescription] = useState("");
  const uploadReference = trpc.miraCore.uploadShootVisualReference.useMutation({ onSuccess: () => { setReferenceFile(null); setReferenceDescription(""); void inspection.refetch(); } });
  const analyzeReference = trpc.miraCore.analyzeShootVisualReference.useMutation({ onSuccess: () => inspection.refetch() });
  const [contact, setContact] = useState({ clientName: "", clientEmail: "", clientPhone: "", invitationMessage: "" });
  useEffect(() => {
    if (!state.data) return;
    setContact({
      clientName: state.data.shoot.clientName || "",
      clientEmail: state.data.shoot.clientEmail || "",
      clientPhone: state.data.shoot.clientPhone || "",
      invitationMessage: state.data.shoot.invitationMessage || "",
    });
    const persistedInvitation = state.data.invitations?.[0];
    if (persistedInvitation && "preparationUrl" in persistedInvitation) setLink(`${window.location.origin}${persistedInvitation.preparationUrl}`);
  }, [state.data?.shoot.id]);
  const updateContact = trpc.miraCore.updateShootContact.useMutation({ onSuccess: () => state.refetch() });
  const markReady = trpc.miraCore.markShootReadyToShoot.useMutation({ onSuccess: () => state.refetch() });
  const invitation = trpc.miraCore.createInvitation.useMutation({ onSuccess: result => {
    setLink(`${window.location.origin}/prepare/${result.token}`);
    setDeliveryMessage("Private client link created.");
    void state.refetch();
  }});
  const sendInvitation = trpc.miraCore.sendInvitation.useMutation({
    onSuccess: result => {
      setLink(result.preparationUrl);
      setDeliveryMessage(result.deliveryError || `Invitation sent. If your client cannot find it within a few minutes, ask them to check Spam or Promotions.${result.replyToWarning ? ` ${result.replyToWarning}` : ""}`);
      void state.refetch();
    },
    onError: error => setDeliveryMessage(error.message || "The invitation could not be sent."),
  });
  useEffect(() => {
    if (!state.data || state.data.invitations.length > 0 || link || invitation.isPending) return;
    invitation.mutate({ shootId, expiresInDays: 7 });
  }, [invitation, link, shootId, state.data]);

  if (loading || state.isLoading) return <PhotographerShell><Loader2 className="size-5 animate-spin" /></PhotographerShell>;
  if (!state.data) return <PhotographerShell><p>Shoot not found.</p></PhotographerShell>;
  const { shoot, invitations } = state.data;
  const latestInvitation = invitations[0];
  const invitationAlreadySent = Boolean(latestInvitation && ["queued", "sent", "delivered", "opened", "preparation_in_progress", "completed"].includes(latestInvitation.deliveryStatus));
  const latestRevision = inspection.data?.revisions?.[inspection.data.revisions.length - 1];
  const scheduleValue = latestRevision?.snapshotJson?.shootContext?.scheduleConfirmation?.value;
  const scheduleResponse = Array.isArray(scheduleValue) ? scheduleValue : null;
  return <PhotographerShell><div className="w-full xl:-mx-10 xl:w-[calc(100%+5rem)]">
    <button onClick={() => navigate("/mira")} className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[#b7a98f]"><ArrowLeft className="size-3.5" /> Dashboard</button>
    <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.62fr)]">
      <section><p className="mira-dark-kicker">{shoot.status.replaceAll("_", " ")}</p><h1 className="mira-dark-display mt-3 text-5xl">{shoot.title}</h1><dl className="mt-6 grid gap-4 border-t border-white/10 pt-5 sm:grid-cols-3">
        <Detail label="Client" value={shoot.clientName || "Not named"} />
        <Detail label="Source" value={shoot.sourceMode === "mira_saas" ? "MIRA photographer dashboard" : "Maria Cavali Photography"} />
        <Detail label="Location" value={shoot.location || "Not set"} />
        <Detail label="Mira room" value={shoot.roomState.replaceAll("_", " ")} />
        <Detail label="Call allowance" value={`${Math.round(shoot.callAllowanceSeconds / 60)} minutes`} />
      </dl>
      {scheduleResponse ? (
        <p className="mt-6 text-sm text-[#ded5c5]">
          {scheduleResponse[0] === "confirmed"
            ? "Client confirmed the scheduled date, time, and location."
            : `Client requested a schedule change${scheduleResponse[1] ? `: "${scheduleResponse[1]}"` : "."}`}
        </p>
      ) : null}
      {shoot.status === "ready_to_shoot" ? (
        <p className="mt-6 flex w-fit items-center gap-2 rounded-full border border-[#d2b98b]/40 px-4 py-2 text-sm text-[#d2b98b]"><Check className="size-4" /> Marked Ready to Shoot</p>
      ) : shoot.roomState === "preparation_active" ? (
        <Button onClick={() => markReady.mutate({ shootId })} disabled={markReady.isPending} className="mt-6 w-fit rounded-full bg-[#d2b98b] text-[#171613]"><Check className="mr-2 size-4" /> Mark Ready to Shoot</Button>
      ) : null}</section>
      <aside className="mira-dark-panel self-start p-6"><p className="mira-dark-kicker">Client invitation</p><h2 className="mira-dark-display mt-3 text-3xl">Invite your client.</h2><p className="mt-3 text-sm leading-6 text-[#bdb6a9]">Save the details, then create one private link.</p>
        <form className="mt-5 grid gap-3" onSubmit={event => {
          event.preventDefault();
          updateContact.mutate({
            shootId,
            clientName: contact.clientName.trim() || null,
            clientEmail: contact.clientEmail.trim() || null,
            clientPhone: contact.clientPhone.trim() || null,
            invitationMessage: contact.invitationMessage.trim() || null,
          });
        }}>
          <ContactField label="Client name"><Input value={contact.clientName} onChange={event => setContact({ ...contact, clientName: event.target.value })} /></ContactField>
          <ContactField label="Client email"><Input type="email" value={contact.clientEmail} onChange={event => setContact({ ...contact, clientEmail: event.target.value })} /></ContactField>
          <ContactField label="Client phone · optional"><Input type="tel" value={contact.clientPhone} onChange={event => setContact({ ...contact, clientPhone: event.target.value })} /></ContactField>
          <ContactField label="Invitation message"><Textarea maxLength={800} value={contact.invitationMessage} onChange={event => setContact({ ...contact, invitationMessage: event.target.value })} /></ContactField>
          <Button type="submit" variant="outline" disabled={updateContact.isPending} className="w-full border-white/15 bg-transparent text-[#ded5c5]">Save client details</Button>
        </form>
        <Button variant="ghost" disabled={invitation.isPending || updateContact.isPending} onClick={async () => { await updateContact.mutateAsync({ shootId, clientName: contact.clientName.trim() || null, clientEmail: contact.clientEmail.trim() || null, clientPhone: contact.clientPhone.trim() || null, invitationMessage: contact.invitationMessage.trim() || null }); invitation.mutate({ shootId, expiresInDays: 7 }); }} className="mt-2 w-full text-[#d2b98b]"><Link2 className="mr-2 size-4" /> Create private client link</Button>
        {isRecordingDemo ? (
          <p className="mt-2 text-xs leading-5 text-[#9e978b]">Recording demo mode does not call Resend. Resend delivery was verified separately; local recording mode uses a direct link.</p>
        ) : (
          <>
            <Button
              variant="outline"
              disabled={sendInvitation.isPending || updateContact.isPending || !contact.clientEmail.trim()}
              onClick={async () => {
                await updateContact.mutateAsync({ shootId, clientName: contact.clientName.trim() || null, clientEmail: contact.clientEmail.trim() || null, clientPhone: contact.clientPhone.trim() || null, invitationMessage: contact.invitationMessage.trim() || null });
                sendInvitation.mutate({ shootId, expiresInDays: 7, force: invitationAlreadySent });
              }}
              className="mt-2 w-full border-[#d2b98b]/40 bg-transparent text-[#d2b98b]"
            >
              {sendInvitation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : invitationAlreadySent ? <RefreshCw className="mr-2 size-4" /> : <Send className="mr-2 size-4" />}
              {invitationAlreadySent ? "Resend invitation" : "Send invitation"}
            </Button>
            {!contact.clientEmail.trim() ? <p className="mt-2 text-xs text-[#9e978b]">Add a client email to send the invitation by email.</p> : null}
          </>
        )}
          <section className="mt-6 border-t border-white/10 pt-5">
            <p className="mira-dark-kicker">Client communications</p>
            <h2 className="mira-dark-display mt-3 text-3xl">Preparation email sequence</h2>
            <p className="mt-3 text-xs leading-5 text-[#9e978b]">A local preview of the messages prepared for this client. Nothing is sent from this preview.</p>
            <EmailSequencePreview scheduledAt={shoot.scheduledAt} timezone={shoot.timezone} clientEmail={shoot.clientEmail} />
          </section>
        {deliveryMessage ? <p className="mt-3 text-xs leading-5 text-[#bdb6a9]">{deliveryMessage}</p> : null}
        {link ? <div className="mt-4 border border-[#d2b98b]/30 bg-black/20 p-4"><p className="text-sm text-[#ded5c5]">{isRecordingDemo ? "Demo invitation ready — no email was sent." : `Invitation ready for ${shoot.clientName || "your client"}.`}</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><Button variant="ghost" onClick={() => window.location.assign(link)} className="justify-start text-[#d2b98b]"><Link2 className="mr-2 size-3.5" /> {isRecordingDemo ? "Open client Shoot Room" : "Open client view"}</Button><Button variant="ghost" onClick={() => { void navigator.clipboard.writeText(link); setDeliveryMessage("Invitation link copied."); }} className="justify-start text-[#d2b98b]"><Copy className="mr-2 size-3.5" /> Copy link</Button></div></div> : null}
        <div className="mt-4 space-y-2">{invitations.map(item => <div key={item.id} className="flex items-center justify-between border-t border-white/10 pt-2 text-xs"><span className="uppercase tracking-[0.14em] text-[#9e978b]">{item.deliveryStatus.replaceAll("_", " ")}</span>{item.consentAcknowledgedAt ? <span className="flex items-center gap-1 text-[#d2b98b]"><Check className="size-3" /> Consent acknowledged</span> : null}</div>)}</div>
      </aside>
    </div>
    <section className="mira-dark-panel mt-6"><div className="flex items-start justify-between gap-5"><div><p className="mira-dark-kicker">Conversation record</p><h2 className="mira-dark-display mt-2 text-3xl">Preparation conversation</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-[#9e978b]">Private preparation notes for this shoot.</p></div><Button variant="outline" disabled={!qaEvents.data?.length || deleteQaEvents.isPending} onClick={() => deleteQaEvents.mutate({ shootId })} className="border-white/15 bg-transparent text-[#ded5c5]">Delete conversation notes</Button></div><div className="mt-5 space-y-3">{qaEvents.data?.length ? qaEvents.data.map(event => <article key={event.id} className="border-t border-white/10 pt-3"><p className="text-[10px] uppercase tracking-[0.16em] text-[#b7a98f]">{event.direction} · {event.modality.replaceAll("_", " ")}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#ded5c5]">{event.content}</p><p className="mt-2 text-[10px] text-[#777168]">Automatically expires {event.expiresAt.toLocaleString()}</p></article>) : <p className="text-sm text-[#9e978b]">No retained conversation notes.</p>}</div></section>
    <section className="mira-dark-panel mt-6"><p className="mira-dark-kicker">Visual input</p><h2 className="mira-dark-display mt-2 text-3xl">Shoot references</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-[#9e978b]">Upload screenshots or imagery that help clarify the shoot.</p><form className="mt-5 grid max-w-2xl gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={async event => { event.preventDefault(); if (!referenceFile) return; uploadReference.mutate({ shootId, reference: { originalName: referenceFile.name, mimeType: referenceFile.type as "image/jpeg" | "image/png" | "image/webp", base64: await fileToBase64(referenceFile), clientDescription: referenceDescription.trim() || null, evidenceKind: "observed" } }); }}><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => setReferenceFile(event.target.files?.[0] ?? null)} className="text-xs text-[#c5bfb3]" /><Textarea className="min-h-20" maxLength={800} value={referenceDescription} onChange={event => setReferenceDescription(event.target.value)} placeholder="Context for this reference" /><Button type="submit" variant="outline" disabled={!referenceFile || uploadReference.isPending} className="w-fit border-white/15 bg-transparent text-[#ded5c5]"><ImagePlus className="mr-2 size-4" />Add reference</Button></form><div className="mt-5 space-y-3">{inspection.data?.visualReferences.map((reference: any) => <article key={reference.id} className="border-t border-white/10 pt-3"><p className="text-xs text-[#ded5c5]">{reference.originalName} · {reference.uploaderRole === "client" ? "Client upload" : "Photographer upload"}</p>{reference.clientDescription ? <p className="mt-2 text-xs text-[#9e978b]">{reference.clientDescription}</p> : null}{reference.analysisJson ? <p className="mt-2 text-xs text-[#d2b98b]">Visual analysis ready.</p> : <Button variant="ghost" disabled={analyzeReference.isPending} onClick={() => analyzeReference.mutate({ shootId, assetId: reference.id })} className="mt-2 text-[#d2b98b]">Analyze visual evidence</Button>}</article>)}</div></section>
    <section className="mira-dark-panel mt-6"><p className="mira-dark-kicker">Preparation overview</p><h2 className="mira-dark-display mt-2 text-3xl">Shoot preparation</h2><p className="mt-2 text-xs leading-5 text-[#9e978b]">A compact view of the preparation already collected for this shoot.</p><div className="mt-5 grid gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-4"><SummaryStat label="Conversations" value={inspection.data?.sessions?.length ?? 0} /><SummaryStat label="Updates" value={inspection.data?.revisions?.length ?? 0} /><SummaryStat label="Summaries" value={inspection.data?.summaries?.length ?? 0} /><SummaryStat label="References" value={inspection.data?.visualReferences?.length ?? 0} /></div></section>
    <section className="mira-dark-panel mt-6"><p className="mira-dark-kicker">Creative direction</p><h2 className="mira-dark-display mt-2 text-3xl">Confirmed Creative DNA</h2>{creativeDna.data?.length ? creativeDna.data.map(record => <article key={record.id} className="mt-5 border-t border-white/10 pt-4"><p className="text-xs uppercase tracking-[0.14em] text-[#b7a98f]">Confirmed direction · {record.status.replaceAll("_", " ")}</p><p className="mt-3 text-sm text-[#ded5c5]">{record.creativeDnaJson ? "Confirmed creative direction is ready for this shoot." : "Creative DNA is not available yet."}</p></article>) : <p className="mt-4 text-sm text-[#9e978b]">No confirmed Creative DNA for this shoot.</p>}</section>
    <section className="mira-dark-panel mt-6"><p className="mira-dark-kicker">Creative direction</p><h2 className="mira-dark-display mt-2 text-3xl">Moodboard</h2>{moodboard.data?.images.length ? <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">{moodboard.data.images.map(image => <img key={image.id} src={image.url} alt={image.direction} className="aspect-[4/5] w-full rounded object-cover" />)}</div> : <p className="mt-4 text-sm text-[#9e978b]">{moodboard.data?.renderStatus === "not_configured" ? "Image generation is not configured for this environment yet." : moodboard.data?.status === "complete" ? "The moodboard is being rendered and will appear here shortly." : "No moodboard for this shoot yet - it is created once the client confirms their Discovery conversation."}</p>}</section>
  </div></PhotographerShell>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-[10px] uppercase tracking-[0.2em] text-[#8f887d]">{label}</dt><dd className="mt-2 text-sm text-[#ded5c5]">{value}</dd></div>; }
function SummaryStat({ label, value }: { label: string; value: number }) { return <div className="bg-[#151514] p-4"><p className="text-2xl text-[#d2b98b]">{value}</p><p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[#8f887d]">{label}</p></div>; }
function ContactField({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-2 text-[10px] uppercase tracking-[0.16em] text-[#9e978b]">{label}{children}</label>; }
function fileToBase64(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); }); }
