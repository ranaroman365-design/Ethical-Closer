/**
 * ShowUpPsychologyBlock — Erwartungsmanagement vor dem Closing-CTA.
 *
 * Reines Frontend: definiert klar, was im Gespräch passiert,
 * ohne Verkaufsdruck. Erhöht Show-Up, weil Unsicherheit reduziert wird.
 */
import { Check } from "lucide-react";

const ShowUpPsychologyBlock = () => (
  <section
    data-mos-section="show_up_psychology"
    className="border-t border-foreground/10 bg-background"
  >
    <div className="mx-auto max-w-3xl px-6 py-20 md:px-10 md:py-24">
      <div className="text-center">
        <p className="text-[10px] uppercase tracking-[0.28em] text-accent sm:text-xs sm:tracking-[0.3em]">
          Was dich erwartet
        </p>
        <h2 className="mt-5 font-serif text-2xl leading-tight md:text-4xl">
          Kein Druck. Kein klassischer Sales-Call.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-foreground/70">
          Das Gespräch ist dafür da, herauszufinden, ob dieser Weg
          überhaupt zu dir passt — beidseitig ehrlich.
        </p>
      </div>

      <ul className="mx-auto mt-10 grid max-w-xl gap-4 text-left text-sm leading-relaxed text-foreground/80 md:text-base">
        {[
          "Klare Orientierung statt Pitch.",
          "Wir hören zu, wo du heute stehst und wohin du willst.",
          "Du bekommst eine ehrliche Einschätzung — auch wenn es nicht passt.",
          "Kein Skript. Kein Druck. Keine Verpflichtung.",
        ].map((line) => (
          <li key={line} className="flex items-start gap-3">
            <Check className="mt-1 h-4 w-4 shrink-0 text-accent" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  </section>
);

export default ShowUpPsychologyBlock;
