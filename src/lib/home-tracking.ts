/**
 * Marketing-root tracking — mirrors the /apply and /qualify event schema so
 * paid traffic landing on `/` can be A/B-tested and attributed end-to-end.
 *
 * Event family:
 *   - home_view                     (mount, deduped per session)
 *   - scroll_25 / 50 / 75 / 90      (canonical snake_case, parity with /qualify)
 *   - home_section_view             (per section, deduped per session)
 *   - home_cta_click                (every CTA on the root page)
 *   - home_faq_open                 (FAQ accordion expand)
 *   - home_exit_intent              (mouse leaves viewport top — desktop)
 *
 * All events carry:
 *   funnel: "home"
 *   page_path: "/"
 *   experiment_id: "home_root_v1"
 *   utm_source / utm_medium / utm_campaign / utm_content / utm_term (if present)
 *   referrer (first-touch, sessionStorage-cached)
 *
 * NOTE: trackFunnelEvent already mirrors to Meta Pixel via FUNNEL_TO_PIXEL —
 * adding new event names here is safe (unknown events are no-ops on the pixel).
 */
import { useEffect, useRef } from "react";
import { trackFunnelEvent } from "@/lib/track-event";

export const HOME_FUNNEL_ID = "home";
export const HOME_EXPERIMENT_ID = "home_root_v1";
const SESSION_KEY = "home_tracking_ctx_v1";
const VIEW_KEY = "home_view_fired_v1";
const SECTION_PREFIX = "home_section_fired_v1:";
const SCROLL_PREFIX = "home_scroll_fired_v1:";
const EXIT_KEY = "home_exit_fired_v1";
const PROOF_VIEW_PREFIX = "home_proof_view_fired_v1:";

/**
 * Canonical proof-element types. Extend here as new social-proof formats
 * (video embeds, case-study links, payout screenshots) get added so the
 * analytics schema stays MECE.
 */
export type ProofType =
  | "metric"
  | "testimonial_card"
  | "testimonial_photo"
  | "testimonial_video"
  | "case_study_link"
  | "screenshot"
  | "logo_bar"
  | "avatar_stack"
  | "external_verification";

interface HomeContext {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer?: string;
  landing_path?: string;
}

const isBrowser = () => typeof window !== "undefined";

const captureContext = (): HomeContext => {
  if (!isBrowser()) return {};
  try {
    const cached = sessionStorage.getItem(SESSION_KEY);
    if (cached) return JSON.parse(cached) as HomeContext;
  } catch { /* ignore */ }

  const params = new URLSearchParams(window.location.search);
  const ctx: HomeContext = {
    utm_source: params.get("utm_source") ?? undefined,
    utm_medium: params.get("utm_medium") ?? undefined,
    utm_campaign: params.get("utm_campaign") ?? undefined,
    utm_content: params.get("utm_content") ?? undefined,
    utm_term: params.get("utm_term") ?? undefined,
    referrer: document.referrer || undefined,
    landing_path: window.location.pathname || "/",
  };

  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(ctx));
  } catch { /* ignore */ }
  return ctx;
};

const basePayload = (extra: Record<string, unknown> = {}) => ({
  funnel: HOME_FUNNEL_ID,
  page_path: "/",
  experiment_id: HOME_EXPERIMENT_ID,
  ...captureContext(),
  ...extra,
});

const firedOnce = (key: string): boolean => {
  if (!isBrowser()) return true;
  try {
    if (sessionStorage.getItem(key)) return true;
    sessionStorage.setItem(key, "1");
  } catch { /* ignore */ }
  return false;
};

/* -------------------- Public helpers -------------------- */

export const trackHomeCta = (
  ctaId: string,
  location: string,
  destination: string,
  extra: Record<string, unknown> = {},
) => {
  trackFunnelEvent(
    "home_cta_click",
    basePayload({ cta_id: ctaId, location, destination, ...extra }),
  );
};

export const trackHomeSection = (sectionKey: string) => {
  if (firedOnce(SECTION_PREFIX + sectionKey)) return;
  trackFunnelEvent(
    "home_section_view",
    basePayload({ section_key: sectionKey }),
  );
};

export const trackHomeFaqOpen = (questionKey: string, categoryKey?: string) => {
  trackFunnelEvent(
    "home_faq_open",
    basePayload({ question_key: questionKey, category_key: categoryKey ?? null }),
  );
};

