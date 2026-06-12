import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Target, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface KpiRow {
  kpi_key: string;
  kpi_name: string;
  level_code: string;
  target_value: number;
  unit_type: string;
  current_value?: number;
}

export default function DirectorKpiOverview() {
  const { lang } = useLanguage();
  const [kpis, setKpis] = useState<KpiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const t = (de: string, en: string) => lang === 'de' ? de : en;

  useEffect(() => {
    supabase.from('kpi_definitions').select('*').eq('is_active', true).order('display_order').then(({ data }) => {
      setKpis((data ?? []) as KpiRow[]);
      setLoading(false);
    });
  }, []);

  if (loading) return <Skeleton className="h-48" />;

  const categories = [...new Set(kpis.map(k => k.level_code))];
  const categoryLabels: Record<string, string> = {
    funnel: 'Funnel',
    lead_ops: t('Lead Operations', 'Lead Operations'),
    product: t('Produkt', 'Product'),
    team: 'Team',
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card p-6">
      <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-5 flex items-center gap-2">
        <Target className="h-3.5 w-3.5" /> {t('KPI-Übersicht', 'KPI Overview')}
      </h3>
      <div className="space-y-5">
        {categories.map(cat => (
          <div key={cat}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
              {categoryLabels[cat] ?? cat}
            </p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {kpis.filter(k => k.level_code === cat).map(k => (
                <div key={k.kpi_key} className="flex items-center justify-between rounded-lg border border-border/20 bg-background px-3 py-2">
                  <span className="text-xs text-muted-foreground truncate flex-1">{k.kpi_name}</span>
                  <div className="flex items-center gap-2">
                    <Minus className="h-3 w-3 text-muted-foreground/30" />
                    <span className="text-[10px] text-muted-foreground/50">
                      {t('Ziel', 'Target')}: {k.target_value}{k.unit_type === 'percent' ? '%' : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[10px] text-muted-foreground/40 italic">
        {t('Live-Werte werden nach dem ersten KPI-Snapshot-Lauf angezeigt.', 'Live values will appear after the first KPI snapshot run.')}
      </p>
    </div>
  );
}
