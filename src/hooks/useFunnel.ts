import { useLocation } from "react-router-dom";

export const FUNNELS = ["start", "freiheit", "income", "lifestyle"] as const;
export type FunnelId = (typeof FUNNELS)[number];

/**
 * Reads funnel namespace from URL path (first segment).
 * Returns the funnel id and a helper to build namespaced paths.
 */
export function useFunnel(): { funnel: FunnelId; path: (slug: string) => string } {
  const { pathname } = useLocation();
  const seg = pathname.split("/").filter(Boolean)[0] as FunnelId | undefined;
  const funnel: FunnelId = seg && (FUNNELS as readonly string[]).includes(seg) ? seg : "start";
  return {
    funnel,
    path: (slug: string) => `/${funnel}/${slug}`,
  };
}
