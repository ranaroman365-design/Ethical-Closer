import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ShieldCheck, AlertTriangle, Lock, Clock, CheckCircle2 } from 'lucide-react';
import { DEAL_CONFIG, formatAmountEur, type DealConfigKey } from '@/config/stripePrices';

/**
 * /checkout/recover/:token — dedicated "Payment failed — complete securely" page.
 *
 * Strategy:
 *  - Apple Pay first (largest, top), one-tap to retry payment_url.
 *  - Calm, premium recovery framing (no shame, no "failed" shouting).
 *  - 10-minute recovery hint countdown — your slot is held; soft urgency.
 *  - Falls back to the regular checkout for card / Klarna / IBAN.
 *
 * Backend: reuses `get_payment_link_by_token` + the existing `payment_url`
 * created by payment-recovery-flow / create-payment-link.
 */

type LinkRow = {
  token: string;
  status: string;
  expires_at: string | null;
  payment_url: string | null;
  amount: number | null;
  deal_type: string | null;
  offer_title: string | null;
  first_name: string | null;
  email: string | null;
};

const RECOVERY_WINDOW_SECONDS = 10 * 60;

function useRecoveryCountdown(startedAt: number) {
  const [remaining, setRemaining] = useState(RECOVERY_WINDOW_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setRemaining(Math.max(0, RECOVERY_WINDOW_SECONDS - elapsed));
    };
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [startedAt]);
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  return { remaining, display: `${mm}:${ss}`, expired: remaining === 0 };
}

