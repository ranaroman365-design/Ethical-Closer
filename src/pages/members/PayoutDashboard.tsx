import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Wallet, CheckCircle2, Clock, AlertCircle, RotateCcw, ArrowRight, Receipt, Banknote } from 'lucide-react';
import { format } from 'date-fns';
import { de, enUS } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';

type Status = 'pending' | 'eligible' | 'paid' | 'reversed';

interface Summary {
  total_earned: number;
  total_pending: number;
  total_eligible: number;
  total_paid: number;
  total_reversed: number;
  eligible_count: number;
  pending_count: number;
}

interface CommissionRow {
  id: string;
  amount: number;
  role: string | null;
  source_type: string | null;
  payout_status: Status;
  created_at: string;
  eligible_at: string | null;
  paid_at: string | null;
  reversed_at: string | null;
  reversed_reason: string | null;
  call_id: string | null;
  payout_batch_id: string | null;
}

interface PayoutBatch {
  id: string;
  total_amount: number;
  commission_count: number;
  payment_method: string | null;
  payout_reference: string | null;
  notes: string | null;
  paid_at: string;
  created_at: string;
}

const ZERO_SUMMARY: Summary = {
  total_earned: 0, total_pending: 0, total_eligible: 0,
  total_paid: 0, total_reversed: 0, eligible_count: 0, pending_count: 0,
};

