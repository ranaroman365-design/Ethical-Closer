/**
 * Phase 10.1 — Closer-Karriere Thank-You Page
 *
 * Route: /closer-karriere/danke
 *
 * Design inspired by /online-webinar-video but rebuilt in the
 * MasterOfSales / Ethical Top Closer brand language (Cream / Gold / Ink,
 * Cormorant + DM Sans).
 *
 * Primary CTA → /apply/quiz
 * Secondary CTA → /closer-karriere
 */
import { useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, MailCheck, MessageCircle, PlayCircle, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAbSlot } from "@/hooks/useAbSlot";
import { trackFunnelEvent } from "@/lib/track-event";
import { MOS_REGISTER_ENABLED, MOS_REGISTER_CTA_TARGET } from "@/lib/closer-karriere-flag";

import heroAsset from "@/assets/lp-proof-p94/hero-D-coaching.jpg.asset.json";

const THANKYOU_CTA_SLOT = {
  slot: "mos_register_thankyou_cta",
  variants: [
    { id: "control" },
    { id: "A_eignung" },
    { id: "B_karriere_check" },
  ],
} as const;

const THANKYOU_CTA_COPY: Record<string, string> = {
  control: "Karriere-Check starten",
  A_eignung: "Jetzt Eignung prüfen",
  B_karriere_check: "Mit dem Karriere-Check starten",
};

