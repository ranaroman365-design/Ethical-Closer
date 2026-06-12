import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import WorkspaceAnalytics from '@/components/members/WorkspaceAnalytics';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import DirectorOverview from '@/components/director/DirectorOverview';
import DirectorOffers from '@/components/director/DirectorOffers';
import DirectorTeam from '@/components/director/DirectorTeam';
import DirectorPerformance from '@/components/director/DirectorPerformance';
import { FlaskConical } from 'lucide-react';

type DataView = 'production' | 'simulation' | 'combined';

export default function DirectorWorkspace() {
  const { user, isAdmin } = useAuth();
  const { lang } = useLanguage();
  const t = (de: string, en: string) => lang === 'de' ? de : en;
  const [dataView, setDataView] = useState<DataView>('production');

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12 lg:px-10">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
            Director Workspace
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('Operative Übersicht — Angebote, Team und Performance.', 'Operational overview — Offers, team and performance.')}
          </p>
        </div>

        {/* Data view toggle */}
        {isAdmin && (
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card p-1">
            {(['production', 'simulation', 'combined'] as DataView[]).map(v => (
              <button
                key={v}
                onClick={() => setDataView(v)}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  dataView === v
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {v === 'simulation' && <FlaskConical className="h-3 w-3" />}
                {v === 'production' ? t('Produktion', 'Production')
                  : v === 'simulation' ? 'Simulation'
                  : t('Kombiniert', 'Combined')}
              </button>
            ))}
          </div>
        )}
      </div>

      {dataView === 'simulation' && (
        <div className="mb-6 rounded-lg border border-accent/30 bg-accent/5 p-3 flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-accent" />
          <p className="text-xs text-muted-foreground">
            {t('Simulation-Modus aktiv — nur synthetische Testdaten werden angezeigt.', 'Simulation mode active — only synthetic test data is shown.')}
          </p>
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="overview">{t('Übersicht', 'Overview')}</TabsTrigger>
          <TabsTrigger value="offers">{t('Angebote', 'Offers')}</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <DirectorOverview />
        </TabsContent>
        <TabsContent value="offers">
          <DirectorOffers />
        </TabsContent>
        <TabsContent value="team">
          <DirectorTeam />
        </TabsContent>
        <TabsContent value="performance">
          <DirectorPerformance />
        </TabsContent>
        <TabsContent value="analytics">
          <WorkspaceAnalytics roleOverride="director" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
