import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/i18n/LanguageContext';
import {
  Users, Copy, Share2, CheckCircle2, Gift,
  UserPlus, TrendingUp, Lock, Trophy, Send,
} from 'lucide-react';
import ReferralLeaderboard from '@/components/members/ReferralLeaderboard';

interface Referral {
  id: string;
  referred_email: string;
  status: string;
  reward_granted: boolean;
  created_at: string;
  accepted_at: string | null;
}

const STATUS_LABELS: Record<string, { label: { de: string; en: string }; color: string }> = {
  pending:  { label: { de: 'Eingeladen', en: 'Invited' },   color: 'text-muted-foreground' },
  applied:  { label: { de: 'Beworben',   en: 'Applied' },   color: 'text-yellow-500' },
  accepted: { label: { de: 'Akzeptiert', en: 'Accepted' },  color: 'text-primary' },
  rejected: { label: { de: 'Abgelehnt',  en: 'Rejected' },  color: 'text-destructive' },
};

// ── Reward model ────────────────────────────────────────────────
// 1–2 referrals → €250 each
// 3–4 referrals → €350 each
// 5+ referrals  → €450 each
const TIERS = [
  { id: 1, name: { de: 'Starter',    en: 'Starter' },    amount: 200, range: { de: '1–2 Empfehlungen', en: '1–2 referrals' }, min: 1, max: 2 },
  { id: 2, name: { de: 'Performer',  en: 'Performer' },  amount: 350, range: { de: '3–4 Empfehlungen', en: '3–4 referrals' }, min: 3, max: 4 },
  { id: 3, name: { de: 'Closer Tier', en: 'Closer Tier' }, amount: 500, range: { de: '5+ Empfehlungen',  en: '5+ referrals'  }, min: 5, max: Infinity },
];

function rewardForCount(n: number): number {
  if (n <= 0) return 0;
  if (n <= 2) return 200;
  if (n <= 4) return 350;
  return 500;
}

function totalEarnings(accepted: number): number {
  // Sum of rewards across tiers earned so far
  let total = 0;
  for (let i = 1; i <= accepted; i++) total += rewardForCount(i);
  return total;
}

function currentTierIndex(accepted: number): number {
  if (accepted >= 5) return 2;
  if (accepted >= 3) return 1;
  if (accepted >= 1) return 0;
  return -1; // none yet
}