export default function PaymentRecoveryPage() {
  const { token } = useParams<{ token: string }>();
  const [link, setLink] = useState<LinkRow | null>(null);
  const [state, setState] = useState<'loading' | 'active' | 'paid' | 'error'>('loading');
  const [paying, setPaying] = useState<null | 'apple' | 'fallback'>(null);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef<number>(Date.now());
  const recovery = useRecoveryCountdown(startedAt.current);

  // Detect Apple Pay availability (best-effort).
  const applePayAvailable = typeof window !== 'undefined'
    && 'ApplePaySession' in window
    && (window as any).ApplePaySession?.canMakePayments?.() === true;

  useEffect(() => {
    if (!token) { setState('error'); return; }
    (async () => {
      const { data, error } = await (supabase as any)
        .rpc('get_payment_link_by_token', { p_token: token });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) { setState('error'); return; }
      if (row.status === 'paid') { setLink(row); setState('paid'); return; }
      setLink(row);
      setState('active');
    })();
  }, [token]);

  const handlePay = useCallback((source: 'apple' | 'fallback') => {
    if (!link?.payment_url) {
      setError('Zahlungssitzung nicht verfügbar. Bitte kontaktiere uns kurz – wir helfen sofort.');
      return;
    }
    setPaying(source);
    setError(null);
    // Stripe Checkout supports Apple Pay natively in its Payment Element
    // when the device/browser allows it — the same payment_url works for both.
    window.location.href = link.payment_url;
  }, [link]);

  const dealConfig = link?.deal_type ? DEAL_CONFIG[link.deal_type as DealConfigKey] : null;
  const priceDisplay = dealConfig?.display || (link?.amount ? formatAmountEur(link.amount) : '');

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F7F3EC' }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#C9A84C' }} />
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#F7F3EC' }}>
        <div className="text-center max-w-sm space-y-3">
          <AlertTriangle className="h-10 w-10 mx-auto" style={{ color: '#C9A84C' }} />
          <p className="text-lg font-semibold" style={{ color: '#1A1A1A', fontFamily: "'Cormorant Garamond', serif" }}>
            Dieser Wiederherstellungs-Link ist nicht mehr gültig.
          </p>
          <p className="text-sm" style={{ color: '#999' }}>
            Bitte antworte einfach auf die letzte Nachricht – wir senden dir sofort einen neuen sicheren Link.
          </p>
        </div>
      </div>
    );
  }

  if (state === 'paid') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#F7F3EC' }}>
        <div className="text-center space-y-4 max-w-sm">
          <CheckCircle2 className="h-16 w-16 mx-auto" style={{ color: '#C9A84C' }} />
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Cormorant Garamond', serif", color: '#1A1A1A' }}>
            Bereits bezahlt – alles erledigt.
          </h1>
          <p className="text-sm" style={{ color: '#666' }}>
            Du musst hier nichts mehr tun, {link?.first_name || ''}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F7F3EC', fontFamily: "'DM Sans', sans-serif" }}>
      <div className="max-w-lg mx-auto py-8 px-4 space-y-5">

        {/* Header */}
        <div className="text-center">
          <h2 className="text-xl font-bold tracking-wide" style={{ fontFamily: "'Cormorant Garamond', serif", color: '#1A1A1A' }}>
            ETC
          </h2>
          <div className="mt-3 mb-4 h-px w-full" style={{ backgroundColor: '#C9A84C' }} />
        </div>

        {/* Recovery framing */}
        <div className="rounded-2xl p-5 text-center" style={{ backgroundColor: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <p className="text-[11px] uppercase tracking-widest mb-2" style={{ color: '#C9A84C' }}>
            Sichere Wiederherstellung
          </p>
          <h1 className="text-[26px] leading-tight font-bold" style={{ fontFamily: "'Cormorant Garamond', serif", color: '#1A1A1A' }}>
            Zahlung nicht durchgegangen{link?.first_name ? `, ${link.first_name}` : ''}.
          </h1>
          <p className="text-sm mt-2" style={{ color: '#5A5A5A' }}>
            Kein Problem – das passiert oft an der Bank, nicht an dir.
            Schließe deine Buchung jetzt in unter 30 Sekunden ab.
          </p>
        </div>

        {/* 10-minute recovery hint */}
        <div
          className="rounded-xl flex items-center justify-center gap-2 py-3 text-sm"
          style={{ backgroundColor: '#1A1A1A', color: '#C9A84C' }}
          aria-live="polite"
        >
          <Clock className="h-4 w-4" />
          {recovery.expired ? (
            <span>Reservierung abgelaufen – schließe jetzt schnell ab, solange dein Slot noch frei ist.</span>
          ) : (
            <span>
              Dein Platz ist noch <strong>{recovery.display}</strong> reserviert
            </span>
          )}
        </div>

        {/* Offer summary */}
        {(link?.offer_title || priceDisplay) && (
          <div className="rounded-2xl p-5" style={{ backgroundColor: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            {link?.offer_title && (
              <p className="text-[11px] uppercase tracking-widest mb-1" style={{ color: '#999' }}>Dein Angebot</p>
            )}
            <h3 className="text-xl font-bold" style={{ fontFamily: "'Cormorant Garamond', serif", color: '#1A1A1A' }}>
              {link?.offer_title}
            </h3>
            {priceDisplay && (
              <p className="text-2xl font-bold mt-1" style={{ fontFamily: "'Cormorant Garamond', serif", color: '#1A1A1A' }}>
                {priceDisplay}
              </p>
            )}
          </div>
        )}

        {/* APPLE PAY FIRST — primary action */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => handlePay('apple')}
            disabled={paying !== null}
            className="w-full h-[64px] rounded-2xl flex items-center justify-center gap-2 font-semibold text-white text-base transition-transform active:scale-[0.99]"
            style={{ backgroundColor: '#000' }}
            aria-label="Mit Apple Pay sicher abschließen"
          >
            {paying === 'apple' ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <span style={{ fontSize: 22 }}></span>
                <span> Pay</span>
              </>
            )}
          </button>
          <p className="text-[12px] text-center" style={{ color: '#666' }}>
            {applePayAvailable
              ? 'Empfohlen · 1-Tipp · Face ID / Touch ID'
              : 'Apple Pay wird im sicheren Checkout angeboten, wenn dein Gerät es unterstützt.'}
          </p>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1" style={{ backgroundColor: '#E8E0D0' }} />
          <span className="text-[11px] uppercase tracking-widest" style={{ color: '#999' }}>oder</span>
          <div className="h-px flex-1" style={{ backgroundColor: '#E8E0D0' }} />
        </div>

        {/* Fallback: secure checkout (card / Klarna / IBAN handled there) */}
        <button
          type="button"
          onClick={() => handlePay('fallback')}
          disabled={paying !== null}
          className="w-full h-[52px] rounded-xl flex items-center justify-center gap-2 font-medium border transition-colors"
          style={{ borderColor: '#1A1A1A', color: '#1A1A1A', backgroundColor: '#fff' }}
        >
          {paying === 'fallback' ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <Lock className="h-4 w-4" />
              Andere Zahlungsmethode wählen
            </>
          )}
        </button>

        {error && (
          <div
            className="rounded-xl p-3 text-sm flex items-start gap-2"
            style={{ backgroundColor: '#FDECEC', color: '#7A1F1F', border: '1px solid #F5C6C6' }}
          >
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Trust row */}
        <div className="flex items-center justify-center gap-4 pt-2 text-[12px]" style={{ color: '#666' }}>
          <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> SSL-verschlüsselt</span>
          <span className="flex items-center gap-1"><Lock className="h-3.5 w-3.5" /> Stripe-gesichert</span>
        </div>

        {/* Help link */}
        <p className="text-center text-[12px]" style={{ color: '#999' }}>
          Probleme beim Abschluss?{' '}
          <Link to="/kontakt" className="underline" style={{ color: '#C9A84C' }}>
            Schreib uns – wir helfen sofort.
          </Link>
        </p>
      </div>
    </div>
  );
}
