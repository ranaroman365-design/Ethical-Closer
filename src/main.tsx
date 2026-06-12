import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { captureReferralFromUrl } from "./lib/referral-attribution";
import { captureAdAttributionFromUrl } from "./lib/ad-attribution";
import { initMetaPixel } from "./lib/meta-pixel";
import { hasPixelConsent, grantPixelConsent } from "./lib/meta-pixel-consent";
import { initTheme } from "./hooks/useTheme";

initTheme();
captureReferralFromUrl();
captureAdAttributionFromUrl();

// Meta Pixel: pixel ID published globally so trackPixelEvent() can read it.
// fbevents.js is NOT auto-loaded — only after explicit consent.
// Active Meta Pixel ID. Old pixel (1925554318156919) fully retired.
window.__META_PIXEL_ID__ = "788225560805467";
initMetaPixel();

// If the visitor previously accepted, activate the pixel now (loads script,
// inits, and fires the single activation PageView for the current path).
if (hasPixelConsent()) {
  grantPixelConsent();
}

createRoot(document.getElementById("root")!).render(<App />);

