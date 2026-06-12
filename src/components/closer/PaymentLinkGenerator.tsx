import { useState, useCallback } from 'react';
import { CheckCircle2, Copy, MessageCircle, Mail, Loader2, RotateCcw, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { DEAL_CONFIG, type DealConfigKey } from '@/config/stripePrices';
import type { SecondaryMethod } from '@/types/payment';
import { toast } from 'sonner';

interface PaymentLinkGeneratorProps {
  leadId: string;
  leadName: string;
  leadEmail: string;
  closerId: string;
  onLinkGenerated?: (token: string, url: string) => void;
}

const SECONDARY_METHODS: { key: SecondaryMethod; label: string }[] = [
  { key: 'stripe', label: 'Kreditkarte' },
  { key: 'klarna', label: 'Klarna' },
  { key: 'paypal', label: 'PayPal' },
  { key: 'iban', label: 'Überweisung' },
  { key: 'digistore', label: 'Digistore' },
];

const DEAL_OPTIONS = Object.entries(DEAL_CONFIG) as [DealConfigKey, typeof DEAL_CONFIG[DealConfigKey]][];

export default function PaymentLinkGenerator({
  leadId, leadName, leadEmail, closerId, onLinkGenerated,
}: PaymentLinkGeneratorProps) {
  const [selectedDeal, setSelectedDeal] = useState<DealConfigKey | null>(null);
  const [secondaryMethod, setSecondaryMethod] = useState<SecondaryMethod>('stripe');
  const [loading, setLoading] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<{ token: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [scriptCopied, setScriptCopied] = useState(false);

  // Klarna Ratenkauf is available for ALL deal types (one_time + split_3)
  // Bei split_3 + Klarna: Klarna übernimmt die Ratenzahlung, ETC's eigene Stripe-Subscription entfällt
  // PayPal is only available for one_time
  const isSplit = selectedDeal?.includes('split_3') ?? false;
  const paypalBlocked = isSplit && secondaryMethod === 'paypal';
  const effectiveMethod: SecondaryMethod = paypalBlocked ? 'stripe' : secondaryMethod;

  const handleGenerate = useCallback(async () => {
    if (!selectedDeal) return;
    setLoading(true);
    try {
      const config = DEAL_CONFIG[selectedDeal];
      const { data, error } = await supabase.functions.invoke('create-payment-link', {
        body: {
          leadId,
          closerId,
          dealType: selectedDeal,
          secondaryMethod: effectiveMethod,
          firstName: leadName.split(' ')[0],
          email: leadEmail,
          offerTitle: config.label,
        },
      });
      if (error) throw error;
      const result = { token: data.token, url: data.paymentUrl };
      setGeneratedLink(result);
      onLinkGenerated?.(result.token, result.url);
      toast.success('Zahlungslink erstellt');
    } catch (err) {
      console.error(err);
      toast.error('Link konnte nicht erstellt werden');
    } finally {
      setLoading(false);
    }
  }, [selectedDeal, effectiveMethod, leadId, closerId, leadName, leadEmail, onLinkGenerated]);

  const handleCopy = useCallback(async () => {
    if (!generatedLink) return;
    await navigator.clipboard.writeText(generatedLink.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [generatedLink]);

  const handleWhatsApp = useCallback(() => {
    if (!generatedLink) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(`Hier ist dein Zahlungslink: ${generatedLink.url}`)}`, '_blank');
  }, [generatedLink]);

  const handleReset = useCallback(async () => {
    if (generatedLink) {
      await supabase
        .from('payment_links' as any)
        .update({ status: 'expired' } as any)
        .eq('token', generatedLink.token);
    }
    setGeneratedLink(null);
    setSelectedDeal(null);
    setCopied(false);
  }, [generatedLink]);

  const closerScript = `Perfekt. Ich richte dir das jetzt genau so ein, wie wir es besprochen haben.\nDu bekommst gleich den Link — geh einfach kurz durch den Prozess,\ndas dauert 1–2 Minuten. Ich bleibe hier, bis alles durch ist.`;

  return (
    <div className="max-w-md mx-auto rounded-2xl shadow-lg p-6 space-y-5" style={{ backgroundColor: '#FDFAF5', fontFamily: "'DM Sans', sans-serif" }}>
      <h3 className="text-lg font-semibold" style={{ color: '#1A1A1A', fontFamily: "'Cormorant Garamond', serif" }}>
        Payment Link erstellen
      </h3>

      {/* Lead Info */}
      <div className="rounded-xl p-3" style={{ backgroundColor: '#F7F3EC' }}>
        <p className="text-sm" style={{ color: '#666' }}>{leadName}</p>
        <p className="text-sm" style={{ color: '#666' }}>{leadEmail}</p>
      </div>

      {/* Deal Selection */}
      <div className="space-y-2">
        <p className="text-sm font-medium" style={{ color: '#1A1A1A' }}>Deal auswählen</p>
        {DEAL_OPTIONS.map(([key, config]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSelectedDeal(key)}
            className="w-full flex items-center justify-between rounded-xl p-4 transition-colors"
            style={{
              border: selectedDeal === key ? '2px solid #C9A84C' : '1px solid #E8E0D0',
              backgroundColor: selectedDeal === key ? '#FDF8EE' : '#fff',
            }}
          >
            <span className="text-sm font-medium" style={{ color: '#1A1A1A' }}>{config.label}</span>
            <span className="text-lg font-semibold" style={{ color: '#C9A84C', fontFamily: "'Cormorant Garamond', serif" }}>
              {config.display}
            </span>
          </button>
        ))}
      </div>

      {/* Secondary Method */}
      <div className="space-y-2">
        <p className="text-sm font-medium" style={{ color: '#1A1A1A' }}>Zweite Zahlungsart</p>
        <div className="flex gap-2 flex-wrap">
          {SECONDARY_METHODS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSecondaryMethod(key)}
              className="px-3 py-1 rounded-full text-sm font-medium transition-all"
              style={{
                backgroundColor: secondaryMethod === key ? '#1A1A1A' : 'transparent',
                color: secondaryMethod === key ? '#fff' : '#666',
                border: secondaryMethod === key ? '1px solid #1A1A1A' : '1px solid #E8E0D0',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* PayPal blocked warning for split_3 */}
        {paypalBlocked && (
          <div className="flex items-start gap-2 rounded-lg p-3 mt-1" style={{ backgroundColor: '#FEF3C7', border: '1px solid #F59E0B33' }}>
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: '#D97706' }} />
            <p className="text-xs" style={{ color: '#92400E' }}>
              PayPal ist bei Ratenzahlung nicht verfügbar. Kreditkarte wird verwendet.
            </p>
          </div>
        )}
        {/* Klarna info for split_3 */}
        {isSplit && secondaryMethod === 'klarna' && (
          <div className="flex items-start gap-2 rounded-lg p-3 mt-1" style={{ backgroundColor: '#EFF6FF', border: '1px solid #3B82F633' }}>
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: '#2563EB' }} />
            <p className="text-xs" style={{ color: '#1E40AF' }}>
              Bei Klarna Ratenkauf übernimmt Klarna die monatlichen Raten (6–24 Monate). ETC erhält den Gesamtbetrag sofort.
            </p>
          </div>
        )}
      </div>

      {/* Generate / Result */}
      {!generatedLink ? (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!selectedDeal || loading}
          className="w-full h-12 rounded-xl text-white font-semibold flex items-center justify-center gap-2 transition-opacity"
          style={{
            backgroundColor: '#C9A84C',
            opacity: !selectedDeal || loading ? 0.4 : 1,
            cursor: !selectedDeal || loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Link wird erstellt…
            </>
          ) : (
            'Payment Link erstellen →'
          )}
        </button>
      ) : (
        <div className="rounded-xl p-4 space-y-3" style={{ border: '1px solid #E8E0D0', backgroundColor: '#FDF8EE' }}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" style={{ color: '#C9A84C' }} />
            <span className="font-semibold text-sm" style={{ color: '#1A1A1A' }}>Zahlungslink bereit</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              readOnly
              value={generatedLink.url}
              className="flex-1 text-xs rounded-lg px-3 py-2 border"
              style={{ borderColor: '#E8E0D0', backgroundColor: '#fff', color: '#1A1A1A' }}
            />
            <button
              type="button"
              onClick={handleCopy}
              className="p-2 rounded-lg"
              style={{ border: '1px solid #E8E0D0' }}
            >
              {copied ? (
                <span className="text-xs font-medium" style={{ color: '#16A34A' }}>✓ Kopiert!</span>
              ) : (
                <Copy className="h-4 w-4" style={{ color: '#666' }} />
              )}
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleWhatsApp}
              className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-medium"
              style={{ backgroundColor: '#1A1A1A', color: '#fff' }}
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </button>
            <button
              type="button"
              onClick={() => toast.info('E-Mail-Versand wird eingerichtet')}
              className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-medium"
              style={{ border: '1px solid #E8E0D0', color: '#1A1A1A' }}
            >
              <Mail className="h-4 w-4" />
              E-Mail
            </button>
          </div>

          {/* Closer Script */}
          <details className="mt-2">
            <summary className="text-xs cursor-pointer" style={{ color: '#666' }}>
              💬 Closer Script — jetzt vorlesen
            </summary>
            <div className="mt-2 rounded-lg p-3 relative" style={{ backgroundColor: '#F7F3EC' }}>
              <p className="text-xs italic whitespace-pre-line" style={{ color: '#666' }}>
                {closerScript}
              </p>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(closerScript);
                  setScriptCopied(true);
                  setTimeout(() => setScriptCopied(false), 2000);
                }}
                className="absolute top-2 right-2"
              >
                {scriptCopied ? (
                  <span className="text-xs" style={{ color: '#16A34A' }}>✓</span>
                ) : (
                  <Copy className="h-3 w-3" style={{ color: '#999' }} />
                )}
              </button>
            </div>
          </details>

          {/* Recovery */}
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1 text-xs underline mt-2"
            style={{ color: '#999' }}
          >
            <RotateCcw className="h-3 w-3" />
            Neuen Link erstellen (alter wird deaktiviert)
          </button>
        </div>
      )}
    </div>
  );
}
