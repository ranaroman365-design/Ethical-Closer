import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getLevelForStage } from '@/lib/kpi-config';
import { normalizeBusinessStage } from '@/lib/stage-utils';
import { Progress } from '@/components/ui/progress';
import {
  Copy, Share2, Mail, MessageCircle, Send, TrendingUp, Sparkles,
  Trophy, Target, ArrowUpRight, Zap, BarChart3, HelpCircle, Info,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface DashboardData {
  total_referrals: number;
  total_earnings: number;
  confirmed_earnings: number;
  pending_earnings: number;
  next_index: number;
  next_reward: number;
  next_threshold: number;
  top_level_reached: boolean;
}

interface ReferralRow {
  id: string;
  referred_email: string;
  status: string;
  referral_index: number | null;
  payout_amount: number | null;
  created_at: string;
}

interface ChannelStat {
  channel: string;
  shares: number;
  total: number;
  invited: number;
  signed: number;
  closed: number;
  earnings: number;
  conv_rate: number;
}

const fmtEur = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);

export default function NetworkGrowth() {
  const { profile } = useAuth();
  const { lang } = useLanguage();
  const { toast } = useToast();
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);

  const [data, setData] = useState<DashboardData | null>(null);
  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [channelStats, setChannelStats] = useState<ChannelStat[]>([]);
  const [inviteInput, setInviteInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const stage = normalizeBusinessStage((profile as any)?.business_stage || 'opener');
  const level = getLevelForStage(stage);
  const uid = (profile as any)?.id;
  const referralCode = (profile as any)?.referral_code as string | undefined;

  const baseRefParam = referralCode || uid || '';
  const referralLink = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/?ref=${baseRefParam}`;
  }, [baseRefParam]);

  const linkFor = (channel: string) => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/?ref=${baseRefParam}&ch=${channel}`;
  };

  useEffect(() => {
    if (!uid) return;
    load();
  }, [uid]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, refRes, chRes] = await Promise.all([
        supabase.rpc('get_referral_dashboard' as any, { _user_id: uid }),
        supabase
          .from('referrals' as any)
          .select('id, referred_email, status, referral_index, payout_amount, created_at')
          .eq('referrer_id', uid)
          .order('referral_index', { ascending: true }),
        supabase.rpc('get_referral_channel_stats' as any, { _user_id: uid }),
      ]);
      if (dashRes.error) throw dashRes.error;
      if (refRes.error) throw refRes.error;
      if (chRes.error) throw chRes.error;
      setData((dashRes.data as unknown as DashboardData) ?? null);
      setRows((refRes.data as unknown as ReferralRow[]) ?? []);
      setChannelStats((chRes.data as unknown as ChannelStat[]) ?? []);
    } catch (e: any) {
      setError(e?.message || (lang === 'de' ? 'Daten konnten nicht geladen werden' : 'Could not load data'));
    } finally {
      setLoading(false);
    }
  }

  // Visibility: L1+ only
  if (level < 1) return null;

  // Loading skeleton — shown until first successful load
  if (loading && !data) {
    return (
      <div
        className="space-y-4"
        aria-busy="true"
        aria-label={tl('Lade Empfehlungs-Dashboard', 'Loading referral dashboard')}
      >
        <div className="rounded-3xl border border-border/50 bg-card p-6 md:p-8 space-y-4">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="pt-4 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-12 w-48" />
          </div>
          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-border/40">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="h-5 w-12" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-border/50 bg-card p-6 space-y-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-2 w-full" />
        </div>
        <div className="rounded-3xl border border-border/50 bg-card p-6 space-y-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-10 w-full" />
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        </div>
      </div>
    );
  }

  // Error state — RPC failed and no cached data available
  if (error || !data) {
    return (
      <div className="space-y-3">
        <Alert variant="destructive" className="rounded-2xl">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{tl('Dashboard nicht verfügbar', 'Dashboard unavailable')}</AlertTitle>
          <AlertDescription className="mt-1 text-xs">
            {error ||
              tl(
                'Die Daten konnten gerade nicht geladen werden. Bitte versuche es erneut.',
                'We could not load your data right now. Please try again.'
              )}
          </AlertDescription>
        </Alert>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-[11px] font-medium text-background hover:opacity-90 transition-opacity"
        >
          <RefreshCw className="h-3 w-3" /> {tl('Erneut versuchen', 'Retry')}
        </button>
      </div>
    );
  }

  const total = data.total_referrals;

  const progressState = (() => {
    if (total === 0) return { pct: 0, headline: tl('Starte jetzt – 150€ mit deiner ersten Empfehlung', 'Start now — 150€ with your first referral'), marker: '150€' };
    if (total === 1) return { pct: 25, headline: tl('Noch 1 Empfehlung bis 300€', '1 more referral to 300€'), marker: '300€' };
    if (total === 2) return { pct: 50, headline: tl('Du bist drin. 400€ pro Empfehlung ab jetzt', "You're in. 400€ per referral from now"), marker: '400€' };
    if (total === 3) return { pct: 65, headline: tl('Noch 1 bis zum 4. Reward (400€)', '1 more to your 4th reward (400€)'), marker: '400€' };
    if (total === 4) return { pct: 85, headline: tl('Noch 1 bis Top-Level (500€)', '1 more to Top-Level (500€)'), marker: '500€' };
    return { pct: 100, headline: tl('Top-Level erreicht: 500€ pro Empfehlung', 'Top-Level reached: 500€ per referral'), marker: '500€' };
  })();

  const momentum = (() => {
    if (total === 0) return tl('Top Performer verdienen 4.000€+', 'Top performers earn 4,000€+');
    if (total <= 2) return tl('Du bist kurz vor dem Boost-Level', "You're close to the boost level");
    if (total <= 4) return tl('Jetzt beginnt echtes Einkommen', 'Real income starts now');
    return tl('Du bist im Top-Level', "You're in the Top-Level");
  })();

  const avgPerReferral = total > 0 ? Math.round(data.total_earnings / total) : 0;

  async function copyLink(channel: string = 'copy') {
    try {
      await navigator.clipboard.writeText(linkFor(channel));
      toast({ title: tl('Link kopiert', 'Link copied') });
      supabase.from('community_events' as any).insert({
        user_id: uid,
        event_type: 'referral_shared',
        metadata: { channel },
      } as any);
      load();
    } catch {
      toast({ title: tl('Kopieren fehlgeschlagen', 'Copy failed'), variant: 'destructive' });
    }
  }

  function shareVia(channel: 'whatsapp' | 'telegram' | 'email') {
    const link = linkFor(channel);
    const msg = encodeURIComponent(
      tl(
        `Schau dir das an — ich verdiene mit Ethical Top Closer. ${link}`,
        `Check this out — I'm earning with Ethical Top Closer. ${link}`
      )
    );
    const urls = {
      whatsapp: `https://wa.me/?text=${msg}`,
      telegram: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${msg}`,
      email: `mailto:?subject=${encodeURIComponent(tl('Empfehlung', 'Referral'))}&body=${msg}`,
    };
    window.open(urls[channel], '_blank', 'noopener');

    supabase.from('community_events' as any).insert({
      user_id: uid,
      event_type: 'referral_shared',
      metadata: { channel },
    } as any);
    setTimeout(load, 500);
  }

  async function sendInvite() {
    const value = inviteInput.trim();
    if (!value) return;
    setSending(true);
    try {
      const isEmail = value.includes('@');
      const { error } = await (supabase.from('referrals' as any) as any).insert({
        referrer_id: uid,
        referred_email: isEmail ? value : `${value}@phone.invite`,
        status: 'invited',
        source_channel: 'direct',
      });
      if (error) throw error;

      await supabase.from('community_events' as any).insert({
        user_id: uid,
        event_type: 'referral_invited',
        metadata: { contact: value, channel: 'direct' },
      } as any);

      toast({ title: tl('Einladung registriert', 'Invitation tracked'), description: tl('Teile jetzt deinen Link mit ihnen', 'Now share your link with them') });
      setInviteInput('');
      load();
    } catch (e: any) {
      toast({ title: tl('Fehler', 'Error'), description: e.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  }

  const channelMeta: Record<string, { label: string; icon: any; color: string }> = {
    whatsapp: { label: 'WhatsApp', icon: MessageCircle, color: 'text-foreground' },
    telegram: { label: 'Telegram', icon: Send, color: 'text-foreground' },
    email:    { label: 'Email',    icon: Mail, color: 'text-foreground' },
    copy:     { label: tl('Link kopiert', 'Link copy'), icon: Copy, color: 'text-foreground' },
    direct:   { label: tl('Direkte Einladung', 'Direct invite'), icon: Share2, color: 'text-foreground' },
  };

  const statusLabel = (s: string) => {
    const map: Record<string, { de: string; en: string; cls: string }> = {
      invited: { de: 'Eingeladen', en: 'Invited', cls: 'bg-muted text-muted-foreground' },
      signed:  { de: 'Registriert', en: 'Signed', cls: 'bg-accent/15 text-accent' },
      closed:  { de: 'Bestätigt', en: 'Closed', cls: 'bg-primary/15 text-primary' },
      paid:    { de: 'Ausgezahlt', en: 'Paid', cls: 'bg-primary/25 text-primary' },
      rejected:{ de: 'Abgelehnt', en: 'Rejected', cls: 'bg-destructive/10 text-destructive' },
    };
    return map[s] ?? map.invited;
  };

  const faqItems = [
    {
      q: tl('Wie funktionieren die Reward-Stufen?', 'How do the reward tiers work?'),
      a: tl(
        'Die Auszahlung steigt mit jeder bestätigten Empfehlung: #1 = 150€, #2 = 300€, #3–4 = je 400€, ab #5 dauerhaft 500€ pro Empfehlung. Die Stufen sind fix und können nicht überschrieben werden.',
        'Payout grows with each confirmed referral: #1 = €150, #2 = €300, #3–4 = €400 each, from #5 onward €500 per referral. Tiers are locked and cannot be overridden.'
      ),
    },
    {
      q: tl('Wann wird eine Empfehlung bestätigt?', 'When does a referral get confirmed?'),
      a: tl(
        'Eine Empfehlung wechselt automatisch auf "Bestätigt", sobald die eingeladene Person die Closer-Stufe (Level 4+) erreicht. Vorher bleibt sie als "Eingeladen" oder "Registriert" sichtbar — keine manuelle Aktion nötig.',
        'A referral automatically moves to "Closed" once the invited person reaches the Closer level (Level 4+). Before that it stays as "Invited" or "Signed" — no manual action needed.'
      ),
    },
    {
      q: tl('Wann erhalte ich die Auszahlung?', 'When do I get paid?'),
      a: tl(
        'Sobald der Status "Bestätigt" erreicht ist, wird die Provision in den nächsten Auszahlungslauf aufgenommen. Der Status wechselt dann auf "Ausgezahlt".',
        'Once the status hits "Closed", the commission is queued for the next payout run. The status then switches to "Paid".'
      ),
    },
    {
      q: tl('Was bedeuten die Status?', 'What do the statuses mean?'),
      a: tl(
        'Eingeladen = Link/Kontakt geteilt. Registriert = Person hat ein Konto erstellt. Bestätigt = Person hat Closer-Level erreicht (Provision fällig). Ausgezahlt = Provision überwiesen.',
        'Invited = link/contact shared. Signed = person created an account. Closed = person reached Closer level (commission due). Paid = commission transferred.'
      ),
    },
    {
      q: tl('Zählt jeder Klick als Empfehlung?', 'Does every click count as a referral?'),
      a: tl(
        'Nein. Nur registrierte Konten via deinem Link oder direkt eingeladene Kontakte zählen. Geteilte Klicks werden in der Kanal-Analyse separat getrackt.',
        'No. Only registered accounts via your link or directly invited contacts count. Shared clicks are tracked separately in Channel Analytics.'
      ),
    },
  ];

  return (
    <TooltipProvider delayDuration={150}>
    <div className="space-y-4">
      {/* HERO EARNINGS BLOCK */}
      <div className="rounded-3xl border border-border/50 bg-gradient-to-br from-card to-card/40 p-6 md:p-8 animate-fade-in">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-3.5 w-3.5 text-muted-foreground/60" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            {tl('Empfehlungs-Programm', 'Referral Program')}
          </p>
        </div>

        <h2 className="text-xl md:text-2xl font-light tracking-tight text-foreground leading-tight inline-flex items-center gap-2">
          <span>
            {tl('Verdiene bis zu ', 'Earn up to ')}
            <span className="font-semibold">500€</span>
            {tl(' pro Empfehlung', ' per referral')}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={tl('Stufen erklärt', 'Tiers explained')} className="text-muted-foreground/60 hover:text-foreground transition-colors">
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[260px] text-xs">
              <p className="font-medium mb-1">{tl('Locked Payout-Stufen', 'Locked Payout Tiers')}</p>
              <p className="text-muted-foreground">#1 → 150€ · #2 → 300€ · #3–4 → 400€ · #5+ → 500€</p>
            </TooltipContent>
          </Tooltip>
        </h2>
        <p className="text-xs md:text-sm text-muted-foreground mt-1.5 max-w-md">
          {tl('Die meisten Nutzer erreichen 1.000€+ mit nur 3–4 Empfehlungen', 'Most users reach 1,000€+ with just 3–4 referrals')}
        </p>

        {/* Big total */}
        <div className="mt-6 mb-5">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
            {tl('Gesamtverdienst', 'Total Earnings')}
          </p>
          <p className="text-4xl md:text-5xl font-light tracking-tight text-foreground tabular-nums">
            {fmtEur(data.total_earnings)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="text-muted-foreground">{tl('Bestätigt', 'Confirmed')}</span>
              <span className="font-semibold text-foreground tabular-nums">{fmtEur(data.confirmed_earnings)}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground/60 hover:text-foreground"><HelpCircle className="h-3 w-3" /></button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[240px] text-xs">
                  {tl('Provisionen für Empfehlungen, die die Closer-Stufe (L4+) erreicht haben.', 'Commissions for referrals that have reached Closer level (L4+).')}
                </TooltipContent>
              </Tooltip>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
              <span className="text-muted-foreground">{tl('Ausstehend', 'Pending')}</span>
              <span className="font-semibold text-foreground tabular-nums">{fmtEur(data.pending_earnings)}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground/60 hover:text-foreground"><HelpCircle className="h-3 w-3" /></button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[240px] text-xs">
                  {tl('Eingeladen oder registriert — wird zu Bestätigt, sobald die Person Closer-Level erreicht.', 'Invited or signed — flips to Confirmed once the person reaches Closer level.')}
                </TooltipContent>
              </Tooltip>
            </span>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-3 gap-3 pt-5 border-t border-border/40">
          <div>
            <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{tl('Empfehlungen', 'Referrals')}</p>
            <p className="text-lg font-semibold text-foreground tabular-nums mt-0.5">{total}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{tl('Ø pro Ref.', 'Avg / Ref.')}</p>
            <p className="text-lg font-semibold text-foreground tabular-nums mt-0.5">{fmtEur(avgPerReferral)}</p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground inline-flex items-center gap-1">
              {tl('Nächster Reward', 'Next Reward')}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground/60 hover:text-foreground"><HelpCircle className="h-2.5 w-2.5" /></button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px] text-xs">
                  {tl('Auszahlung deiner nächsten bestätigten Empfehlung gemäß fester Stufenlogik.', 'Payout for your next confirmed referral based on the locked tier logic.')}
                </TooltipContent>
              </Tooltip>
            </p>
            <p className="text-lg font-semibold text-primary tabular-nums mt-0.5">{fmtEur(data.next_reward)}</p>
          </div>
        </div>
      </div>

      {/* PROGRESS BAR */}
      <div className="rounded-3xl border border-border/50 bg-card p-6 md:p-7">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground mb-2">
              {tl('Dein Fortschritt', 'Your Progress')}
            </p>
            <h3 className="text-base md:text-lg font-medium text-foreground">{progressState.headline}</h3>
          </div>
          {data.top_level_reached && (
            <div className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary">
              <Trophy className="h-3 w-3" /> Top-Level
            </div>
          )}
        </div>

        <Progress value={progressState.pct} className="h-2 transition-all duration-700" />

        {/* Tier markers */}
        <div className="flex justify-between mt-2.5 text-[9px] uppercase tracking-wider text-muted-foreground/70 tabular-nums">
          <span className={total >= 1 ? 'text-primary font-semibold' : ''}>150</span>
          <span className={total >= 2 ? 'text-primary font-semibold' : ''}>300</span>
          <span className={total >= 3 ? 'text-primary font-semibold' : ''}>400</span>
          <span className={total >= 4 ? 'text-primary font-semibold' : ''}>400</span>
          <span className={total >= 5 ? 'text-primary font-semibold' : ''}>500+</span>
        </div>

        {data.next_threshold > 0 && !data.top_level_reached && (
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1.5 text-[11px] text-accent">
            <Zap className="h-3 w-3" />
            {tl(
              `${data.next_threshold} Empfehlung entfernt von +${data.next_reward}€`,
              `${data.next_threshold} referral away from +${data.next_reward}€`
            )}
          </div>
        )}
      </div>

      {/* MOMENTUM BOX */}
      <div className="rounded-3xl border border-accent/30 bg-gradient-to-br from-accent/5 to-transparent p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-accent/15 p-2">
            <TrendingUp className="h-4 w-4 text-accent" />
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">{tl('Momentum', 'Momentum')}</p>
            <p className="text-sm font-medium text-foreground mt-0.5">{momentum}</p>
          </div>
        </div>
      </div>

      {/* ACTION BLOCK */}
      <div className="rounded-3xl border border-border/50 bg-card p-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground mb-3">
          {tl('Dein Empfehlungs-Link', 'Your Referral Link')}
        </p>

        <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-background px-3 py-2.5">
          <code className="flex-1 truncate text-xs text-foreground/80">{referralLink}</code>
          <button
            onClick={() => copyLink('copy')}
            className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-foreground px-3 py-1.5 text-[11px] font-medium text-background hover:opacity-90 transition-opacity"
          >
            <Copy className="h-3 w-3" /> {tl('Kopieren', 'Copy')}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <button onClick={() => shareVia('whatsapp')} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border/50 bg-background py-2.5 text-[11px] font-medium text-foreground hover:bg-muted/40 transition-colors">
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </button>
          <button onClick={() => shareVia('telegram')} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border/50 bg-background py-2.5 text-[11px] font-medium text-foreground hover:bg-muted/40 transition-colors">
            <Send className="h-3.5 w-3.5" /> Telegram
          </button>
          <button onClick={() => shareVia('email')} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border/50 bg-background py-2.5 text-[11px] font-medium text-foreground hover:bg-muted/40 transition-colors">
            <Mail className="h-3.5 w-3.5" /> Email
          </button>
        </div>

        <div className="mt-5 pt-5 border-t border-border/40">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground mb-2">
            {tl('Direkt einladen', 'Invite directly')}
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendInvite()}
              placeholder={tl('E-Mail oder Telefon', 'Email or phone')}
              className="flex-1 rounded-xl border border-border/50 bg-background px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50"
            />
            <button
              onClick={sendInvite}
              disabled={sending || !inviteInput.trim()}
              className="inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2.5 text-[11px] font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              <Share2 className="h-3 w-3" /> {tl('Einladen', 'Invite')}
            </button>
          </div>
        </div>
      </div>

      {/* REFERRAL TABLE */}
      {rows.length > 0 && (
        <div className="rounded-3xl border border-border/50 bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
              {tl('Deine Empfehlungen', 'Your Referrals')}
            </p>
            <span className="text-[10px] text-muted-foreground tabular-nums">{rows.length}</span>
          </div>
          <div className="space-y-1.5">
            {rows.map((r) => {
              const sl = statusLabel(r.status);
              return (
                <div key={r.id} className="flex items-center gap-3 rounded-xl border border-border/30 bg-background/50 px-3.5 py-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground tabular-nums">
                    #{r.referral_index ?? '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">{r.referred_email}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US')}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium ${sl.cls}`}>
                    {tl(sl.de, sl.en)}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-foreground tabular-nums w-14 text-right">
                    {fmtEur(r.payout_amount ?? 0)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CHANNEL ANALYTICS */}
      {(() => {
        const visible = channelStats.filter((c) => c.shares > 0 || c.total > 0);
        if (visible.length === 0) return null;
        const maxShares = Math.max(...visible.map((c) => c.shares), 1);
        const best = [...visible].sort((a, b) => b.closed - a.closed || b.conv_rate - a.conv_rate)[0];
        return (
          <div className="rounded-3xl border border-border/50 bg-card p-6">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-3.5 w-3.5 text-muted-foreground/60" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                  {tl('Kanal-Analyse', 'Channel Analytics')}
                </p>
              </div>
              {best && best.closed > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-medium text-primary">
                  <Trophy className="h-2.5 w-2.5" />
                  {tl('Bester', 'Best')}: {channelMeta[best.channel]?.label ?? best.channel}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mb-4">
              {tl('Welche Kanäle bringen Empfehlungen?', 'Which channels convert into referrals?')}
            </p>

            <div className="space-y-2.5">
              {visible.map((c) => {
                const meta = channelMeta[c.channel] ?? { label: c.channel, icon: Share2, color: 'text-foreground' };
                const Icon = meta.icon;
                const widthPct = (c.shares / maxShares) * 100;
                return (
                  <div key={c.channel} className="rounded-xl border border-border/30 bg-background/40 p-3">
                    <div className="flex items-center gap-2.5 mb-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-foreground flex-1">{meta.label}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {c.shares} {tl('Shares', 'shares')}
                      </span>
                    </div>

                    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted/60 mb-2.5">
                      <div className="h-full bg-foreground/80 transition-all duration-700" style={{ width: `${widthPct}%` }} />
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70">{tl('Eingel.', 'Invited')}</p>
                        <p className="text-xs font-semibold text-foreground tabular-nums mt-0.5">{c.invited}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70">{tl('Reg.', 'Signed')}</p>
                        <p className="text-xs font-semibold text-accent tabular-nums mt-0.5">{c.signed}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70">{tl('Bestät.', 'Closed')}</p>
                        <p className="text-xs font-semibold text-primary tabular-nums mt-0.5">{c.closed}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground/70">{tl('Conv.', 'Conv.')}</p>
                        <p className="text-xs font-semibold text-foreground tabular-nums mt-0.5">{c.conv_rate}%</p>
                      </div>
                    </div>

                    {c.earnings > 0 && (
                      <div className="mt-2 pt-2 border-t border-border/30 flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">{tl('Verdient', 'Earned')}</span>
                        <span className="text-xs font-semibold text-primary tabular-nums">{fmtEur(c.earnings)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="mt-4 text-[10px] text-muted-foreground/70 italic">
              {tl(
                'Conversion = (Registriert + Bestätigt) / Shares. Höher = besser performender Kanal.',
                'Conversion = (Signed + Closed) / Shares. Higher = better performing channel.'
              )}
            </p>
          </div>
        );
      })()}

      {/* Empty state CTA */}
      {rows.length === 0 && (
        <div className="rounded-3xl border border-dashed border-border/50 bg-card/30 p-8 text-center">
          <Target className="h-6 w-6 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-foreground font-medium mb-1">
            {tl('Bereit für deine erste Empfehlung?', 'Ready for your first referral?')}
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            {tl('150€ warten — teile deinen Link in unter 60 Sekunden', '150€ waits — share your link in under 60 seconds')}
          </p>
          <button onClick={() => copyLink('copy')} className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-5 py-2 text-[11px] font-medium text-background hover:opacity-90 transition-opacity">
            <ArrowUpRight className="h-3 w-3" /> {tl('Link kopieren & teilen', 'Copy & share link')}
          </button>
        </div>
      )}

      {/* MINI-FAQ */}
      <div className="rounded-3xl border border-border/50 bg-card p-6">
        <div className="flex items-center gap-2 mb-3">
          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            {tl('Häufige Fragen', 'Quick FAQ')}
          </p>
        </div>
        <Accordion type="single" collapsible className="w-full">
          {faqItems.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`} className="border-border/40">
              <AccordionTrigger className="text-xs font-medium text-foreground hover:no-underline py-3 text-left">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-xs text-muted-foreground leading-relaxed">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
    </TooltipProvider>
  );
}
