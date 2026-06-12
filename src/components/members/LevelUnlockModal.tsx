import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, ExternalLink, ArrowRight, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { normalizeBusinessStage } from '@/lib/stage-utils';
import { supabase } from '@/integrations/supabase/client';

const STAGE_INDEX_ORDER = [
  'prospect', 'opener', 'setter', 'senior_associate',
  'junior_manager', 'manager', 'senior_manager',
  'director', 'partner',
];

interface LevelExperience {
  level: number;
  identityDe: string;
  identityEn: string;
  rulesDe: string[];
  rulesEn: string[];
  actionDe: string;
  actionEn: string;
  redirect: string;
  pdf: string;
  pdfTitleDe: string;
  pdfTitleEn: string;
}

const EXPERIENCES: Record<number, LevelExperience> = {
  1: {
    level: 1,
    identityDe: 'Du startest Gespräche. Du pitchst nicht.',
    identityEn: 'You start conversations. You don’t pitch.',
    rulesDe: ['Kein Pitch', 'Eine Frage', 'Kein Signal = Stop'],
    rulesEn: ['No pitch', 'One question', 'No signal = stop'],
    actionDe: 'Starte heute 5 Gespräche',
    actionEn: 'Start 5 conversations today',
    redirect: '/community/feed',
    pdf: '/playbooks/opener_system.pdf',
    pdfTitleDe: 'Opener System',
    pdfTitleEn: 'Opener System',
  },
  2: {
    level: 2,
    identityDe: 'Du qualifizierst. Du steuerst den Prozess.',
    identityEn: 'You qualify. You control the process.',
    rulesDe: ['Frame zuerst', 'Discovery vor Pitch', 'Kein Buy-In = kein Termin'],
    rulesEn: ['Frame first', 'Discovery before pitch', 'No buy-in = no appointment'],
    actionDe: 'Führe 3 Qualifikations-Calls',
    actionEn: 'Run 3 qualification calls',
    redirect: '/members/calendar',
    pdf: '/playbooks/setter_script.pdf',
    pdfTitleDe: 'Setter Script',
    pdfTitleEn: 'Setter Script',
  },
  3: {
    level: 3,
    identityDe: 'Du verbesserst dich durch Feedback, nicht durch Wiederholung.',
    identityEn: 'You improve through feedback, not repetition.',
    rulesDe: ['Jeder Call wird reviewt', 'Schwäche benennen', 'Nächste Iteration definieren'],
    rulesEn: ['Every call gets reviewed', 'Name the weakness', 'Define the next iteration'],
    actionDe: 'Reviewe 2 Calls',
    actionEn: 'Review 2 calls',
    redirect: '/members/call-review',
    pdf: '/playbooks/call_review_system.pdf',
    pdfTitleDe: 'Call Review System',
    pdfTitleEn: 'Call Review System',
  },
  4: {
    level: 4,
    identityDe: 'Du closest. Du führst Entscheidungen.',
    identityEn: 'You close. You lead decisions.',
    rulesDe: ['Diskovery vor Preis', 'Einwand = Information', 'Close ist eine Entscheidung'],
    rulesEn: ['Discovery before price', 'Objection = information', 'Closing is a decision'],
    actionDe: 'Schließe 1 Deal',
    actionEn: 'Close 1 deal',
    redirect: '/members/closer-workspace',
    pdf: '/playbooks/closer_system.pdf',
    pdfTitleDe: 'Closer System',
    pdfTitleEn: 'Closer System',
  },
  5: {
    level: 5,
    identityDe: 'Du arbeitest nicht im System. Du steuerst es.',
    identityEn: 'You don’t work in the system. You control it.',
    rulesDe: ['Bottleneck zuerst', 'Hebel statt Aufwand', 'System statt Held'],
    rulesEn: ['Bottleneck first', 'Lever over effort', 'System over hero'],
    actionDe: 'Identifiziere 1 Bottleneck',
    actionEn: 'Identify 1 bottleneck',
    redirect: '/members/dashboard/performance',
    pdf: '/playbooks/operator_playbook.pdf',
    pdfTitleDe: 'Operator Playbook',
    pdfTitleEn: 'Operator Playbook',
  },
};

async function logEvent(userId: string, eventType: string, level: number) {
  try {
    await supabase.from('community_events').insert({
      user_id: userId,
      event_type: eventType,
      metadata: { level, source: 'level_unlock_modal' },
    });
  } catch (e) {
    console.warn('[LevelUnlockModal] Event log failed:', e);
  }
}

