import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { DEAL_CONFIG, formatAmountEur, totalAmount, type DealConfigKey } from '@/config/stripePrices';
import { resolvePaymentOptions, type PaymentMethod } from '@/lib/resolvePaymentOptions';
import type { SecondaryMethod } from '@/types/payment';
import { Loader2, CheckCircle2, CreditCard, Building2, ShieldCheck } from 'lucide-react';
import CheckoutLegalConsent, { isConsentComplete, type ConsentState } from '@/components/checkout/CheckoutLegalConsent';
import { recordCheckoutConsent } from '@/lib/checkout/recordConsent';

/* ─────────── Helpers ─────────── */
function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!expiresAt) return;
    const target = new Date(expiresAt).getTime();
    const tick = () => {
      const diff = Math.max(0, Math.floor((target - Date.now()) / 1000));
      setRemaining(diff);
      if (diff <= 0 && intervalRef.current) clearInterval(intervalRef.current);
    };
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [expiresAt]);

  const mm = remaining !== null ? String(Math.floor(remaining / 60)).padStart(2, '0') : '--';
  const ss = remaining !== null ? String(remaining % 60).padStart(2, '0') : '--';
  return { remaining, display: `${mm}:${ss}`, expired: remaining === 0 };
}

/* ─────────── Reservation Countdown (15 min) ─────────── */
function ReservationCountdown() {
  const TOTAL = 15 * 60;
  const [secondsLeft, setSecondsLeft] = useState<number>(() => {
    if (typeof window === 'undefined') return TOTAL;
    const key = 'etc_checkout_reservation_started_at';
    let started = Number(window.sessionStorage.getItem(key));
    if (!started || Number.isNaN(started)) {
      started = Date.now();
      window.sessionStorage.setItem(key, String(started));
    }
    const elapsed = Math.floor((Date.now() - started) / 1000);
    return Math.max(0, TOTAL - elapsed);
  });

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const expired = secondsLeft === 0;

  return (
    <div
      className="mb-5 rounded-xl border-2 px-4 py-3 flex items-center gap-3"
      style={{
        borderColor: 'hsl(var(--danger))',
        backgroundColor: 'hsl(var(--danger-muted))',
      }}
      role="timer"
      aria-live="polite"
    >
      <span
        className="inline-flex h-2.5 w-2.5 rounded-full animate-pulse shrink-0"
        style={{ backgroundColor: 'hsl(var(--danger))' }}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <p
          className="text-[10px] font-bold uppercase tracking-[0.18em]"
          style={{ color: 'hsl(var(--danger))' }}
        >
          {expired ? 'Reservierung abgelaufen' : 'Dein Platz ist reserviert'}
        </p>
        <p className="text-[12px] leading-snug" style={{ color: '#5a1a1a' }}>
          Dein L1-Starter-Platz ist reserviert. Schließe die Zahlung ab, bevor der Timer auf null fällt, um deinen Platz zu sichern.
        </p>
      </div>
      <div
        className="font-mono font-bold text-2xl tabular-nums tracking-tight px-3 py-1 rounded-lg"
        style={{
          color: 'hsl(var(--danger))',
          backgroundColor: '#fff',
          minWidth: 92,
          textAlign: 'center',
        }}
        aria-label={`Verbleibende Zeit ${mm} Minuten ${ss} Sekunden`}
      >
        {mm}:{ss}
      </div>
    </div>
  );
}

