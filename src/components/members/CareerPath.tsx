import { Link } from 'react-router-dom';
import {
  CheckCircle2, Lock, Crown, Target,
  GraduationCap, Award, Briefcase, ArrowRight, Shield, TrendingUp,
  Layers, Users, Eye,
} from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { normalizeBusinessStage } from '@/lib/stage-utils';

/* ─── Types ─── */

interface SubItem {
  label: string;
  to: string;
  requiresCertified?: boolean;
  requiresPlacement?: boolean;
}

interface CareerLevel {
  level: number;
  title: { de: string; en: string };
  role: string | null;
  activity: string | null;
  stageKey: string;
  subItems: SubItem[];
  inviteOnly?: boolean;
}

/* ─── Career Data ─── */

export const STAGE_ORDER = [
  'prospect', 'opener', 'setter', 'senior_associate',
  'junior_manager', 'manager', 'senior_manager',
  'director', 'partner',
];

export const STAGE_LABELS: Record<string, { de: string; en: string }> = {
  prospect: { de: 'Bewerber', en: 'Applicant' },
  opener: { de: 'Trainee (Opener)', en: 'Trainee (Opener)' },
  setter: { de: 'Associate Setter', en: 'Associate Setter' },
  associate_setter: { de: 'Associate Setter', en: 'Associate Setter' },
  senior_associate: { de: 'Senior Setter', en: 'Senior Setter' },
  senior_setter: { de: 'Senior Setter', en: 'Senior Setter' },
  junior_manager: { de: 'Junior Closer', en: 'Junior Closer' },
  manager: { de: 'Managing Closer', en: 'Managing Closer' },
  senior_manager: { de: 'Senior Closer', en: 'Senior Closer' },
  director: { de: 'Director', en: 'Director' },
  partner: { de: 'Partner', en: 'Partner' },
};

const careerPath: CareerLevel[] = [
  {
    level: 0, title: { de: 'Bewerber', en: 'Applicant' }, role: null, activity: null,
    stageKey: 'prospect', subItems: [],
  },
  {
    level: 1, title: { de: 'Opener', en: 'Opener' }, role: 'Trainee', activity: 'Opening & Lead Gen',
    stageKey: 'opener',
    subItems: [
      { label: 'Opener Training', to: '/members/academy' },
      { label: 'Global Closer Network', to: '/members/community' },
      { label: 'Opener Workspace', to: '/members/opener-workspace' },
    ],
  },
  {
    level: 2, title: { de: 'Setter', en: 'Setter' }, role: 'Associate', activity: 'Setting & Qualifying',
    stageKey: 'setter',
    subItems: [
      { label: 'Setter Training', to: '/members/academy' },
      { label: 'Zertifizierung', to: '/members/certification' },
      { label: 'Global Closer Network', to: '/members/community' },
      { label: 'Setter Workspace', to: '/members/setter-workspace' },
    ],
  },
  {
    level: 3, title: { de: 'Senior Setter', en: 'Senior Setter' }, role: 'Setter (Mentor)', activity: 'Setting + Mentoring',
    stageKey: 'senior_associate',
    subItems: [
      { label: 'Setter Training', to: '/members/academy' },
      { label: 'Mentee-Übersicht', to: '/members/dashboard' },
      { label: 'Global Closer Network', to: '/members/community' },
      { label: 'Setter Workspace', to: '/members/setter-workspace' },
    ],
  },
  {
    level: 4, title: { de: 'Closer (Placement Track)', en: 'Closer (Placement Track)' }, role: 'Closer', activity: 'Closing',
    stageKey: 'junior_manager',
    subItems: [
      { label: 'Closer Training', to: '/members/academy' },
      { label: 'Zertifizierung', to: '/members/certification', requiresCertified: true },
      { label: 'Global Closer Network', to: '/members/closer-community' },
      { label: 'Closer Workspace', to: '/members/closer' },
    ],
  },
  {
    level: 5, title: { de: 'Managing Closer', en: 'Managing Closer' }, role: 'Closer (Mentor)', activity: 'Closing + Mentoring',
    stageKey: 'manager',
    subItems: [
      { label: 'Placement Board', to: '/members/placement', requiresCertified: true },
      { label: 'Mentee-Übersicht', to: '/members/dashboard' },
      { label: 'Global Closer Network', to: '/members/closer-community' },
      { label: 'Closer Workspace', to: '/members/closer' },
    ],
  },
  {
    level: 6, title: { de: 'Senior Closer', en: 'Senior Closer' }, role: 'Placed Closer', activity: 'Live Deals & Optimization',
    stageKey: 'senior_manager',
    subItems: [
      { label: 'Advanced Lab', to: '/members/advanced-lab', requiresPlacement: true },
      { label: 'Quarterly Crossing', to: '/members/quarterly-crossing', requiresPlacement: true },
      { label: 'Global Closer Network', to: '/members/closer-community' },
    ],
  },
  {
    level: 7, title: { de: 'Director', en: 'Director' }, role: 'Director', activity: 'Leadership & Scaling',
    stageKey: 'director',
    subItems: [
      { label: 'Director Workspace', to: '/members/director-workspace' },
      { label: 'Advanced Lab', to: '/members/advanced-lab' },
    ],
  },
  {
    level: 8, title: { de: 'Partner', en: 'Partner' }, role: 'Partner', activity: 'Platform & Strategy',
    stageKey: 'partner',
    inviteOnly: true,
    subItems: [
      { label: 'Director Workspace', to: '/members/director-workspace' },
      { label: 'Inner Circle', to: '/members/inner-circle' },
    ],
  },
];

