import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { FileText, Download, Award } from 'lucide-react';
import { getLevelForStage, KPI_THRESHOLDS, getKpiStatus } from '@/lib/kpi-config';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  stage: string;
  overallProgress: number;
  kpiValues: Record<string, number>;
}

type CertTitle = 'Certified' | 'Qualified' | 'In Progress' | 'Not Started';

const BADGE_STYLES: Record<CertTitle, string> = {
  'Certified': 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
  'Qualified': 'bg-gray-300/15 text-gray-500 border-gray-400/30',
  'In Progress': 'bg-muted text-muted-foreground border-border/40',
  'Not Started': 'bg-muted text-muted-foreground border-border/40',
};

export default function CertificationSection({ stage, overallProgress, kpiValues }: Props) {
  const { lang } = useLanguage();
  const { profile } = useAuth();
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);

  const level = getLevelForStage(stage);
  const thresholds = KPI_THRESHOLDS[level] ?? {};
  const kpiKeys = Object.keys(thresholds);
  const greenCount = kpiKeys.filter(k => getKpiStatus(k as any, kpiValues[k] ?? 0, level) === 'green').length;
  const kpiCompletion = kpiKeys.length > 0 ? Math.round((greenCount / kpiKeys.length) * 100) : 0;
  const combinedProgress = Math.round(overallProgress * 0.3 + kpiCompletion * 0.7);

  const [certTitle, setCertTitle] = useState<CertTitle>('Not Started');
  const [finalScore, setFinalScore] = useState<number | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from('certification_status')
      .select('certification_title, final_score, certified_at')
      .eq('user_id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const title = (data.certification_title as CertTitle) || 'In Progress';
          setCertTitle(title);
          setFinalScore(data.final_score);
        }
      });
  }, [profile?.id]);

  return (
    <div className="mb-8 rounded-xl border border-border/60 bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground/50" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {tl('Zertifizierung & Nachweis', 'Certification & Proof')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${BADGE_STYLES[certTitle]}`}>
            <Award className="h-3 w-3" />
            {certTitle}
          </span>
          <Link
            to="/members/certification"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download className="h-3 w-3" />
            {tl('PDF Export', 'PDF Export')}
          </Link>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border/40 bg-background p-3">
          <p className="text-[10px] text-muted-foreground mb-1">{tl('Abgeschlossene Module', 'Completed Modules')}</p>
          <p className="text-lg font-bold text-foreground">{overallProgress >= 100 ? tl('Alle', 'All') : `${overallProgress}%`}</p>
        </div>
        <div className="rounded-lg border border-border/40 bg-background p-3">
          <p className="text-[10px] text-muted-foreground mb-1">{tl('KPI-Status', 'KPI Status')}</p>
          <p className="text-lg font-bold text-foreground">{greenCount}/{kpiKeys.length} {tl('erreicht', 'met')}</p>
        </div>
        <div className="rounded-lg border border-border/40 bg-background p-3">
          <p className="text-[10px] text-muted-foreground mb-1">{tl('Bereitschaft', 'Readiness')}</p>
          <p className={`text-lg font-bold ${combinedProgress >= 90 ? 'text-green-500' : 'text-foreground'}`}>
            {finalScore !== null ? `${finalScore}%` : `${combinedProgress}%`}
          </p>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        {tl(
          'Dein Zertifizierungsstatus basiert auf messbarem Lernfortschritt und verifizierter KPI-Performance.',
          'Your certification status is based on measurable learning progress and verified KPI performance.'
        )}
      </p>
    </div>
  );
}