/* ─────────── Payment Method Renderers ─────────── */
function ApplePayOption({ onPay }: { onPay: () => void }) {
  // Detect availability so we can show the right microcopy without changing logic.
  const applePayAvailable = typeof window !== 'undefined'
    && 'ApplePaySession' in window
    && (window as any).ApplePaySession?.canMakePayments?.() === true;

  return (
    <div className="space-y-2">
      <div className="relative">
        {/* Recommended badge */}
        <div className="absolute -top-2 right-3 z-10">
          <span
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white shadow-md"
            style={{ backgroundColor: '#C9A84C' }}
          >
            ★ Empfohlen
          </span>
        </div>
        {/* Subtle pulse ring */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-2xl animate-ping opacity-20 pointer-events-none"
          style={{ backgroundColor: '#000', animationDuration: '2.4s' }}
        />
        <button
          type="button"
          onClick={onPay}
          className="relative w-full h-[64px] rounded-2xl flex items-center justify-center gap-2 font-semibold text-white text-base transition-transform active:scale-[0.99] shadow-md hover:shadow-lg"
          style={{ backgroundColor: '#000' }}
          aria-label="Mit Apple Pay sicher abschließen (Empfohlen)"
        >
          <span aria-hidden className="text-xl leading-none"></span>
          <span className="tracking-wide">Pay</span>
        </button>
      </div>
      <p className="text-[12px] text-center" style={{ color: '#666' }}>
        {applePayAvailable
          ? '1-Tipp · Face ID / Touch ID · schnellste Methode'
          : 'Apple Pay wird im sicheren Checkout angeboten, wenn dein Gerät es unterstützt.'}
      </p>
    </div>
  );
}

function StripeCardOption({ onPay, loading }: { onPay: () => void; loading: boolean }) {
  return (
    <div className="rounded-xl p-4" style={{ border: '1px solid #E8E0D0' }}>
      <div className="flex items-center gap-2 mb-3">
        <CreditCard className="h-5 w-5" style={{ color: '#666' }} />
        <span className="text-sm font-medium" style={{ color: '#1A1A1A' }}>Kreditkarte / Debitkarte</span>
      </div>
      <div className="rounded-lg p-3 mb-3" style={{ backgroundColor: '#FDFAF5', border: '1px solid #E8E0D0' }}>
        <p className="text-xs" style={{ color: '#999' }}>
          Stripe Elements werden nach Konfiguration geladen
        </p>
      </div>
      <button
        type="button"
        onClick={onPay}
        disabled={loading}
        className="w-full h-12 rounded-xl text-white font-semibold flex items-center justify-center gap-2"
        style={{ backgroundColor: '#1A1A1A' }}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Jetzt bezahlen →'}
      </button>
    </div>
  );
}

function KlarnaOption({ token, onSuccess, onError, isSplit }: { token: string; onSuccess: () => void; onError: () => void; isSplit: boolean }) {
  const [loading, setLoading] = useState(false);

  const handleKlarna = useCallback(async () => {
    setLoading(true);
    try {
      // Klarna Ratenkauf: direkt über Klarna Merchant API (nicht Stripe)
      const { data, error } = await supabase.functions.invoke('klarna-create-session', {
        body: { token },
      });
      if (error || !data?.redirectUrl) {
        onError();
        return;
      }
      // Redirect to Klarna checkout (_self, not new tab)
      window.location.href = data.redirectUrl;
    } catch {
      onError();
    } finally {
      setLoading(false);
    }
  }, [token, onError]);

  return (
    <div className="rounded-xl p-4" style={{ border: '1px solid #E8E0D0' }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg font-bold" style={{ color: '#FFB3C7' }}>K</span>
        <span className="text-sm font-medium" style={{ color: '#1A1A1A' }}>
          {isSplit ? 'Klarna Ratenkauf' : 'Klarna – Sofort kaufen'}
        </span>
      </div>
      <p className="text-xs mb-3" style={{ color: '#999' }}>
        {isSplit
          ? 'Monatliche Raten (6–24 Monate) · ETC erhält Gesamtbetrag sofort'
          : 'Direkte Abwicklung über Klarna · Sicher & verschlüsselt'}
      </p>
      <button
        type="button"
        onClick={handleKlarna}
        disabled={loading}
        className="w-full h-12 rounded-xl font-semibold flex items-center justify-center gap-2"
        style={{ backgroundColor: '#FFB3C7', color: '#1A1A1A' }}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Weiter zu Klarna →'}
      </button>
    </div>
  );
}

function PayPalOption({ token, onSuccess, onError }: { token: string; onSuccess: () => void; onError: () => void }) {
  const [loading, setLoading] = useState(false);

  const handlePayPal = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('paypal-create-order', {
        body: { token },
      });
      if (error || !data?.orderId) {
        onError();
        return;
      }
      // For now, redirect to PayPal approval URL
      // In production, use PayPal JS SDK for inline experience
      const { data: captureData, error: captureError } = await supabase.functions.invoke('paypal-capture-order', {
        body: { orderId: data.orderId, token },
      });
      if (captureError || !captureData?.success) {
        onError();
      } else {
        onSuccess();
      }
    } catch {
      onError();
    } finally {
      setLoading(false);
    }
  }, [token, onSuccess, onError]);

  return (
    <div className="rounded-xl p-4" style={{ border: '1px solid #E8E0D0' }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg font-bold" style={{ color: '#003087' }}>P</span>
        <span className="text-sm font-medium" style={{ color: '#1A1A1A' }}>PayPal</span>
      </div>
      <p className="text-xs mb-3" style={{ color: '#999' }}>Sichere Zahlung über PayPal</p>
      <button
        type="button"
        onClick={handlePayPal}
        disabled={loading}
        className="w-full h-12 rounded-xl text-white font-semibold flex items-center justify-center gap-2"
        style={{ backgroundColor: '#003087' }}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Mit PayPal bezahlen →'}
      </button>
    </div>
  );
}

