/**
 * Phase 10.3 — Salesbook WhatsApp landing
 *
 * Route: /salesbook
 * Single WhatsApp CTA → opens wa.me link, tracks click, redirects to
 * /closer-karriere/danke after a short delay. Strictly additive.
 */
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, BookOpen, MessageCircle, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAbSlot } from "@/hooks/useAbSlot";
import { trackFunnelEvent } from "@/lib/track-event";
import { MOS_REGISTER_ENABLED } from "@/lib/closer-karriere-flag";
import {
  SALESBOOK_WHATSAPP_NUMBER,
  SALESBOOK_WHATSAPP_MESSAGE,
  buildSalesbookWhatsAppLink,
} from "@/lib/salesbook-config";

const PAGE_CTA_SLOT = {
  slot: "mos_salesbook_page_cta",
  variants: [
    { id: "control" },
    { id: "A_oeffnen" },
    { id: "B_anfordern" },
  ],
} as const;

const PAGE_CTA_COPY: Record<string, string> = {
  control: "Salesbook per WhatsApp erhalten",
  A_oeffnen: "WhatsApp öffnen & Salesbook sichern",
  B_anfordern: "Jetzt per WhatsApp anfordern",
};

const FUNNEL = "closer_karriere_register";
const REDIRECT_DELAY_MS = 1500;

export default function Salesbook() {
  if (!MOS_REGISTER_ENABLED) return <Navigate to="/" replace />;

  const navigate = useNavigate();
  const ctaSlot = useAbSlot(PAGE_CTA_SLOT);
  const ctaLabel = PAGE_CTA_COPY[ctaSlot.variant] ?? PAGE_CTA_COPY.control;
  const [clicked, setClicked] = useState(false);
  const waLink = buildSalesbookWhatsAppLink(
    SALESBOOK_WHATSAPP_NUMBER,
    SALESBOOK_WHATSAPP_MESSAGE,
  );

  const viewFiredRef = useRef(false);
  useEffect(() => {
    document.title = "Dein Salesbook — Ethical Top Closer™";
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
      "Hol dir das Ethical Top Closer Salesbook kostenlos per WhatsApp.",
    );

    if (!viewFiredRef.current) {
      viewFiredRef.current = true;
      trackFunnelEvent("closer_karriere_salesbook_view", {
        funnel: FUNNEL,
        ab_page_cta: ctaSlot.variant,
      });
    }
  }, [ctaSlot.variant]);

  const handleWhatsAppClick = () => {
    if (clicked) return;
    setClicked(true);
    try {
      sessionStorage.setItem("salesbook_whatsapp_clicked", "true");
    } catch {
      /* ignore */
    }
    trackFunnelEvent("closer_karriere_salesbook_whatsapp_click", {
      funnel: FUNNEL,
      ab_page_cta: ctaSlot.variant,
    });
    // Open in new tab; browsers will route to native WhatsApp app on mobile.
    try {
      window.open(waLink, "_blank", "noopener,noreferrer");
    } catch {
      window.location.href = waLink;
    }
    window.setTimeout(() => {
      navigate("/closer-karriere/danke");
    }, REDIRECT_DELAY_MS);
  };

  return (
    <main className="min-h-screen bg-background text-foreground antialiased">
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-foreground via-foreground to-background/95" />
        <div className="mx-auto flex max-w-3xl flex-col items-center px-6 py-24 text-center md:py-32">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-[11px] uppercase tracking-[0.22em] text-white/80 backdrop-blur-sm">
            <BookOpen className="h-3.5 w-3.5 text-accent" /> Dein kostenloses Salesbook
          </span>

          <h1 className="font-serif text-3xl font-medium leading-[1.15] tracking-tight text-white md:text-5xl">
            Dein kostenloses Salesbook wartet auf dich.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/75 md:text-lg">
            Klicke auf den WhatsApp-Button und schreibe uns kurz. Danach leiten wir
            dich zum nächsten Schritt weiter.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3">
            <Button
              size="lg"
              onClick={handleWhatsAppClick}
              disabled={clicked}
              className="h-14 rounded-xl bg-[#25D366] px-8 text-base font-medium text-black shadow-[0_10px_40px_-10px_rgba(37,211,102,0.6)] hover:bg-[#25D366]/90"
            >
              <MessageCircle className="mr-1 h-4 w-4" />
              {clicked ? "WhatsApp geöffnet — du wirst weitergeleitet…" : ctaLabel}
              {!clicked && <ArrowRight className="ml-1 h-4 w-4" />}
            </Button>

            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleWhatsAppClick}
              className="mt-2 text-[12px] text-white/55 underline-offset-4 hover:text-white hover:underline"
            >
              Falls WhatsApp nicht öffnet, hier klicken
            </a>
          </div>

          <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12px] text-white/65">
            <li className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" /> kostenlos
            </li>
            <li className="inline-flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5 text-accent" /> per WhatsApp
            </li>
            <li className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" /> keine Verpflichtung
            </li>
          </ul>

          <p className="mt-12 text-[11px] uppercase tracking-[0.25em] text-white/40">
            Ethical Top Closer™
          </p>
        </div>
      </section>

      <footer className="border-t border-border bg-background py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 text-xs text-muted-foreground md:flex-row">
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