export default function PayoutDashboard() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const t = (de_: string, en: string) => (lang === 'de' ? de_ : en);
  const dateLocale = lang === 'de' ? de : enUS;

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary>(ZERO_SUMMARY);
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [batches, setBatches] = useState<PayoutBatch[]>([]);
  const [openBatchId, setOpenBatchId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | Status>('all');
  const [payoutReady, setPayoutReady] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const [sumRes, comRes, profRes, batchRes] = await Promise.all([
        supabase.from('v_user_payout_summary').select('*').eq('user_id', user.id).maybeSingle(),
        supabase
          .from('commissions')
          .select('id, amount, role, source_type, payout_status, created_at, eligible_at, paid_at, reversed_at, reversed_reason, call_id, payout_batch_id')
          .eq('user_id', user.id)
          .eq('is_simulation', false)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase.from('profiles').select('iban, payout_full_name, payment_method').eq('id', user.id).maybeSingle(),
        supabase
          .from('payout_batches')
          .select('id, total_amount, commission_count, payment_method, payout_reference, notes, paid_at, created_at')
          .eq('user_id', user.id)
          .order('paid_at', { ascending: false })
          .limit(100),
      ]);
      if (!alive) return;

      setSummary((sumRes.data as Summary) ?? ZERO_SUMMARY);
      setRows((comRes.data as CommissionRow[] | null) ?? []);
      setBatches((batchRes.data as PayoutBatch[] | null) ?? []);
      const p = profRes.data as { iban: string | null; payout_full_name: string | null; payment_method: string | null } | null;
      setPayoutReady(!!(p && p.payout_full_name && p.payment_method && (p.payment_method !== 'sepa' ? p.iban : p.iban)));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [user]);

  const commissionsByBatch = useMemo(() => {
    const map = new Map<string, CommissionRow[]>();
    for (const r of rows) {
      if (!r.payout_batch_id) continue;
      const arr = map.get(r.payout_batch_id) ?? [];
      arr.push(r);
      map.set(r.payout_batch_id, arr);
    }
    return map;
  }, [rows]);

  const methodLabel = (m: string | null) => {
    if (!m) return '—';
    const k = m.toLowerCase();
    if (k === 'sepa') return 'SEPA';
    if (k === 'paypal') return 'PayPal';
    if (k === 'wise') return 'Wise';
    if (k === 'crypto') return t('Krypto', 'Crypto');
    return m;
  };

  const fmtEUR = (n: number) =>
    new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-US', { style: 'currency', currency: 'EUR' }).format(n ?? 0);
  const fmtDate = (iso: string | null) =>
    iso ? format(new Date(iso), lang === 'de' ? 'dd. MMM yyyy' : 'MMM dd, yyyy', { locale: dateLocale }) : '—';

  const filtered = useMemo(
    () => (filter === 'all' ? rows : rows.filter(r => r.payout_status === filter)),
    [rows, filter],
  );

  const STATUS_META: Record<Status, { label: string; cls: string; icon: any }> = {
    pending:  { label: t('Ausstehend', 'Pending'),    cls: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400', icon: Clock },
    eligible: { label: t('Auszahlbar', 'Eligible'),   cls: 'bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400',     icon: CheckCircle2 },
    paid:     { label: t('Ausgezahlt', 'Paid'),       cls: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400', icon: CheckCircle2 },
    reversed: { label: t('Storniert', 'Reversed'),    cls: 'bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400',         icon: RotateCcw },
  };

  if (loading) {
    return (
      <div className="container mx-auto max-w-6xl p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" />
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
            {t('Meine Auszahlungen', 'My Payouts')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('Übersicht deiner Provisionen und Auszahlungen.', 'Overview of your commissions and payouts.')}
          </p>
        </div>
        <Link to="/members/profile">
          <Button variant="outline" size="sm">
            <Wallet className="w-4 h-4 mr-2" />
            {t('Auszahlungs-Daten', 'Payout details')}
            <ArrowRight className="w-3 h-3 ml-2" />
          </Button>
        </Link>
      </div>

      {/* Payout-readiness banner */}
      {payoutReady === false && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 text-[13px]">
            <p className="font-medium text-foreground">
              {t('Auszahlungs-Daten unvollständig', 'Payout details incomplete')}
            </p>
            <p className="text-muted-foreground mt-0.5">
              {t(
                'Hinterlege deinen Namen, eine Auszahlungsart und IBAN, damit wir dich auszahlen können.',
                'Add your name, a payout method and IBAN so we can pay you out.',
              )}
            </p>
          </div>
          <Link to="/members/profile">
            <Button size="sm" className="shrink-0">{t('Jetzt ergänzen', 'Complete now')}</Button>
          </Link>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard label={t('Gesamt verdient', 'Total earned')}    value={fmtEUR(Number(summary.total_earned))}    accent />
        <KpiCard label={t('Ausstehend', 'Pending')}                value={fmtEUR(Number(summary.total_pending))}   sub={`${summary.pending_count} ${t('Provisionen', 'commissions')}`} />
        <KpiCard label={t('Auszahlbar', 'Eligible')}              value={fmtEUR(Number(summary.total_eligible))} sub={`${summary.eligible_count} ${t('Provisionen', 'commissions')}`} highlight />
        <KpiCard label={t('Ausgezahlt', 'Paid')}                  value={fmtEUR(Number(summary.total_paid))} />
      </div>

      {Number(summary.total_reversed) > 0 && (
        <p className="text-[12px] text-muted-foreground">
          {t('Stornierte Provisionen', 'Reversed commissions')}: <span className="font-medium text-foreground">{fmtEUR(Number(summary.total_reversed))}</span>
        </p>
      )}

      {/* Commission list */}
      <Card>
        <CardContent className="p-5">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
            <TabsList>
              <TabsTrigger value="all">{t('Alle', 'All')} ({rows.length})</TabsTrigger>
              <TabsTrigger value="pending">{STATUS_META.pending.label}</TabsTrigger>
              <TabsTrigger value="eligible">{STATUS_META.eligible.label}</TabsTrigger>
              <TabsTrigger value="paid">{STATUS_META.paid.label}</TabsTrigger>
              {Number(summary.total_reversed) > 0 && (
                <TabsTrigger value="reversed">{STATUS_META.reversed.label}</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value={filter} className="mt-4">
              {filtered.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Wallet className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">
                    {filter === 'all'
                      ? t('Noch keine Provisionen.', 'No commissions yet.')
                      : t('Keine Einträge in dieser Kategorie.', 'No entries in this category.')}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('Datum', 'Date')}</TableHead>
                      <TableHead>{t('Rolle', 'Role')}</TableHead>
                      <TableHead>{t('Status', 'Status')}</TableHead>
                      <TableHead>{t('Auszahlbar ab', 'Eligible from')}</TableHead>
                      <TableHead>{t('Ausgezahlt am', 'Paid on')}</TableHead>
                      <TableHead className="text-right">{t('Betrag', 'Amount')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(r => {
                      const meta = STATUS_META[r.payout_status];
                      const Icon = meta?.icon ?? Clock;
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs">{fmtDate(r.created_at)}</TableCell>
                          <TableCell className="text-xs capitalize text-muted-foreground">
                            {r.role ?? r.source_type ?? '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`${meta?.cls ?? ''} gap-1 text-[10px]`}>
                              <Icon className="w-3 h-3" />
                              {meta?.label ?? r.payout_status}
                            </Badge>
                            {r.payout_status === 'reversed' && r.reversed_reason && (
                              <p className="text-[10px] text-muted-foreground mt-1 max-w-[200px] truncate">
                                {r.reversed_reason}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{fmtDate(r.eligible_at)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{fmtDate(r.paid_at)}</TableCell>
                          <TableCell className={`text-right font-medium ${r.payout_status === 'reversed' ? 'line-through text-muted-foreground' : ''}`}>
                            {fmtEUR(Number(r.amount))}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Payout history (per batch) */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-accent" />
              <h2 className="font-serif text-lg font-medium text-foreground">
                {t('Auszahlungs­historie', 'Payout history')}
              </h2>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {batches.length} {t('Auszahlung(en)', 'payout(s)')}
            </span>
          </div>

          {batches.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Banknote className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">
                {t('Noch keine Auszahlung erhalten.', 'No payout received yet.')}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Datum', 'Date')}</TableHead>
                  <TableHead>{t('Methode', 'Method')}</TableHead>
                  <TableHead>{t('Referenz', 'Reference')}</TableHead>
                  <TableHead className="text-center">{t('Provisionen', 'Commissions')}</TableHead>
                  <TableHead>{t('Status', 'Status')}</TableHead>
                  <TableHead className="text-right">{t('Betrag', 'Amount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map(b => {
                  const open = openBatchId === b.id;
                  const items = commissionsByBatch.get(b.id) ?? [];
                  return (
                    <>
                      <TableRow
                        key={b.id}
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() => setOpenBatchId(open ? null : b.id)}
                      >
                        <TableCell className="text-xs font-medium">{fmtDate(b.paid_at)}</TableCell>
                        <TableCell className="text-xs">{methodLabel(b.payment_method)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono max-w-[180px] truncate">
                          {b.payout_reference ?? '—'}
                        </TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">
                          {b.commission_count}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400 gap-1 text-[10px]">
                            <CheckCircle2 className="w-3 h-3" />
                            {t('Ausgezahlt', 'Paid')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium text-accent">
                          {fmtEUR(Number(b.total_amount))}
                        </TableCell>
                      </TableRow>
                      {open && (
                        <TableRow key={`${b.id}-detail`} className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={6} className="p-0">
                            <div className="px-6 py-4 space-y-2">
                              {b.notes && (
                                <p className="text-[11px] text-muted-foreground italic">
                                  {t('Notiz', 'Note')}: {b.notes}
                                </p>
                              )}
                              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                                {t('Enthaltene Provisionen', 'Included commissions')}
                              </p>
                              {items.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                  {t('Keine Detail-Daten verfügbar.', 'No detail data available.')}
                                </p>
                              ) : (
                                <div className="space-y-1">
                                  {items.map(it => (
                                    <div key={it.id} className="flex items-center justify-between text-xs py-1 border-b border-border/40 last:border-0">
                                      <span className="text-muted-foreground">
                                        {fmtDate(it.created_at)} · <span className="capitalize">{it.role ?? it.source_type ?? '—'}</span>
                                      </span>
                                      <span className="font-medium">{fmtEUR(Number(it.amount))}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground text-center">
        {t(
          'Provisionen werden nach einer Validierungsphase auszahlbar. Die Auszahlung erfolgt manuell durch das Team.',
          'Commissions become eligible after a validation period. Payouts are processed manually by the team.',
        )}
      </p>
    </div>
  );
}

function KpiCard({ label, value, sub, accent, highlight }: { label: string; value: string; sub?: string; accent?: boolean; highlight?: boolean }) {
  return (
    <Card className={highlight ? 'border-accent/40 bg-accent/[0.04]' : ''}>
      <CardContent className="p-5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className={`mt-2 font-serif text-2xl font-medium ${accent ? 'text-accent' : 'text-foreground'}`}>{value}</p>
        {sub && <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