function IbanOption({ onConfirm }: { onConfirm: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyField = async (value: string, field: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="rounded-xl p-4 transition-all" style={{ border: '1px solid #E8E0D0' }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2"
      >
        <Building2 className="h-5 w-5" style={{ color: '#666' }} />
        <span className="text-sm font-medium" style={{ color: '#1A1A1A' }}>Banküberweisung</span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-2 text-sm" style={{ color: '#1A1A1A' }}>
          <div className="flex justify-between items-center">
            <span style={{ color: '#999' }}>Empfänger:</span>
            <span className="font-medium">ETC GmbH</span>
          </div>
          <div className="flex justify-between items-center">
            <span style={{ color: '#999' }}>IBAN:</span>
            <div className="flex items-center gap-1">
              <span className="font-mono text-xs">DE89 3704 0044 0532 0130 00</span>
              <button type="button" onClick={() => copyField('DE89370400440532013000', 'iban')} className="text-xs underline" style={{ color: '#C9A84C' }}>
                {copiedField === 'iban' ? '✓ Kopiert!' : 'Kopieren'}
              </button>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span style={{ color: '#999' }}>BIC:</span>
            <span className="font-mono text-xs">COBADEFFXXX</span>
          </div>
          <div className="flex justify-between items-center">
            <span style={{ color: '#999' }}>Verwendungszweck:</span>
            <div className="flex items-center gap-1">
              <span className="font-mono text-xs">ETC-PAY-TOKEN</span>
              <button type="button" onClick={() => copyField('ETC-PAY-TOKEN', 'ref')} className="text-xs underline" style={{ color: '#C9A84C' }}>
                {copiedField === 'ref' ? '✓ Kopiert!' : 'Kopieren'}
              </button>
            </div>
          </div>
          <p className="text-xs mt-2" style={{ color: '#999' }}>
            Zugang wird nach Zahlungseingang (1–2 Werktage) aktiviert.
          </p>
          <button
            type="button"
            onClick={onConfirm}
            className="w-full h-12 rounded-xl text-white font-semibold mt-2"
            style={{ backgroundColor: '#1A1A1A' }}
          >
            Details kopiert — Überweisung vornehmen
          </button>
        </div>
      )}
    </div>
  );
}

function DigistoreOption({ onPay }: { onPay: () => void }) {
  return (
    <div className="rounded-xl p-4" style={{ border: '1px solid #E8E0D0' }}>
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="h-5 w-5" style={{ color: '#666' }} />
        <span className="text-sm font-medium" style={{ color: '#1A1A1A' }}>Digistore24</span>
      </div>
      <p className="text-xs mb-3" style={{ color: '#999' }}>Sichere Zahlung über Digistore24</p>
      <button
        type="button"
        onClick={onPay}
        className="w-full h-12 rounded-xl text-white font-semibold"
        style={{ backgroundColor: '#1A1A1A' }}
      >
        Weiter zu Digistore24 →
      </button>
    </div>
  );
}

