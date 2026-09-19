import { ArrowRight, Check } from "lucide-react";

export default function MiraLanding() {
  return (
    <main className="mira-dark-surface min-h-screen px-5 py-8 text-[#f1eadc] sm:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between border-b border-white/10 pb-6">
          <span className="mira-dark-display text-2xl">MIRA</span>
          <a
            href="/mira/dashboard"
            className="rounded-full border border-white/20 px-5 py-3 text-sm text-[#ded5c5]"
          >
            Log in / My shoots
          </a>
        </header>
        <section className="grid gap-8 py-12 sm:py-16 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <div>
            <p className="mira-dark-kicker">For remote photographers</p>
            <h1 className="mira-dark-display mt-5 text-4xl leading-tight sm:text-5xl">
              A prepared client.
              <br />A clearer shoot.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-[#c9c3b7]">
              Invite your client to one private Shoot Room. MIRA guides their
              preparation, gathers references and creates a moodboard for you to
              review together.
            </p>
          </div>
          <aside className="mira-dark-panel p-6 sm:p-8">
            <p className="mira-dark-kicker">MIRA for photographers</p>
            <p className="mt-5 text-4xl text-[#d2b98b]">
              €33.33 <span className="text-base text-[#b7a98f]">one-time</span>
            </p>
            <p className="mt-2 text-sm text-[#c9c3b7]">
              One payment. No recurring charges.
            </p>
            <a
              href="/mira/signup"
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#d2b98b] px-6 font-medium text-[#171613] hover:bg-[#e0c99e]"
            >
              Get MIRA <ArrowRight className="ml-2 size-4" />
            </a>
            <p className="mt-3 text-center text-xs leading-5 text-[#b7a98f]">
              Create your account, then pay securely with Stripe.
            </p>
          </aside>
        </section>
        <section
          className="border-t border-white/10 py-10"
          aria-labelledby="mira-how-it-works"
        >
          <h2 id="mira-how-it-works" className="mira-dark-display text-3xl">
            Three steps to your next shoot.
          </h2>
          <ol className="mt-7 grid gap-7 sm:grid-cols-3">
            {[
              ["Create your shoot", "Add the client, date and location."],
              [
                "Invite your client",
                "Send one private link. Your client prepares with MIRA using voice or text and optional images.",
              ],
              [
                "Review and get ready",
                "Check their direction, moodboard and shoot guidance. You keep creative control.",
              ],
            ].map(([title, description], index) => (
              <li key={title} className="border-t border-white/15 pt-5">
                <span className="text-sm text-[#d2b98b]">0{index + 1}</span>
                <h3 className="mira-dark-display mt-3 text-2xl">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#c9c3b7]">
                  {description}
                </p>
              </li>
            ))}
          </ol>
        </section>
        <details className="border-y border-white/10 py-5">
          <summary className="cursor-pointer py-2 text-sm font-medium text-[#d2b98b]">
            What does MIRA help the client prepare?
          </summary>
          <ul className="mt-4 grid gap-3 pb-3 text-sm leading-6 text-[#c9c3b7] sm:grid-cols-2">
            {[
              "The purpose and feeling of the photographs",
              "Location, light, clothes and practical needs",
              "Brand context and visual references",
              "A shared moodboard and simple shoot guidance",
            ].map(item => (
              <li key={item} className="flex gap-2">
                <Check className="mt-1 size-4 shrink-0 text-[#d2b98b]" />
                {item}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </main>
  );
}
