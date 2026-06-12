import { useLocation } from "react-router-dom";
import { LanguageToggle } from "@/i18n/LanguageContext";

/**
 * Layer 48.8 — Global Language Switcher (Landing Pages)
 *
 * Renders a fixed DE/EN pill on the root `/` and every public landing page,
 * EXCEPT /apply and any /apply/* sub-route (locked to the experimentation OS).
 *
 * Decision is route-based (allow-list of landing prefixes). Member, auth,
 * checkout, partner, webinar, legal and admin routes already have their own
 * chrome and should NOT get a duplicate floating switch.
 */

// Exact paths or path prefixes that count as public landing surfaces.
// Order matters only for readability — match is exact-or-prefix.
const LANDING_PREFIXES: readonly string[] = [
  "/", // root
  "/start",
  "/freiheit",
  "/income",
  "/lifestyle",
  "/closerpath",
  "/system",
  "/high-income-skill",
  "/qualify",
  "/insider",
  "/nextrealstep",
  "/partners",
];

// Hard exclusions — even if they would otherwise match, never show the switch.
const EXCLUDED_PREFIXES: readonly string[] = [
  "/apply", // Experimentation OS — locked surface, no language switch.
];

function isLandingRoute(pathname: string): boolean {
  // Normalize trailing slash (except root).
  const path =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;

  // Excluded wins over landing.
  for (const ex of EXCLUDED_PREFIXES) {
    if (path === ex || path.startsWith(`${ex}/`)) return false;
  }

  for (const lp of LANDING_PREFIXES) {
    if (lp === "/") {
      if (path === "/") return true;
      continue;
    }
    if (path === lp || path.startsWith(`${lp}/`)) return true;
  }
  return false;
}

export default function GlobalLanguageSwitcher() {
  const { pathname } = useLocation();
  if (!isLandingRoute(pathname)) return null;

  return (
    <div
      className="fixed top-4 right-4 z-50 print:hidden"
      data-testid="global-language-switcher"
      aria-label="Sprache wechseln"
    >
      <LanguageToggle />
    </div>
  );
}

// Exposed for tests / debugging.
export const __test__ = { isLandingRoute, LANDING_PREFIXES, EXCLUDED_PREFIXES };
