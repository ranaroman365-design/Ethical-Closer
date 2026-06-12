import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useKpis } from '@/hooks/useKpis';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { formatK } from '@/lib/utils';
import { getLevelForStage } from '@/lib/kpi-config';
import { normalizeBusinessStage } from '@/lib/stage-utils';
import { DollarSign, TrendingUp, Users, Zap } from 'lucide-react';

interface EarningsData {
  directCommissions: number;
  referralIncome: number;
  teamRevenue: number;
  totalEarnings: number;
  pendingPayout: number;
}

export default function EarningsOverview() {
  const { profile } = useAuth();
  const { kpis } = useKpis();
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);
  const [earnings, setEarnings] = useState<EarningsData | null>(null);

  const stage = normalizeBusinessStage((profile as any)?.business_stage || 'opener');
  const level = getLevelForStage(stage);

  useEffect(() => {
    if (!profile) return;
    const uid = (profile as any).id;

    const fetchEarnings = async () => {
      // Direct commissions
      const { data: commissions } = await supabase
        .from('commissions')
        .select('amount, payout_status, source_type')
        .eq('user_id', uid)
        .eq('is_simulation', false);

      const directCommissions = (commissions ?? [])
        .filter(c => c.source_type === 'direct' || c.source_type === 'closer' || c.source_type === 'setter' || c.source_type === 'opener')
        .reduce((sum, c) => sum + (c.amount || 0), 0);

      const referralIncome = (commissions ?? [])
        .filter(c => c.source_type === 'partner_l1' || c.source_type === 'partner_l2' || c.source_type === 'referral')
        .reduce((sum, c) => sum + (c.amount || 0), 0);

      const pendingPayout = (commissions ?? [])
        .filter(c => c.payout_status === 'pending' || c.payout_status === 'approved')
        .reduce((sum, c) => sum + (c.amount || 0), 0);

      // Team revenue (for directors/partners)
      let teamRevenue = 0;
      if (level >= 7) {
        const { data: teamAssignments } = await supabase
          .from('director_team_assignments')
          .select('revenue_generated')
          .eq('director_id', uid)
          .eq('status', 'active');
        teamRevenue = (teamAssignments ?? []).reduce((sum, t) => sum + (t.revenue_generated || 0), 0);
      }

      const totalEarnings = directCommissions + referralIncome;

      setEarnings({
        directCommissions,
        referralIncome,
        teamRevenue,
        totalEarnings,
        pendingPayout,
      });
    };

    fetchEarnings();
  }, [profile, level]);

  // L1-L3: show only own commissions. L4+: show full overview
  const showReferral = level >= 2;
  const showTeam = level >= 7;

  const cards = useMemo(() => {
    if (!earnings) return [];
    const items = [
      {
        icon: DollarSign,
        label: tl('Provisionen', 'Commissions'),
        value: earnings.directCommissions,
        show: true,
      },
      {
        icon: Users,
        label: tl('Referral-Einnahmen', 'Referral Income'),
        value: earnings.referralIncome,
        show: showReferral,
      },
      {
        icon: TrendingUp,
        label: tl('Team-Revenue', 'Team Revenue'),
        value: earnings.teamRevenue,
        show: showTeam,
      },
    ];
    return items.filter(c => c.show);
  }, [earnings, showReferral, showTeam, lang]);

  if (!earnings || cards.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {tl('Einnahmen-Übersicht', 'Earnings Overview')}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {tl('Gesamt:', 'Total:')} <span className="font-semibold text-foreground">{formatK(earnings.totalEarnings, '€')}</span>
            </p>
          </div>
        </div>
        {earnings.pendingPayout > 0 && (
          <span className="inline-flex items-center rounded-md border border-accent/20 bg-accent/5 px-2 py-0.5 text-[10px] font-medium text-accent">
            {formatK(earnings.pendingPayout, '€')} {tl('ausstehend', 'pending')}
          </span>
        )}
      </div>

      <div className={`grid gap-3 ${cards.length >= 3 ? 'grid-cols-3' : cards.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {cards.map(card => (
          <div key={card.label} className="rounded-xl border border-border/40 bg-background p-3.5">
            <div className="flex items-center gap-1.5 mb-2">
              <card.icon className="h-3.5 w-3.5 text-muted-foreground/50" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {card.label}
              </span>
            </div>
            <p className="text-xl font-bold tracking-tight text-foreground">
              {formatK(card.value, '€')}
            </p>
          </div>
        ))}
      </div>

      {/* Director/Partner CTA */}
      {level >= 5 && level < 7 && (
        <div className="mt-4 rounded-lg border border-primary/10 bg-primary/[0.02] px-4 py-3">
          <p className="text-xs text-foreground">
            <span className="font-semibold">{tl('Nächstes Ziel:', 'Next goal:')}</span>{' '}
            {tl(
              'Als Director (L7) verdienst du an der Performance deines Teams.',
              'As a Director (L7) you earn from your team\'s performance.'
            )}
          </p>
        </div>
      )}
      {level >= 7 && level < 8 && (
        <div className="mt-4 rounded-lg border border-primary/10 bg-primary/[0.02] px-4 py-3">
          <p className="text-xs text-foreground">
            <span className="font-semibold">{tl('Partner-Track:', 'Partner Track:')}</span>{' '}
            {tl(
              'Skaliere über mehrere Teams und erziele Equity-ähnliche Positionierung.',
              'Scale across multiple teams and achieve equity-like positioning.'
            )}
          </p>
        </div>
      )}
    </div>
  );
}