function PaymentMethodRenderer({
  method, onPay, loading, token, onSuccess, onError, isSplit,
}: {
  method: PaymentMethod; onPay: () => void; loading: boolean;
  token?: string; onSuccess?: () => void; onError?: () => void; isSplit?: boolean;
}) {
  switch (method) {
    case 'apple_pay': return <ApplePayOption onPay={onPay} />;
    case 'stripe': return <StripeCardOption onPay={onPay} loading={loading} />;
    case 'klarna': return <KlarnaOption token={token || ''} onSuccess={onSuccess || (() => {})} onError={onError || (() => {})} isSplit={isSplit || false} />;
    case 'paypal': return <PayPalOption token={token || ''} onSuccess={onSuccess || (() => {})} onError={onError || (() => {})} />;
    case 'iban': return <IbanOption onConfirm={onPay} />;
    case 'digistore': return <DigistoreOption onPay={onPay} />;
  }
}

/* ─────────── Divider ─────────── */
function OrDivider() {
  return (
    <div className="flex items-center gap-3 my-4">
      <hr className="flex-1" style={{ borderColor: '#E8E0D0' }} />
      <span className="text-xs font-medium tracking-wide" style={{ color: '#999' }}>ODER</span>
      <hr className="flex-1" style={{ borderColor: '#E8E0D0' }} />
    </div>
  );
}

