import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Lock, Radio, Fingerprint, Brain, MessageSquare, BarChart3, Coins, Crown, ShieldCheck, Zap } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  isEnabled: boolean;
  isAdmin: boolean;
  userId?: string;
  avgScore?: number;
  totalAttempts?: number;
  userLevel?: number;
}

const FEATURES = [
  { icon: Radio, label: 'Live AI-Buyer Interaction' },
  { icon: Brain, label: 'Real-Time Objection Handling' },
  { icon: MessageSquare, label: 'Dynamic Conversation Flow' },
  { icon: BarChart3, label: 'Advanced Performance Analysis' },
];

const QUALIFICATION_THRESHOLDS = {
  avg_score: 7.0,
  min_attempts: 5,
  min_level: 3,
};

type ModalType = 'info' | 'qualification' | 'credits' | null;

export default function RealtimeLockedCard({
  isEnabled, isAdmin, userId,
  avgScore = 0, totalAttempts = 0, userLevel = 0,
}: Props) {
  const [modal, setModal] = useState<ModalType>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [loading, setLoading] = useState(false);

  const isQualified = avgScore >= QUALIFICATION_THRESHOLDS.avg_score
    && totalAttempts >= QUALIFICATION_THRESHOLDS.min_attempts
    && userLevel >= QUALIFICATION_THRESHOLDS.min_level;

  // Load credits & subscription status
  useEffect(() => {
    if (!userId || (!isEnabled && !isAdmin)) return;
    Promise.all([
      supabase.from('user_credits' as any).select('balance').eq('user_id', userId).maybeSingle(),
      supabase.from('user_subscriptions' as any).select('status, plan, expires_at').eq('user_id', userId).maybeSingle(),
    ]).then(([creditsRes, subRes]) => {
      setCredits((creditsRes.data as any)?.balance ?? 0);
      const sub = subRes.data as any;
      setHasSubscription(
        sub?.status === 'active' && sub?.plan !== 'none'
        && (!sub?.expires_at || new Date(sub.expires_at) > new Date())
      );
    });
  }, [userId, isEnabled, isAdmin]);

  const canStart = isQualified && (hasSubscription || (credits ?? 0) > 0);

  const handleStartClick = () => {
    if (!isQualified) {
      setModal('qualification');
    } else if (!hasSubscription && (credits ?? 0) <= 0) {
      setModal('credits');
    } else {
      // Would start session — for now just placeholder
    }
  };

  // ── UNLOCKED STATE ──
  if (isEnabled || isAdmin) {
    return (
      <>
        <div className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-br from-card via-card to-primary/[0.04] p-6 shadow-[0_2px_20px_-6px_hsl(var(--primary)/0.12)]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/[0.03] rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Radio className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Real-Time Voice Simulator</h3>
                  <Badge className="text-[8px] bg-primary/15 text-primary border-0 font-semibold tracking-wide">
                    AKTIV
                  </Badge>
                </div>
              </div>
            </div>

            <p className="text-[12px] text-muted-foreground leading-relaxed mb-3">
              Live AI-Konversation mit dynamischen Einwänden und echtem Gesprächsdruck.
            </p>

            {/* Status indicators */}
            <div className="flex flex-wrap gap-2 mb-4 text-[10px]">
              <div className={`flex items-center gap-1 rounded-md px-2 py-1 border ${isQualified ? 'border-primary/30 bg-primary/5 text-primary' : 'border-destructive/30 bg-destructive/5 text-destructive'}`}>
                <ShieldCheck className="h-3 w-3" />
                {isQualified ? 'Qualifiziert' : 'Nicht qualifiziert'}
              </div>
              {hasSubscription ? (
                <div className="flex items-center gap-1 rounded-md px-2 py-1 border border-primary/30 bg-primary/5 text-primary">
                  <Crown className="h-3 w-3" /> Unlimited
                </div>
              ) : (
                <div className="flex items-center gap-1 rounded-md px-2 py-1 border border-border/40 bg-muted/30 text-muted-foreground">
                  <Coins className="h-3 w-3" /> {credits ?? 0} Credits
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {FEATURES.map(f => (
                <div key={f.label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <f.icon className="h-3 w-3 text-primary/60 shrink-0" />
                  <span>{f.label}</span>
                </div>
              ))}
            </div>

            <Button
              size="sm"
              className="text-xs w-full bg-primary hover:bg-primary/90"
              disabled={!canStart}
              onClick={handleStartClick}
            >
              {!isQualified ? (
                <><ShieldCheck className="mr-1.5 h-3 w-3" /> Qualifikation erforderlich</>
              ) : !hasSubscription && (credits ?? 0) <= 0 ? (
                <><Coins className="mr-1.5 h-3 w-3" /> Credits kaufen</>
              ) : (
                <><Radio className="mr-1.5 h-3 w-3" /> Start Live Session</>
              )}
            </Button>
            {!hasSubscription && (credits ?? 0) > 0 && (
              <p className="mt-1.5 text-[9px] text-muted-foreground/60 text-center">
                1 Credit pro Session
              </p>
            )}
            <p className="mt-2 text-[9px] text-muted-foreground/50 text-center">
              Für Advanced Evaluation und Zertifizierung.
            </p>
          </div>
        </div>

        {/* Qualification Modal */}
        <Dialog open={modal === 'qualification'} onOpenChange={() => setModal(null)}>
          <DialogContent className="max-w-[360px] p-0 overflow-hidden">
            <div className="relative bg-gradient-to-b from-muted/50 to-card px-6 pt-7 pb-5">
              <DialogHeader className="relative">
                <div className="flex justify-center mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                    <ShieldCheck className="h-5 w-5 text-accent" />
                  </div>
                </div>
                <DialogTitle className="text-center text-[16px] font-semibold tracking-tight">
                  Qualifikation erforderlich
                </DialogTitle>
              </DialogHeader>
            </div>
            <div className="px-6 pb-6 space-y-4">
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Um Real-Time Simulation freizuschalten:
              </p>
              <div className="space-y-2.5">
                {[
                  { label: `Durchschnittlicher Score ≥ ${QUALIFICATION_THRESHOLDS.avg_score}`, met: avgScore >= QUALIFICATION_THRESHOLDS.avg_score, current: `${avgScore.toFixed(1)}` },
                  { label: `Mindestens ${QUALIFICATION_THRESHOLDS.min_attempts} Versuche`, met: totalAttempts >= QUALIFICATION_THRESHOLDS.min_attempts, current: `${totalAttempts}` },
                  { label: `Level ≥ ${QUALIFICATION_THRESHOLDS.min_level}`, met: userLevel >= QUALIFICATION_THRESHOLDS.min_level, current: `L${userLevel}` },
                ].map(req => (
                  <div key={req.label} className="flex items-center justify-between gap-2 text-[12px]">
                    <div className="flex items-center gap-2">
                      <div className={`h-1.5 w-1.5 rounded-full ${req.met ? 'bg-primary' : 'bg-destructive'}`} />
                      <span className={req.met ? 'text-foreground' : 'text-muted-foreground'}>{req.label}</span>
                    </div>
                    <span className={`text-[11px] font-mono ${req.met ? 'text-primary' : 'text-destructive'}`}>{req.current}</span>
                  </div>
                ))}
              </div>
              <Button size="sm" className="w-full text-xs" onClick={() => setModal(null)}>
                Weiter trainieren
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Credits Purchase Modal */}
        <Dialog open={modal === 'credits'} onOpenChange={() => setModal(null)}>
          <DialogContent className="max-w-[360px] p-0 overflow-hidden">
            <div className="relative bg-gradient-to-b from-muted/50 to-card px-6 pt-7 pb-5">
              <DialogHeader className="relative">
                <div className="flex justify-center mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                    <Coins className="h-5 w-5 text-accent" />
                  </div>
                </div>
                <DialogTitle className="text-center text-[16px] font-semibold tracking-tight">
                  Real-Time Simulation Credits
                </DialogTitle>
              </DialogHeader>
            </div>
            <div className="px-6 pb-6 space-y-4">
              <p className="text-[13px] text-muted-foreground text-center">
                Jede Session verbraucht 1 Credit.
              </p>
              <div className="space-y-2">
                {[
                  { amount: 5, label: '5 Credits', tag: null },
                  { amount: 15, label: '15 Credits', tag: 'Empfohlen' },
                  { amount: 50, label: '50 Credits', tag: 'Bester Wert' },
                ].map(pack => (
                  <button
                    key={pack.amount}
                    className="w-full flex items-center justify-between rounded-lg border border-border/50 bg-card p-3 hover:border-primary/40 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Coins className="h-4 w-4 text-accent" />
                      <span className="text-[13px] font-medium text-foreground">{pack.label}</span>
                      {pack.tag && (
                        <Badge className="text-[8px] bg-accent/10 text-accent border-0">{pack.tag}</Badge>
                      )}
                    </div>
                    <Zap className="h-3.5 w-3.5 text-muted-foreground/40" />
                  </button>
                ))}
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-center">
                <p className="text-[11px] text-muted-foreground/70">
                  Stripe-Zahlung wird nach Aktivierung verfügbar.
                </p>
              </div>
              <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => setModal(null)}>
                Schließen
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // ── LOCKED STATE ──
  return (
    <>
      <button
        onClick={() => setModal('info')}
        className="group relative w-full text-left overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br from-card via-card to-muted/40 p-6 transition-all hover:border-border/70 hover:shadow-[0_2px_16px_-4px_hsl(var(--foreground)/0.06)]"
      >
        <div className="absolute top-0 right-0 w-28 h-28 bg-foreground/[0.015] rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06]">
              <Fingerprint className="h-4 w-4 text-foreground/40" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-semibold tracking-tight text-foreground/70 group-hover:text-foreground/80 transition-colors">
                  Real-Time Voice Simulator
                </h3>
                <Badge variant="outline" className="text-[8px] border-foreground/10 text-foreground/40 font-semibold tracking-wide">
                  ADVANCED
                </Badge>
              </div>
            </div>
          </div>
          <p className="text-[12px] text-muted-foreground/70 leading-relaxed mb-4">
            Live AI-Konversation mit dynamischen Einwänden und echtem Gesprächsdruck.
          </p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {FEATURES.map(f => (
              <div key={f.label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
                <f.icon className="h-3 w-3 text-foreground/20 shrink-0" />
                <span>{f.label}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-1.5 rounded-lg border border-border/40 bg-muted/30 py-2 text-[11px] font-medium text-muted-foreground/60">
            <Lock className="h-3 w-3" />
            Controlled Access
          </div>
          <p className="mt-2.5 text-[9px] text-muted-foreground/40 text-center">
            Für Advanced Evaluation und Zertifizierung.
          </p>
        </div>
      </button>

      <Dialog open={modal === 'info'} onOpenChange={() => setModal(null)}>
        <DialogContent className="max-w-[360px] p-0 overflow-hidden">
          <div className="relative bg-gradient-to-b from-muted/50 to-card px-6 pt-7 pb-5">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-20 bg-primary/[0.04] rounded-full blur-3xl" />
            <DialogHeader className="relative">
              <div className="flex justify-center mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground/[0.06]">
                  <Fingerprint className="h-5 w-5 text-foreground/50" />
                </div>
              </div>
              <DialogTitle className="text-center text-[16px] font-semibold tracking-tight">
                Advanced Simulation Mode
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="px-6 pb-6 space-y-4">
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              Dieser Modus simuliert reale Gespräche mit einem Live AI-Buyer und führt ein:
            </p>
            <div className="space-y-2.5">
              {[
                'Dynamische Einwände in Echtzeit',
                'Realer Gesprächsdruck',
                'Unvorhersehbarer Dialogverlauf',
              ].map(item => (
                <div key={item} className="flex items-start gap-2.5">
                  <div className="mt-1 h-1 w-1 rounded-full bg-foreground/30 shrink-0" />
                  <span className="text-[12px] text-foreground/80">{item}</span>
                </div>
              ))}
            </div>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Der Zugang wird kontrolliert freigegeben, um Qualität und Leistungsniveau sicherzustellen.
            </p>
            <div className="rounded-lg bg-muted/40 px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground/70 text-center">
                Du wirst benachrichtigt, sobald dieser Modus für dich verfügbar ist.
              </p>
            </div>
            <div className="space-y-2 pt-1">
              <Button size="sm" className="w-full text-xs" onClick={() => setModal(null)}>
                Mit Standard Mode fortfahren
              </Button>
              <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => setModal(null)}>
                Schließen
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
