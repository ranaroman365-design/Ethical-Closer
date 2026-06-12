/**
 * Phase 12.3 — /closer-now Lead-Quality Filter
 * ----------------------------------------------
 * Additive components to attract Typ A (Einsteiger, lernbereit) and
 * Typ B (bereits ausgebildet, will sich weiterentwickeln) — and to
 * actively disqualify Typ C (Jobsucher), Typ D (Kostenlos-Mentalität)
 * and Typ E (Falsche Erwartung).
 *
 * Components:
 *   - <DisqualifierBlock>    — prominent "Für wen NICHT / Für wen JA"
 *   - <MicroFilterLine>      — small line above each CTA
 *   - <SoftPrequalifierModal>— intercepts Salesbook clicks for filter routing
 *
 * Tracking events:
 *   CLOSER_NOW_DISQUALIFIER_VIEW
 *   CLOSER_NOW_AVATAR_FILTER_VIEW
 *   CLOSER_NOW_INVESTMENT_MINDSET_VIEW
 *   CLOSER_NOW_PREQUALIFIER_VIEW
 *   CLOSER_NOW_JOBSEEKER_FILTERED
 *   CLOSER_NOW_GROWTH_PROFILE
 */
import { useEffect, useState } from "react";
import { Check, X, ArrowRight, ShieldAlert, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { trackFunnelEvent } from "@/lib/track-event";

const SALESBOOK_HREF = "/salesbook-offer";

const DISQUALIFY: string[] = [
  "Du suchst ausschließlich eine Setter-Stelle",
  "Du suchst ausschließlich eine Closer-Stelle",
  "Du möchtest nur Auftraggeber oder Leads",
  "Du bist nicht bereit in deine Entwicklung zu investieren",
  "Du suchst eine Abkürzung",
];
const QUALIFY: string[] = [
  "Du möchtest professionelle Sales-Skills lernen",
  "Du möchtest langfristig erfolgreich werden",
  "Du bist bereit Verantwortung zu übernehmen",
  "Du bist offen für Coaching und Weiterbildung",
  "Du willst Ergebnisse statt Ausreden",
];

/* ─── Disqualifier Block ──────────────────────────────────────────────── */
export function DisqualifierBlock({
  ab_slots,
  variant = "strict",
}: {
  ab_slots: Record<string, string>;
  variant?: string;
}) {
  useEffect(() => {
    try {
      trackFunnelEvent("CLOSER_NOW_DISQUALIFIER_VIEW", {
        funnel: "closer_now",
        ab_slots,
        variant,
      });
      trackFunnelEvent("CLOSER_NOW_AVATAR_FILTER_VIEW", {
        funnel: "closer_now",
        ab_slots,
      });
    } catch { /* never throw */ }
  }, [ab_slots, variant]);

  return (
    <section className="border-y border-border/40 bg-card/30 py-20 sm:py-24">
      <div className="mx-auto max-w-5xl px-6">
        {/* NOT for */}
        <div className="text-center">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <h2 className="mt-4 font-serif text-3xl sm:text-4xl text-foreground">
            Für wen ist das NICHT geeignet?
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Wir sind direkt: Diese Seite ist nicht für jeden gedacht.
          </p>
        </div>
        <ul className="mx-auto mt-10 grid max-w-3xl gap-3">
          {DISQUALIFY.map((item) => (
            <li
              key={item}
              className="flex items-start gap-3 rounded-xl border border-border/60 bg-background p-4"
            >
              <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <X className="h-4 w-4" aria-hidden />
              </span>
              <span className="text-foreground/80">{item}</span>
            </li>
          ))}
        </ul>

        {/* FOR whom */}
        <div className="mt-20 text-center">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </span>
          <h2 className="mt-4 font-serif text-3xl sm:text-4xl text-foreground">
            Für wen ist es geeignet?
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Für Menschen, die bereit sind in echte Fähigkeiten zu investieren.
          </p>
        </div>
        <ul className="mx-auto mt-10 grid max-w-3xl gap-3">
          {QUALIFY.map((item) => (
            <li
              key={item}
              className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4"
            >
              <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-primary/15 text-primary">
                <Check className="h-4 w-4" aria-hidden />
              </span>
              <span className="text-foreground">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ─── Micro-Filter Line (above every main CTA) ────────────────────────── */
export function MicroFilterLine({
  ab_slots,
  className,
}: {
  ab_slots: Record<string, string>;
  className?: string;
}) {
  useEffect(() => {
    try {
      trackFunnelEvent("CLOSER_NOW_INVESTMENT_MINDSET_VIEW", {
        funnel: "closer_now",
        ab_slots,
      });
    } catch { /* */ }
    // fire once-ish: harmless if multiple instances mount
  }, [ab_slots]);
  return (
    <p
      className={
        "mx-auto max-w-xl text-center text-xs text-muted-foreground " +
        (className ?? "")
      }
    >
      Diese Seite richtet sich an Menschen, die bereit sind Zeit, Energie und
      Entwicklung in ihre Zukunft zu investieren.
    </p>
  );
}

/* ─── Soft Prequalifier Modal ─────────────────────────────────────────── */
type Profile = "learn" | "expand" | "trained_no_results" | "job" | "leads";
type Invest = "yes" | "maybe" | "no";

const PROFILE_OPTS: { id: Profile; label: string }[] = [
  { id: "learn", label: "Ich möchte Closing professionell lernen" },
  { id: "expand", label: "Ich möchte mein bestehendes Wissen erweitern" },
  {
    id: "trained_no_results",
    label:
      "Ich habe bereits eine Ausbildung gemacht, erreiche aber nicht die gewünschten Ergebnisse",
  },
  { id: "job", label: "Ich suche aktuell hauptsächlich eine Setter-/Closer-Stelle" },
  { id: "leads", label: "Ich suche primär Auftraggeber oder Leads" },
];
const INVEST_OPTS: { id: Invest; label: string }[] = [
  { id: "yes", label: "Ja" },
  { id: "maybe", label: "Vielleicht" },
  { id: "no", label: "Nein" },
];

export function SoftPrequalifierModal({
  open,
  onOpenChange,
  ab_slots,
  onProceed,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ab_slots: Record<string, string>;
  /** Called when the user is allowed to continue to the salesbook offer. */
  onProceed: () => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [invest, setInvest] = useState<Invest | null>(null);
  const [filteredOut, setFilteredOut] = useState(false);

  useEffect(() => {
    if (!open) return;
    try {
      trackFunnelEvent("CLOSER_NOW_PREQUALIFIER_VIEW", {
        funnel: "closer_now",
        ab_slots,
      });
    } catch { /* */ }
    // Reset on each open
    setProfile(null);
    setInvest(null);
    setFilteredOut(false);
  }, [open, ab_slots]);

  const needsInvestQuestion = profile === "job" || profile === "leads";

  const handlePrimary = () => {
    if (!profile) return;
    const growth_profile =
      profile === "learn"
        ? "beginner"
        : profile === "expand"
        ? "skill_builder"
        : profile === "trained_no_results"
        ? "trained_no_results"
        : profile === "job"
        ? "jobseeker"
        : "leadseeker";

    if (needsInvestQuestion) {
      if (!invest) return;
      if (invest === "no") {
        try {
          trackFunnelEvent("CLOSER_NOW_JOBSEEKER_FILTERED", {
            funnel: "closer_now",
            ab_slots,
            profile,
            invest,
          });
        } catch { /* */ }
        setFilteredOut(true);
        return;
      }
    }

    try {
      trackFunnelEvent("CLOSER_NOW_GROWTH_PROFILE", {
        funnel: "closer_now",
        ab_slots,
        profile,
        invest: invest ?? null,
        growth_profile,
      });
    } catch { /* */ }
    onOpenChange(false);
    onProceed();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {filteredOut ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">
                Vermutlich nicht der richtige Weg.
              </DialogTitle>
              <DialogDescription className="pt-2 text-base text-foreground/80">
                Du suchst aktuell primär eine Stelle oder Auftraggeber.
                Deshalb ist dieser Entwicklungsweg vermutlich nicht die
                passende Lösung für dich.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-6 flex flex-col gap-3">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="h-11"
              >
                Schließen
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">
                Kurze Frage vorab
              </DialogTitle>
              <DialogDescription>
                Welche Aussage beschreibt dich am ehesten?
              </DialogDescription>
            </DialogHeader>

            <RadioGroup
              value={profile ?? ""}
              onValueChange={(v) => setProfile(v as Profile)}
              className="mt-4 space-y-2"
            >
              {PROFILE_OPTS.map((o) => (
                <Label
                  key={o.id}
                  htmlFor={`p-${o.id}`}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 p-3 hover:bg-muted/40"
                >
                  <RadioGroupItem value={o.id} id={`p-${o.id}`} className="mt-0.5" />
                  <span className="text-sm font-normal text-foreground">{o.label}</span>
                </Label>
              ))}
            </RadioGroup>

            {needsInvestQuestion && (
              <div className="mt-5 rounded-lg border border-primary/30 bg-primary/5 p-4">
                <p className="text-sm font-medium text-foreground">
                  Bist du bereit weiter in deine Entwicklung zu investieren,
                  wenn dadurch deine Erfolgschancen steigen?
                </p>
                <RadioGroup
                  value={invest ?? ""}
                  onValueChange={(v) => setInvest(v as Invest)}
                  className="mt-3 grid grid-cols-3 gap-2"
                >
                  {INVEST_OPTS.map((o) => (
                    <Label
                      key={o.id}
                      htmlFor={`i-${o.id}`}
                      className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border/60 bg-background p-2 hover:bg-muted/40"
                    >
                      <RadioGroupItem value={o.id} id={`i-${o.id}`} />
                      <span className="text-sm font-normal">{o.label}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>
            )}

            <Button
              size="lg"
              className="mt-6 h-12 w-full"
              disabled={!profile || (needsInvestQuestion && !invest)}
              onClick={handlePrimary}
            >
              Weiter
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Diese Frage dient ausschließlich deiner Orientierung.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Helper: navigate to the salesbook offer (used after prequalifier). */
export function goToSalesbook(): void {
  if (typeof window !== "undefined") window.location.href = SALESBOOK_HREF;
}
