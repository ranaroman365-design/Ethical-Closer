import { useEffect, useState, useMemo } from 'react';
import { PRODUCT } from '@/config/product';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/i18n/LanguageContext';
import {
  Gift, Lock, CheckCircle2, Star, Sparkles, Award,
  Ticket, Key, Package, Zap, ExternalLink,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Gift, Star, Sparkles, Award, Ticket, Key, Package, Zap,
};

const STAGE_ORDER = [
  'opener', 'setter', 'senior_associate',
  'junior_manager', 'manager', 'senior_manager',
  'director', 'partner',
];

const LEVEL_LABELS: Record<string, { de: string; en: string }> = {
  '1': { de: 'Stufe 1 – Trainee', en: 'Level 1 – Trainee' },
  '2': { de: 'Stufe 2 – Associate Setter', en: 'Level 2 – Associate Setter' },
  '3': { de: 'Stufe 3 – Senior Setter', en: 'Level 3 – Senior Setter' },
  '4': { de: 'Stufe 4 – Closer (Placement Track)', en: 'Level 4 – Closer (Placement Track)' },
  '5': { de: 'Stufe 5 – Managing Closer', en: 'Level 5 – Managing Closer' },
  '6': { de: 'Stufe 6 – Senior Closer', en: 'Level 6 – Senior Closer' },
  '7': { de: 'Stufe 7 – Director', en: 'Level 7 – Director' },
  '8': { de: 'Stufe 8 – Partner', en: 'Level 8 – Partner' },
};

interface Benefit {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlock_type: string;
  unlock_value: string;
  reward_type: string;
  redeem_link: string | null;
  redeem_code: string | null;
  is_new: boolean;
  active: boolean;
}

type Filter = 'all' | 'unlocked' | 'locked';

