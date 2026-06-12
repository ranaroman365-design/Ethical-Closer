/**
 * Webinar Entry — Strategic Nurture Layer (warm/unsure → /apply).
 *
 * Hard contracts:
 *   - SECONDARY path. /apply remains the primary CTA across the system.
 *   - Does NOT overwrite funnel_source. /webinar is intentionally absent from
 *     `funnelSourceForPath`; `resolveFunnelSource` inherits the prior session
 *     value (e.g. apply_direct, qualify_filter, high_income_angle) or falls
 *     back to `external_inbound` for direct hits.
 *   - Passes session_id (etc_attribution_session_id_v1) on every event.
 *   - Does NOT call `ab_assign_funnel()` or interfere with /apply A/B test.
 *   - Preserves attribution chain via `captureCurrentPageAttribution`.
 *
 * Event family (all carry funnel_source via track-event auto-injection):
 *   - webinar_view          (mount, deduped per session)
 *   - webinar_start         (user starts video)
 *   - webinar_50            (50% playback)
 *   - webinar_complete      (>=95% playback)
 *   - webinar_to_apply_click(post-video primary CTA)
 *   - webinar_save_click    (save / reminder)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { trackFunnelEvent } from "@/lib/track-event";
import { getOrCreateAttributionSessionId } from "@/lib/attribution-session";
import { captureCurrentPageAttribution } from "@/lib/lead-attribution";
import { Play, CheckCircle2, XCircle, ArrowRight, Bookmark } from "lucide-react";

const PAGE = "/webinar";
const FUNNEL = "webinar";
const EXPERIMENT_ID = "webinar_entry_v1";

const SS_VIEW = "webinar_view_fired_v1";
const SS_START = "webinar_start_fired_v1";
const SS_50 = "webinar_50_fired_v1";
const SS_COMPLETE = "webinar_complete_fired_v1";

const firedOnce = (key: string) => {
  if (typeof window === "undefined") return true;
  try {
    if (sessionStorage.getItem(key)) return true;
    sessionStorage.setItem(key, "1");
  } catch { /* ignore */ }
  return false;
};

const useBasePayload = () => {
  return useMemo(() => {
    const session_id = getOrCreateAttributionSessionId();
    return {
      funnel: FUNNEL,
      page_path: PAGE,
      experiment_id: EXPERIMENT_ID,
      session_id,
    } as Record<string, unknown>;
  }, []);
};

