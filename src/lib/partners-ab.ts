/**
 * Partners landing — A/B test registry
 * ────────────────────────────────────
 * Sticky, deterministic variant assignment for the /partners hero headline
 * and primary CTA copy. Persists 30 days in localStorage. Supports URL
 * overrides via `?ab_hero=A|B|C` and `?ab_cta=1|2` for QA and forced cohorts.
 *
 * All variant exposures and downstream conversions should be reported with
 * the variant ids returned by `getPartnersAbVariants()` so CTR, quiz/form
 * starts and booking rate can be compared per arm.
 */

export type HeroVariantId = "A" | "B" | "C";
export type CtaVariantId = "1" | "2";

type Localized = { de: string; en: string };

export interface HeroVariant {
  id: HeroVariantId;
  eyebrow: Localized;
  headline: Localized;
  subheadline: Localized;
}

export interface CtaVariant {
  id: CtaVariantId;
  primary: Localized;
  secondary: Localized;
}

export const HERO_VARIANTS: Record<HeroVariantId, HeroVariant> = {
  A: {
    id: "A",
    eyebrow: {
      en: "Revenue Infrastructure · Lead Autobahn™",
      de: "Revenue-Infrastruktur · Lead Autobahn™",
    },
    headline: {
      en: "Stop losing revenue inside your lead pool.",
      de: "Hör auf, Umsatz in deinem Lead-Pool zu verlieren.",
    },
    subheadline: {
      en: "Revenue OS™ helps high-ticket businesses identify, recover and systemize lost revenue across booking, show-up, closing and follow-up — using the Lead Autobahn™ framework.",
      de: "Revenue OS™ hilft High-Ticket-Unternehmen, verlorenen Umsatz über Buchung, Show-Up, Closing und Follow-up zu identifizieren, zurückzuholen und zu systematisieren — mit dem Lead Autobahn™ Framework.",
    },
  },
  B: {
    id: "B",
    eyebrow: {
      en: "Revenue Recovery · For high-ticket businesses",
      de: "Revenue Recovery · Für High-Ticket-Unternehmen",
    },
    headline: {
      en: "Your next €100k is already in your CRM.",
      de: "Deine nächsten €100k liegen bereits in deinem CRM.",
    },
    subheadline: {
      en: "Most high-ticket businesses lose 30–60% of revenue between lead, booking, show-up and close. Revenue OS™ finds the leak, recovers the cash, and turns ad-hoc selling into infrastructure.",
      de: "Die meisten High-Ticket-Unternehmen verlieren 30–60 % des Umsatzes zwischen Lead, Buchung, Show-Up und Close. Revenue OS™ findet das Leck, holt den Umsatz zurück und macht aus Ad-hoc-Verkauf eine Infrastruktur.",
    },
  },
  C: {
    id: "C",
    eyebrow: {
      en: "Managed Sales Operations · Revenue OS™",
      de: "Managed Sales Operations · Revenue OS™",
    },
    headline: {
      en: "Build a sales engine that runs without you.",
      de: "Bau eine Vertriebsmaschine, die ohne dich läuft.",
    },
    subheadline: {
      en: "From lead routing to closer cadence and KPI ownership — we operate the infrastructure that turns existing demand into predictable, scalable revenue.",
      de: "Von Lead-Routing über Closer-Kadenz bis zu KPI-Ownership — wir betreiben die Infrastruktur, die bestehende Nachfrage in planbaren, skalierbaren Umsatz verwandelt.",
    },
  },
};

export const CTA_VARIANTS: Record<CtaVariantId, CtaVariant> = {
  "1": {
    id: "1",
    primary: { en: "Book Revenue Snapshot", de: "Revenue Snapshot buchen" },
    secondary: { en: "See how it works", de: "So funktioniert's" },
  },
  "2": {
    id: "2",
    primary: { en: "Find your Revenue Drag", de: "Finde deinen Revenue Drag" },
    secondary: { en: "Show me the Autobahn", de: "Zeig mir die Autobahn" },
  },
};

const STORAGE_KEY = "etc:partners:ab:v1";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface StoredAssignment {
  hero: HeroVariantId;
  cta: CtaVariantId;
  assignedAt: number;
}

function pickRandom<T extends string>(pool: readonly T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

function readUrlOverride(): Partial<StoredAssignment> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const hero = params.get("ab_hero")?.toUpperCase();
  const cta = params.get("ab_cta");
  const out: Partial<StoredAssignment> = {};
  if (hero && hero in HERO_VARIANTS) out.hero = hero as HeroVariantId;
  if (cta && cta in CTA_VARIANTS) out.cta = cta as CtaVariantId;
  return out;
}

export interface PartnersAbAssignment {
  hero: HeroVariant;
  cta: CtaVariant;
  heroId: HeroVariantId;
  ctaId: CtaVariantId;
  /** Identifier used for analytics joins. */
  combo: string;
}

export function getPartnersAbVariants(): PartnersAbAssignment {
  let stored: StoredAssignment | null = null;
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredAssignment;
        if (parsed && Date.now() - parsed.assignedAt < TTL_MS) {
          stored = parsed;
        }
      }
    } catch {
      /* ignore corrupted storage */
    }
  }

  const override = readUrlOverride();
  const hero =
    override.hero ??
    stored?.hero ??
    pickRandom(Object.keys(HERO_VARIANTS) as HeroVariantId[]);
  const cta =
    override.cta ??
    stored?.cta ??
    pickRandom(Object.keys(CTA_VARIANTS) as CtaVariantId[]);

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ hero, cta, assignedAt: stored?.assignedAt ?? Date.now() }),
      );
    } catch {
      /* storage disabled — non-fatal */
    }
  }

  return {
    hero: HERO_VARIANTS[hero],
    cta: CTA_VARIANTS[cta],
    heroId: hero,
    ctaId: cta,
    combo: `${hero}-${cta}`,
  };
}
