import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, BellRing, ShieldCheck, RefreshCw } from "lucide-react";
import FunnelFooter from "@/components/funnel/FunnelFooter";
import { trackFunnelEvent } from "@/lib/track-event";

/**
 * LowLeadResult — terminal page for hard-blocked / low-bucket applicants.
 *
 * WHY this page exists:
 *   The /apply quiz contains a hard-block question ("Bist du bereit, echte
 *   Verkaufsgespräche zu führen?" → "Nein"). Routing such leads into
 *   /booking would (a) burn closer capacity, (b) corrupt funnel KPIs and
 *   (c) generate refund-prone signups. They MUST land here instead.
 *
 * Design principles:
 *   - Respectful, no shame, no dark patterns.
 *   - NO calendar / NO booking entry of any kind.
 *   - Two soft alternatives: free content + waitlist.
 */
export default function LowLeadResult() {
  useEffect(() => {
    document.title = "Dein Ergebnis — Ethical Top Closer";
    trackFunnelEvent("low_lead_result_view", {
      funnel: "apply",
      qualification_bucket: "low",
      lead_id: localStorage.getItem("lead_id") ?? null,
      session_id: localStorage.getItem("quiz_session_id") ?? null,
    });
  }, []);

  const leadId = localStorage.getItem("lead_id");
  const email = localStorage.getItem("lead_email");

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-16 md:py-24">
        <p className="font-sans text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-6">
          Ethical Top Closer · Ergebnis
        </p>

        <h1 className="font-serif text-3xl md:text-4xl font-semibold leading-[1.15] tracking-tight mb-5">
          Aktuell passt das Programm
          <br />
          <span className="text-muted-foreground">nicht optimal zu deiner Situation.</span>
        </h1>

        <p className="font-sans text-base leading-relaxed text-muted-foreground mb-10 max-w-xl">
          Danke für deine Ehrlichkeit. Unser Programm baut darauf auf, dass
          Teilnehmer ab Woche 2 echte Verkaufsgespräche führen. Wenn das
          aktuell nicht zu dir passt, ist ein Strategiegespräch jetzt nicht
          der richtige Schritt — weder für dich noch für uns.
        </p>

        {/* Retake CTA — rejection is not permanent. Same email is allowed. */}
        <section className="mb-5 rounded-sm border border-primary/40 bg-primary/5 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
              <RefreshCw className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-serif text-lg font-semibold mb-1">
                Quiz erneut machen
              </h2>
              <p className="font-sans text-sm text-muted-foreground leading-relaxed mb-4">
                Du kannst das Quiz jederzeit erneut machen, wenn deine
                Situation sich verändert hat oder du deine Antworten
                korrigieren möchtest. Mit der gleichen E-Mail-Adresse wird
                dein Profil aktualisiert — kein neuer Eintrag.
              </p>
              <Link
                to="/apply?retake=1"
                onClick={() => {
                  // Hard-clear stale qualification state BEFORE navigating
                  // into the quiz. Apply.tsx will then call
                  // upsert_funnel_lead with the fresh quiz_answers and
                  // overwrite localStorage with the server's new verdict
                  // via persistLeadVerdict() — guaranteeing the next
                  // /booking attempt trusts only the new server truth, not
                  // the previous "low" snapshot.
                  try {
                    [
                      "qualification_bucket",
                      "qualification_score",
                      "qualification_hard_blocked",
                      "lead_quality",
                      "lead_score",
                      "quiz_score",
                      "low_lead_locked",
                      "low_result",
                      "low_lead",
                      "disqualified",
                      "quiz_low_result",
                      "low_quality_cache",
                      "low_lead_result",
                      "low_lead_blocked",
                    ].forEach((k) => localStorage.removeItem(k));
                  } catch {
                    /* private mode — non-fatal */
                  }
                  trackFunnelEvent("low_lead_retake_click", {
                    lead_id: leadId,
                    email: email ?? null,
                  });
                }}
                className="inline-flex items-center gap-2 rounded-sm bg-primary px-5 py-2.5 font-sans text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Quiz erneut starten
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* Alternative 1 — free content */}
        <section className="mb-5 rounded-sm border border-border bg-card p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-serif text-lg font-semibold mb-1">
                Lerne kostenlos weiter
              </h2>
              <p className="font-sans text-sm text-muted-foreground leading-relaxed mb-4">
                Lies unser Buch „THE SALES SYSTEM" (PDF) und entscheide
                später, ob Closing zu dir passt.
              </p>
              <Link
                to="/#lead-magnet"
                onClick={() =>
                  trackFunnelEvent("low_lead_alt_click", {
                    target: "free_content",
                    lead_id: leadId,
                  })
                }
                className="inline-flex items-center gap-2 rounded-sm border border-foreground px-5 py-2.5 font-sans text-sm font-medium text-foreground transition-colors hover:bg-foreground hover:text-background"
              >
                Buch herunterladen
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* Alternative 2 — waitlist */}
        <section className="mb-10 rounded-sm border border-border bg-card p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <BellRing className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-serif text-lg font-semibold mb-1">
                Auf die Warteliste
              </h2>
              <p className="font-sans text-sm text-muted-foreground leading-relaxed mb-4">
                Wenn sich deine Situation in den nächsten Monaten ändert,
                melden wir uns mit einem neuen Auswahlfenster.
                {email ? <> Wir nutzen dafür <span className="font-medium text-foreground">{email}</span>.</> : null}
              </p>
              <button
                onClick={() => {
                  trackFunnelEvent("low_lead_waitlist_join", {
                    lead_id: leadId,
                    email: email ?? null,
                  });
                  // Best-effort UI feedback only — backend already has the lead row.
                  alert("Eingetragen. Wir melden uns, sobald sich etwas öffnet.");
                }}
                className="inline-flex items-center gap-2 rounded-sm border border-foreground px-5 py-2.5 font-sans text-sm font-medium text-foreground transition-colors hover:bg-foreground hover:text-background"
              >
                Auf Warteliste setzen
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        {/* Footer note — explicit "no booking" framing */}
        <div className="rounded-sm bg-muted/40 p-5 text-center">
          <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-background">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="font-sans text-xs text-muted-foreground leading-relaxed">
            Aus Respekt vor deiner Zeit gibt es hier keinen Termin.
            <br />
            Bewertung basiert auf deinen eigenen Antworten — nicht auf einem Algorithmus.
          </p>
        </div>
      </div>
      <FunnelFooter />
    </main>
  );
}
