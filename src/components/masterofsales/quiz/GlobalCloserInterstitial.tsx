/**
 * MOS → GlobalCloser Interstitial.
 *
 * Shown only for MOS-attributed sessions whose avatar filter resolved to
 * `redirect_globalcloser`. Communicates honestly (no income/job guarantees),
 * gives a clear CTA to https://joinglobalcloser.com/ and an explicit
 * "Trotzdem im Karriereweg bleiben" escape hatch.
 */
import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { fireMosCroEvent } from "@/lib/mos-cro-events";
import { GLOBALCLOSER_URL } from "@/lib/mos-development-score";

interface Props {
  variant: string; // mos_avatar_filter_copy slot variant
  routingReason: string;
  devScore: number;
  cluster: string;
  onStay: () => void;
}

export function GlobalCloserInterstitial({
  variant,
  routingReason,
  devScore,
  cluster,
  onStay,
}: Props) {
  useEffect(() => {
    fireMosCroEvent("MASTER_GLOBALCLOSER_REDIRECT", variant, {
      routing_reason: routingReason,
      development_score: devScore,
      qualification_cluster: cluster,
      redirect_target: GLOBALCLOSER_URL,
    });
  }, [variant, routingReason, devScore, cluster]);

  const lines =
    variant === "alt"
      ? [
          "Du willst aktuell direkt ins Tun kommen, nicht zuerst lernen.",
          "GlobalCloser ist der schnellere Einstieg, wenn du bereits Grundlagen hast und dich beweisen willst.",
          "Mit Testleads kannst du dort zeigen, was du kannst.",
        ]
      : [
          "Du suchst aktuell keine Ausbildung, sondern eine Möglichkeit ins Tun zu kommen.",
          "Wenn du bereits Grundlagen hast und dich beweisen willst, passt GlobalCloser besser zu deiner aktuellen Situation.",
          "Bei GlobalCloser kannst du mit Testleads zeigen, was du kannst.",
        ];

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="font-sans text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Deine Einordnung
        </p>
        <h2 className="font-serif text-2xl font-semibold leading-tight tracking-tight md:text-4xl">
          Ein anderer Weg passt aktuell besser zu dir.
        </h2>
      </div>

      <ul className="space-y-3 font-serif text-base leading-relaxed text-foreground/85 md:text-lg">
        {lines.map((l) => (
          <li key={l} className="flex items-start gap-3">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foreground/60" />
            {l}
          </li>
        ))}
      </ul>

      <p className="font-sans text-[12px] leading-relaxed text-muted-foreground">
        Hinweis: Keine Garantie auf Einkommen. Keine Garantie auf einen Job.
        GlobalCloser ist ein Bewährungs-Umfeld mit Testleads.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <a
          href={GLOBALCLOSER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center justify-center gap-2 rounded-sm bg-foreground px-8 py-4 font-sans text-sm font-medium tracking-wide text-background transition-all hover:bg-foreground/90"
        >
          Zu GlobalCloser wechseln
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </a>
        <button
          onClick={onStay}
          className="inline-flex items-center justify-center rounded-sm border border-border/60 px-6 py-4 font-sans text-sm text-foreground/80 transition-colors hover:border-foreground hover:text-foreground"
        >
          Trotzdem im Karriereweg bleiben
        </button>
      </div>
    </div>
  );
}