/* -------------------- Social proof tracking -------------------- */

interface ProofMeta {
  /** Visual / source label (e.g. "sarah_m", "case_acme_2024"). */
  proofId: string;
  /** Canonical type for funnel grouping. */
  proofType: ProofType;
  /** Section the element lives in (matches data-home-section keys). */
  location: string;
  /** Optional zero-based index for ordered grids. */
  position?: number;
  /** Optional outbound URL or media src for click events. */
  destination?: string;
  /** Free-form passthrough (asset_kind, duration, verified flag, etc.). */
  extra?: Record<string, unknown>;
}

/**
 * Fires `home_proof_view` exactly once per session per proof element.
 * Use via `useProofViewTracker` for IntersectionObserver wiring.
 */
export const trackProofView = (meta: ProofMeta) => {
  const key = `${PROOF_VIEW_PREFIX}${meta.proofType}:${meta.proofId}`;
  if (firedOnce(key)) return;
  trackFunnelEvent(
    "home_proof_view",
    basePayload({
      proof_id: meta.proofId,
      proof_type: meta.proofType,
      location: meta.location,
      position: meta.position ?? null,
      destination: meta.destination ?? null,
      ...(meta.extra ?? {}),
    }),
  );
};

/**
 * Fires `home_proof_click` on every interaction (NOT deduped — repeated
 * clicks on the same proof element are signal, not noise).
 */
export const trackProofClick = (meta: ProofMeta) => {
  trackFunnelEvent(
    "home_proof_click",
    basePayload({
      proof_id: meta.proofId,
      proof_type: meta.proofType,
      location: meta.location,
      position: meta.position ?? null,
      destination: meta.destination ?? null,
      ...(meta.extra ?? {}),
    }),
  );
};

/**
 * Attach to any element that represents a social-proof asset. Fires
 * `home_proof_view` once when the element crosses the viewport threshold.
 * Returns a ref to spread onto the target element.
 */
export const useProofViewTracker = <T extends HTMLElement = HTMLElement>(
  meta: ProofMeta,
  threshold = 0.5,
) => {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!isBrowser()) return;
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            trackProofView(meta);
            observer.disconnect();
          }
        });
      },
      { threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.proofId, meta.proofType, meta.location]);

  return ref;
};

/* -------------------- Hook: page-level wiring -------------------- */

/**
 * Mount once at the root of `/`. Handles:
 *   - home_view (deduped)
 *   - scroll_25/50/75/90 (deduped per session)
 *   - home_exit_intent (desktop mouseleave-top, deduped)
 *   - section observers for every element with [data-home-section]
 */
export const useHomeTracking = () => {
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (!isBrowser()) return;

    // 1. Page view (deduped per session)
    if (!firedOnce(VIEW_KEY)) {
      trackFunnelEvent("home_view", basePayload());
    }

    // 2. Scroll depth — canonical snake_case parity with /qualify + /apply
    const thresholds = [25, 50, 75, 90] as const;
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      const pct = Math.min(100, Math.round((window.scrollY / max) * 100));
      thresholds.forEach((t) => {
        if (pct >= t && !firedOnce(SCROLL_PREFIX + t)) {
          trackFunnelEvent(`scroll_${t}`, basePayload({ depth: t }));
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // 3. Exit intent (desktop only)
    const onMouseLeave = (e: MouseEvent) => {
      if (e.clientY > 0) return;
      if (window.innerWidth < 1024) return;
      if (firedOnce(EXIT_KEY)) return;
      trackFunnelEvent(
        "home_exit_intent",
        basePayload({ scroll_y: window.scrollY }),
      );
    };
    document.addEventListener("mouseleave", onMouseLeave);

    // 4. Section observers (deduped per session per section)
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const key = (entry.target as HTMLElement).dataset.homeSection;
          if (!key) return;
          trackHomeSection(key);
        });
      },
      { threshold: 0.4 },
    );
    observerRef.current = observer;
    document
      .querySelectorAll<HTMLElement>("[data-home-section]")
      .forEach((el) => observer.observe(el));

    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("mouseleave", onMouseLeave);
      observer.disconnect();
      observerRef.current = null;
    };
  }, []);
};
