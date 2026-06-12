/**
 * /apply Audience Cohort Detection
 *
 * Detects whether the visitor likely came from a male / ambition / career-focused
 * ad creative based on UTM parameters and persists the cohort sticky per browser
 * for 30 days. Used by ApplyLanding to swap the hero headline + primary CTA copy
 * to a male-psychology variant ("Fortschritt / Zukunft / Selbstbestimmung")
 * without changing the funnel mechanics.
 *
 * Cohorts:
 *  - "male_ambition": ambition / career / freedom / status / control creatives
 *  - "default":       everything else (current copy)
 *
 * Detection signals (case-insensitive substring match on UTM fields):
 *  - utm_campaign / utm_content / utm_term / utm_source contain any of the
 *    keywords below → "male_ambition"
 *  - explicit ?audience=men|male|ambition|career override (manual QA)
 *
 * Sticky for 30d so a returning visitor keeps the same cohort across ad clicks.
 * SSR-safe; falls back to "default" without storage access.
 */

const STORAGE_KEY = "ec_apply_audience_v1";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type ApplyAudience = "male_ambition" | "default";

interface Stored {
  cohort: ApplyAudience;
  assignedAt: number;
  source: "utm" | "override" | "fallback";
}

// Keywords that strongly correlate with male / ambition / career creatives.
// Conservative on purpose — we'd rather miss a few than mis-classify a female
// emotion-led visitor into the male cohort.
const MALE_AMBITION_KEYWORDS = [
  "men", "male", "maenner", "männer", "mann",
  "ambition", "ambitious", "ehrgeiz",
  "career", "karriere", "karriereweg",
  "freiheit", "freedom",
  "status", "kontrolle", "control",
  "selbstbestimmung", "selbst",
  "fortschritt", "progress", "momentum",
  "potenzial", "potential", "skill", "skills",
  "future", "zukunft",
];

const isBrowser = () => typeof window !== "undefined";

function readStored(): Stored | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (
      (parsed.cohort === "male_ambition" || parsed.cohort === "default") &&
      typeof parsed.assignedAt === "number" &&
      Date.now() - parsed.assignedAt < TTL_MS
    ) {
      return parsed as Stored;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeStored(value: Stored) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function detectFromQuery(): { cohort: ApplyAudience; source: Stored["source"] } {
  if (!isBrowser()) return { cohort: "default", source: "fallback" };
  try {
    const params = new URLSearchParams(window.location.search);
    const overrideRaw = (params.get("aud") || params.get("audience") || "").toLowerCase();
    if (["men", "male", "ambition", "career", "karriere", "m"].includes(overrideRaw)) {
      return { cohort: "male_ambition", source: "override" };
    }
    if (["women", "female", "default", "f", "w"].includes(overrideRaw)) {
      return { cohort: "default", source: "override" };
    }
    // NOTE: UTM-keyword auto-classification REMOVED on purpose.
    // It was misclassifying women's /apply traffic as male_ambition because
    // the women's funnel now also sells "Freiheit / Zukunft / Selbstbestimmung",
    // and routed those visitors to /booking-men. Audience is now derived
    // strictly from the route (`/apply` = default = women, `/masterofsales` =
    // male_ambition via explicit setApplyAudience() call) plus the explicit
    // `?aud=` query override. No more UTM keyword guessing.
  } catch {
    /* ignore */
  }
  return { cohort: "default", source: "fallback" };
}

/**
 * Returns the resolved audience cohort. Sticky for 30d after first visit.
 */
export function getApplyAudience(): ApplyAudience {
  const detected = detectFromQuery();
  // Explicit ?aud=/?audience= override always wins and is persisted, so QA
  // toggles flip immediately and stick across navigations.
  if (detected.source === "override") {
    writeStored({ cohort: detected.cohort, assignedAt: Date.now(), source: "override" });
    return detected.cohort;
  }
  const stored = readStored();
  if (stored) return stored.cohort;
  // Only persist a UTM-detected ambition signal so a later UTM click can
  // still flip a non-classified visitor.
  if (detected.cohort === "male_ambition") {
    writeStored({ cohort: detected.cohort, assignedAt: Date.now(), source: detected.source });
  }
  return detected.cohort;
}

/**
 * For tests / debug overlay. Forces the cohort.
 */
export function setApplyAudience(cohort: ApplyAudience) {
  writeStored({ cohort, assignedAt: Date.now(), source: "override" });
}

export const APPLY_AUDIENCE_STORAGE_KEY = STORAGE_KEY;
