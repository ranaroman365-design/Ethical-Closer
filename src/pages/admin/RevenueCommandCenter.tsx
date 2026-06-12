import { useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import LiveFunnelPanel from '@/components/admin/revenue-command/LiveFunnelPanel';
import CallPerformancePanel from '@/components/admin/revenue-command/CallPerformancePanel';
import SetterCloserTable from '@/components/admin/revenue-command/SetterCloserTable';
import AiInsightsPanel from '@/components/admin/revenue-command/AiInsightsPanel';
import RevenuePanel from '@/components/admin/revenue-command/RevenuePanel';
import AdSpendThrottlingPanel from '@/components/admin/revenue-command/AdSpendThrottlingPanel';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity } from 'lucide-react';

type TimeRange = 'today' | '7d' | '30d';

export default function RevenueCommandCenter() {
  const [range, setRange] = useState<TimeRange>('7d');
  const { lang } = useLanguage();
  const t = (de: string, en: string) => lang === 'de' ? de : en;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Revenue Command Center</h1>
            <p className="text-xs text-muted-foreground">{t('Echtzeit-Überblick über Pipeline, Calls & Revenue', 'Real-time overview of pipeline, calls & revenue')}</p>
          </div>
        </div>
        <Select value={range} onValueChange={(v) => setRange(v as TimeRange)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">{t('Heute', 'Today')}</SelectItem>
            <SelectItem value="7d">{t('Letzte 7 Tage', 'Last 7 days')}</SelectItem>
            <SelectItem value="30d">{t('Letzte 30 Tage', 'Last 30 days')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Top Row: Funnel + Revenue */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LiveFunnelPanel range={range} />
        </div>
        <RevenuePanel range={range} />
      </div>

      {/* Middle Row: Call Performance + AI Insights */}
      <div className="grid gap-6 md:grid-cols-2">
        <CallPerformancePanel range={range} />
        <AiInsightsPanel range={range} />
      </div>

      {/* Throttling: capacity-aware ad spend recommendations */}
      <AdSpendThrottlingPanel range={range} />

      {/* Bottom: Setter/Closer Table */}
      <SetterCloserTable range={range} />
    </div>
  );
}