export default function BuildYourTeam() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [sending, setSending] = useState(false);

  const t = (de: string, en: string) => lang === 'de' ? de : en;

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  async function loadData() {
    const { data: refData } = await supabase
      .from('referrals' as any)
      .select('*')
      .eq('referrer_id', user!.id)
      .order('created_at', { ascending: false });

    setReferrals((refData as unknown as Referral[]) ?? []);
    setLoading(false);
  }

  const referralLink = useMemo(() => {
    return `${window.location.origin}/bewerbung?ref=${user?.id || ''}`;
  }, [user]);

  async function copyLink() {
    await navigator.clipboard.writeText(referralLink);
    toast({
      title: t('Link kopiert', 'Link copied'),
      description: t('Dein persönlicher Referral-Link wurde kopiert.', 'Your personal referral link has been copied.'),
    });
  }

  async function shareLink() {
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({
          title: t('Empfehlung', 'Referral'),
          text: t(
            'Schau dir das mal an — ich glaube, das passt zu dir:',
            'Check this out — I think this could be a great fit for you:'
          ),
          url: referralLink,
        });
        return;
      } catch {
        // user cancelled — fall through to copy
      }
    }
    await copyLink();
  }

  async function sendInvite() {
    if (!inviteEmail.trim()) return;
    setSending(true);

    const existing = referrals.find(r => r.referred_email.toLowerCase() === inviteEmail.trim().toLowerCase());
    if (existing) {
      toast({
        title: t('Bereits eingeladen', 'Already invited'),
        description: t('Diese Person wurde bereits von dir eingeladen.', 'This person has already been invited by you.'),
        variant: 'destructive',
      });
      setSending(false);
      return;
    }

    const { error } = await (supabase.from('referrals' as any) as any).insert({
      referrer_id: user!.id,
      referred_email: inviteEmail.trim().toLowerCase(),
      status: 'pending',
    });

    if (error) {
      toast({ title: t('Fehler', 'Error'), description: error.message, variant: 'destructive' });
    } else {
      toast({
        title: t('Einladung gespeichert', 'Invitation saved'),
        description: t('Teile deinen Referral-Link mit dieser Person.', 'Share your referral link with this person.'),
      });
      setInviteEmail('');
      loadData();
    }
    setSending(false);
  }

  const stats = useMemo(() => {
    const accepted = referrals.filter(r => r.status === 'accepted').length;
    return {
      invites: referrals.length,
      accepted,
      totalEarned: totalEarnings(accepted),
      tierIdx: currentTierIndex(accepted),
    };
  }, [referrals]);

  const currentTier = stats.tierIdx >= 0 ? TIERS[stats.tierIdx] : null;
  const nextTier = stats.tierIdx < TIERS.length - 1 ? TIERS[stats.tierIdx + 1] : null;

  // Next milestone copy
  const nextMilestone = useMemo(() => {
    const a = stats.accepted;
    if (a === 0) return t('Noch 1 Empfehlung bis zu 200€ pro Referral', '1 more referral until €200 per referral');
    if (a === 1) return t('Noch 1 Empfehlung bis zum Abschluss des ersten Levels', '1 more referral to complete the first level');
    if (a === 2) return t('Noch 1 Empfehlung bis zu 350€ pro Referral', '1 more referral until €350 per referral');
    if (a === 3) return t('Noch 1 Empfehlung bis zum Ausbau des 350€ Levels', '1 more referral to expand your €350 level');
    if (a === 4) return t('Noch 1 Empfehlung bis zu 500€ pro Referral', '1 more referral until €500 per referral');
    return t('Du hast das höchste Reward-Level erreicht', 'You have reached the highest reward level');
  }, [stats.accepted, lang]);

  // Progress (within next-tier window) for the bar
  const progressPct = useMemo(() => {
    const a = stats.accepted;
    if (a >= 5) return 100;
    if (a === 0) return 0;
    if (a <= 2) return (a / 3) * 100;       // toward 350€ tier
    return ((a - 2) / 3) * 100;              // toward 500€ tier
  }, [stats.accepted]);

  const currentLevelLabel = useMemo(() => {
    if (stats.tierIdx < 0) return t('Noch nicht erreicht', 'Not yet reached');
    return `${TIERS[stats.tierIdx].amount}€ ${t('Level', 'Level')}`;
  }, [stats.tierIdx, lang]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
      {/* ── Page Header ─────────────────────────── */}
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          {t('Invite & Earn', 'Invite & Earn')}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-2xl">
          {t(
            'Empfiehl passende Personen und verdiene pro erfolgreicher Empfehlung. Mit jeder Stufe steigt dein Verdienst pro Referral.',
            'Refer the right people and earn per successful referral. Your reward per referral grows with every level.'
          )}
        </p>
      </div>

      {/* ── Top KPI Cards ───────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard icon={<Send className="h-4 w-4" />}        label={t('Einladungen',  'Invites')}      value={String(stats.invites)} />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label={t('Angenommen',   'Accepted')}     value={String(stats.accepted)} />
        <KpiCard icon={<Trophy className="h-4 w-4" />}       label={t('Aktuelle Stufe', 'Current Tier')} value={currentLevelLabel} small />
        <KpiCard icon={<Gift className="h-4 w-4" />}         label={t('Verdient',     'Earned')}       value={`${stats.totalEarned}€`} accent />
      </div>

      {/* ── Progress / Next Milestone ───────────── */}
      <div className="mb-6 rounded-xl border border-border/40 bg-card p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-accent" />
            <span className="text-[13px] font-semibold text-foreground">
              {t('Nächster Meilenstein', 'Next milestone')}
            </span>
          </div>
          {nextTier && (
            <span className="text-[11px] font-medium text-accent tabular-nums">
              {nextTier.amount}€ / {t('Referral', 'referral')}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-3">{nextMilestone}</p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-accent transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* ── Referral Link Section (PRIMARY CTA) ─── */}
      <div className="mb-6 rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/5 to-accent/10 p-5">
        <h3 className="text-sm font-semibold text-foreground mb-1">
          {t('Dein persönlicher Referral-Link', 'Your personal referral link')}
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          {t('Teile deinen Link. Gewinne Momentum. Erhöhe deinen Reward.', 'Share your link. Build momentum. Grow your reward.')}
        </p>
        <Input
          readOnly
          value={referralLink}
          onClick={copyLink}
          className="mb-3 text-xs bg-background/60 font-mono cursor-pointer"
        />
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <Button variant="outline" size="sm" className="sm:flex-1" onClick={copyLink}>
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            {t('Link kopieren', 'Copy link')}
          </Button>
          <Button
            size="sm"
            className="sm:flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={shareLink}
          >
            <Share2 className="mr-1.5 h-3.5 w-3.5" />
            {t('Jetzt teilen', 'Share now')}
          </Button>
        </div>

        <div className="mt-4 pt-4 border-t border-border/30">
          <h4 className="text-[11px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">
            {t('Oder per E-Mail einladen', 'Or invite via email')}
          </h4>
          <div className="flex gap-2">
            <Input
              placeholder="email@beispiel.de"
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              className="flex-1 text-xs"
              onKeyDown={e => e.key === 'Enter' && sendInvite()}
            />
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 text-xs"
              onClick={sendInvite}
              disabled={sending}
            >
              {sending ? t('Sende…', 'Sending…') : t('Einladen', 'Invite')}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Referral Levels ─────────────────────── */}
      <div className="mb-8">
        <h2 className="text-base font-semibold text-foreground mb-1">
          {t('Referral Levels', 'Referral Levels')}
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          {t('Mit jeder Stufe steigt dein Verdienst pro Referral.', 'Your reward per referral grows with every level.')}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {TIERS.map((tier, idx) => {
            const isCurrent   = idx === stats.tierIdx;
            const isCompleted = idx < stats.tierIdx;
            const isNext      = idx === stats.tierIdx + 1 || (stats.tierIdx === -1 && idx === 0);
            const isLocked    = !isCurrent && !isCompleted && !isNext;

            return (
              <div
                key={tier.id}
                className={[
                  'relative rounded-xl border p-4 transition-all',
                  isCurrent   && 'border-accent/40 bg-accent/5 shadow-sm',
                  isCompleted && 'border-primary/30 bg-primary/5',
                  isNext      && !isCurrent && 'border-border/40 bg-card',
                  isLocked    && 'border-border/20 bg-card/40 opacity-60',
                ].filter(Boolean).join(' ')}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('Level', 'Level')} {tier.id}
                    </p>
                    <p className="text-sm font-semibold text-foreground">{tier.name[lang]}</p>
                  </div>
                  {isCurrent && (
                    <Badge className="bg-accent/15 text-accent border-0 text-[9px] uppercase tracking-wider">
                      {t('Aktuell', 'Current')}
                    </Badge>
                  )}
                  {isCompleted && (
                    <Badge className="bg-primary/15 text-primary border-0 text-[9px] uppercase tracking-wider">
                      <CheckCircle2 className="mr-0.5 h-2.5 w-2.5" />
                      {t('Erreicht', 'Done')}
                    </Badge>
                  )}
                  {isNext && !isCurrent && (
                    <Badge variant="outline" className="text-[9px] uppercase tracking-wider">
                      {t('Nächste', 'Next')}
                    </Badge>
                  )}
                  {isLocked && (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground/40" />
                  )}
                </div>
                <p className="font-serif text-2xl font-bold text-foreground tabular-nums">
                  {tier.amount}€
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {t('pro Referral', 'per referral')} · {tier.range[lang]}
                </p>
                {tier.id === 3 && stats.accepted >= 5 && (
                  <p className="mt-2 text-[10px] font-medium text-accent uppercase tracking-wider">
                    {t('Highest Reward Tier', 'Highest Reward Tier')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Empty state OR Invitations list ────── */}
      {referrals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-accent/30 bg-accent/5 p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Gift className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            {t('Starte dein erstes Reward-Level', 'Start your first reward level')}
          </h3>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-md mx-auto">
            {t(
              'Teile deinen Link und verdiene 200€ pro Empfehlung für deine ersten 2 Referrals.',
              'Share your link and earn €200 per referral for your first 2 referrals.'
            )}
          </p>
          <div className="mt-4 flex flex-col-reverse sm:flex-row gap-2 justify-center">
            <Button variant="outline" size="sm" onClick={copyLink}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              {t('Link kopieren', 'Copy link')}
            </Button>
            <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={shareLink}>
              <Share2 className="mr-1.5 h-3.5 w-3.5" />
              {t('Referral-Link teilen', 'Share referral link')}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <h2 className="text-base font-semibold text-foreground mb-4">
            {t('Deine Empfehlungen', 'Your referrals')}
          </h2>
          <div className="space-y-2">
            {referrals.map(r => {
              const statusInfo = STATUS_LABELS[r.status] || STATUS_LABELS.pending;
              return (
                <div key={r.id} className="flex items-center gap-3 rounded-xl border border-border/40 bg-card p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <UserPlus className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-foreground truncate">{r.referred_email}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString('de-DE')}
                      {r.accepted_at && ` · ${t('Akzeptiert', 'Accepted')} ${new Date(r.accepted_at).toLocaleDateString('de-DE')}`}
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${statusInfo.color}`}>
                    {statusInfo.label[lang]}
                  </Badge>
                  {r.reward_granted && (
                    <Badge className="bg-primary/15 text-primary border-0 text-[9px]">
                      <Gift className="mr-0.5 h-2.5 w-2.5" />
                      {t('Belohnt', 'Rewarded')}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Leaderboard ─────────────────────────── */}
      <div className="mt-8">
        <ReferralLeaderboard />
      </div>
    </div>
  );
}

// ───────────────── Subcomponents ─────────────────

function KpiCard({
  icon,
  label,
  value,
  accent,
  small,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
  small?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
        <span className={accent ? 'text-accent' : ''}>{icon}</span>
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p
        className={[
          'font-bold text-foreground tabular-nums leading-tight',
          small ? 'text-sm' : 'text-xl',
          accent && !small ? 'text-accent' : '',
        ].filter(Boolean).join(' ')}
      >
        {value}
      </p>
    </div>
  );
}
