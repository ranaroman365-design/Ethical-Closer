import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPixelEvent } from "@/lib/meta-pixel";

/**
 * SPA-safe PageView for Meta Pixel.
 * Fires `ROUTE_VIEW` (→ Meta `PageView`) on every meaningful path change.
 * `trackPixelEvent` already de-dupes identical consecutive paths, so this
 * is safe against rerenders and replace-state navigations.
 *
 * Mount once inside <BrowserRouter>. The initial paint is already covered
 * by main.tsx's `LP_VIEW`, so we skip the very first render here to avoid
 * a duplicate PageView on cold load.
 */
export default function MetaPixelRouteListener() {
  const location = useLocation();

  useEffect(() => {
    // Skip the first render (handled by main.tsx LP_VIEW).
    if ((MetaPixelRouteListener as any)._primed !== true) {
      (MetaPixelRouteListener as any)._primed = true;
      return;
    }
    trackPixelEvent("ROUTE_VIEW", { path: location.pathname });
  }, [location.pathname]);

  return null;
}
