/**
 * IdentityRecognitionBlock — "Vielleicht erkennst du dich wieder".
 * 3 ruhige Karten direkt unter Hero. Reine Identifikation, kein CTA.
 * A/B (mos_identity_block) variiert nur die Card-Copy (control | alt).
 * Feuert MASTER_IDENTITY_VIEW 1x/Session bei 50% Sichtbarkeit.
 */
import { useEffect, useRef } from "react";
import { trackFunnelEvent } from "@/lib/track-event";

const SS_KEY = "mos_identity_view_v1";

interface Card { title: string; body: string }

const COPY: Record<string, Card[]> = {
  control: [
    { title: "Mehr Potenzial, kein klarer Weg",
      body: "Du hast das Gefühl, dass mehr in dir steckt — aber dir fehlt ein klarer Weg." },
    { title: "Verantwortung, kein klassischer Vertrieb",
      body: "Du willst Verantwortung übernehmen, aber nicht in einem klassischen Vertriebsumfeld landen." },
    { title: "Entwicklung statt Motivationssprüche",
      body: "Du suchst echte Entwicklung — keine leeren Motivationssprüche." },
  ],
  alt: [
    { title: "Du spürst Stillstand",
      body: "Routine, kein Sog. Du willst Bewegung, aber in eine Richtung, die wirklich zu dir passt." },
    { title: "Du willst Substanz, keine Show",
      body: "Klare Fähigkeiten statt großer Bühne. Wirkung statt Selbstdarstellung." },
    { title: "Du willst wissen, wo du stehst",
      body: "Bevor du etwas Neues beginnst, willst du eine ehrliche Standortbestimmung — kein Pitch." },
  ],
};

const IdentityRecognitionBlock = ({ variant }: { variant: "control" | "alt" }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const cards = COPY[variant] ?? COPY.control;

  useEffect(() => {
    if (typeof window === "undefined" || !ref.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting || e.intersectionRatio < 0.5) continue;
          try {
            if (sessionStorage.getItem(SS_KEY) !== "1") {
              sessionStorage.setItem(SS_KEY, "1");
              trackFunnelEvent("MASTER_IDENTITY_VIEW", {
                funnel: "masterofsales",
                identity_variant: variant,
              });
            }
          } catch { /* noop */ }
          obs.disconnect();
          break;
        }
      },
      { threshold: [0.5] },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [variant]);

  return (
    <section
      ref={ref}
      data-mos-section="identity_recognition"
      className="border-t border-foreground/10 bg-background"
    >
      <div className="mx-auto max-w-5xl px-6 py-20 md:px-10 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[10px] uppercase tracking-[0.28em] text-accent sm:text-xs sm:tracking-[0.3em]">
            Vielleicht erkennst du dich wieder
          </p>
          <h2 className="mt-5 font-serif text-3xl leading-tight md:text-5xl">
            Drei stille Sätze. Einer könnte deiner sein.
          </h2>
        </div>

        <ul className="mt-12 grid gap-5 md:grid-cols-3">
          {cards.map((c) => (
            <li
              key={c.title}
              className="flex h-full flex-col gap-3 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-6 md:p-7"
            >
              <p className="font-serif text-lg leading-snug text-foreground md:text-xl">
                {c.title}
              </p>
              <p className="text-sm leading-relaxed text-foreground/70 md:text-base">
                {c.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default IdentityRecognitionBlock;