const WebinarEntry = () => {
  const base = useBasePayload();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [unlocked, setUnlocked] = useState(true); // instant playback by default
  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);

  // Mount: capture attribution (does not overwrite) + fire webinar_view.
  useEffect(() => {
    captureCurrentPageAttribution("Webinar");
    if (!firedOnce(SS_VIEW)) {
      trackFunnelEvent("webinar_view", base);
    }
  }, [base]);

  // Video playback tracking.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onPlay = () => {
      if (!firedOnce(SS_START)) trackFunnelEvent("webinar_start", base);
    };
    const onTimeUpdate = () => {
      if (!v.duration || isNaN(v.duration)) return;
      const pct = v.currentTime / v.duration;
      if (pct >= 0.5 && !firedOnce(SS_50)) {
        trackFunnelEvent("webinar_50", base);
      }
      if (pct >= 0.95 && !firedOnce(SS_COMPLETE)) {
        trackFunnelEvent("webinar_complete", base);
      }
    };
    const onEnded = () => {
      if (!firedOnce(SS_COMPLETE)) trackFunnelEvent("webinar_complete", base);
    };

    v.addEventListener("play", onPlay);
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("ended", onEnded);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("ended", onEnded);
    };
  }, [unlocked, base]);

  const handleApplyClick = (location: string) => {
    trackFunnelEvent("webinar_to_apply_click", { ...base, location });
  };

  const handleSaveClick = () => {
    trackFunnelEvent("webinar_save_click", base);
    if (typeof window !== "undefined") {
      try { window.localStorage.setItem("webinar_saved_v1", new Date().toISOString()); } catch { /* ignore */ }
    }
  };

  const handleEmailUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;
    trackFunnelEvent("webinar_email_unlock", { ...base, email_provided: true });
    setEmailSubmitted(true);
    setUnlocked(true);
    // Note: no lead is created here — this is a soft unlock only. Lead capture
    // remains exclusive to /apply to keep ORS attribution clean.
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* HERO */}
      <section className="border-b border-border">
        <div className="container mx-auto max-w-4xl px-6 py-20 md:py-28 text-center">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-6"
          >
            Masterclass · Kostenlos · 22 Minuten
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="font-serif text-3xl md:text-5xl leading-tight mb-6"
          >
            Wie du als Closer 1.500 € – 8.000 € monatlich verdienst — ohne eigene Produkte
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12 }}
            className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mb-10"
          >
            Ein klarer Einblick in das System hinter echten Closing-Deals.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <a
              href="#video"
              className="inline-flex items-center gap-2 rounded-sm bg-primary px-8 py-3.5 font-sans text-sm font-medium tracking-wide text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Play className="h-4 w-4" /> Masterclass ansehen
            </a>
            <p className="text-xs text-muted-foreground mt-4">
              Du weißt bereits, was du willst?{" "}
              <Link
                to="/apply"
                onClick={() => handleApplyClick("hero_skip")}
                className="underline underline-offset-2 hover:text-foreground"
              >
                Direkt bewerben →
              </Link>
            </p>
          </motion.div>
        </div>
      </section>

      {/* WHAT YOU WILL LEARN */}
      <section className="border-b border-border">
        <div className="container mx-auto max-w-4xl px-6 py-16">
          <h2 className="font-serif text-2xl md:text-3xl mb-10 text-center">Was du in 22 Minuten verstehst</h2>
          <div className="grid md:grid-cols-2 gap-5">
            {[
              { t: "Wie Deals entstehen", d: "Vom ersten Kontakt bis zum Abschluss — der reale Flow eines High-Ticket-Calls." },
              { t: "Wie du bezahlt wirst", d: "Provisionsstruktur, Auszahlung, typische Range pro Monat (1.500 € – 8.000 €)." },
              { t: "Wie du einsteigst", d: "Welche Rolle für dich passt: Setter, Closer oder Director-Pfad." },
              { t: "Warum 90 % scheitern", d: "Die zwei Fehler, die fast jeder Anfänger macht — und wie wir sie verhindern." },
            ].map((b) => (
              <div key={b.t} className="rounded-sm border border-border p-5 bg-card/40">
                <h3 className="font-medium mb-1.5">{b.t}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{b.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOR WHO */}
      <section className="border-b border-border bg-card/20">
        <div className="container mx-auto max-w-4xl px-6 py-16">
          <h2 className="font-serif text-2xl md:text-3xl mb-10 text-center">Für wen das ist</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-sm border border-destructive/30 p-6">
              <div className="flex items-center gap-2 mb-3 text-destructive">
                <XCircle className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wider font-medium">Nicht für dich, wenn</span>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• du passives Einkommen suchst</li>
                <li>• du keine Gespräche führen willst</li>
                <li>• du in 7 Tagen reich werden willst</li>
              </ul>
            </div>
            <div className="rounded-sm border border-primary/40 p-6">
              <div className="flex items-center gap-2 mb-3 text-primary">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wider font-medium">Für dich, wenn</span>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• du performance-orientiert bist</li>
                <li>• du echte Skills aufbauen willst</li>
                <li>• du planbar 1.500 € – 8.000 € pro Monat verdienen willst</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* MECHANISM PREVIEW */}
      <section className="border-b border-border">
        <div className="container mx-auto max-w-4xl px-6 py-16">
          <h2 className="font-serif text-2xl md:text-3xl mb-10 text-center">Wie das System funktioniert</h2>
          <div className="grid md:grid-cols-3 gap-5">
            <div className="text-center">
              <div className="text-3xl font-serif mb-2">2.000 € – 12.000 €</div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Produktpreis</p>
              <p className="text-sm text-muted-foreground mt-2">High-Ticket-Coaching & Programme von verifizierten Anbietern.</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-serif mb-2">10 – 20 %</div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Provision pro Deal</p>
              <p className="text-sm text-muted-foreground mt-2">200 € – 2.400 € Provision pro abgeschlossenem Gespräch.</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-serif mb-2">15 – 40</div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Calls pro Woche</p>
              <p className="text-sm text-muted-foreground mt-2">Vorqualifizierte Termine — du closter, wir liefern den Lead.</p>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section className="border-b border-border bg-card/20">
        <div className="container mx-auto max-w-4xl px-6 py-16">
          <h2 className="font-serif text-2xl md:text-3xl mb-10 text-center">Echte Zahlen, echte Closer</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-sm border border-border bg-background p-6">
              <p className="font-serif text-2xl mb-2">+4.840 € im ersten Monat</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                „Nach 6 Wochen Training kam mein erster Deal. Ende des ersten vollen Monats: 4.840 € Provision bei 22 Calls.“
              </p>
              <p className="text-xs text-muted-foreground mt-3">— Marvin, ehemaliger Eventmanager</p>
            </div>
            <div className="rounded-sm border border-border bg-background p-6">
              <p className="font-serif text-2xl mb-2">7.200 € / Monat (Monat 4)</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                „Ich war Quereinsteiger ohne Vertriebs­erfahrung. Mit dem System komme ich heute auf 7.200 € im Monat.“
              </p>
              <p className="text-xs text-muted-foreground mt-3">— Lara, ehemals Marketing-Praktikantin</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-6">
            Verifizierte interne Auszahlungsdaten. Ergebnisse sind individuell und an Performance gebunden.
          </p>
        </div>
      </section>

      {/* VIDEO DELIVERY */}
      <section id="video" className="border-b border-border">
        <div className="container mx-auto max-w-4xl px-6 py-16">
          <h2 className="font-serif text-2xl md:text-3xl mb-8 text-center">Die Masterclass</h2>

          {!unlocked && (
            <div className="max-w-md mx-auto rounded-sm border border-border p-6 bg-card/40 mb-8">
              <p className="text-sm text-muted-foreground mb-4 text-center">
                Trag deine E-Mail ein, um die Masterclass freizuschalten:
              </p>
              <form onSubmit={handleEmailUnlock} className="flex gap-2">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="deine@email.de"
                  className="flex-1 rounded-sm border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="submit"
                  className="rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  Freischalten
                </button>
              </form>
              {emailSubmitted && (
                <p className="text-xs text-muted-foreground mt-3 text-center">Freigeschaltet ✓</p>
              )}
            </div>
          )}

          {unlocked && (
            <div className="rounded-sm overflow-hidden border border-border bg-black aspect-video max-w-3xl mx-auto">
              <video
                ref={videoRef}
                controls
                playsInline
                preload="metadata"
                poster="/poster.jpg"
                className="w-full h-full"
              >
                <source src="/webinar/masterclass.mp4" type="video/mp4" />
                Dein Browser unterstützt kein eingebettetes Video.
              </video>
            </div>
          )}
        </div>
      </section>

      {/* POST-WEBINAR FLOW (CRITICAL) */}
      <section className="bg-primary/5">
        <div className="container mx-auto max-w-3xl px-6 py-20 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-5">Nächster Schritt</p>
          <h2 className="font-serif text-3xl md:text-4xl mb-5 leading-tight">
            Du hast das System verstanden. Jetzt prüfen wir, ob es zu dir passt.
          </h2>
          <p className="text-base text-muted-foreground mb-10 max-w-xl mx-auto">
            Die Bewerbung dauert 3 Minuten. Du bekommst eine ehrliche Einschätzung, ob du auf den Closer-Pfad passt — kein Pitch, kein Druck.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Link
              to="/apply"
              onClick={() => handleApplyClick("post_webinar_primary")}
              className="inline-flex items-center gap-2 rounded-sm bg-primary px-8 py-3.5 font-sans text-sm font-medium tracking-wide text-primary-foreground transition-opacity hover:opacity-90"
            >
              Jetzt bewerben <ArrowRight className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={handleSaveClick}
              className="inline-flex items-center gap-2 rounded-sm border border-border px-6 py-3.5 font-sans text-sm font-medium hover:bg-card/40 transition-colors"
            >
              <Bookmark className="h-4 w-4" /> Für später speichern
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-8">
            580+ aktive Closer · Auszahlung wöchentlich · Keine Vorkosten
          </p>
        </div>
      </section>
    </main>
  );
};

export default WebinarEntry;
