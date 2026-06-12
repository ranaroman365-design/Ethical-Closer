/**
 * Phase 10.3 / 10.4 — Salesbook WhatsApp Offer (interstitial, premium upgrade)
 *
 * Route: /closer-karriere/salesbook-offer
 * Strictly additive UI/CRO layer. No changes to lead capture, tracking,
 * routing, GHL, attribution, session storage or WhatsApp redirect.
 */
import { useEffect, useRef } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, Check, ShieldCheck, MessageCircle, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAbSlot } from "@/hooks/useAbSlot";
import { trackFunnelEvent } from "@/lib/track-event";
import { MOS_REGISTER_ENABLED } from "@/lib/closer-karriere-flag";
import bundleImage from "@/assets/closer-karriere/salesbook-bundle.jpg";

// ---------------------------------------------------------------------------
// A/B slots (Phase 10.4 — additive)
// ---------------------------------------------------------------------------

const HEADLINE_SLOT = {
  slot: "mos_salesbook_headline",
  variants: [
    { id: "control" },
    { id: "A_intern_genutzt" },
    { id: "B_erste_verkaufsgespraeche" },
    { id: "C_100_euro_wert" },
  ],
} as const;

const HEADLINE_COPY: Record<string, { title: string; sub: string }> = {
  control: {
    title:
      "Bevor du gehst: Sichere dir kostenlos das Salesbook, mit dem angehende Closer ihre ersten echten Verkaufsgespräche vorbereiten.",
    sub: "Normalerweise nur intern genutzt. Heute kostenlos per WhatsApp.",
  },
  A_intern_genutzt: {
    title:
      "Das interne Salesbook, das unsere Closer vor jedem Erstgespräch nutzen — heute kostenlos für dich.",
    sub: "Normalerweise nur intern genutzt. Heute kostenlos per WhatsApp.",
  },
  B_erste_verkaufsgespraeche: {
    title:
      "Bevor du dein erstes echtes Verkaufsgespräch führst: Hol dir das komplette Vorbereitungs-Paket.",
    sub: "Das Material, mit dem angehende Closer ihre ersten Calls vorbereiten.",
  },
  C_100_euro_wert: {
    title:
      "Premium Closer-Starterpaket im Wert von 100 € — heute kostenlos per WhatsApp.",
    sub: "Salesbook, Gesprächsleitfaden, Discovery-Fragen, Closing-Framework.",
  },
};

const CTA_SLOT = {
  slot: "mos_salesbook_cta",
  variants: [
    { id: "control" },
    { id: "A_kostenlos_sichern" },
    { id: "B_whatsapp_erhalten" },
    { id: "C_freischalten" },
  ],
} as const;

const CTA_COPY: Record<string, string> = {
  control: "Ja, Salesbook kostenlos sichern",
  A_kostenlos_sichern: "Ja, Salesbook kostenlos sichern",
  B_whatsapp_erhalten: "Ja, per WhatsApp erhalten",
  C_freischalten: "Salesbook jetzt freischalten",
};

const BADGE_SLOT = {
  slot: "mos_salesbook_value_badge",
  variants: [
    { id: "control" },
    { id: "A_100_euro" },
    { id: "B_internes_material" },
    { id: "C_bonus_paket" },
  ],
} as const;

const BADGE_COPY: Record<string, { line1: string; line2: string }> = {
  control: { line1: "Wert: 100 €", line2: "Heute kostenlos" },
  A_100_euro: { line1: "Wert: 100 €", line2: "Heute kostenlos" },
  B_internes_material: { line1: "Internes Material", line2: "Heute freigegeben" },
  C_bonus_paket: { line1: "Bonus-Paket", line2: "Kostenlos sichern" },
};

const VALUE_STACK: ReadonlyArray<string> = [
  "Salesbook (PDF)",
  "Gesprächsleitfaden",
  "Discovery-Fragen",
  "Einwandbehandlung",
  "Gesprächsvorbereitung",
  "Closing-Framework",
  "WhatsApp-Zugang",
];

const FUNNEL = "closer_karriere_register";

