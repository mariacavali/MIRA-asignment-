import { ArrowRight } from "lucide-react";

export default function MiraLanding() {
  return (
    <main className="mira-dark-surface min-h-screen px-5 py-8 text-[#f1eadc] sm:px-10 sm:py-12">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-white/10 pb-6 mb-20 lg:mb-24">
          <span className="mira-dark-display text-2xl">MIRA</span>
        </header>

        {/* 1. HERO SECTION */}
        <section className="mb-20 lg:mb-32">
          <p className="mira-dark-kicker mb-6">For remote photographers</p>
          <h1 className="mira-dark-display text-4xl sm:text-5xl leading-[1.15] mb-10">
            Better shoots begin before the camera turns on.
          </h1>
          <p className="text-base leading-7 text-[#c9c3b7] max-w-2xl mb-10">
            Remote photography is still new. Clients often do not understand how it works, what they need to prepare or what it will feel like to be photographed through their phone.
          </p>
          <p className="text-base leading-7 text-[#c9c3b7] max-w-2xl mb-10">
            MIRA prepares your client for the remote shoot, so you can arrive with shared direction, fewer loose ends and more space for the photographs that matter.
          </p>
          <a href="/mira/checkout" className="inline-flex h-11 items-center rounded-full bg-[#d2b98b] px-8 text-sm font-medium text-[#171613] hover:bg-[#e0c99e]">
            Prepare your next shoot <ArrowRight className="ml-2 size-4" />
          </a>
        </section>
        {/* 2. PROBLEM SECTION */}
        <section className="mb-20 lg:mb-32">
          <h2 className="mira-dark-display text-3xl sm:text-4xl leading-[1.2] mb-10">
            "Remote photography? How does that work?"
          </h2>
          <p className="text-base leading-7 text-[#c9c3b7] max-w-3xl mb-8">
            How many times have you heard that question? Then come the others: Do I need a professional camera? Where should I place my phone? What should I wear? Where should we photograph? How will you direct me? Do I need to know how to pose?
          </p>
          <p className="text-base leading-7 text-[#c9c3b7] max-w-3xl mb-8">
            Remote photography gives photographers extraordinary freedom, but the experience is still unfamiliar to most clients. When the client does not understand the process, the photographer becomes responsible for explaining, reminding, planning and reassuring before every shoot.
          </p>
          <p className="text-base leading-7 text-[#c9c3b7] max-w-3xl mb-8">
            More messages. More repeated instructions. More last-minute uncertainty. Less creative attention available for the shoot itself.
          </p>
          <p className="text-base leading-7 text-[#c9c3b7] max-w-3xl">
            MIRA was created to hold that preparation.
          </p>
        </section>

        {/* 3. HOW IT WORKS SECTION */}
        <section className="mb-20 lg:mb-32">
          <h2 className="mira-dark-kicker mb-12">From booking to ready to photograph</h2>
          <div className="grid gap-10 sm:grid-cols-2 lg:gap-16">
            <div>
              <h3 className="mira-dark-display text-2xl text-[#d2b98b] mb-4">Create the shoot</h3>
              <p className="text-sm leading-6 text-[#a9a296]">Add the client, date and essential shoot details once.</p>
            </div>
            <div>
              <h3 className="mira-dark-display text-2xl text-[#d2b98b] mb-4">Invite your client</h3>
              <p className="text-sm leading-6 text-[#a9a296]">Your client enters a private preparation room created for her shoot.</p>
            </div>
            <div>
              <h3 className="mira-dark-display text-2xl text-[#d2b98b] mb-4">Let MIRA guide the preparation</h3>
              <p className="text-sm leading-6 text-[#a9a296]">MIRA explains how remote photography works and speaks with your client about the purpose, feeling and practical needs of the photographs.</p>
            </div>
            <div>
              <h3 className="mira-dark-display text-2xl text-[#d2b98b] mb-4">Review the direction</h3>
              <p className="text-sm leading-6 text-[#a9a296]">Receive the collected details and generated moodboard before the session.</p>
            </div>
            <div>
              <h3 className="mira-dark-display text-2xl text-[#d2b98b] mb-4">Arrive ready to photograph</h3>
              <p className="text-sm leading-6 text-[#a9a296]">Connect with a client who understands the process and is better prepared to be directed.</p>
            </div>
          </div>
        </section>

        {/* 4. WHAT MIRA HANDLES SECTION */}
        <section className="mb-20 lg:mb-32">
          <h2 className="mira-dark-kicker mb-10">What MIRA holds before the shoot</h2>
          <div className="grid gap-3 max-w-3xl">
            <p className="text-base leading-7 text-[#c9c3b7]">
              • Adds the confirmed shoot to the calendar<br/>
              • Sends client email notifications and reminders<br/>
              • Explains the remote-photography process<br/>
              • Prepares the client through a guided voice conversation<br/>
              • Collects the shoot purpose and desired feeling<br/>
              • Asks about location, light, wardrobe and practical needs<br/>
              • Generates a coherent moodboard<br/>
              • Brings the preparation together for the photographer to review
            </p>
          </div>
          <p className="text-base leading-7 text-[#c9c3b7] max-w-3xl mt-10">
            This is one guided pathway replacing scattered emails, repeated explanations and disconnected preparation forms.
          </p>
        </section>

        {/* 5. FINAL PURCHASE SECTION */}
        <section id="final-purchase" className="border-t border-white/10 pt-20">
          <p className="mira-dark-kicker mb-8">One simple plan</p>
          <h2 className="mira-dark-display text-4xl sm:text-5xl mb-8">MIRA for photographers</h2>
          <p className="text-base leading-7 text-[#c9c3b7] max-w-3xl mb-6">
            A private preparation experience for your remote-shoot clients. Your client receives clear guidance before the session. You receive the essential practical and creative direction in one place. The result is a better-prepared client and more space for a better shoot.
          </p>
          <div className="mt-12 mb-10">
            <p className="text-5xl sm:text-6xl font-bold text-[#d2b98b] mb-2">€33.33/month</p>
          </div>
          <a href="/mira/checkout" className="inline-flex h-12 items-center rounded-full bg-[#d2b98b] px-10 text-base font-medium text-[#171613] hover:bg-[#e0c99e] mb-8">
            Buy MIRA <ArrowRight className="ml-2 size-5" />
          </a>
          <p className="text-sm text-[#b7a98f]">
            <a href="/mira/login" className="underline hover:text-[#f1eadc]">Already have an account? Photographer login</a>
          </p>
        </section>
      </div>
    </main>
  );
}