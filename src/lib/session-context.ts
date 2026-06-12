/**
 * Session Context — overlay on top of user roles.
 *
 * Some entry points (notably the applicant magic link from
 * `provision-applicant-account`) must FORCE a restricted scope even when the
 * underlying account also has admin / partner / member roles.
 *
 * Rule: magic-link context > role. If `current_session_context === 'applicant'`,
 * the user is treated as L0 applicant for routing + UI, no matter what their
 * `user_roles` row says. They can explicitly switch out via `clearSessionContext()`
 * (the "Zum Adminbereich wechseln" action) — never automatically.
 */

export type SessionContext = "applicant" | null;

const KEY = "current_session_context";
const APPLICANT_HOME = "/members/interview";

/** Routes an applicant session is allowed to visit inside /members. */
const APPLICANT_ALLOWED_PREFIXES = [
  "/members/interview",
  "/members/dashboard", // L0 applicant dashboard landing (Magic Link target)
  "/members/calendar",
  "/members/onboarding",
  "/members/welcome",
  "/members/payment-links",
  "/members/payment",
  "/members/checkout",
  "/members/logout",
  "/members/portal-preview",
  "/members/start",
  "/members/path", // career-path teaser is read-only & safe
];

/** Anything outside /members is always allowed (public landings, /quiz, etc.). */
export function isApplicantAllowedPath(pathname: string): boolean {
  if (!pathname.startsWith("/members")) return true;
  return APPLICANT_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
}

export function getSessionContext(): SessionContext {
  try {
    const v = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(KEY) : null;
    return v === "applicant" ? "applicant" : null;
  } catch {
    return null;
  }
}

export function setSessionContext(ctx: SessionContext) {
  try {
    if (ctx) sessionStorage.setItem(KEY, ctx);
    else sessionStorage.removeItem(KEY);
  } catch { /* ignore */ }
}

export function clearSessionContext() {
  setSessionContext(null);
}

/**
 * Read a `?ctx=applicant` query param from the current URL and persist it.
 * Called on every protected-route render so an applicant magic link locks
 * the session into applicant scope before any role-based redirect runs.
 */
export function captureSessionContextFromUrl(search: string): SessionContext {
  try {
    const params = new URLSearchParams(search);
    const ctx = params.get("ctx");
    if (ctx === "applicant") {
      setSessionContext("applicant");
      return "applicant";
    }
  } catch { /* ignore */ }
  return getSessionContext();
}

export const APPLICANT_PORTAL_PATH = APPLICANT_HOME;
