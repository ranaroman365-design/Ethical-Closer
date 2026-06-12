import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { BookOpen, Gamepad2, Award, BarChart3 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface ProductMetrics {
  totalModules: number;
  completedModules: number;
  moduleCompletionRate: number;
  simulatorSessions: number;
  certAttempts: number;
  certPassed: number;
  activeUsers: number;
}

export default function DirectorProductHealth() {
  const { lang } = useLanguage();
  const [metrics, setMetrics] = useState<ProductMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const t = (de: string, en: string) => lang === 'de' ? de : en;

  useEffect(() => {
    Promise.all([
      supabase.from('modules').select('id', { count: 'exact', head: true }),
      supabase.from('member_progress').select('id, completed', { count: 'exact' }),
      supabase.from('practice_calls').select('id', { count: 'exact', head: true }),
      supabase.from('certification_status').select('id, certification_readiness_score'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).neq('business_stage', 'applicant'),
    ]).then(([modules, progress, sims, certs, users]) => {
      const progressRows = (progress.data ?? []) as any[];
      const completedCount = progressRows.filter(p => p.completed).length;
      const certRows = (certs.data ?? []) as any[];
      
      setMetrics({
        totalModules: modules.count ?? 0,
        completedModules: completedCount,
        moduleCompletionRate: progressRows.length > 0 ? Math.round((completedCount / progressRows.length) * 100) : 0,
        simulatorSessions: sims.count ?? 0,
        certAttempts: certRows.length,
        certPassed: certRows.filter(c => c.certification_readiness_score >= 80).length,
        activeUsers: users.count ?? 0,
      });
      setLoading(false);
    });
  }, []);

  if (loading) return <Skeleton className="h-48" />;
  if (!metrics) return null;

  const cards = [
    { label: t('Module-Abschlussrate', 'Module Completion'), value: `${metrics.moduleCompletionRate}%`, icon: BookOpen, sub: `${metrics.completedModules}/${metrics.totalModules * Math.max(metrics.activeUsers, 1)}` },
    { label: t('Simulator-Sessions', 'Simulator Sessions'), value: metrics.simulatorSessions, icon: Gamepad2, sub: t('Praxis-Calls', 'Practice Calls') },
    { label: t('Zertifizierungen', 'Certifications'), value: `${metrics.certPassed}/${metrics.certAttempts}`, icon: Award, sub: t('bestanden/versucht', 'passed/attempted') },
    { label: t('Aktive Nutzer', 'Active Users'), value: metrics.activeUsers, icon: BarChart3, sub: t('nicht-Bewerber', 'non-applicant') },
  ];

  return (
    <div className="rounded-xl border border-border/60 bg-card p-6">
      <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-5 flex items-center gap-2">
        <BookOpen className="h-3.5 w-3.5" /> {t('Produkt-Gesundheit', 'Product Health')}
      </h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map(c => (
          <div key={c.label} className="rounded-lg border border-border/30 bg-background p-4">
            <c.icon className="h-4 w-4 text-muted-foreground/40 mb-2" />
            <p className="text-2xl font-bold tracking-tight text-foreground">{c.value}</p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{c.label}</p>
            <p className="text-[9px] text-muted-foreground/60">{c.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
