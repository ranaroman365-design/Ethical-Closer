import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, AlertCircle, Loader2, Wallet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/i18n/LanguageContext';
import { formatIban, validateBic, validateIban } from '@/lib/iban';

type Method = 'sepa' | 'paypal' | 'wise';

interface ProfileRow {
  iban: string | null;
  bic: string | null;
  payment_method: string | null;
  payout_full_name: string | null;
  payout_company_name: string | null;
}

export function PayoutDetailsCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const t = (de: string, en: string) => (lang === 'de' ? de : en);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [method, setMethod] = useState<Method>('sepa');
  const [iban, setIban] = useState('');
  const [bic, setBic] = useState('');
  const [holder, setHolder] = useState('');
  const [company, setCompany] = useState('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('iban,bic,payment_method,payout_full_name,payout_company_name')
        .eq('id', user.id)
        .maybeSingle();
      const row = (data ?? {}) as ProfileRow;
      const m = (row.payment_method as Method) || 'sepa';
      setMethod(['sepa', 'paypal', 'wise'].includes(m) ? m : 'sepa');
      setIban(row.iban ? formatIban(row.iban) : '');
      setBic(row.bic ?? '');
      setHolder(row.payout_full_name ?? '');
      setCompany(row.payout_company_name ?? '');
      setLoading(false);
    })();
  }, [user]);

  const ibanCheck = useMemo(() => (method === 'sepa' ? validateIban(iban) : null), [iban, method]);
  const bicValid = useMemo(() => (method === 'sepa' ? validateBic(bic) : true), [bic, method]);
  const holderValid = holder.trim().length >= 2;

  // Method-specific completeness
  const isComplete = useMemo(() => {
    if (!holderValid) return false;
    if (method === 'sepa') return ibanCheck?.valid === true && bicValid;
    if (method === 'paypal' || method === 'wise') {
      // Re-use IBAN field as the email/identifier for non-SEPA methods
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(iban.trim());
    }
    return false;
  }, [method, holderValid, ibanCheck, bicValid, iban]);

  const ibanError = (() => {
    if (method !== 'sepa' || !iban) return null;
    if (!ibanCheck || ibanCheck.valid === true) return null;
    const reason = ibanCheck.reason;
    const country = ibanCheck.country ?? '';
    switch (reason) {
      case 'format': return t('Nur Buchstaben und Zahlen erlaubt.', 'Only letters and digits allowed.');
      case 'country': return t(`Ländercode "${country}" wird nicht unterstützt.`, `Country code "${country}" not supported.`);
      case 'length': return t('IBAN-Länge stimmt nicht.', 'IBAN length is incorrect.');
      case 'checksum': return t('IBAN-Prüfziffer ungültig.', 'IBAN checksum invalid.');
      default: return t('IBAN ungültig.', 'IBAN invalid.');
    }
  })();

  const handleSave = async () => {
    if (!user) return;
    if (!isComplete) {
      toast({
        title: t('Daten unvollständig', 'Details incomplete'),
        description: t('Bitte korrigiere die markierten Felder.', 'Please correct the highlighted fields.'),
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    const payload = {
      payment_method: method,
      payout_full_name: holder.trim(),
      payout_company_name: company.trim() || null,
      iban:
        method === 'sepa'
          ? ibanCheck && ibanCheck.valid
            ? ibanCheck.normalized
            : null
          : iban.trim(),
      bic: method === 'sepa' && bic ? bic.replace(/\s+/g, '').toUpperCase() : null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('profiles').update(payload).eq('id', user.id);
    setSaving(false);
    if (error) {
      toast({ title: t('Fehler beim Speichern', 'Error saving'), description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: t('Auszahlungs-Daten gespeichert', 'Payout details saved'),
      description: t('Du bist jetzt auszahlungsbereit.', 'You are now payout-ready.'),
    });
  };

  if (loading) {
    return (
      <div className="mb-8 rounded-xl border border-border/40 bg-card p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('Lade Auszahlungs-Daten…', 'Loading payout details…')}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8 rounded-xl border border-border/40 bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-accent" />
          <h2 className="font-serif text-base font-semibold text-foreground">
            {t('Auszahlungs-Daten', 'Payout Details')}
          </h2>
        </div>
        {isComplete ? (
          <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 text-[10px] gap-1">
            <CheckCircle2 className="h-3 w-3" /> {t('Auszahlungsbereit', 'Payout ready')}
          </Badge>
        ) : (
          <Badge className="bg-amber-500/10 text-amber-600 border border-amber-500/30 text-[10px] gap-1">
            <AlertCircle className="h-3 w-3" /> {t('Unvollständig', 'Incomplete')}
          </Badge>
        )}
      </div>

      {!isComplete && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[12px] text-amber-700 dark:text-amber-300">
          {t(
            'Vervollständige deine Auszahlungs-Daten, damit Provisionen ausbezahlt werden können.',
            'Complete your payout details so commissions can be paid out.',
          )}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
            {t('Auszahlungsart', 'Payout method')}
          </label>
          <Select value={method} onValueChange={(v) => setMethod(v as Method)}>
            <SelectTrigger className="border-border/40 bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sepa">SEPA / IBAN</SelectItem>
              <SelectItem value="paypal">PayPal</SelectItem>
              <SelectItem value="wise">Wise</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
            {t('Kontoinhaber (vollständiger Name)', 'Account holder (full name)')}
          </label>
          <Input
            value={holder}
            onChange={(e) => setHolder(e.target.value)}
            placeholder={t('Max Mustermann', 'Jane Doe')}
            className="border-border/40 bg-background"
            maxLength={120}
          />
          {!holderValid && holder.length > 0 && (
            <p className="mt-1 text-[11px] text-destructive">{t('Bitte vollständigen Namen angeben.', 'Please enter full name.')}</p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
            {t('Firma (optional)', 'Company (optional)')}
          </label>
          <Input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder={t('Falls Auszahlung an Firma', 'If paying to a company')}
            className="border-border/40 bg-background"
            maxLength={160}
          />
        </div>

        {method === 'sepa' ? (
          <>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">IBAN</label>
              <Input
                value={iban}
                onChange={(e) => setIban(formatIban(e.target.value))}
                placeholder="DE89 3704 0044 0532 0130 00"
                className={`border-border/40 bg-background font-mono ${ibanError ? 'border-destructive' : ibanCheck?.valid ? 'border-emerald-500/50' : ''}`}
                maxLength={42}
                spellCheck={false}
                autoComplete="off"
              />
              {ibanError && <p className="mt-1 text-[11px] text-destructive">{ibanError}</p>}
              {ibanCheck?.valid && (
                <p className="mt-1 text-[11px] text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> {t(`Gültige IBAN (${ibanCheck.country})`, `Valid IBAN (${ibanCheck.country})`)}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
                BIC / SWIFT {t('(optional)', '(optional)')}
              </label>
              <Input
                value={bic}
                onChange={(e) => setBic(e.target.value.toUpperCase())}
                placeholder="COBADEFFXXX"
                className={`border-border/40 bg-background font-mono ${bic && !bicValid ? 'border-destructive' : ''}`}
                maxLength={11}
                spellCheck={false}
                autoComplete="off"
              />
              {bic && !bicValid && (
                <p className="mt-1 text-[11px] text-destructive">{t('BIC ungültig (8 oder 11 Zeichen).', 'BIC invalid (8 or 11 characters).')}</p>
              )}
            </div>
          </>
        ) : (
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
              {method === 'paypal' ? t('PayPal-E-Mail', 'PayPal email') : t('Wise-E-Mail', 'Wise email')}
            </label>
            <Input
              type="email"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              placeholder="name@example.com"
              className="border-border/40 bg-background"
              maxLength={255}
              autoComplete="off"
            />
          </div>
        )}
      </div>

      <Button
        onClick={handleSave}
        disabled={saving || !isComplete}
        className="mt-5 bg-accent text-accent-foreground hover:bg-accent/90 text-xs"
      >
        {saving ? t('Speichern…', 'Saving…') : t('Auszahlungs-Daten speichern', 'Save payout details')}
      </Button>
    </div>
  );
}
