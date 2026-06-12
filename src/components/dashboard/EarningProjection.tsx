import { useLanguage } from '@/i18n/LanguageContext';
import { useKpis } from '@/hooks/useKpis';
import { useAuth } from '@/hooks/useAuth';
import { getLevelForStage } from '@/lib/kpi-config';
import { TrendingUp } from 'lucide-react';

/**
 * Earning Relevance Layer for L1–L3.
 * Shows honest projection based on current KPI trajectory.
 */

const EARNING_RANGES: Record<number, { de: string; en: string; range: string }> = {
  1: {
    de: 'In deiner aktuellen Phase als Trainee baust du die Grundlagen für dein erstes Setter-Einkommen auf.',
    en: 'In your current Trainee phase, you are building the foundation for your first Setter income.',
    range: '€300 – €600 / Monat',
  },
  2: {
    de: 'Als Associate Setter kannst du durch qualifizierte Übergaben erste Provisionen verdienen.',
    en: 'As Associate Setter, you can earn your first commissions through qualified handovers.',
    range: '€450 – €900 / Monat',
  },
  3: {
    de: 'Als Senior Setter bist du nah an der Closer-Zertifizierung und höheren Provisionen.',
    en: 'As Senior Setter, you are close to Closer certification and higher commissions.',
    range: '€800 – €1.500 / Monat',
  },
};

export default function EarningProjection() {
  const { profile } = useAuth();
  const { kpis } = useKpis();
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);

  const stage = (profile as any)?.business_stage || 'opener';
  const level = getLevelForStage(stage);

  // Only show for L1–L3
  if (level < 1 || level > 3) return null;

  const data = EARNING_RANGES[level];
  if (!data) return null;

  return (
    <div className="rounded-2xl border border-accent/15 bg-gradient-to-br from-accent/[0.03] to-transparent p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
          <TrendingUp className="h-4 w-4 text-accent" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            {tl('Einkommensperspektive', 'Earning Outlook')}
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed mb-3">
        {lang === 'de' ? data.de : data.en}
      </p>
      <div className="flex items-center justify-between rounded-xl bg-card/80 border border-border/50 px-4 py-2.5">
        <span className="text-xs text-muted-foreground">
          {tl('Projektionsbereich', 'Projection range')}
        </span>
        <span className="text-sm font-bold text-accent">{data.range}</span>
      </div>
      <p className="text-[10px] text-muted-foreground/60 mt-2 italic">
        {tl(
          'Basierend auf typischen Ergebnissen bei vergleichbaren KPIs. Keine Einkommensgarantie.',
          'Based on typical outcomes at comparable KPI levels. Not an income guarantee.'
        )}
      </p>
    </div>
  );
}
