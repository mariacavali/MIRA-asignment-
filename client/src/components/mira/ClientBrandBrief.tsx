import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { BRAND_FEEL_OPTIONS, POSING_SUPPORT_OPTIONS, type ClientBriefInput } from "@shared/miraClientBrief";

const blank: ClientBriefInput = { brandFeel: [], posingSupport: null, comfortNote: "", brandUrls: [] };

export function ClientBrandBrief({ token, confirmed, onPendingChange }: { token: string; confirmed: boolean; onPendingChange: (pending: boolean) => void }) {
  const query = trpc.miraCore.getClientBrief.useQuery({ token }, { retry: false });
  const utils = trpc.useUtils();
  const [form, setForm] = useState<ClientBriefInput>(blank);
  const [dirty, setDirty] = useState(false);
  const save = trpc.miraCore.saveClientBrief.useMutation({
    onSuccess: result => { utils.miraCore.getClientBrief.setData({ token }, result); setDirty(false); },
  });
  useEffect(() => {
    if (dirty) return;
    const saved = query.data;
    setForm(saved ? { brandFeel: saved.brandFeel, posingSupport: saved.posingSupport, comfortNote: saved.comfortNote, brandUrls: saved.brandPages.map(page => page.url) } : blank);
  }, [query.data, dirty]);
  function change(patch: Partial<ClientBriefInput>) { setForm(current => ({ ...current, ...patch })); setDirty(true); save.reset(); }
  const busy = save.isPending || query.isLoading || query.isError;
  useEffect(() => { onPendingChange(!confirmed && (dirty || save.isPending)); }, [confirmed, dirty, save.isPending, onPendingChange]);
  return <section className="mb-8 border-b border-white/10 pb-8" aria-label="Your brand and posing preferences">
    <h3 className="mira-dark-display text-3xl">Make this shoot feel like you.</h3>
    <p className="mt-3 text-sm leading-6 text-[#c5bfb3]">Optional choices to help MIRA prepare your moodboard and simple posing suggestions. Your conversation will confirm the direction.</p>
    {query.isError && <p role="alert" className="mt-3 text-sm text-red-200">Your saved choices could not be loaded. <button type="button" className="underline" onClick={() => void query.refetch()}>Try again</button></p>}
    <form onSubmit={event => { event.preventDefault(); if (!busy && !confirmed) save.mutate({ token, brief: { ...form, brandUrls: form.brandUrls.filter(url => url.trim()) } }); }}>
      <fieldset disabled={busy || confirmed} className="mt-6 disabled:opacity-70">
        <legend className="text-sm text-[#ded5c5]">How should your brand feel? <span className="text-[#b7a98f]">Choose up to 3.</span></legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {BRAND_FEEL_OPTIONS.map(option => <label key={option} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${form.brandFeel.includes(option) ? "border-[#d2b98b] bg-[#d2b98b]/10" : "border-white/20"}`}>
            <input type="checkbox" checked={form.brandFeel.includes(option)} disabled={!form.brandFeel.includes(option) && form.brandFeel.length >= 3} onChange={event => change({ brandFeel: event.target.checked ? [...form.brandFeel, option] : form.brandFeel.filter(value => value !== option) })} className="accent-[#d2b98b]" />{option}
          </label>)}
        </div>
      </fieldset>
      <fieldset disabled={busy || confirmed} className="mt-6 disabled:opacity-70">
        <legend className="text-sm text-[#ded5c5]">What would help you feel comfortable?</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{POSING_SUPPORT_OPTIONS.map(option => <label key={option} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${form.posingSupport === option ? "border-[#d2b98b] bg-[#d2b98b]/10" : "border-white/20"}`}><input type="radio" name="posing-support" checked={form.posingSupport === option} onChange={() => change({ posingSupport: option })} className="accent-[#d2b98b]" />{option}</label>)}</div>
        <label className="mt-4 block text-sm text-[#b7a98f]">Anything you want us to adapt or avoid? <span>(Optional)</span><textarea value={form.comfortNote} maxLength={300} onChange={event => change({ comfortNote: event.target.value })} placeholder="For example: no floor poses, or please help me with my hands." className="rounded-lg border border-white/20 bg-[#242320] px-3 py-3 text-[#f1eadc] placeholder:text-[#9e978b] focus:outline-none focus:ring-2 focus:ring-[#d2b98b] mt-2 min-h-20 w-full" /></label>
      </fieldset>
      <fieldset disabled={busy || confirmed} className="mt-6 disabled:opacity-70">
        <legend className="text-sm text-[#ded5c5]">Your brand links <span className="text-[#b7a98f]">Optional · up to 3</span></legend>
        <p className="mt-2 text-sm leading-6 text-[#b7a98f]">Add your website, About page or a public brand page. MIRA reads page text when you save. For colours, layouts and social pages that require login, upload a screenshot under “My current brand”.</p>
        {form.brandUrls.map((url, index) => <div key={index} className="mt-3 flex items-center gap-2"><input aria-label={`Brand link ${index + 1}`} type="text" inputMode="url" maxLength={1024} value={url} onChange={event => change({ brandUrls: form.brandUrls.map((value, i) => i === index ? event.target.value : value) })} placeholder="https://yourbrand.com" className="rounded-lg border border-white/20 bg-[#242320] px-3 py-3 text-[#f1eadc] placeholder:text-[#9e978b] focus:outline-none focus:ring-2 focus:ring-[#d2b98b] min-w-0 flex-1" /><button type="button" aria-label={`Remove brand link ${index + 1}`} className="min-h-11 px-2 text-sm underline" onClick={() => change({ brandUrls: form.brandUrls.filter((_, i) => i !== index) })}>Remove</button></div>)}
        {form.brandUrls.length < 3 && <button type="button" className="mt-2 min-h-11 text-sm text-[#d2b98b] underline" onClick={() => change({ brandUrls: [...form.brandUrls, ""] })}>+ Add brand link</button>}
      </fieldset>
      {!confirmed && <button type="submit" disabled={busy || (!dirty && !query.data?.brandPages.some(page => page.status === "unavailable"))} className="mt-5 min-h-11 rounded-full bg-[#d2b98b] px-6 py-3 text-sm font-medium text-[#171613] disabled:opacity-50">{save.isPending ? "Saving and reading your links…" : form.brandUrls.some(url => url.trim()) ? "Save choices & read links" : "Save my choices"}</button>}
      {dirty && !save.isPending && <button type="button" className="ml-3 mt-3 min-h-11 text-sm text-[#b7a98f] underline" onClick={() => { setDirty(false); save.reset(); }}>Discard unsaved changes</button>}
      {save.isError && <p role="alert" className="mt-3 text-sm text-red-200">{save.error.data?.code === "BAD_REQUEST" ? "Check your links: use public HTTPS addresses without login details." : save.error.data?.code === "PRECONDITION_FAILED" ? "Your direction is already confirmed. Discuss changes with your photographer." : save.error.data?.code === "TOO_MANY_REQUESTS" ? "Please wait a minute before reading more links. Your changes are still here." : "Your choices could not be saved. Please wait a moment and try again."}</p>}
      <p role="status" className="mt-3 text-sm text-[#d2b98b]">{dirty ? "Changes not saved yet." : query.data ? "Your choices are saved for MIRA." : "These choices are optional."}{confirmed ? " Your creative direction is confirmed; ask your photographer about changes." : ""}</p>
    </form>
    {!dirty && query.data?.brandPages.map(page => <div key={page.url} className="mt-3 rounded-lg border border-white/10 p-4 text-sm text-[#c5bfb3]">
      <a href={page.url} target="_blank" rel="noopener noreferrer" className="break-words text-[#d2b98b] underline">{page.url}</a>
      <p className="mt-2">{page.status === "read" ? "Page text read. Tell MIRA if this page no longer reflects your brand." : "Link saved, but MIRA could not read this page. Upload a screenshot or describe it during your conversation."}</p>
      {page.status === "read" && <details className="mt-2"><summary className="cursor-pointer text-[#d2b98b]">See the text MIRA will use</summary><p className="mt-3 font-medium">{page.title}</p><p className="mt-2 max-h-48 overflow-y-auto leading-6">{page.excerpt}</p></details>}
    </div>)}
  </section>;
}
