import { buildMiraEmailSequence } from "@shared/miraEmailSequence";

export function EmailSequencePreview({ scheduledAt, timezone, clientEmail }: { scheduledAt: Date | null; timezone: string; clientEmail: string | null }) {
  if (!scheduledAt) return <p className="mt-4 text-sm text-[#9e978b]">Add a shoot date and time to preview the preparation emails.</p>;
  const invitationSentAt = new Date();
  const sequence = buildMiraEmailSequence({ shootId: 0, scheduledAt, timeZone: timezone, clientEmail, invitationSentAt });
  if (sequence.every(email => email.status !== "scheduled")) return <p className="mt-4 text-sm text-[#9e978b]">This shoot has already started, so no preparation emails will be queued.</p>;
  return <div className="mt-5 space-y-3">{sequence.filter(email => email.status === "scheduled").map(email => <article key={email.id} className="border-t border-white/10 pt-3"><div className="flex flex-wrap justify-between gap-2 text-sm text-[#ded5c5]"><span>{email.name}</span><span className="text-xs text-[#b7a98f]">{email.scheduledAt <= invitationSentAt ? "send now" : "scheduled"} · {email.scheduledAt.toLocaleString([], { dateStyle: "medium", timeStyle: "short", timeZone: timezone })}</span></div><p className="mt-1 text-xs text-[#9e978b]">{clientEmail ? `Prepared for ${clientEmail}` : "Waiting for a client email"} · same private Shoot Room link</p></article>)}</div>;
}
