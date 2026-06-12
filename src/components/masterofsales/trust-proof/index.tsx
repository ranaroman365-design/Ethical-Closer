/**
 * Trust & Proof Layer — additive Blöcke für /masterofsales.
 *
 * Ziel: Glaubwürdigkeit & nachvollziehbare Entwicklung erhöhen, ohne
 * Identitäts-/Klarheits-Positionierung zu verwässern. Keine Einkommens-
 * versprechen, keine Placement-Garantie, keine Fake Testimonials.
 *
 * Jeder Block:
 *   - feuert 1x pro Session (sessionStorage-Guard) bei 50% Sichtbarkeit
 *   - additiver Event-Name (keine bestehenden Events verändert)
 *   - EthicalCloser Premium-Stil (ruhig · schwarz/gold · serif headings)
 *
 * Bestehende Slots, Routing, CRM, Pixel & CAPI bleiben unberührt.
 */
import { useEffect, useRef } from "react";
import { Check, ArrowDown } from "lucide-react";
import { trackFunnelEvent } from "@/lib/track-event";

/** Generischer Once-per-Session-View-Tracker mit IntersectionObserver. */
const useOnceVisible = (
  ref: React.RefObject<HTMLElement>,
  ssKey: string,
  event: string,
  payload?: Record<string, unknown>,
) => {
  useEffect(() => {
    if (typeof window === "undefined" || !ref.current) return;
    try {
      if (sessionStorage.getItem(ssKey) === "1") return;
    } catch { /* ignore */ }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting || e.intersectionRatio < 0.5) continue;
          try { sessionStorage.setItem(ssKey, "1"); } catch { /* ignore */ }
          try {
            trackFunnelEvent(event, { funnel: "masterofsales", ...(payload ?? {}) });
          } catch { /* never throw */ }
          obs.disconnect();
          break;
        }
      },
      { threshold: [0.5] },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [ref, ssKey, event]);
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. SYSTEM PROOF BLOCK — sichtbare Entwicklung statt Versprechen
// ─────────────────────────────────────────────────────────────────────────────
export const SystemProofBlock = () => {
  const ref = useRef<HTMLElement | null>(null);
  useOnceVisible(ref, "mos_system_proof_view_v1", "MASTER_SYSTEM_PROOF_VIEW");
  return (
    <section
      ref={ref}
      data-mos-section="system_proof"
      className="border-t border-foreground/10 bg-background"
    >
      <div className="mx-auto max-w-3xl px-6 py-20 md:px-10 md:py-24">
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-[0.28em] text-accent sm:text-xs sm:tracking-[0.3em]">
            System-Beweis
          </p>
          <h2 className="mt-5 font-serif text-3xl leading-tight md:text-5xl">
            Ein Weg, der sichtbar macht,
            <br />
            <span className="text-accent">was du bereits aufgebaut hast.</span>
          </h2>
        </div>

        <div className="mx-auto mt-10 max-w-2xl space-y-5 text-base leading-relaxed text-foreground/80 md:text-lg">
          <p>Fortschritt wird nicht vermutet.</p>
          <p className="text-foreground">Fortschritt wird sichtbar.</p>
          <p>
            Jeder Schritt, jede Aufgabe, jede Entwicklung baut auf dem
            vorherigen auf.
          </p>
        </div>

        {/* Premium-Level-Struktur — ruhig, nicht gamifiziert */}
        <div className="mx-auto mt-12 flex max-w-md flex-col items-stretch gap-3">
          {[
            { label: "Foundation", hint: "Grundlagen sichtbar machen" },
            { label: "Practice", hint: "Praxis statt Theorie" },
            { label: "Opportunity Readiness", hint: "Bereit für echte Chancen" },
          ].map((row, i, arr) => (
            <div key={row.label}>
              <div className="rounded-xl border border-foreground/15 bg-foreground/[0.02] px-5 py-4 text-left md:px-6 md:py-5">
                <p className="text-[10px] uppercase tracking-[0.22em] text-accent sm:text-xs">
                  Stufe {i + 1}
                </p>
                <p className="mt-1 font-serif text-lg leading-snug text-foreground md:text-xl">
                  {row.label}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-foreground/60 md:text-sm">
                  {row.hint}
                </p>
              </div>
              {i < arr.length - 1 && (
                <div className="flex justify-center py-2 text-foreground/35">
                  <ArrowDown className="h-4 w-4" aria-hidden />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. REALITY BLOCK — kein Versprechen, kein Abkürzungs-System
// ─────────────────────────────────────────────────────────────────────────────
export type RealityCopyVariant = "no_shortcut" | "no_promise";

const REALITY_HEADLINE: Record<RealityCopyVariant, string> = {
  no_shortcut: "Kein Versprechen. Kein Abkürzungs-System.",
  no_promise: "Keine Versprechen. Nur nachvollziehbare Entwicklung.",
};

export const RealityBlock = ({ variant }: { variant: RealityCopyVariant }) => {
  const ref = useRef<HTMLElement | null>(null);
  useOnceVisible(ref, "mos_reality_block_view_v1", "MASTER_REALITY_BLOCK_VIEW", {
    reality_copy: variant,
  });
  return (
    <section
      ref={ref}
      data-mos-section="reality_block"
      className="border-t border-foreground/10 bg-foreground/[0.02]"
    >
      <div className="mx-auto max-w-3xl px-6 py-20 text-center md:px-10 md:py-24">
        <p className="text-[10px] uppercase tracking-[0.28em] text-accent sm:text-xs sm:tracking-[0.3em]">
          Ehrliche Realität
        </p>
        <h2 className="mt-5 font-serif text-3xl leading-tight md:text-4xl">
          {REALITY_HEADLINE[variant]}
        </h2>
        <div className="mx-auto mt-8 max-w-xl space-y-4 text-base leading-relaxed text-foreground/80 md:text-lg">
          <p>Nicht jeder geht denselben Weg.</p>
          <p>Nicht jeder entwickelt sich gleich schnell.</p>
          <p className="text-foreground">
            Deshalb basiert Master of Sales nicht auf Hoffnungen.
          </p>
          <p className="font-serif italic text-foreground/85">
            Sondern auf nachvollziehbarer Entwicklung.
          </p>
        </div>
      </div>
    </section>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. TRANSPARENCY BLOCK — du musst niemandem glauben
// ─────────────────────────────────────────────────────────────────────────────
export type TransparencyAngle = "kontrolle" | "klarheit";

const TRANSPARENCY_EYEBROW: Record<TransparencyAngle, string> = {
  kontrolle: "Volle Kontrolle",
  klarheit: "Volle Klarheit",
};

export const TransparencyBlock = ({ angle }: { angle: TransparencyAngle }) => {
  const ref = useRef<HTMLElement | null>(null);
  useOnceVisible(ref, "mos_transparency_view_v1", "MASTER_TRANSPARENCY_BLOCK_VIEW", {
    transparency_angle: angle,
  });
  return (
    <section
      ref={ref}
      data-mos-section="transparency"
      className="border-t border-foreground/10 bg-background"
    >
      <div className="mx-auto max-w-3xl px-6 py-20 md:px-10 md:py-24">
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-[0.28em] text-accent sm:text-xs sm:tracking-[0.3em]">
            {TRANSPARENCY_EYEBROW[angle]}
          </p>
          <h2 className="mt-5 font-serif text-3xl leading-tight md:text-5xl">
            Du musst niemandem glauben.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-foreground/75 md:text-lg">
            Du siehst jederzeit:
          </p>
        </div>

        <ul className="mx-auto mt-8 grid max-w-xl gap-3">
          {[
            "wo du stehst",
            "was du bereits geschafft hast",
            "welcher Schritt als Nächstes folgt",
          ].map((t) => (
            <li
              key={t}
              className="flex items-start gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.02] px-5 py-4"
            >
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <span className="text-base leading-relaxed text-foreground/85 md:text-lg">
                {t}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. PROOF THROUGH PROCESS — Weg statt Ergebnis
// ─────────────────────────────────────────────────────────────────────────────
export const ProcessProofBlock = () => {
  const ref = useRef<HTMLElement | null>(null);
  useOnceVisible(ref, "mos_process_proof_view_v1", "MASTER_PROCESS_PROOF_VIEW");
  const steps = [
    { eyebrow: "Vorher", text: "Ich weiß nicht, wo ich anfangen soll." },
    { eyebrow: "Schritt 1", text: "Analyse" },
    { eyebrow: "Schritt 2", text: "Foundation" },
    { eyebrow: "Schritt 3", text: "Praxiserfahrung" },
    { eyebrow: "Schritt 4", text: "Nächste Möglichkeiten" },
  ];
  return (
    <section
      ref={ref}
      data-mos-section="process_proof"
      className="border-t border-foreground/10 bg-foreground/[0.02]"
    >
      <div className="mx-auto max-w-4xl px-6 py-20 md:px-10 md:py-24">
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-[0.28em] text-accent sm:text-xs sm:tracking-[0.3em]">
            Beweis durch Prozess
          </p>
          <h2 className="mt-5 font-serif text-3xl leading-tight md:text-5xl">
            Wir zeigen keine Ergebnisse.
            <br />
            <span className="text-accent">Wir zeigen den Weg.</span>
          </h2>
        </div>

        <ol className="mx-auto mt-12 max-w-xl space-y-3">
          {steps.map((s, i) => (
            <li key={s.eyebrow}>
              <div
                className={`rounded-xl border px-5 py-4 md:px-6 md:py-5 ${
                  i === 0
                    ? "border-foreground/15 bg-background"
                    : "border-accent/25 bg-accent/[0.04]"
                }`}
              >
                <p className="text-[10px] uppercase tracking-[0.22em] text-accent sm:text-xs">
                  {s.eyebrow}
                </p>
                <p
                  className={`mt-1 leading-snug ${
                    i === 0
                      ? "font-serif text-lg italic text-foreground/75 md:text-xl"
                      : "font-serif text-lg text-foreground md:text-xl"
                  }`}
                >
                  {s.text}
                </p>
              </div>
              {i < steps.length - 1 && (
                <div className="flex justify-center py-2 text-foreground/35">
                  <ArrowDown className="h-4 w-4" aria-hidden />
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. ETHICAL TRUST STRIP — kompakte 4-Punkt-Leiste vor CTA
// ─────────────────────────────────────────────────────────────────────────────
export const EthicalTrustStrip = ({
  positionKey,
}: {
  positionKey: "before_first_cta" | "before_sticky_cta";
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useOnceVisible(
    ref as React.RefObject<HTMLElement>,
    `mos_ethics_strip_view_v1_${positionKey}`,
    "MASTER_ETHICS_STRIP_VIEW",
    { ethics_strip_position: positionKey },
  );
  const items = [
    "keine Einkommensversprechen",
    "keine Placement-Garantie",
    "keine künstliche Knappheit",
    "klare Entwicklungsschritte",
  ];
  return (
    <div
      ref={ref}
      data-mos-section={`ethics_strip_${positionKey}`}
      className="mx-auto mb-6 max-w-2xl rounded-2xl border border-accent/25 bg-foreground/[0.02] p-4 md:p-5"
    >
      <p className="text-[10px] uppercase tracking-[0.24em] text-accent sm:text-xs">
        Unser ethischer Standard
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
            <span className="text-[12px] leading-relaxed text-foreground/80 sm:text-[13px]">
              {it}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. WHY THIS EXISTS — System-Existenzberechtigung (kein Gründerkult)
// ─────────────────────────────────────────────────────────────────────────────
export const WhyExistsBlock = () => {
  const ref = useRef<HTMLElement | null>(null);
  useOnceVisible(ref, "mos_why_exists_view_v1", "MASTER_WHY_EXISTS_VIEW");
  return (
    <section
      ref={ref}
      data-mos-section="why_exists"
      className="border-t border-foreground/10 bg-background"
    >
      <div className="mx-auto max-w-3xl px-6 py-20 md:px-10 md:py-24">
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-[0.28em] text-accent sm:text-xs sm:tracking-[0.3em]">
            Warum dieses System
          </p>
          <h2 className="mt-5 font-serif text-3xl leading-tight md:text-5xl">
            Warum dieses System entstanden ist
          </h2>
        </div>
        <div className="mx-auto mt-10 max-w-xl space-y-5 text-base leading-relaxed text-foreground/80 md:text-lg">
          <p>Viele Programme konzentrieren sich auf Motivation.</p>
          <p>Viele Programme konzentrieren sich auf Inhalte.</p>
          <p className="font-serif italic text-foreground/90">
            Master of Sales wurde entwickelt, um Fortschritt sichtbar zu machen.
          </p>
        </div>
      </div>
    </section>
  );
};