export default function CloserKarriereDanke() {
  if (!MOS_REGISTER_ENABLED) {
    return <Navigate to="/" replace />;
  }

  const ctaSlot = useAbSlot(THANKYOU_CTA_SLOT);
  const ctaLabel = THANKYOU_CTA_COPY[ctaSlot.variant] ?? THANKYOU_CTA_COPY.control;

  useEffect(() => {
    document.title = "Danke — Ethical Top Closer™";
    const setMeta = (name: string, content: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    setMeta("description", "Danke für deine Registrierung. Hier ist dein nächster Schritt im Karriereweg als Closer.");
    setMeta("robots", "noindex,follow");

    trackFunnelEvent("closer_karriere_thankyou_view", {
      funnel: "closer_karriere_register",
      ab_thankyou_cta: ctaSlot.variant,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trackCta = (target: string) => {
    trackFunnelEvent("closer_karriere_thankyou_cta_click", {
      funnel: "closer_karriere_register",
      ab_thankyou_cta: ctaSlot.variant,
      target,
    });
  };

  return (
    <main className="min-h-screen bg-background text-foreground antialiased">
      {/* ─── Hero / Confirmation ─── */}
      <section className="relative isolate overflow-hidden border-b border-border">
        <div className="absolute inset-0 -z-10">
          <img src={heroAsset.url} alt="" aria-hidden className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/75 to-black/90" />
        </div>

        <div className="mx-auto max-w-3xl px-6 py-24 text-center md:py-32">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-[11px] uppercase tracking-[0.22em] text-white/80 backdrop-blur-sm">
            <CheckCircle2 className="h-3.5 w-3.5 text-accent" /> Registrierung bestätigt
          </span>

          <h1 className="font-serif text-4xl font-medium leading-[1.1] tracking-tight text-white md:text-5xl">
            Danke — deine Registrierung ist eingegangen.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/75 md:text-lg">
            Wir zeigen dir jetzt den nächsten Schritt auf deinem Karriereweg im Closing.
          </p>

          <p className="mt-10 text-[11px] uppercase tracking-[0.25em] text-white/40">
            Ethical Top Closer™
          </p>
        </div>
      </section>

      {/* ─── Video / Next-Step Frame ─── */}
      <section className="border-b border-border bg-background py-20 md:py-28">
        <div className="mx-auto max-w-4xl px-6">
          <div className="text-center">
            <span className="text-[11px] uppercase tracking-[0.25em] text-accent">Dein nächster Schritt</span>
            <h2 className="mt-4 font-serif text-3xl font-medium leading-tight tracking-tight md:text-4xl">
              Starte jetzt mit dem Karriere-Check.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
              Eine ehrliche Standortbestimmung in wenigen Minuten — keine Verpflichtung,
              keine Vorerfahrung nötig.
            </p>
          </div>

          <div className="mx-auto mt-12 max-w-3xl">
            <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_30px_80px_-40px_rgba(0,0,0,0.4)]">
              <div className="relative aspect-video w-full">
                <img
                  src={heroAsset.url}
                  alt="Karriereweg im Closing"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white">
                  <PlayCircle className="h-16 w-16 text-accent drop-shadow-lg" />
                  <p className="mt-4 font-serif text-xl font-medium md:text-2xl">
                    Dein nächster Schritt
                  </p>
                  <p className="mt-1 text-sm text-white/75">
                    Starte den kostenlosen Karriere-Check
                  </p>
                </div>
              </div>
              <div className="p-6 text-center md:p-8">
                <Link to={MOS_REGISTER_CTA_TARGET} onClick={() => trackCta("video_cta")}>
                  <Button
                    size="lg"
                    className="h-14 rounded-xl bg-accent px-10 text-base font-medium text-accent-foreground shadow-[0_10px_40px_-10px_hsl(var(--accent)/0.6)] hover:bg-accent/90"
                  >
                    {ctaLabel}
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── What happens next ─── */}
      <section className="border-b border-border bg-muted/30 py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <span className="text-[11px] uppercase tracking-[0.25em] text-accent">So geht es weiter</span>
            <h2 className="mt-4 font-serif text-3xl font-medium leading-tight tracking-tight md:text-4xl">
              Was als Nächstes passiert.
            </h2>
          </div>

          <ol className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: MailCheck,
                title: "Prüfe dein Postfach",
                body: "Wir senden dir eine Bestätigung und alle Infos zum Karriereweg per E-Mail.",
              },
              {
                icon: MessageCircle,
                title: "Speichere unsere WhatsApp Nummer",
                body: "Damit du unsere Nachricht sicher erhältst — ohne im Spam zu landen.",
              },
              {
                icon: ShieldCheck,
                title: "Starte mit dem Karriere-Check",
                body: "Beantworte einige Fragen und erhalte eine ehrliche Einschätzung deiner Eignung.",
              },
            ].map(({ icon: Icon, title, body }, i) => (
              <li
                key={title}
                className="relative rounded-2xl border border-border bg-card p-7"
              >
                <span className="absolute -top-3 left-7 inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[11px] font-medium text-accent-foreground">
                  {i + 1}
                </span>
                <Icon className="h-6 w-6 text-accent" />
                <h3 className="mt-4 font-serif text-lg font-medium leading-snug">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ─── Primary + Secondary CTA ─── */}
      <section className="border-b border-border bg-background py-20 md:py-28">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="font-serif text-3xl font-medium leading-tight tracking-tight md:text-4xl">
            Bereit für deinen Karriere-Check?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Keine Motivation. Kein Druck. Eine klare Einschätzung, ob Closing zu dir passt.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 md:flex-row md:gap-5">
            <Link to={MOS_REGISTER_CTA_TARGET} onClick={() => trackCta("primary")}>
              <Button
                size="lg"
                className="h-14 rounded-xl bg-accent px-10 text-base font-medium text-accent-foreground shadow-[0_10px_40px_-10px_hsl(var(--accent)/0.6)] hover:bg-accent/90"
              >
                {ctaLabel}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/closer-karriere" onClick={() => trackCta("secondary")}>
              <Button
                size="lg"
                variant="outline"
                className="h-14 rounded-xl border-border px-10 text-base font-medium"
              >
                Zurück zur Startseite
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Trust / Reminder ─── */}
      <section className="bg-muted/30 py-14">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <ShieldCheck className="mx-auto h-6 w-6 text-accent" />
          <p className="mt-4 font-serif text-lg italic leading-relaxed text-muted-foreground md:text-xl">
            „Keine Motivation. Kein Druck. Eine klare Einschätzung, ob Closing zu dir passt."
          </p>
          <p className="mt-6 text-[11px] uppercase tracking-[0.25em] text-muted-foreground/70">
            Selection over Pressure
          </p>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-border bg-background py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-xs text-muted-foreground md:flex-row">
          <span>© {new Date().getFullYear()} Ethical Closer — Ethical Top Closer™</span>
          <nav className="flex items-center gap-6">
            <Link to="/impressum" className="hover:text-foreground">Impressum</Link>
            <Link to="/datenschutz" className="hover:text-foreground">Datenschutz</Link>
            <Link to="/agb" className="hover:text-foreground">AGB</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
