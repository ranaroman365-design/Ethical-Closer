import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Gauge, AlertTriangle, TrendingUp, TrendingDown, Pause, Minus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import {
  bindingCapacity,
  recommendThrottle,
  actionLabel,
  actionTone,
  type FunnelIntake,
  type ThrottleRecommendation,
} from '@/lib/canonical-throttling';
import type { CapacityRow } from '@/lib/canonical-capacity';

/**
 * Layer 27 surface — Intelligent Ad Spend Throttling.
 * Read-only operator decision support. No writes, no automation.
 * Reads: capacity_status() RPC + ad_spend_daily + leads/calls aggregates.
 */
export default function AdSpendThrottlingPanel({ range }: { range: string }) {
  const { lang } = useLanguage();
  const t = (de: string, en: string) => (lang === 'de' ? de : en);
  const [recs, setRecs] = useState<ThrottleRecommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  async function load() {
    setLoading(true);
    const days = range === 'today' ? 1 : range === '7d' ? 7 : 30;
    const sinceISO = new Date(Date.now() - days * 86_400_000).toISOString();
    const baselineISO = new Date(Date.now() - 30 * 86_400_000).toISOString();

    const [capRes, spendRes, leadsRes, callsRes, baseCallsRes] = await Promise.all([
      supabase.rpc('capacity_status' as never),
      supabase
        .from('ad_spend_daily')
        .select('source, amount, spend_date')
        .gte('spend_date', sinceISO.slice(0, 10)),
      supabase
        .from('leads')
        .select('id, source, created_at')
        .gte('created_at', sinceISO),
      supabase
        .from('calls')
        .select('id, lead_source, status, showed_at, booked_at, created_at')
        .gte('created_at', sinceISO),
      supabase
        .from('calls')
        .select('id, lead_source, showed_at, booked_at')
        .gte('created_at', baselineISO),
    ]);

    const capRows = ((capRes.data as unknown as CapacityRow[]) ?? []);
    const capacity = bindingCapacity(capRows);

    // Aggregate by source.
    const sources = new Set<string>();
    (spendRes.data ?? []).forEach((r: any) => sources.add(r.source ?? 'unknown'));
    (leadsRes.data ?? []).forEach((r: any) => sources.add(r.source ?? 'unknown'));
    (callsRes.data ?? []).forEach((r: any) => sources.add(r.lead_source ?? 'unknown'));

    const intakes: FunnelIntake[] = Array.from(sources)
      .filter((s) => s && s !== 'unknown')
      .map((source) => {
        const spend = (spendRes.data ?? [])
          .filter((r: any) => r.source === source)
          .reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
        const dailySpend = days > 0 ? spend / days : spend;

        const leads = (leadsRes.data ?? []).filter((r: any) => r.source === source).length;
        const sourceCalls = (callsRes.data ?? []).filter((r: any) => r.lead_source === source);
        const bookings = sourceCalls.filter((c: any) => c.booked_at).length;
        const shows = sourceCalls.filter((c: any) => c.showed_at).length;
        const show_rate = bookings > 0 ? shows / bookings : 0;

        const baseCalls = (baseCallsRes.data ?? []).filter((r: any) => r.lead_source === source);
        const baseBookings = baseCalls.filter((c: any) => c.booked_at).length;
        const baseShows = baseCalls.filter((c: any) => c.showed_at).length;
        const show_rate_baseline = baseBookings > 0 ? baseShows / baseBookings : show_rate;

        const qualification_rate = leads > 0 ? bookings / leads : 0;
        const qualification_rate_baseline = qualification_rate; // baseline approximated; refine later

        return {
          source,
          current_spend: dailySpend,
          leads,
          bookings,
          show_rate,
          show_rate_baseline,
          qualification_rate,
          qualification_rate_baseline,
        };
      });

    setRecs(intakes.map((i) => recommendThrottle(i, capacity)));
    setLoading(false);
  }

  const summary = useMemo(() => {
    const counts = { scale: 0, hold: 0, reduce: 0, pause: 0 };
    recs.forEach((r) => {
      if (r.action === 'scale' || r.action === 'maintain') counts.scale++;
      else if (r.action === 'hold') counts.hold++;
      else if (r.action === 'reduce') counts.reduce++;
      else if (r.action === 'pause') counts.pause++;
    });
    return counts;
  }, [recs]);

  if (loading) return <Skeleton className="h-64 rounded-xl" />;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" />
            {t('Ad Spend Throttling', 'Ad Spend Throttling')}
          </span>
          <span className="flex items-center gap-1.5 text-[10px] font-normal">
            {summary.scale > 0 && (
              <Badge variant="outline" className="h-5 border-emerald-200 bg-emerald-50 text-emerald-700">
                <TrendingUp className="mr-1 h-3 w-3" />
                {summary.scale}
              </Badge>
            )}
            {summary.hold > 0 && (
              <Badge variant="outline" className="h-5 border-amber-200 bg-amber-50 text-amber-700">
                <Minus className="mr-1 h-3 w-3" />
                {summary.hold}
              </Badge>
            )}
            {summary.reduce > 0 && (
              <Badge variant="outline" className="h-5 border-orange-200 bg-orange-50 text-orange-700">
                <TrendingDown className="mr-1 h-3 w-3" />
                {summary.reduce}
              </Badge>
            )}
            {summary.pause > 0 && (
              <Badge variant="outline" className="h-5 border-rose-200 bg-rose-50 text-rose-700">
                <Pause className="mr-1 h-3 w-3" />
                {summary.pause}
              </Badge>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {recs.length === 0 ? (
          <p className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
            {t(
              'Keine Ad-Spend-Daten im Zeitraum. Erfasse Spend in ad_spend_daily, um Empfehlungen zu sehen.',
              'No ad spend data in this range. Log spend in ad_spend_daily to see recommendations.',
            )}
          </p>
        ) : (
          recs.map((r) => <Row key={r.source} rec={r} lang={lang} />)
        )}
        <p className="pt-2 text-[10px] text-muted-foreground">
          {t(
            'Entscheidungs-Support · Operator entscheidet. Keine automatischen Änderungen.',
            'Decision support · operator decides. No automatic changes.',
          )}
        </p>
      </CardContent>
    </Card>
  );
}

function Row({ rec, lang }: { rec: ThrottleRecommendation; lang: 'de' | 'en' }) {
  const Icon =
    rec.action === 'scale'
      ? TrendingUp
      : rec.action === 'reduce'
        ? TrendingDown
        : rec.action === 'pause'
          ? Pause
          : Minus;
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${actionTone(rec.action)}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <p className="truncate text-sm font-medium uppercase tracking-wide">{rec.source}</p>
          {rec.quality_flag && (
            <AlertTriangle className="h-3 w-3 shrink-0" aria-label={rec.quality_flag} />
          )}
        </div>
        <div className="flex items-center gap-3 text-xs whitespace-nowrap">
          <span className="opacity-70">{rec.utilization_pct}%</span>
          <span className="text-[10px] uppercase tracking-wider font-semibold">
            {actionLabel(rec.action, lang)}
          </span>
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px]">
        <span className="opacity-80">
          {lang === 'de' ? 'Aktuell' : 'Current'}: €{rec.current_spend}/d
        </span>
        <span className="font-medium">
          {lang === 'de' ? 'Empfohlen' : 'Recommended'}:{' '}
          {rec.action === 'pause' ? '€0' : `€${rec.spend_min}–€${rec.spend_max}/d`}
        </span>
      </div>
      <p className="mt-1 text-[11px] opacity-80">{rec.reason}</p>
    </div>
  );
}