export default function CloserBenefits() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [userBenefitIds, setUserBenefitIds] = useState<Set<string>>(new Set());
  const [redeemedIds, setRedeemedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  const t = (de: string, en: string) => lang === 'de' ? de : en;

  const userLevel = useMemo(() => {
    const stage = (profile as any)?.business_stage || 'opener';
    return STAGE_ORDER.indexOf(stage) + 1;
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  async function loadData() {
    const [{ data: bData }, { data: ubData }] = await Promise.all([
      supabase.from('benefits' as any).select('*').eq('active', true).order('unlock_value'),
      supabase.from('user_benefits' as any).select('benefit_id, redeemed').eq('user_id', user!.id),
    ]);
    const benefitsList = (bData as unknown as Benefit[]) ?? [];
    setBenefits(benefitsList);
    const unlocked = new Set((ubData as any[] ?? []).map((u: any) => u.benefit_id));
    const redeemed = new Set((ubData as any[] ?? []).filter((u: any) => u.redeemed).map((u: any) => u.benefit_id));
    setUserBenefitIds(unlocked);
    setRedeemedIds(redeemed);

    const toUnlock = benefitsList.filter(b => {
      if (unlocked.has(b.id)) return false;
      if (b.unlock_type === 'level_based') {
        return userLevel >= parseInt(b.unlock_value || '99', 10);
      }
      return false;
    });

    if (toUnlock.length > 0) {
      const inserts = toUnlock.map(b => ({ user_id: user!.id, benefit_id: b.id }));
      await (supabase.from('user_benefits' as any) as any).insert(inserts);
      toUnlock.forEach(b => unlocked.add(b.id));
      setUserBenefitIds(new Set(unlocked));
      if (toUnlock.length === 1) {
        toast({ title: t('🎁 Neuer Benefit freigeschaltet!', '🎁 New benefit unlocked!'), description: toUnlock[0].title });
      } else {
        toast({ title: t('🎁 Neue Benefits freigeschaltet!', '🎁 New benefits unlocked!'), description: t(`${toUnlock.length} Benefits wurden aktiviert.`, `${toUnlock.length} benefits activated.`) });
      }
    }

    setLoading(false);
  }

  async function handleRedeem(benefitId: string) {
    const benefit = benefits.find(b => b.id === benefitId);
    if (!benefit) return;

    await (supabase.from('user_benefits' as any) as any).update({ redeemed: true, redeemed_at: new Date().toISOString() }).eq('user_id', user!.id).eq('benefit_id', benefitId);
    setRedeemedIds(prev => new Set([...prev, benefitId]));

    if (benefit.redeem_code) {
      await navigator.clipboard.writeText(benefit.redeem_code);
      toast({ title: t('Code kopiert!', 'Code copied!'), description: benefit.redeem_code });
    }
    if (benefit.redeem_link) {
      window.open(benefit.redeem_link, '_blank');
    }
  }

  const isUnlocked = (b: Benefit) => userBenefitIds.has(b.id) || (b.unlock_type === 'level_based' && userLevel >= parseInt(b.unlock_value || '99', 10));

  const activeBenefits = benefits.filter(isUnlocked);
  const upcomingBenefits = benefits.filter(b => !isUnlocked(b));
  const filteredBenefits = filter === 'unlocked' ? activeBenefits : filter === 'locked' ? upcomingBenefits : benefits;

  const REWARD_TYPE_LABELS: Record<string, { de: string; en: string }> = {
    voucher: { de: '🎟 Gutschein', en: '🎟 Voucher' },
    access: { de: '🔑 Zugang', en: '🔑 Access' },
    physical: { de: '📦 Physisch', en: '📦 Physical' },
    digital: { de: '💎 Digital', en: '💎 Digital' },
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const BenefitCard = ({ benefit, unlocked }: { benefit: Benefit; unlocked: boolean }) => {
    const Icon = ICON_MAP[benefit.icon] || Gift;
    const redeemed = redeemedIds.has(benefit.id);
    const unlockLevel = parseInt(benefit.unlock_value || '1', 10);

    return (
      <div className={`rounded-xl border p-4 transition-all ${unlocked ? 'border-accent/30 bg-card' : 'border-border/20 bg-card/40 opacity-60'}`}>
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${unlocked ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground'}`}>
            {unlocked ? <Icon className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className={`text-sm font-semibold ${unlocked ? 'text-foreground' : 'text-muted-foreground'}`}>{benefit.title}</h3>
              {benefit.is_new && <Badge className="bg-accent/15 text-accent border-0 text-[9px] px-1.5 py-0">{t('NEU', 'NEW')}</Badge>}
              {redeemed && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
            </div>
            <p className={`mt-0.5 text-xs ${unlocked ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>{benefit.description}</p>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="outline" className="text-[9px]">
                {REWARD_TYPE_LABELS[benefit.reward_type]?.[lang] || benefit.reward_type}
              </Badge>
              {!unlocked && (
                <span className="text-[10px] text-muted-foreground">
                  {t('Verfügbar ab', 'Available at')} {LEVEL_LABELS[String(unlockLevel)]?.[lang] || `${t('Stufe', 'Level')} ${unlockLevel}`}
                </span>
              )}
            </div>
          </div>
          {unlocked && (benefit.redeem_link || benefit.redeem_code) && !redeemed && (
            <Button size="sm" variant="outline" className="shrink-0 text-xs h-8 border-accent/30 text-accent hover:bg-accent/10" onClick={() => handleRedeem(benefit.id)}>
              <ExternalLink className="mr-1 h-3 w-3" />{t('Einlösen', 'Redeem')}
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
      <div className="mb-8">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">Benefits</h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-2xl">
           {t(
            `Im Laufe deiner Karriere im ${PRODUCT.name} System schaltest du reale Benefits frei. Dazu gehören Gutscheine, Tools, priorisierter Zugang und exklusive Partner-Rewards. Neue Benefits werden laufend über unser Netzwerk ergänzt und automatisch freigeschaltet, wenn du neue Stufen erreichst.`,
            `As you progress through the ${PRODUCT.name} system, you unlock real-world benefits. These include vouchers, tools, priority access, and exclusive partner rewards. New benefits are continuously added through our network and automatically unlocked as you reach new levels.`
          )}
        </p>
      </div>

      {activeBenefits.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-accent" />
            <h2 className="text-base font-semibold text-foreground">{t('Aktive Benefits', 'Active Benefits')}</h2>
            <Badge className="bg-primary/15 text-primary border-0 text-[10px]">{activeBenefits.length}</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {activeBenefits.map(b => <BenefitCard key={b.id} benefit={b} unlocked />)}
          </div>
        </div>
      )}

      {upcomingBenefits.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold text-foreground">{t('Kommende Benefits', 'Upcoming Benefits')}</h2>
            <Badge variant="outline" className="text-[10px]">{upcomingBenefits.length}</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {upcomingBenefits.map(b => <BenefitCard key={b.id} benefit={b} unlocked={false} />)}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-4">
          <Gift className="h-4 w-4 text-foreground" />
          <h2 className="text-base font-semibold text-foreground">{t('Alle Benefits', 'All Benefits')}</h2>
          <div className="ml-auto flex gap-1">
            {(['all', 'unlocked', 'locked'] as Filter[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-3 py-1 text-[11px] font-medium transition-colors ${filter === f ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {f === 'all' ? t('Alle', 'All') : f === 'unlocked' ? t('Freigeschaltet', 'Unlocked') : t('Gesperrt', 'Locked')}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {filteredBenefits.map(b => <BenefitCard key={b.id} benefit={b} unlocked={isUnlocked(b)} />)}
        </div>
        {filteredBenefits.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-12">{t('Keine Benefits in dieser Kategorie.', 'No benefits in this category.')}</p>
        )}
      </div>
    </div>
  );
}