export default function LevelUnlockModal() {
  const { user, profile, isAdmin } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const currentLevel = useMemo(() => {
    if (!profile) return 0;
    if (isAdmin) return 0; // Don't show for admins
    const stage = normalizeBusinessStage((profile as any)?.business_stage || 'opener');
    const idx = STAGE_INDEX_ORDER.indexOf(stage);
    return idx; // opener = 1, setter = 2, etc.
  }, [profile, isAdmin]);

  const lastSeen = (profile as any)?.last_unlock_seen_level ?? 0;
  const experience = EXPERIENCES[currentLevel];
  const shouldShow = !!experience && currentLevel > lastSeen;

  useEffect(() => {
    if (shouldShow && !open && !dismissing) {
      setOpen(true);
      if (user) logEvent(user.id, 'level_unlock_opened', currentLevel);
    }
  }, [shouldShow, open, dismissing, user, currentLevel]);

  const persistSeen = async () => {
    if (!user) return;
    setDismissing(true);
    try {
      await supabase
        .from('profiles')
        .update({ last_unlock_seen_level: currentLevel })
        .eq('id', user.id);
    } catch (e) {
      console.warn('[LevelUnlockModal] Persist failed:', e);
    }
  };

  const handleAction = async () => {
    if (!user || !experience) return;
    await logEvent(user.id, 'level_unlock_action_clicked', currentLevel);
    await persistSeen();
    setOpen(false);
    navigate(experience.redirect);
  };

  const handlePlaybook = async () => {
    if (!user || !experience) return;
    await logEvent(user.id, 'level_unlock_playbook_opened', currentLevel);
    window.open(experience.pdf, '_blank', 'noopener,noreferrer');
  };

  if (!experience) return null;

  const identity = lang === 'de' ? experience.identityDe : experience.identityEn;
  const rules = lang === 'de' ? experience.rulesDe : experience.rulesEn;
  const action = lang === 'de' ? experience.actionDe : experience.actionEn;
  const pdfTitle = lang === 'de' ? experience.pdfTitleDe : experience.pdfTitleEn;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Soft-lock: closing requires the action button
        if (!o) return;
        setOpen(o);
      }}
    >
      <DialogContent
        className="max-w-md border-border/40 bg-[hsl(220,15%,10%)] p-0 text-foreground sm:max-w-lg"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="px-6 pt-8 pb-6 sm:px-8 sm:pt-10">
          {/* Spark icon */}
          <div className="mb-5 flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(39,41%,55%)]/15">
              <Sparkles className="h-5 w-5 text-[hsl(39,41%,55%)]" />
            </div>
          </div>

          {/* Headline */}
          <h2 className="text-center font-serif text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {lang === 'de'
              ? `Du bist jetzt Level ${currentLevel}`
              : `You are now Level ${currentLevel}`}
          </h2>

          {/* Identity */}
          <p className="mt-3 text-center text-sm text-white/70 sm:text-base">
            {identity}
          </p>

          {/* Rules */}
          <div className="mt-6 space-y-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-4">
            <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-[hsl(39,41%,55%)]">
              {lang === 'de' ? '3 Regeln' : '3 Rules'}
            </p>
            <ul className="space-y-1.5">
              {rules.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-white/85">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[hsl(39,41%,55%)]" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Playbook chip */}
          <button
            onClick={handlePlaybook}
            className="mt-4 flex w-full items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-left transition hover:border-[hsl(39,41%,55%)]/30 hover:bg-white/[0.05]"
          >
            <div className="min-w-0">
              <p className="font-mono text-[9px] uppercase tracking-wider text-white/40">
                {lang === 'de' ? 'Playbook' : 'Playbook'}
              </p>
              <p className="truncate text-sm font-medium text-white">{pdfTitle}</p>
            </div>
            <Download className="h-4 w-4 shrink-0 text-white/50" />
          </button>

          {/* Action */}
          <div className="mt-6 rounded-lg border border-[hsl(39,41%,55%)]/20 bg-[hsl(39,41%,55%)]/[0.06] px-4 py-4">
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[hsl(39,41%,55%)]">
              {lang === 'de' ? 'Deine Aktion' : 'Your Action'}
            </p>
            <p className="mt-1 text-base font-medium text-white">{action}</p>
          </div>

          {/* CTAs */}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={handleAction}
              className="flex-1 bg-[hsl(39,41%,55%)] text-[hsl(220,15%,8%)] hover:bg-[hsl(39,41%,50%)]"
            >
              {lang === 'de' ? 'Jetzt starten' : 'Start Now'}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
            <Button
              onClick={handlePlaybook}
              variant="outline"
              className="border-white/10 bg-transparent text-white/80 hover:bg-white/[0.04] hover:text-white"
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              {lang === 'de' ? 'Playbook ansehen' : 'View Playbook'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
