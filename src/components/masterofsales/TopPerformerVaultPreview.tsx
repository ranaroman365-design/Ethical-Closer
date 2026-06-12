/**
 * TopPerformerVaultPreview — visuelle MVP-Vorschau des Top Performer
 * Breakdown Vault™ auf der Landingpage.
 *
 * Zeigt EIN realitätsnahes Beispiel-Breakdown (Call · Key Moments · KPI
 * Impact · Lesson). Keine erfundenen Personendaten — anonymisiert dargestellt.
 * Reine Sicht-Schicht, kein neuer Route, keine echten DB-Reads.
 */
import { useEffect, useRef } from "react";
import { Play, Sparkles, TrendingUp, Lightbulb } from "lucide-react";
import { trackFunnelEvent } from "@/lib/track-event";

const FIRED_KEY = "mos_vault_preview_view_fired_v1";

const TopPerformerVaultPreview = () => {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !ref.current) return;
    try {
      if (sessionStorage.getItem(FIRED_KEY) === "1") return;
    } catch {
      /* ignore */
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.5) {
            try {
              sessionStorage.setItem(FIRED_KEY, "1");
            } catch {
              /* ignore */
            }
            try {
              trackFunnelEvent("MASTER_VAULT_PREVIEW_VIEW", {
                funnel: "masterofsales",
              });
            } catch {
              /* never throw */
            }
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: [0.5] },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      data-mos-section="vault_preview"
      className="border-t border-foreground/10 bg-background"
    >
      <div className="mx-auto max-w-5xl px-6 py-20 md:px-10 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[10px] uppercase tracking-[0.28em] text-accent sm:text-xs sm:tracking-[0.3em]">
            Einblick statt Behauptung
          </p>
          <h2 className="mt-5 font-serif text-3xl leading-tight md:text-5xl">
            Top Performer Breakdown Vault™
          </h2>
          <p className="mt-5 text-base leading-relaxed text-foreground/70 md:text-lg">
            Sieh genau, was Top-Performer anders machen. Echte Calls, Moment
            für Moment zerlegt.
          </p>
        </div>

        {/* Vault-Card Preview — visuelle MVP-Darstellung */}
        <div className="mx-auto mt-12 max-w-3xl overflow-hidden rounded-2xl border border-foreground/10 bg-foreground/[0.02]">
          {/* Call-Header */}
          <div className="flex items-center justify-between border-b border-foreground/10 px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent text-background">
                <Play className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Closer „M.K." · Discovery → Close
                </p>
                <p className="text-xs text-foreground/55">
                  47 Min · High-Ticket Coaching · Closed Won
                </p>
              </div>
            </div>
            <span className="rounded-full border border-accent/30 bg-accent/[0.06] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-accent">
              Anonymisiert
            </span>
          </div>

          {/* Key Moments */}
          <div className="border-b border-foreground/10 px-6 py-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-foreground/55">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              Key Moments
            </div>
            <ul className="mt-4 space-y-3">
              {[
                ["07:12", 'Reframe der „Ich überleg\u2019s mir“-Aussage in 2 Sätzen.'],
                ["19:48", "Stille nach Preisnennung — 11 Sekunden ausgehalten."],
                ["34:05", 'Einwand „Zu teuer“ in echte Entscheidung verwandelt.'],
              ].map(([t, m]) => (
                <li key={t} className="flex items-start gap-3">
                  <span className="mt-0.5 rounded-md border border-foreground/15 bg-background px-2 py-0.5 font-mono text-xs text-foreground/70">
                    {t}
                  </span>
                  <span className="text-sm leading-relaxed text-foreground/80">
                    {m}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* KPI Impact */}
          <div className="grid grid-cols-3 border-b border-foreground/10">
            {[
              { label: "Close Rate", value: "42 %", sub: "vs. 18 % Median" },
              { label: "Avg Cycle", value: "1,4 Calls", sub: "vs. 2,8" },
              { label: "Show Rate", value: "91 %", sub: "vs. 64 %" },
            ].map(({ label, value, sub }) => (
              <div key={label} className="px-6 py-5 text-center [&:not(:last-child)]:border-r border-foreground/10">
                <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/55">
                  {label}
                </p>
                <p className="mt-2 font-serif text-2xl text-foreground">{value}</p>
                <p className="mt-1 text-[11px] text-accent">{sub}</p>
              </div>
            ))}
          </div>

          {/* Lesson Learned */}
          <div className="flex items-start gap-3 px-6 py-5">
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent/[0.06] text-accent">
              <Lightbulb className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-foreground/55">
                Lesson Learned
              </p>
              <p className="mt-2 text-sm leading-relaxed text-foreground/85 md:text-base">
                Top-Performer schließen nicht härter — sie schaffen früher
                Klarheit über die Entscheidung. Druck ersetzt fehlende Klarheit;
                Klarheit ersetzt Druck.
              </p>
            </div>
          </div>
        </div>

        <p className="mx-auto mt-8 max-w-xl text-center text-xs leading-relaxed text-foreground/55 md:text-sm">
          Vorschau aus dem Member-Bereich. Mitglieder sehen die vollständige
          Bibliothek aller Breakdowns — kontinuierlich erweitert.
        </p>
      </div>

      <div className="mx-auto mb-2 flex max-w-5xl items-center justify-center gap-2 text-[10px] uppercase tracking-[0.22em] text-foreground/40">
        <TrendingUp className="h-3 w-3" />
        Vorschau · Live-Daten im Member-Portal
      </div>
    </section>
  );
};

export default TopPerformerVaultPreview;
