import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  CONSENT_KEY,
  grantPixelConsent,
  revokePixelConsent,
} from '@/lib/meta-pixel-consent';

/**
 * Bottom-anchored cookie banner. Mirrors its height into a CSS variable
 * (--cookie-banner-h) so other bottom-anchored elements (e.g. the /apply
 * sticky CTA) can shift above it instead of being visually overlapped.
 */
export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (!consent) {
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Publish banner height as a CSS variable on <html>. Cleared when the
  // banner is dismissed/accepted so dependent layouts collapse cleanly.
  useEffect(() => {
    const root = document.documentElement;
    if (!visible) {
      root.style.removeProperty('--cookie-banner-h');
      return;
    }
    const measure = () => {
      const h = ref.current?.getBoundingClientRect().height ?? 0;
      root.style.setProperty('--cookie-banner-h', `${Math.round(h)}px`);
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' && ref.current
      ? new ResizeObserver(measure)
      : null;
    if (ro && ref.current) ro.observe(ref.current);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      if (ro) ro.disconnect();
      root.style.removeProperty('--cookie-banner-h');
    };
  }, [visible]);

  const accept = () => {
    // Persists consent + injects fbevents.js + inits + fires the single
    // activation PageView (seeds route-listener dedup state).
    grantPixelConsent();
    setVisible(false);
    window.dispatchEvent(new CustomEvent('analytics', { detail: { event: 'cookie_consent', value: 'accepted' } }));
  };

  const decline = () => {
    revokePixelConsent();
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          ref={ref}
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed bottom-0 left-0 right-0 z-[60] border-t border-border bg-card/98 backdrop-blur-md"
        >
          <div className="container mx-auto flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:py-3">
            <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
              Wir verwenden Cookies, um dir die bestmögliche Erfahrung zu bieten.{' '}
              <Link to="/datenschutz" className="underline hover:text-foreground">
                Datenschutzerklärung
              </Link>
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={decline}
                className="rounded-sm border border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
              >
                Nur essenzielle
              </button>
              <button
                onClick={accept}
                className="rounded-sm bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Alle akzeptieren
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
