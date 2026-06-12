import { ArrowRight, Sparkles, Users, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { normalizeBusinessStage } from '@/lib/stage-utils';

/**
 * Soft monetization entry point — shows contextual upgrade paths
 * based on current career level. No popups, no aggressive sales.
 */
export default function UpgradePathCard() {
  const { profile } = useAuth();
  const { lang } = useLanguage();
  const t = (de: string, en: string) => lang === 'de' ? de : en;
  const stage = normalizeBusinessStage((profile as any)?.business_stage || 'opener');

  // Only show for L2+ (past initial onboarding)
  const showStages = ['setter', 'associate_setter', 'senior_associate', 'junior_manager', 'manager', 'senior_manager'];
  if (!showStages.includes(stage)) return null;

  // Determine contextual upgrade suggestion
  const closerStages = ['junior_manager', 'manager', 'senior_manager'];
  const isCloser = closerStages.includes(stage);

  const suggestions = isCloser
    ? [
        {
          icon: Users,
          title: t('Mentor-Zugang', 'Mentor Access'),
          desc: t('Lerne von erfahrenen Top Closern in deiner Nische.', 'Learn from experienced top closers in your niche.'),
          to: '/members/mentor-space',
        },
        {
          icon: Sparkles,
          title: t('Advanced Closing Lab', 'Advanced Closing Lab'),
          desc: t('Fortgeschrittene Techniken für komplexere Deals.', 'Advanced techniques for complex deals.'),
          to: '/members/advanced-lab',
        },
      ]
    : [
        {
          icon: BookOpen,
          title: t('Nächste Academy-Phase', 'Next Academy Phase'),
          desc: t('Schalte neue Inhalte frei und entwickle dich weiter.', 'Unlock new content and advance your career.'),
          to: '/members/academy',
        },
        {
          icon: Users,
          title: t('Community Austausch', 'Community Exchange'),
          desc: t('Vernetze dich mit Gleichgesinnten auf deinem Level.', 'Connect with peers at your level.'),
          to: '/members/community',
        },
      ];

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">
        {t('Nächste Schritte', 'Next Steps')}
      </p>
      <div className="space-y-2.5">
        {suggestions.map((s, i) => (
          <Link
            key={i}
            to={s.to}
            className="group flex items-center gap-3 rounded-lg border border-border/30 bg-background p-3 transition-all hover:border-primary/20 hover:bg-primary/[0.02]"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/8">
              <s.icon className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-foreground group-hover:text-primary transition-colors">{s.title}</p>
              <p className="text-[11px] text-muted-foreground truncate">{s.desc}</p>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-primary transition-all shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