/* ─────────── Main Page ─────────── */
export default function CheckoutPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [linkData, setLinkData] = useState<any>(null);
  const [pageState, setPageState] = useState<'loading' | 'active' | 'expired' | 'error' | 'success'>('loading');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [consent, setConsent] = useState<ConsentState>({
    acceptedTerms: false,
    acceptedRefund: false,
    acceptedWaiver: false,
    acceptedNoGuarantee: false,
    acceptedAccessDuration: false,
    acceptedPaymentObligation: false,
  });

  // Fetch payment link
  useEffect(() => {
    if (!token) { setPageState('error'); return; }

    const load = async () => {
      const { data, error } = await (supabase as any)
        .rpc('get_payment_link_by_token', { p_token: token });

      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row || !['pending', 'opened'].includes(row.status)) {
        setPageState('error');
        return;
      }

      setLinkData(row);

      // Mark as opened (only once)
      if (row.status === 'pending') {
        await (supabase as any).rpc('update_payment_link_status', { p_token: token, p_status: 'opened' });
      }

      setPageState('active');
    };
    load();
  }, [token]);

  const countdown = useCountdown(linkData?.expires_at || null);

  // When countdown expires
  useEffect(() => {
    if (countdown.expired && pageState === 'active') {
      setPageState('expired');
    }
  }, [countdown.expired, pageState]);

  const dealConfig = linkData?.deal_type ? DEAL_CONFIG[linkData.deal_type as DealConfigKey] : null;

  // Detect Apple Pay
  const applePayAvailable = typeof window !== 'undefined' &&
    'ApplePaySession' in window &&
    (window as any).ApplePaySession?.canMakePayments?.() === true;

  const secondaryMethod = (linkData?.secondary_method as SecondaryMethod) || 'stripe';
  const isOneTime = linkData?.payment_type === 'one_time';

  const methods = linkData?.secondary_method
    ? resolvePaymentOptions({
        applePayAvailable,
        secondaryMethod,
        klarnaAvailable: true, // Klarna Ratenkauf verfügbar für ALLE deal_types
        paypalAvailable: isOneTime, // PayPal only for one_time
      })
    : (['stripe', 'iban'] as [PaymentMethod, PaymentMethod]);

  const handlePay = useCallback(async () => {
    if (!linkData?.payment_url) {
      setPaymentError('Zahlungssitzung nicht verfügbar. Bitte kontaktiere deinen Closer.');
      return;
    }
    if (!isConsentComplete(consent, { isPaymentPlan: !isOneTime })) {
      setPaymentError('Bitte bestätige die rechtlichen Hinweise, um fortzufahren.');
      return;
    }
    setPaymentLoading(true);
    setPaymentError(null);

    // Persist explicit consent BEFORE redirecting to the payment provider.
    // Non-blocking: even if logging fails (network), payment proceeds — but we warn.
    try {
      await recordCheckoutConsent({
        paymentToken: token ?? null,
        leadId: linkData?.lead_id ?? null,
        email: linkData?.email ?? null,
        consent,
        isPaymentPlan: !isOneTime,
      });
    } catch (e) {
      console.warn('[checkout] consent log error', e);
    }

    // Redirect to Stripe Checkout (also handles Klarna via Stripe)
    window.location.href = linkData.payment_url;
  }, [linkData, consent, token]);

  const handlePaymentSuccess = useCallback(() => {
    setPageState('success');
    // Fallback: mark as paid client-side (webhook is primary)
    if (token) {
      (supabase as any).rpc('update_payment_link_status', { p_token: token, p_status: 'paid' });
    }
  }, [token]);

  const handlePaymentError = useCallback(() => {
    setPaymentError('Zahlung fehlgeschlagen. Bitte versuche eine andere Zahlungsmethode oder kontaktiere uns direkt.');
  }, []);

  /* ─── STATES ─── */

  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F7F3EC' }}>
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" style={{ color: '#C9A84C' }} />
          <p className="text-sm" style={{ color: '#999', fontFamily: "'DM Sans', sans-serif" }}>Wird geladen…</p>
        </div>
      </div>
    );
  }

  if (pageState === 'error' || pageState === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#F7F3EC' }}>
        <div className="text-center max-w-sm space-y-3">
          <p className="text-lg font-semibold" style={{ color: '#1A1A1A', fontFamily: "'Cormorant Garamond', serif" }}>
            {pageState === 'expired' ? 'Dieser Link ist abgelaufen.' : 'Dieser Link ist nicht mehr gültig.'}
          </p>
          <p className="text-sm" style={{ color: '#999', fontFamily: "'DM Sans', sans-serif" }}>
            Bitte wende dich an deinen Closer.
          </p>
        </div>
      </div>
    );
  }

  if (pageState === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#F7F3EC' }}>
        <div className="text-center space-y-4">
          <CheckCircle2 className="h-16 w-16 mx-auto animate-[scale-in_0.4s_ease-out]" style={{ color: '#C9A84C' }} />
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Cormorant Garamond', serif", color: '#1A1A1A' }}>
            Herzlichen Glückwunsch, {linkData?.first_name || ''}!
          </h1>
          <p className="text-sm" style={{ color: '#666', fontFamily: "'DM Sans', sans-serif" }}>
            Dein Zugang wird jetzt eingerichtet.
          </p>
          <button
            type="button"
            onClick={() => navigate('/members/dashboard')}
            className="mt-4 px-6 py-3 rounded-xl font-semibold text-white"
            style={{ backgroundColor: '#C9A84C' }}
          >
            Zum Dashboard
          </button>
        </div>
      </div>
    );
  }

  /* ─── ACTIVE ─── */
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F7F3EC', fontFamily: "'DM Sans', sans-serif" }}>
      <div className="max-w-lg mx-auto py-8 px-4 space-y-4">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-xl font-bold tracking-wide" style={{ fontFamily: "'Cormorant Garamond', serif", color: '#1A1A1A' }}>
            ETC
          </h2>
          <div className="mt-3 mb-6 h-px w-full" style={{ backgroundColor: '#C9A84C' }} />
        </div>

        {/* Urgency Strip */}
        <div className="rounded-xl py-2 text-center text-xs font-medium" style={{ backgroundColor: '#1A1A1A', color: '#C9A84C' }}>
          ⚡ Dein Platz wird für <strong>{countdown.display}</strong> reserviert
        </div>

        {/* Offer Summary */}
        <div className="rounded-2xl p-6" style={{ backgroundColor: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <p className="text-xs uppercase tracking-widest mb-2" style={{ color: '#999' }}>Du hast gewählt:</p>
          <h3 className="text-2xl font-bold mb-2" style={{ fontFamily: "'Cormorant Garamond', serif", color: '#1A1A1A' }}>
            {linkData?.offer_title || dealConfig?.label || ''}
          </h3>
          <div className="h-px w-full mb-4" style={{ backgroundColor: '#C9A84C' }} />

          {/* Payment Type Badge + Price */}
          <div className="flex items-center gap-3 mb-4">
            <span className="px-3 py-1 rounded-full text-sm font-medium" style={{ backgroundColor: '#F0EAD8', color: '#C9A84C' }}>
              {dealConfig?.installments ? `${dealConfig.installments} Raten` : 'Einmalzahlung'}
            </span>
          </div>
          <p className="text-3xl font-bold" style={{ fontFamily: "'Cormorant Garamond', serif", color: '#1A1A1A' }}>
            {dealConfig?.display || formatAmountEur(linkData?.amount || 0)}
          </p>
          {dealConfig?.installments && (
            <p className="text-xs mt-1" style={{ color: '#999' }}>
              = {formatAmountEur(totalAmount(linkData?.deal_type as DealConfigKey))} gesamt · +5 % Ratenaufschlag
            </p>
          )}

          {/* Trust Row */}
          <div className="flex flex-wrap gap-3 mt-4">
            {['SSL-verschlüsselt', 'Sofortige Aktivierung'].map((t) => (
              <span key={t} className="text-xs" style={{ color: '#666' }}>✓ {t}</span>
            ))}
          </div>

          {/* Refund Positioning — soft but strong, placed near pricing */}
          <div className="mt-4 rounded-lg px-3 py-2.5" style={{ backgroundColor: '#FBF6EC', border: '1px solid #E8DCBE' }}>
            <p className="text-[12px] leading-relaxed" style={{ color: '#5A4A1A' }}>
              Aufgrund der strukturierten und zeitgebundenen Natur dieses Programms sind nach Programmstart keine Rückerstattungen mehr möglich.
            </p>
          </div>
        </div>

        {/* Commitment Agreement — psychological + legal framing */}
        <div className="rounded-2xl p-6 space-y-5" style={{ backgroundColor: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: '#C9A84C' }}>
              Commitment Agreement
            </p>
            <h3 className="text-xl mb-2" style={{ fontFamily: "'Cormorant Garamond', serif", color: '#1A1A1A', fontWeight: 600 }}>
              Ein strukturiertes 9-Wochen-Programm
            </h3>
            <p className="text-[13px] leading-relaxed" style={{ color: '#444' }}>
              Dieses Programm ist als strukturierte, zeitlich begrenzte Erfahrung gestaltet, um deine Entwicklung, Disziplin und Umsetzung zu unterstützen.
            </p>
            <p className="text-[13px] leading-relaxed mt-2" style={{ color: '#444' }}>
              Mit dem Beitritt zu <strong>Ethical Top Closer</strong> trittst du in ein fokussiertes 9-Wochen-Programm ein, das aktive Teilnahme und persönliche Verantwortung erfordert.
            </p>
            <p className="text-[13px] leading-relaxed mt-2 italic" style={{ color: '#666' }}>
              Dies ist kein passives Produkt — es ist eine commitment-basierte Lernumgebung.
            </p>
          </div>

          <div className="h-px w-full" style={{ backgroundColor: '#F0EAD8' }} />

          {/* Program Clarity */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] mb-3" style={{ color: '#999' }}>
              Programm-Klarheit
            </p>
            <div className="grid gap-2 text-[13px]" style={{ color: '#1A1A1A' }}>
              <div className="flex justify-between">
                <span style={{ color: '#666' }}>Programmdauer</span>
                <span style={{ fontWeight: 500 }}>9 Wochen</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#666' }}>Zugang</span>
                <span style={{ fontWeight: 500 }}>Zeitlich begrenzt</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#666' }}>Start</span>
                <span style={{ fontWeight: 500 }}>Sofort oder Cohort-Start</span>
              </div>
            </div>
            <p className="text-[12px] leading-relaxed mt-3" style={{ color: '#666' }}>
              Dein Zugang zu allen Materialien, Coaching und Community ist auf die Dauer des Programms begrenzt.
            </p>
          </div>

          <div className="h-px w-full" style={{ backgroundColor: '#F0EAD8' }} />

          {/* Expectation Frame */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: '#999' }}>
              Realistische Erwartung
            </p>
            <p className="text-[13px] leading-relaxed" style={{ color: '#444' }}>
              Dieses Programm bietet Bildung, Struktur und Unterstützung. Deine Ergebnisse hängen von deinem eigenen Einsatz, deiner Beständigkeit und deiner Anwendung ab. Wir garantieren keine spezifischen finanziellen oder beruflichen Ergebnisse.
            </p>
          </div>
        </div>

        {/* Mandatory Legal Consent (must be checked before payment) */}
        <div className="rounded-2xl p-6" style={{ backgroundColor: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <p className="text-xs uppercase tracking-widest mb-3" style={{ color: '#999' }}>
            Deine Bestätigung
          </p>
          <CheckoutLegalConsent value={consent} onChange={setConsent} variant="light" isPaymentPlan={!isOneTime} />
        </div>

        {/* Payment Methods */}
        <div
          className="relative rounded-2xl p-6 transition-opacity"
          style={{
            backgroundColor: '#fff',
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            opacity: isConsentComplete(consent, { isPaymentPlan: !isOneTime }) ? 1 : 0.55,
            pointerEvents: isConsentComplete(consent, { isPaymentPlan: !isOneTime }) ? 'auto' : 'none',
          }}
          aria-disabled={!isConsentComplete(consent, { isPaymentPlan: !isOneTime })}
        >
          <ReservationCountdown />

          <p className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: '#C9A84C' }}>
            Secure Your Spot
          </p>
          <p className="text-sm mb-4" style={{ color: '#666' }}>
            {isConsentComplete(consent, { isPaymentPlan: !isOneTime })
              ? 'Wähle jetzt die Zahlungsart, die wir besprochen haben.'
              : 'Bitte bestätige zuerst die Commitment-Punkte oben.'}
          </p>

          {/* Payment Loading Overlay */}
          {paymentLoading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl z-10" style={{ backgroundColor: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(4px)' }}>
              <div className="text-center space-y-2">
                <Loader2 className="h-6 w-6 animate-spin mx-auto" style={{ color: '#C9A84C' }} />
                <p className="text-sm" style={{ color: '#1A1A1A' }}>Zahlung wird verarbeitet…</p>
              </div>
            </div>
          )}

          <PaymentMethodRenderer
            method={methods[0]}
            onPay={handlePay}
            loading={paymentLoading}
            token={token}
            onSuccess={handlePaymentSuccess}
            onError={handlePaymentError}
            isSplit={!isOneTime}
          />
          <OrDivider />
          <PaymentMethodRenderer
            method={methods[1]}
            onPay={handlePay}
            loading={paymentLoading}
            token={token}
            onSuccess={handlePaymentSuccess}
            onError={handlePaymentError}
            isSplit={!isOneTime}
          />

          {/* Error */}
          {paymentError && (
            <div className="mt-3 rounded-xl p-3" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
              <p className="text-sm" style={{ color: '#DC2626' }}>
                {paymentError}
              </p>
            </div>
          )}

          {/* Microcopy under CTA */}
          <p className="text-[11px] text-center mt-4 leading-relaxed" style={{ color: '#888' }}>
            🔒 Sichere Zahlung. Mit Abschluss deines Kaufs bestätigst du deine Teilnahme sowie deine Zustimmung zu den{' '}
            <Link to="/terms" target="_blank" className="underline" style={{ color: '#C9A84C' }}>AGB</Link>
            {' '}und der{' '}
            <Link to="/refund-policy" target="_blank" className="underline" style={{ color: '#C9A84C' }}>Erstattungsrichtlinie</Link>.
          </p>
        </div>

        {/* Social Proof */}
        <p className="text-xs text-center mt-4" style={{ color: '#999' }}>
          580+ Menschen haben bereits ihren Weg mit uns gestartet.
        </p>
      </div>
    </div>
  );
}