export default function CloserKarriereSalesbookOffer() {
  if (!MOS_REGISTER_ENABLED) return <Navigate to="/" replace />;

  const navigate = useNavigate();
  const headlineSlot = useAbSlot(HEADLINE_SLOT);
  const ctaSlot = useAbSlot(CTA_SLOT);
  const badgeSlot = useAbSlot(BADGE_SLOT);
  const headline = HEADLINE_COPY[headlineSlot.variant] ?? HEADLINE_COPY.control;
  const ctaLabel = CTA_COPY[ctaSlot.variant] ?? CTA_COPY.control;
  const badge = BADGE_COPY[badgeSlot.variant] ?? BADGE_COPY.control;

  const viewFiredRef = useRef(false);
  useEffect(() => {
    document.title = "Premium Closer-Starterpaket — Ethical Top Closer™";
    const setMeta = (name: string, content: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    setMeta("robots", "noindex,follow");
    setMeta(
      "description",
      "Premium Closer-Starterpaket — Salesbook, Gesprächsleitfaden und Frameworks kostenlos per WhatsApp.",
    );

    if (!viewFiredRef.current) {
      viewFiredRef.current = true;
      try {
        sessionStorage.setItem("salesbook_offer_seen", "true");
      } catch {
        /* ignore */
      }
      trackFunnelEvent("closer_karriere_salesbook_offer_view", {
        funnel: FUNNEL,
        ab_offer_headline: headlineSlot.variant,
        ab_offer_cta: ctaSlot.variant,
        ab_offer_value_badge: badgeSlot.variant,
      });
    }
  }, [headlineSlot.variant, ctaSlot.variant, badgeSlot.variant]);

  const handleYes = () => {
    try {
      sessionStorage.setItem("salesbook_offer_choice", "yes");
    } catch {
      /* ignore */
    }
    trackFunnelEvent("closer_karriere_salesbook_offer_yes", {
      funnel: FUNNEL,
      ab_offer_headline: headlineSlot.variant,
      ab_offer_cta: ctaSlot.variant,
      ab_offer_value_badge: badgeSlot.variant,
    });
    navigate("/salesbook");
  };

  const handleNo = () => {
    try {
      sessionStorage.setItem("salesbook_offer_choice", "no");
    } catch {
      /* ignore */
    }
    trackFunnelEvent("closer_karriere_salesbook_offer_no", {
      funnel: FUNNEL,
      ab_offer_headline: headlineSlot.variant,
      ab_offer_cta: ctaSlot.variant,
      ab_offer_value_badge: badgeSlot.variant,
    });
    navigate("/closer-karriere/danke");
  };

  return (
    <main className="min-h-screen bg-[#0e0e10] text-white antialiased">
      <section className="relative isolate overflow-hidden">
        {/* Warm gold radial glow on anthracite */}
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(201,168,76,0.18),_transparent_55%),radial-gradient(ellipse_at_bottom,_rgba(201,168,76,0.10),_transparent_60%)]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#0a0a0b] via-[#0e0e10] to-[#0a0a0b]" />

        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:py-28 lg:grid-cols-2 lg:items-center lg:gap-16">
          {/* LEFT — Copy + value stack */}
          <div className="order-2 lg:order-1">
            {/* Value badge */}
            <div className="mb-6 inline-flex items-center gap-3 rounded-full border border-[#C9A84C]/40 bg-gradient-to-r from-[#C9A84C]/15 to-[#C9A84C]/5 px-5 py-2 backdrop-blur-sm">
              <Sparkles className="h-4 w-4 text-[#E8C766]" />
              <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#E8C766]">
                {badge.line1}
              </span>
              <span className="text-[11px] uppercase tracking-[0.18em] text-white/70">
                · {badge.line2}
              </span>
            </div>

            <h1 className="font-serif text-3xl font-medium leading-[1.15] tracking-tight text-white md:text-[42px]">
              {headline.title}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70 md:text-lg">
              {headline.sub}
            </p>

            {/* Value stack */}
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm md:p-7">
              <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.22em] text-[#E8C766]">
                Was du erhältst
              </p>
              <ul className="grid grid-cols-1 gap-y-3 sm:grid-cols-2 sm:gap-x-6">
                {VALUE_STACK.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-[15px] text-white/90">
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#C9A84C]/15 ring-1 ring-[#C9A84C]/40">
                      <Check className="h-3 w-3 text-[#E8C766]" strokeWidth={3} />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Micro proof */}
            <p className="mt-5 text-sm italic text-white/55">
              „Wird von Teilnehmern genutzt, bevor sie ihre ersten echten Verkaufsgespräche führen."
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <Button
                size="lg"
                onClick={handleYes}
                className="group h-14 rounded-xl bg-gradient-to-b from-[#D4B45A] to-[#B89236] px-8 text-base font-medium text-black shadow-[0_18px_45px_-12px_rgba(201,168,76,0.55)] ring-1 ring-[#C9A84C]/60 transition-all hover:from-[#E0C06A] hover:to-[#C49A40] hover:shadow-[0_22px_55px_-12px_rgba(201,168,76,0.7)]"
              >
                {ctaLabel}
                <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
              <button
                type="button"
                onClick={handleNo}
                className="text-sm text-white/45 underline-offset-4 transition-colors hover:text-white/70 hover:underline"
              >
                Nein, weiter ohne Salesbook
              </button>
            </div>

            <ul className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-white/55">
              <li className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-[#C9A84C]" /> kostenlos
              </li>
              <li className="inline-flex items-center gap-1.5">
                <MessageCircle className="h-3.5 w-3.5 text-[#C9A84C]" /> per WhatsApp
              </li>
              <li className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-[#C9A84C]" /> keine Verpflichtung
              </li>
            </ul>
          </div>

          {/* RIGHT — Premium bundle hero image */}
          <div className="relative order-1 lg:order-2">
            <div className="relative overflow-hidden rounded-3xl ring-1 ring-white/10 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.8)]">
              <img
                src={bundleImage}
                alt="Premium Closer-Starterpaket — Salesbook, Laptop, Smartphone, Workbook"
                width={1536}
                height={1152}
                className="block h-full w-full object-cover"
              />
              {/* Soft gold vignette */}
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_50%,_rgba(0,0,0,0.4))]" />
            </div>

            {/* Floating value badge */}
            <div className="absolute -right-3 -top-3 rotate-[6deg] rounded-2xl bg-[#C9A84C] px-4 py-3 text-center text-black shadow-[0_18px_40px_-12px_rgba(201,168,76,0.7)] ring-1 ring-[#A8862E] md:-right-5 md:-top-5">
              <div className="text-[10px] font-medium uppercase tracking-[0.18em]">{badge.line1}</div>
              <div className="text-[10px] uppercase tracking-[0.18em] opacity-80">{badge.line2}</div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[#0a0a0b] py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 text-xs text-white/45 md:flex-row">
          <span>© {new Date().getFullYear()} Ethical Closing — Ethical Top Closer™</span>
          <nav className="flex items-center gap-6">
            <Link to="/impressum" className="hover:text-white">Impressum</Link>
            <Link to="/datenschutz" className="hover:text-white">Datenschutz</Link>
            <Link to="/agb" className="hover:text-white">AGB</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
