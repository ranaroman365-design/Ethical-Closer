/**
 * Phase 9.7 · Section A — "Worauf das alles hinausläuft."
 *
 * Additive narrative bridge that makes the END RESULT (Kompetenz) tangible
 * just before the hero quiz CTA. Rendered ONLY when the `mos_end_result_angle`
 * AB slot variant !== "control" — default state is invisible.
 *
 * No tracking, scoring, or routing logic. Pure presentation.
 * Roll back: set variant to `control` (Thompson Sampling) or remove mount.
 */
import closerImg from "@/assets/lp-proof-p94/community-zoom-v5.png.asset.json";

interface EndResultSectionProps {
  /** Optional id for SectionViewTracker / anchor links. */
  id?: string;
}

const CARDS = [
  {
    eyebrow: "01",
    title: "Professionelle Gesprächsführung",
    body: "Lerne Gespräche strukturiert zu führen, statt auf Zufall zu hoffen.",
  },
  {
    eyebrow: "02",
    title: "Verkaufspsychologie verstehen",
    body: "Verstehe Menschen, Entscheidungen und Einwände.",
  },
  {
    eyebrow: "03",
    title: "Als Closer einsatzbereit werden",
    body: "Wissen reicht nicht. Du trainierst, bis du es anwenden kannst.",
  },
] as const;

export default function EndResultSection({ id }: EndResultSectionProps) {
  return (
    <section
      id={id}
      aria-label="Worauf das alles hinausläuft"
      className="mb-10 rounded-3xl border border-foreground/10 bg-foreground/[0.015] p-6 md:p-10"
    >
      <div className="grid gap-8 md:grid-cols-[1.1fr_0.9fr] md:items-center">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-foreground/55">
            Endergebnis
          </p>
          <h2 className="mt-3 font-serif text-[28px] leading-[1.15] text-foreground md:text-[36px]">
            Worauf das alles hinausläuft.
          </h2>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-foreground/75 md:text-lg">
            Das Ziel ist nicht Motivation.
            <br className="hidden sm:block" />
            Das Ziel ist Kompetenz.
          </p>

          <ul className="mt-7 grid gap-4 sm:gap-5">
            {CARDS.map((c) => (
              <li
                key={c.eyebrow}
                className="rounded-2xl border border-foreground/10 bg-background/60 p-4 md:p-5"
              >
                <div className="flex items-baseline gap-3">
                  <span className="text-[11px] font-medium tracking-[0.22em] text-accent">
                    {c.eyebrow}
                  </span>
                  <h3 className="font-serif text-lg text-foreground md:text-xl">
                    {c.title}
                  </h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-foreground/70 md:text-base">
                  {c.body}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative overflow-hidden rounded-2xl">
          <img
            src={closerImg.url}
            alt="Professioneller Closer im Kundengespräch"
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-foreground/40 to-transparent" />
          <p className="absolute bottom-3 left-4 right-4 text-[11px] uppercase tracking-[0.22em] text-background/95">
            Professioneller Closer im Kundengespräch
          </p>
        </div>
      </div>
    </section>
  );
}
