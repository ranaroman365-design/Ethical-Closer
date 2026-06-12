import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAcademyData } from '@/hooks/useAcademyData';
import { useKpis } from '@/hooks/useKpis';
import { useStreak } from '@/hooks/useStreak';
import { getUserLevel } from '@/components/members/CareerPath';
import { getLevelForStage, KPI_THRESHOLDS, getKpiStatus, KPI_DEFINITIONS } from '@/lib/kpi-config';
import { Skeleton } from '@/components/ui/skeleton';

// Sub-components
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import AdminPerspectiveSwitcher from '@/components/dashboard/AdminPerspectiveSwitcher';
import ApplicantDashboard from '@/components/landing/ApplicantDashboard';
import DirectorOverview from '@/components/director/DirectorOverview';
import PartnerDashboard from '@/components/members/PartnerDashboard';

// New simplified blocks
import DailyActionEngine from '@/components/dashboard/DailyActionEngine';
import EarningProjection from '@/components/dashboard/EarningProjection';
import PlacementReadinessBlock from '@/components/dashboard/PlacementReadinessBlock';
import SectionExplainer from '@/components/dashboard/SectionExplainer';
import CareerProgressHeader from '@/components/dashboard/CareerProgressHeader';

// Existing blocks (used selectively by level)
import KpiSummaryCards from '@/components/dashboard/KpiSummaryCards';
import PromotionReadiness from '@/components/dashboard/PromotionReadiness';
import CertificationDashboard from '@/components/dashboard/CertificationDashboard';
import ProgressTracker from '@/components/members/ProgressTracker';
import EarningsOverview from '@/components/members/EarningsOverview';
import NetworkGrowth from '@/components/members/NetworkGrowth';
import TrustProofBlock from '@/components/dashboard/TrustProofBlock';
import ProgressWidget from '@/components/credits/ProgressWidget';
import { useCreditEngine } from '@/hooks/useCreditEngine';
import ActivityFeed from '@/components/dashboard/ActivityFeed';

