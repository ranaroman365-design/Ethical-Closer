import { useEffect, useState } from 'react';
import { formatK } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Building2, Users, TrendingUp, Briefcase, Package,
} from 'lucide-react';

interface PartnerData {
  company_name: string;
  partner_type: string;
  revenue_share_pct: number;
  total_offers: number;
  total_closers: number;
  total_revenue: number;
  status: string;
}

interface OfferSummary {
  id: string;
  offer_name: string;
  closers_assigned: number;
  status: string;
}

export default function PartnerHub() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const t = (de: string, en: string) => lang === 'de' ? de : en;

  const [partner, setPartner] = useState<PartnerData | null>(null);
  const [offers, setOffers] = useState<OfferSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetch = async () => {
      const [{ data: pData }, { data: oData }] = await Promise.all([
        supabase.from('partner_profiles').select('*').eq('user_id', user.id).single(),
        supabase.from('director_offers').select('id, offer_name, closers_assigned, status').eq('director_id', user.id),
      ]);

      if (pData) setPartner(pData as any);
      setOffers((oData as any[]) ?? []);
      setLoading(false);
    };

    fetch();
  }, [user]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12 lg:px-10 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const kpis = [
    { label: t('Angebote', 'Offers'), value: partner?.total_offers ?? offers.length, icon: Package },
    { label: t('Closer gesamt', 'Total Closers'), value: partner?.total_closers ?? 0, icon: Users },
    { label: t('Umsatz', 'Revenue'), value: formatK(partner?.total_revenue ?? 0, '€'), icon: TrendingUp },
    { label: t('Revenue Share', 'Revenue Share'), value: `${partner?.revenue_share_pct ?? 20}%`, icon: Briefcase },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12 lg:px-10">
      <div className="mb-8">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          Scaling Hub
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('Partner-Zentrale für Multi-Offer-Management und Skalierung.', 'Partner central for multi-offer management and scaling.')}
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        {kpis.map(k => (
          <div key={k.label} className="rounded-lg border border-border bg-card p-5">
            <k.icon className="h-4 w-4 text-muted-foreground/50 mb-2" />
            <p className="text-2xl font-semibold text-foreground">{k.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="offers" className="space-y-6">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="offers">{t('Angebote', 'Offers')}</TabsTrigger>
          <TabsTrigger value="closers">Closer Pool</TabsTrigger>
          <TabsTrigger value="expansion">{t('Expansion', 'Expansion')}</TabsTrigger>
        </TabsList>

        <TabsContent value="offers">
          {offers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center">
              <Package className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{t('Keine aktiven Angebote.', 'No active offers.')}</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {offers.map(o => (
                <div key={o.id} className="rounded-lg border border-border bg-card p-5 flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-foreground">{o.offer_name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {o.closers_assigned} Closer · {o.status}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    o.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'
                  }`}>
                    {o.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="closers">
          <div className="rounded-lg border border-dashed border-border p-10 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {t('Globaler Closer-Pool — gefiltert nach KPIs und Verfügbarkeit.', 'Global closer pool — filtered by KPIs and availability.')}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-2">
              {t('Wird automatisch aus der Placement Engine befüllt.', 'Automatically populated from the Placement Engine.')}
            </p>
          </div>
        </TabsContent>

        <TabsContent value="expansion">
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <h3 className="font-semibold text-foreground">{t('Neue Unternehmen onboarden', 'Onboard New Companies')}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t(
                'Als Partner können Sie neue Directors einladen und deren Angebote über Ihre Scaling-Infrastruktur verwalten. Jedes platzierte Team generiert Revenue Share.',
                'As a partner, you can invite new directors and manage their offers through your scaling infrastructure. Each placed team generates revenue share.'
              )}
            </p>
            <div className="rounded-md border border-border/50 bg-background p-4">
              <p className="text-xs text-muted-foreground">
                {t('Ihr Partner-Typ', 'Your Partner Type')}: <span className="font-medium text-foreground">{partner?.partner_type || 'standard'}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Revenue Share: <span className="font-medium text-foreground">{partner?.revenue_share_pct ?? 20}%</span>
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
