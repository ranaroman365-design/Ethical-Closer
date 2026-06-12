import { useEffect, useState } from 'react';
import { formatK } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, TrendingUp, AlertTriangle } from 'lucide-react';

interface TeamMember {
  id: string;
  closer_id: string;
  closer_name: string;
  offer_name: string;
  status: string;
  performance_score: number;
  revenue_generated: number;
}

export default function DirectorTeam() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const t = (de: string, en: string) => lang === 'de' ? de : en;

  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchTeam = async () => {
      // Get team assignments
      const { data: assignments } = await supabase
        .from('director_team_assignments')
        .select('id, closer_id, offer_id, status, performance_score, revenue_generated')
        .eq('director_id', user.id);

      if (!assignments || assignments.length === 0) {
        setLoading(false);
        return;
      }

      // Get closer names and offer names
      const closerIds = [...new Set((assignments as any[]).map(a => a.closer_id))];
      const offerIds = [...new Set((assignments as any[]).filter(a => a.offer_id).map(a => a.offer_id))];

      const [{ data: profiles }, { data: offers }] = await Promise.all([
        supabase.from('profiles').select('id, full_name').in('id', closerIds),
        offerIds.length > 0
          ? supabase.from('director_offers').select('id, offer_name').in('id', offerIds)
          : Promise.resolve({ data: [] }),
      ]);

      const nameMap: Record<string, string> = {};
      ((profiles as any[]) ?? []).forEach(p => { nameMap[p.id] = p.full_name || 'Closer'; });
      const offerMap: Record<string, string> = {};
      ((offers as any[]) ?? []).forEach(o => { offerMap[o.id] = o.offer_name; });

      setTeam((assignments as any[]).map(a => ({
        id: a.id,
        closer_id: a.closer_id,
        closer_name: nameMap[a.closer_id] || 'Closer',
        offer_name: offerMap[a.offer_id] || '—',
        status: a.status,
        performance_score: a.performance_score || 0,
        revenue_generated: a.revenue_generated || 0,
      })));
      setLoading(false);
    };

    fetchTeam();
  }, [user]);

  if (loading) return <Skeleton className="h-48" />;

  const activeTeam = team.filter(m => m.status === 'active');
  const totalRevenue = team.reduce((s, m) => s + m.revenue_generated, 0);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-5">
          <Users className="h-4 w-4 text-muted-foreground/50 mb-2" />
          <p className="text-2xl font-semibold text-foreground">{activeTeam.length}</p>
          <p className="text-xs text-muted-foreground">{t('Aktive Closer', 'Active Closers')}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <TrendingUp className="h-4 w-4 text-muted-foreground/50 mb-2" />
          <p className="text-2xl font-semibold text-foreground">{formatK(totalRevenue, '€')}</p>
          <p className="text-xs text-muted-foreground">{t('Umsatz generiert', 'Revenue Generated')}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <AlertTriangle className="h-4 w-4 text-muted-foreground/50 mb-2" />
          <p className="text-2xl font-semibold text-foreground">
            {team.filter(m => m.performance_score < 50).length}
          </p>
          <p className="text-xs text-muted-foreground">{t('Unter Zielwert', 'Below Target')}</p>
        </div>
      </div>

      {/* Team List */}
      {team.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {t('Noch keine Closer zugewiesen. Erstellen Sie ein Angebot und nutzen Sie die Placement Engine.', 'No closers assigned yet. Create an offer and use the Placement Engine.')}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-5 py-3 grid grid-cols-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            <span>Closer</span>
            <span>{t('Angebot', 'Offer')}</span>
            <span>Status</span>
            <span>Performance</span>
            <span>{t('Umsatz', 'Revenue')}</span>
          </div>
          {team.map(member => (
            <div key={member.id} className="border-b border-border/50 px-5 py-3 grid grid-cols-5 items-center text-sm">
              <span className="font-medium text-foreground">{member.closer_name}</span>
              <span className="text-muted-foreground text-xs">{member.offer_name}</span>
              <span className={`text-xs font-medium ${member.status === 'active' ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                {member.status}
              </span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 max-w-[80px] rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${member.performance_score >= 70 ? 'bg-emerald-500' : member.performance_score >= 40 ? 'bg-amber-500' : 'bg-destructive'}`}
                    style={{ width: `${Math.min(member.performance_score, 100)}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">{member.performance_score}%</span>
              </div>
              <span className="text-foreground font-medium">{formatK(member.revenue_generated, '€')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