export default function Dashboard() {
  const { profile, isAdmin } = useAuth();
  const { overallProgress } = useAcademyData();
  const { kpis } = useKpis();
  const { lang } = useLanguage();
  const { streak, recordActivity } = useStreak();
  const [adminPerspective, setAdminPerspective] = useState<string | null>(null);

  const tl = (de: string, en: string) => (lang === 'de' ? de : en);
  const stage = (profile as any)?.business_stage || 'opener';
  const userLevel = getUserLevel(stage);

  const { award } = useCreditEngine();

  // Record login streak on mount + award daily-login credit (server-capped to 1/day)
  useEffect(() => {
    if (profile) {
      recordActivity('login');
      award('login').catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // KPI values
  const kpiValues: Record<string, number> = useMemo(() => ({
    closing_rate: kpis?.closing_rate ?? 0,
    show_rate: kpis?.show_rate ?? 0,
    revenue_closed: kpis?.revenue_closed ?? 0,
    commission_earned: kpis?.commission_earned ?? 0,
    setter_influenced_revenue: kpis?.setter_influenced_revenue ?? 0,
    storno_rate: kpis?.storno_rate ?? 0,
    response_time: kpis?.response_time ?? 0,
    follow_up_rate: kpis?.follow_up_rate ?? 0,
    crm_hygiene_score: kpis?.crm_hygiene_score ?? 0,
    lead_quality_sensitivity: kpis?.lead_quality_sensitivity ?? 0,
    earnings_per_call: kpis?.earnings_per_call ?? 0,
    qualification_accuracy: kpis?.qualification_accuracy ?? 0,
    handover_rate: kpis?.handover_rate ?? 0,
    leads_assigned: kpis?.leads_assigned ?? 0,
  }), [kpis]);

  // Loading state
  if (!profile) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      </div>
    );
  }

  // Admin perspective mode
  if (isAdmin && adminPerspective !== null) {
    return <AdminPerspectiveSwitcher perspective={adminPerspective} onChangePerspective={setAdminPerspective} />;
  }

  const openPerspective = () => setAdminPerspective('prospect');

  // ═══════════════════════════════════════════
  // L0 — APPLICANT (max 5 blocks: status, career path, why, CTA, next)
  // ═══════════════════════════════════════════
  if ((stage === 'prospect' || stage === 'applicant') && !isAdmin) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10 lg:px-8">
        <div className="mb-10 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">{tl('Bewerbungs-Dashboard', 'Application Dashboard')}</p>
            <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {tl(`Willkommen, ${(profile as any)?.full_name?.split(' ')[0] || 'Bewerber'}`, `Welcome, ${(profile as any)?.full_name?.split(' ')[0] || 'Applicant'}`)}
            </h1>
          </div>
          <span className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1 text-xs font-medium text-foreground">L0 · {tl('Bewerber', 'Applicant')}</span>
        </div>
        <ApplicantDashboard status={{ stage, name: (profile as any)?.full_name || '', email: (profile as any)?.email || '' }} />
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // L7 — DIRECTOR
  // ═══════════════════════════════════════════
  if (stage === 'director') {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10 lg:px-8">
        <DashboardHeader profile={profile} stage={stage} isAdmin={isAdmin} onOpenPerspective={openPerspective} />
        <DirectorOverview />
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // L8 — PARTNER
  // ═══════════════════════════════════════════
  if (stage === 'partner') {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10 lg:px-8">
        <DashboardHeader profile={profile} stage={stage} isAdmin={isAdmin} onOpenPerspective={openPerspective} />
        <PartnerDashboard />
      </div>
    );
  }

  const level = getLevelForStage(stage);

  // ═══════════════════════════════════════════
  // L1–L2 — TRAINEE / SETTER (5 blocks)
  // 1. Daily Action  2. Academy Progress  3. KPI Snapshot (max 3)
  // 4. Earning Projection  5. Next Step (Promotion)
  // ═══════════════════════════════════════════
  if (level <= 2) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10 lg:px-8">
        <DashboardHeader profile={profile} stage={stage} isAdmin={isAdmin} onOpenPerspective={openPerspective} />

        <CareerProgressHeader
          stage={stage}
          overallProgress={overallProgress}
          kpiValues={kpiValues}
          fullName={(profile as any)?.full_name}
        />

        <SectionExplainer
          de="Dein Dashboard zeigt dir täglich die wichtigste Aktion, deinen Lernfortschritt und wie sich deine Entwicklung wirtschaftlich auswirkt."
          en="Your dashboard shows today's most important action, your learning progress, and how your development translates economically."
        />

        {/* 1. Daily Action */}
        <div className="mb-6">
          <DailyActionEngine />
        </div>

        {/* 1b. Progress / Credit Engine */}
        <div className="mb-6">
          <ProgressWidget variant="full" />
        </div>

        {/* 2. Academy Progress */}
        <div className="mb-6">
          <ProgressTracker />
        </div>

        {/* 3. KPI Snapshot (max 3 KPIs) */}
        <div className="mb-6">
          <KpiSummaryCards stage={stage} kpiValues={kpiValues} maxCards={3} />
        </div>

        {/* 4. Earning Projection */}
        <div className="mb-6">
          <EarningProjection />
        </div>

        {/* 5. Trust / Proof */}
        <div className="mb-6">
          <TrustProofBlock />
        </div>

        {/* 5b. Activity Feed */}
        <div className="mb-6">
          <ActivityFeed />
        </div>

        {/* 6. Promotion Readiness */}
        <PromotionReadiness stage={stage} overallProgress={overallProgress} kpiValues={kpiValues} />
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // L3–L4 — SENIOR SETTER / CLOSER (PLACEMENT TRACK) (5 blocks)
  // 1. Daily Action  2. KPI Dashboard  3. Certification
  // 4. Placement Readiness  5. Next Career Step
  // ═══════════════════════════════════════════
  if (level <= 4) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10 lg:px-8">
        <DashboardHeader profile={profile} stage={stage} isAdmin={isAdmin} onOpenPerspective={openPerspective} />

        <CareerProgressHeader
          stage={stage}
          overallProgress={overallProgress}
          kpiValues={kpiValues}
          fullName={(profile as any)?.full_name}
        />

        <SectionExplainer
          de="Dein Fokus: Zertifizierung abschließen und Placement-Bereitschaft erreichen. Deine KPIs bestimmen deinen Fortschritt."
          en="Your focus: Complete certification and reach placement readiness. Your KPIs determine your progression."
        />

        {/* 1. Daily Action */}
        <div className="mb-6">
          <DailyActionEngine />
        </div>

        {/* 1b. Progress / Credit Engine */}
        <div className="mb-6">
          <ProgressWidget variant="full" />
        </div>

        {/* 2. KPI Dashboard */}
        <div className="mb-6">
          <KpiSummaryCards stage={stage} kpiValues={kpiValues} />
        </div>

        {/* 3. Certification */}
        <div className="mb-6">
          <CertificationDashboard />
        </div>

        {/* 4. Placement Readiness */}
        <div className="mb-6">
          <PlacementReadinessBlock />
        </div>

        {/* 4b. Activity Feed */}
        <div className="mb-6">
          <ActivityFeed />
        </div>

        {/* 5. Promotion / Next Step */}
        <PromotionReadiness stage={stage} overallProgress={overallProgress} kpiValues={kpiValues} />
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // L5–L6 — MANAGING / SENIOR CLOSER (5 blocks)
  // 1. Earnings  2. KPI Performance  3. Placement Pipeline
  // 4. Growth Lever  5. Network
  // ═══════════════════════════════════════════
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10 lg:px-8">
      <DashboardHeader profile={profile} stage={stage} isAdmin={isAdmin} onOpenPerspective={openPerspective} />

      <SectionExplainer
        de="Dein Fokus: Performance maximieren, Placement-Chancen nutzen und dein Netzwerk ausbauen."
        en="Your focus: Maximize performance, leverage placement opportunities, and grow your network."
      />

      {/* 1. Earnings */}
      <div className="mb-6">
        <EarningsOverview />
      </div>

      {/* 2. KPI Performance */}
      <div className="mb-6">
        <KpiSummaryCards stage={stage} kpiValues={kpiValues} />
      </div>

      {/* 3. Placement */}
      <div className="mb-6">
        <PlacementReadinessBlock />
      </div>

      {/* 4. Certification / Growth */}
      <div className="mb-6">
        <CertificationDashboard />
      </div>

      {/* 5. Network */}
      <div className="mb-6">
        <NetworkGrowth />
      </div>

      {/* 5b. Activity Feed */}
      <div className="mb-6">
        <ActivityFeed />
      </div>
    </div>
  );
}
