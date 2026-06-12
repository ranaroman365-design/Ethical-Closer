import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { TrendingUp, Users, DollarSign, Layers } from 'lucide-react';

interface EarningsData {
  directRevenue: number;
  indirectRevenue: number;
  totalEarnings: number;
  referralCount: number;
  directCommissions: number;
  indirectCommissions: number;
}

export default function PartnerEarnings() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const t = (de: string, en: string) => lang === 'de' ? de : en;
  const eur = (v: number) => v >= 1000 ? `€${(v / 1000).toFixed(1)}k` : `€${v.toFixed(0)}`;

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      // Get direct commissions
      const { data: directComm } = await supabase
        .from('commissions')
        .select('amount, source_type')
        .eq('user_id', user.id)
        .eq('is_simulation', false);

      const direct = (directComm ?? []).filter((c: any) => (c.source_type || 'direct') === 'direct');
      const indirect = (directComm ?? []).filter((c: any) => c.source_type === 'indirect');

      const directTotal = direct.reduce((s: number, c: any) => s + (c.amount || 0), 0);
      const indirectTotal = indirect.reduce((s: number, c: any) => s + (c.amount || 0), 0);

      // Get referral count
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('referred_by', user.id);

      // Get revenue from referred users' calls
      const { data: referredUsers } = await supabase
        .from('profiles')
        .select('id')
        .eq('referred_by', user.id);

      let indirectRevenue = 0;
      if (referredUsers && referredUsers.length > 0) {
        const refIds = referredUsers.map((u: any) => u.id);
        const { data: refCalls } = await supabase
          .from('calls')
          .select('revenue')
          .in('user_id', refIds)
          .eq('result', 'won');
        indirectRevenue = (refCalls ?? []).reduce((s: number, c: any) => s + (c.revenue || 0), 0);
      }

      // Direct revenue from own calls
      const { data: ownCalls } = await supabase
        .from('calls')
        .select('revenue')
        .eq('user_id', user.id)
        .eq('result', 'won');
      const directRevenue = (ownCalls ?? []).reduce((s: number, c: any) => s + (c.revenue || 0), 0);

      setData({
        directRevenue,
        indirectRevenue,
        totalEarnings: directTotal + indirectTotal,
        referralCount: count || 0,
        directCommissions: directTotal,
        indirectCommissions: indirectTotal,
      });
      setLoading(false);
    };
    fetch();
  }, [user]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!data) return null;

  const cards = [
    { icon: DollarSign, label: t('Eigener Umsatz', 'Direct Revenue'), value: eur(data.directRevenue), color: 'text-green-400' },
    { icon: Layers, label: t('Referral-Umsatz', 'Referral Revenue'), value: eur(data.indirectRevenue), color: 'text-blue-400' },
    { icon: TrendingUp, label: t('Gesamtverdienst', 'Total Earnings'), value: eur(data.totalEarnings), color: 'text-yellow-400' },
    { icon: Users, label: t('Referrals', 'Referrals'), value: `${data.referralCount}`, color: 'text-purple-400' },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-foreground">{t('Partner-Earnings', 'Partner Earnings')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('Dein direkter und indirekter Umsatz auf einen Blick.', 'Your direct and indirect revenue at a glance.')}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map(c => (
          <Card key={c.label}>
            <CardContent className="flex flex-col items-center justify-center p-5 text-center">
              <c.icon className={`h-6 w-6 ${c.color} mb-2`} />
              <p className="text-2xl font-bold text-foreground">{c.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">{t('Direkte Provisionen', 'Direct Commissions')}</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{eur(data.directCommissions)}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('Aus eigenen Deals', 'From own deals')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t('Indirekte Provisionen', 'Indirect Commissions')}</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{eur(data.indirectCommissions)}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('Aus Referral-Deals', 'From referral deals')}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