/* ─── Helpers ─── */

export function getUserLevel(stage: string): number {
  const idx = STAGE_ORDER.indexOf(normalizeBusinessStage(stage));
  return idx >= 0 ? idx : 1;
}

const LEVEL_ICONS: Record<number, React.ComponentType<any>> = {
  0: Eye, 1: GraduationCap, 2: Target, 3: Users,
  4: Briefcase, 5: Award, 6: TrendingUp,
  7: Layers, 8: Crown,
};

/* ─── Component ─── */

interface CareerPathProps {
  profile: any;
  isAdmin?: boolean;
}

export default function CareerPath({ profile, isAdmin }: CareerPathProps) {
  const userLevel = isAdmin ? 8 : getUserLevel(profile?.business_stage || 'opener');
  const isCertified = profile?.certified || isAdmin;
  const isPlacementReady = profile?.placement_ready || isAdmin;
  const { lang, t } = useLanguage();

  // Cap visible levels at L6 (Senior Closer / Placement Track) for non-admins
  // L7 Director and L8 Partner are hidden from career path
  const visibleItems = careerPath.filter((item) => {
    if (isAdmin) return true;
    // Hard cap: never show L7+ to non-admins
    if (item.level > 6) return false;
    // Always show current ±1
    if (item.level >= userLevel - 1 && item.level <= userLevel + 1) return true;
    // Hide post-placement complexity (L6+) for users below L5
    if (userLevel < 5 && item.level > 5) return false;
    // Past levels always visible
    if (item.level < userLevel) return true;
    return false;
  });

  return (
    <div className="space-y-3">
      {visibleItems.map((item) => {
        const isCompleted = item.level < userLevel;
        const isActive = item.level === userLevel;
        const isLocked = item.level > userLevel && !isAdmin;
        const Icon = LEVEL_ICONS[item.level] || Crown;

        return (
          <div
            key={item.level}
            className={`relative rounded-xl border p-4 transition-all ${
              isActive
                ? 'border-accent/40 bg-accent/[0.05]'
                : isCompleted
                ? 'border-primary/20 bg-primary/[0.03]'
                : 'border-border/30 bg-muted/20 opacity-70'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  isCompleted ? 'bg-primary/10 text-primary' :
                  isActive ? 'bg-accent/15 text-accent' :
                  'bg-muted text-muted-foreground'
                }`}
              >
                {isCompleted ? <CheckCircle2 className="h-4 w-4" /> :
                 isLocked ? <Lock className="h-3.5 w-3.5" /> :
                 <Icon className="h-4 w-4" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-[13px] font-semibold ${isLocked ? 'text-muted-foreground' : 'text-foreground'}`}>
                    {item.title[lang]}
                  </p>
                  {isActive && (
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent">
                      {t('career_step_current')}
                    </span>
                  )}
                  {item.inviteOnly && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      {t('cp_invite_only')}
                    </span>
                  )}
                </div>

                {isLocked && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {t('career_step_next_desc')}
                  </p>
                )}

                {item.role && !isLocked && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Icon className="h-3 w-3 shrink-0" />
                      {t('cp_role')}: <span className="font-medium text-foreground/80">{item.role}</span>
                    </span>
                    {item.activity && (
                      <span>
                        {t('cp_core_activity')}: <span className="font-medium text-foreground/80">{item.activity}</span>
                      </span>
                    )}
                  </div>
                )}

                {!isLocked && item.subItems.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {item.subItems.map((sub) => {
                      let subLocked = false;
                      if (sub.requiresCertified && !isCertified) subLocked = true;
                      if (sub.requiresPlacement && !isPlacementReady) subLocked = true;
                      if (item.inviteOnly) subLocked = !isAdmin;

                      if (subLocked) {
                        return (
                          <span
                            key={sub.label}
                            className="inline-flex items-center gap-1 rounded-md border border-border/30 bg-muted/30 px-2.5 py-1 text-[10px] font-medium text-muted-foreground cursor-not-allowed"
                          >
                            <Lock className="h-2.5 w-2.5" />
                            {sub.label}
                          </span>
                        );
                      }

                      return (
                        <Link
                          key={sub.label}
                          to={sub.to}
                          className="inline-flex items-center gap-1 rounded-md border border-accent/20 bg-accent/5 px-2.5 py-1 text-[10px] font-medium text-accent transition-all hover:bg-accent/10 hover:border-accent/40 hover:shadow-sm"
                        >
                          {sub.label}
                          <ArrowRight className="h-2.5 w-2.5" />
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
