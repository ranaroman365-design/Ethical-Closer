import { useEffect, useMemo, useRef, useState } from "react";

import { motion } from "framer-motion";
import { ArrowRight, Check, Sparkles, Users, Compass, PlayCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { trackFunnelEvent } from "@/lib/track-event";
import { captureCurrentPageAttribution, getCurrentAttributionSessionId } from "@/lib/lead-attribution";

// ---------- Lightweight A/B engine (isolated, client-side, sticky per visitor)
type Variant = "A" | "B" | "C";
const STORAGE_KEY = "workshop_variant_v1";

const HEADLINES: Record<Variant, { kicker: string; h1: string; sub: string }> = {
  A: {
    kicker: "Kostenloser Online-Workshop",
    h1: "Du weißt, dass mehr möglich ist.",
    sub: "Ein ruhiger, ehrlicher Einblick in moderne Remote-Karrieren — und wie ambitionierte Menschen sich heute neue Perspektiven aufbauen.",
  },
  B: {
    kicker: "Kostenloser Online-Workshop",
    h1: "Vielleicht fehlt dir nicht Motivation — sondern Richtung.",
    sub: "Moderne Fähigkeiten. Modernes Umfeld. Moderne Freiheit. Erlebe einen Workshop, der nichts verkauft — sondern dir zeigt, was heute wirklich möglich ist.",
  },
  C: {
    kicker: "Kostenloser Online-Workshop",
    h1: "Die neue Generation ortsunabhängigen Arbeitens.",
    sub: "Wie Menschen aus über 12 Ländern sich gerade ein freieres Leben aufbauen — mit echten Fähigkeiten, einem starken Umfeld und einer klaren Richtung.",
  },
};

const CTAS: Record<Variant, string> = {
  A: "Workshop kostenlos ansehen",
  B: "Neue Perspektiven entdecken",
  C: "Kostenlos teilnehmen",
};

function pickVariant(): Variant {
  if (typeof window === "undefined") return "A";
  const existing = window.localStorage.getItem(STORAGE_KEY) as Variant | null;
  if (existing && ["A", "B", "C"].includes(existing)) return existing;
  const v: Variant = (["A", "B", "C"] as const)[Math.floor(Math.random() * 3)];
  window.localStorage.setItem(STORAGE_KEY, v);
  return v;
}

// ---------- Page

const Workshop = () => {
  const [variant, setVariant] = useState<Variant>("A");
  const [first_name, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const scrollMarks = useRef<Set<number>>(new Set());

  const copy = useMemo(() => HEADLINES[variant], [variant]);
  const ctaLabel = CTAS[variant];

  // mount: pick variant, capture attribution, fire pageview
  useEffect(() => {
    const v = pickVariant();
    setVariant(v);
    captureCurrentPageAttribution("workshop");
    trackFunnelEvent("WorkshopPageView", { funnel: "workshop", variant: v });
    document.title = "Workshop · Moderne Remote-Karriere & Perspektive";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Kostenloser Online-Workshop: moderne, ortsunabhängige Karrierewege — ruhig, ehrlich, ohne Verkauf.");
  }, []);

  // scroll depth tracking — isolated event
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const pct = Math.round(((h.scrollTop + window.innerHeight) / h.scrollHeight) * 100);
      [25, 50, 75, 90].forEach((m) => {
        if (pct >= m && !scrollMarks.current.has(m)) {
          scrollMarks.current.add(m);
          trackFunnelEvent("WorkshopScrollDepth", { funnel: "workshop", depth: m, variant });
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [variant]);

  const scrollToForm = (where: string) => {
    trackFunnelEvent("WorkshopCTA", { funnel: "workshop", variant, where });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!first_name.trim() || !email.trim()) {
      setError("Bitte Vorname und E-Mail angeben.");
      return;
    }
    setSubmitting(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const utm = {
        utm_source: params.get("utm_source"),
        utm_medium: params.get("utm_medium"),
        utm_campaign: params.get("utm_campaign"),
        utm_content: params.get("utm_content"),
        utm_term: params.get("utm_term"),
        fbclid: params.get("fbclid"),
        gclid: params.get("gclid"),
      };
      const { error: fnErr } = await supabase.functions.invoke("workshop-optin", {
        body: {
          first_name: first_name.trim(),
          email: email.trim(),
          variant,
          utm,
          session_id: getCurrentAttributionSessionId() || "",
        },
      });
      if (fnErr) throw fnErr;
      trackFunnelEvent("WorkshopOptin", { funnel: "workshop", variant });
      setDone(true);
    } catch (err) {
      console.error(err);
      setError("Hat leider nicht geklappt. Bitte später erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0B0E] text-white antialiased">

      {/* ───── HERO ───── */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 0%, rgba(201,168,76,0.18) 0%, rgba(11,11,14,0) 60%), linear-gradient(180deg, #0B0B0E 0%, #0E0E12 100%)",
          }}
        />
        <div className="container mx-auto max-w-5xl px-6 pt-24 pb-20 md:pt-32 md:pb-28">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-[11px] tracking-[0.2em] uppercase text-white/70">
              <Sparkles className="h-3 w-3 text-[#C9A84C]" />
              {copy.kicker}
            </div>
            <h1
              className="mt-8 font-serif text-4xl leading-[1.05] text-white md:text-6xl lg:text-7xl"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              {copy.h1}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/70 md:text-lg">
              {copy.sub}
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <button
                onClick={() => scrollToForm("hero")}
                className="group inline-flex items-center justify-center gap-2 rounded-xl bg-[#C9A84C] px-7 py-4 text-sm font-medium text-[#1A1A1A] transition-all hover:brightness-110 active:scale-[0.98]"
              >
                {ctaLabel}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <div className="flex items-center gap-2 text-xs text-white/50">
                <PlayCircle className="h-4 w-4" /> 100 % kostenlos · keine Verpflichtung
              </div>
            </div>

            <div className="mt-16 grid grid-cols-3 gap-6 border-t border-white/[0.06] pt-8 text-left md:gap-12">
              {[
                { k: "12+", v: "Länder im Umfeld" },
                { k: "Ruhig", v: "Kein Sales-Druck" },
                { k: "Live", v: "Online-Workshop" },
              ].map((s) => (
                <div key={s.v}>
                  <div className="font-serif text-2xl text-[#C9A84C] md:text-3xl" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                    {s.k}
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/50">{s.v}</div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ───── EMOTIONAL IDENTIFIKATION ───── */}
      <Section>
        <SectionEyebrow>Vielleicht kennst du das</SectionEyebrow>
        <SerifH2>
          Du funktionierst — aber lebst du das Leben, das du wirklich willst?
        </SerifH2>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {[
            "Tage, die sich ähneln. Wochen, die vorbeiziehen.",
            "Ein Gefühl, dass mehr in dir steckt — aber nicht genutzt wird.",
            "Ein Job, der reicht — aber dich nicht weiterbringt.",
            "Das leise Wissen: Es muss einen anderen Weg geben.",
          ].map((t) => (
            <div key={t} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-white/75">
              {t}
            </div>
          ))}
        </div>
      </Section>

      {/* ───── WARUM MEHR MENSCHEN MEHR WOLLEN ───── */}
      <Section tone="quiet">
        <SectionEyebrow>Eine neue Generation</SectionEyebrow>
        <SerifH2>Klassische Karrierewege passen nicht mehr zu jedem Leben.</SerifH2>
        <p className="mt-6 max-w-2xl text-white/65">
          Immer mehr Menschen suchen nach etwas Eigenem. Nach Arbeit, die zum Leben passt — nicht
          umgekehrt. Nach einem Umfeld, das mitwächst. Nach Fähigkeiten, die heute relevant sind und
          morgen noch relevanter werden.
        </p>
      </Section>

      {/* ───── MODERNE REMOTE-KARRIERE ───── */}
      <Section>
        <SectionEyebrow>Moderne Remote-Karriere</SectionEyebrow>
        <SerifH2>Ortsunabhängig. Wertschöpfend. Echt.</SerifH2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { icon: Compass, t: "Richtung", d: "Eine klare Perspektive — statt diffuser Optionen." },
            { icon: Users, t: "Umfeld", d: "Ambitionierte Menschen, die dieselbe Sprache sprechen." },
            { icon: Sparkles, t: "Fähigkeit", d: "Skills, die in der modernen Wirtschaft tatsächlich gefragt sind." },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-7">
              <Icon className="h-5 w-5 text-[#C9A84C]" />
              <div className="mt-5 font-serif text-2xl" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                {t}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-white/65">{d}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ───── COMMUNITY / UMFELD ───── */}
      <Section tone="warm">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <SectionEyebrow>Umfeld verändert alles</SectionEyebrow>
            <SerifH2>Du bist nicht allein in dem, was du gerade fühlst.</SerifH2>
            <p className="mt-6 text-white/70">
              Hunderte Menschen aus über 12 Ländern stehen gerade an einem ähnlichen Punkt. Was sie
              verändert hat: ein Umfeld, das ehrlich, ambitioniert und gleichzeitig menschlich ist.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-white/75">
              {[
                "Echte Gespräche statt Performance",
                "Gegenseitige Entwicklung statt Konkurrenz",
                "Ein Ort, an dem Ambition normal ist",
              ].map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-4 w-4 text-[#C9A84C]" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              "Vom Job-Modus zur eigenen Richtung.",
              "Vom Stillstand zum echten Momentum.",
              "Von Isolation zu einem starken Umfeld.",
              "Vom Funktionieren zur echten Entwicklung.",
            ].map((q, i) => (
              <div
                key={q}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 text-[13px] leading-relaxed text-white/75"
                style={{ transform: i % 2 ? "translateY(16px)" : "none" }}
              >
                „{q}"
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ───── WORKSHOP-INHALTE ───── */}
      <Section>
        <SectionEyebrow>Im Workshop bekommst du</SectionEyebrow>
        <SerifH2>Orientierung — nicht noch mehr Content.</SerifH2>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {[
            "Wie moderne, ortsunabhängige Karrierewege heute wirklich funktionieren.",
            "Welche Fähigkeiten in der nächsten Dekade an Wert gewinnen.",
            "Wie ambitionierte Menschen sich Schritt für Schritt eine neue Richtung aufbauen.",
            "Wie das richtige Umfeld Entwicklung beschleunigt — und warum es alles verändert.",
          ].map((t, i) => (
            <div key={t} className="flex gap-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
              <div className="font-serif text-3xl text-[#C9A84C]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                0{i + 1}
              </div>
              <p className="text-white/80">{t}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <button
            onClick={() => scrollToForm("workshop-content")}
            className="inline-flex items-center gap-2 rounded-xl bg-[#C9A84C] px-7 py-4 text-sm font-medium text-[#1A1A1A] hover:brightness-110"
          >
            {ctaLabel} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </Section>

      {/* ───── SOCIAL PROOF ───── */}
      <Section tone="quiet">
        <SectionEyebrow>Stimmen aus dem Umfeld</SectionEyebrow>
        <SerifH2>Echte Menschen. Echte Veränderungen.</SerifH2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {[
            { q: "Ich hatte das Gefühl, falsch abgebogen zu sein. Heute weiß ich, wohin ich gehe.", n: "Sarah, 28" },
            { q: "Endlich ein Umfeld, in dem Ambition nicht erklärt werden muss.", n: "Daniel, 34" },
            { q: "Kein Funnel-Gefühl. Eher wie eine echte Tür, die jemand öffnet.", n: "Lena, 31" },
          ].map((p) => (
            <figure key={p.n} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
              <blockquote className="font-serif text-lg leading-relaxed text-white/85" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                „{p.q}"
              </blockquote>
              <figcaption className="mt-5 text-xs uppercase tracking-[0.18em] text-white/50">— {p.n}</figcaption>
            </figure>
          ))}
        </div>
      </Section>

      {/* ───── FAQ ───── */}
      <Section>
        <SectionEyebrow>Häufige Fragen</SectionEyebrow>
        <SerifH2>Ruhig & ehrlich beantwortet.</SerifH2>
        <div className="mx-auto mt-10 max-w-3xl divide-y divide-white/[0.06] rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          {[
            {
              q: "Ist der Workshop wirklich kostenlos?",
              a: "Ja. Keine Kreditkarte, keine versteckten Kosten, keine Verkaufsbühne am Ende.",
            },
            {
              q: "Für wen ist der Workshop gedacht?",
              a: "Für ambitionierte Menschen, die das Gefühl haben, dass mehr möglich ist — und neue Perspektiven suchen.",
            },
            {
              q: "Muss ich Vorerfahrung haben?",
              a: "Nein. Es geht um Orientierung, Richtung und moderne Möglichkeiten — kein Vorwissen nötig.",
            },
            {
              q: "Wird mir danach etwas verkauft?",
              a: "Wir zeigen dir, was möglich ist. Ob du einen nächsten Schritt gehen willst, entscheidest du in Ruhe — nicht im Workshop.",
            },
          ].map((f) => (
            <details key={f.q} className="group p-6">
              <summary className="flex cursor-pointer list-none items-center justify-between text-left text-white/90">
                <span className="font-medium">{f.q}</span>
                <span className="ml-4 text-[#C9A84C] transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-4 text-sm leading-relaxed text-white/65">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      {/* ───── FORM ───── */}
      <section ref={formRef} className="relative py-24 md:py-32">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(50% 60% at 50% 40%, rgba(201,168,76,0.14) 0%, rgba(11,11,14,0) 70%)",
          }}
        />
        <div className="container mx-auto max-w-xl px-6">
          {done ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-3xl border border-[#C9A84C]/30 bg-white/[0.03] p-10 text-center"
            >
              <Check className="mx-auto h-10 w-10 text-[#C9A84C]" />
              <h3 className="mt-6 font-serif text-3xl" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                Schön, dass du dabei bist.
              </h3>
              <p className="mt-4 text-white/70">
                Du bekommst gleich eine E-Mail mit allen Details zum Workshop. Schau auch im Spam-Ordner nach — manchmal landet sie dort.
              </p>
            </motion.div>
          ) : (
            <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-8 md:p-10">
              <div className="text-center">
                <SectionEyebrow>Kostenlos anmelden</SectionEyebrow>
                <h3 className="mt-4 font-serif text-3xl md:text-4xl" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                  Sichere dir deinen Platz.
                </h3>
                <p className="mt-3 text-sm text-white/60">Nur Vorname & E-Mail. Mehr brauchen wir nicht.</p>
              </div>
              <form onSubmit={onSubmit} className="mt-8 space-y-3">
                <input
                  type="text"
                  required
                  value={first_name}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Vorname"
                  autoComplete="given-name"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white placeholder:text-white/40 outline-none focus:border-[#C9A84C]/60"
                />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="E-Mail"
                  autoComplete="email"
                  inputMode="email"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white placeholder:text-white/40 outline-none focus:border-[#C9A84C]/60"
                />
                {error && <div className="text-sm text-red-400">{error}</div>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="group w-full rounded-xl bg-[#C9A84C] px-6 py-4 text-sm font-medium text-[#1A1A1A] transition-all hover:brightness-110 disabled:opacity-60"
                >
                  {submitting ? "Wird gesendet…" : ctaLabel}
                </button>
                <p className="pt-2 text-center text-[11px] text-white/40">
                  Deine Daten werden vertraulich behandelt. Keine Werbeflut. Jederzeit abmeldbar.
                </p>
              </form>
            </div>
          )}
        </div>
      </section>

      {/* ───── FOOTER ───── */}
      <footer className="border-t border-white/[0.06] py-10 text-center text-xs text-white/40">
        © {new Date().getFullYear()} Ethical Closer · <a href="/impressum" className="hover:text-white/70">Impressum</a> · <a href="/privacy" className="hover:text-white/70">Datenschutz</a>
      </footer>

      {/* ───── MOBILE STICKY CTA ───── */}
      {!done && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0B0B0E]/95 p-3 backdrop-blur md:hidden">
          <button
            onClick={() => scrollToForm("sticky")}
            className="w-full rounded-xl bg-[#C9A84C] px-6 py-3.5 text-sm font-medium text-[#1A1A1A]"
          >
            {ctaLabel}
          </button>
        </div>
      )}
    </div>
  );
};

/* ---------- atoms ---------- */

const Section = ({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "quiet" | "warm" }) => {
  const bg =
    tone === "quiet"
      ? "bg-[#0E0E12]"
      : tone === "warm"
      ? "bg-gradient-to-b from-[#0B0B0E] via-[#100F11] to-[#0B0B0E]"
      : "bg-[#0B0B0E]";
  return (
    <section className={`${bg} py-20 md:py-28`}>
      <div className="container mx-auto max-w-5xl px-6">{children}</div>
    </section>
  );
};

const SectionEyebrow = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[11px] uppercase tracking-[0.22em] text-[#C9A84C]/80">{children}</div>
);

const SerifH2 = ({ children }: { children: React.ReactNode }) => (
  <h2
    className="mt-4 font-serif text-3xl leading-[1.15] text-white md:text-5xl"
    style={{ fontFamily: "'Cormorant Garamond', serif" }}
  >
    {children}
  </h2>
);

export default Workshop;
