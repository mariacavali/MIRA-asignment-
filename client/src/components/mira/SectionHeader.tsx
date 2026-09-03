export function SectionHeader({ index, title, subtitle }: { index: string; title: string; subtitle: string }) {
  return (
    <div>
      <p className="mira-dark-kicker">{index} — {title}</p>
      <p className="mt-2 text-sm text-[#c5bfb3]">{subtitle}</p>
    </div>
  );
}
