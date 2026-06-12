import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Download, FileText, ExternalLink, Loader2, Info, CheckCircle2, ShieldCheck, AlertTriangle, BookOpen } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { useLanguage } from '@/i18n/LanguageContext';
import { normalizeBusinessStage } from '@/lib/stage-utils';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import LiveScriptViewer from '@/components/playbooks/LiveScriptViewer';
import Level3SelfCheck from '@/components/playbooks/Level3SelfCheck';

const STAGE_INDEX_ORDER = [
  'prospect', 'opener', 'setter', 'senior_associate',
  'junior_manager', 'manager', 'senior_manager',
  'director', 'partner',
];

type PlaybookCategory = 'skill' | 'policy' | 'system' | 'core';

interface Playbook {
  id: string;
  level: number;
  tier: 'execution' | 'control';
  category: PlaybookCategory;
  order: number;
  titleDe: string;
  titleEn: string;
  previewDe: string;
  previewEn: string;
  file: string;
  /** If set, enables in-app reading */
  readerRoute?: string;
}

const PLAYBOOKS: Playbook[] = [
  {
    id: 'lead-recovery-sop',
    level: 1, tier: 'execution', category: 'core', order: 0,
    titleDe: 'Lead Recovery & Conversion Protocol™',
    titleEn: 'Lead Recovery & Conversion Protocol™',
    previewDe: 'Das zentrale System für alle eingehenden Leads. Pflichtlektüre für jeden im Team — von der Erstreaktion bis zur Conversion.',
    previewEn: 'The core system for all incoming leads. Required reading for every team member — from first response to conversion.',
    file: '/playbooks/SOP_LeadRecovery_ETC_v5.pdf',
    readerRoute: '/members/playbooks/sop-lead-recovery',
  },
  {
    id: 'opener',
    level: 1, tier: 'execution', category: 'skill', order: 1,
    titleDe: 'Opener System',
    titleEn: 'Opener System',
    previewDe: 'Das System für die ersten Kontakte. Wie du Aufmerksamkeit sicherst, Vertrauen baust und qualifizierst — bevor irgendjemand pitcht.',
    previewEn: 'The system for first contact. How to capture attention, build trust, and qualify — before anyone pitches.',
    file: '/playbooks/opener_system.pdf',
  },
  {
    id: 'setter',
    level: 2, tier: 'execution', category: 'skill', order: 1,
    titleDe: 'Setter Script',
    titleEn: 'Setter Script',
    previewDe: 'Das vollständige Setter-Skript: Frame, Discovery, Buy-In, Booking. Strukturiert für reproduzierbare Termine.',
    previewEn: 'The full setter script: frame, discovery, buy-in, booking. Structured for reproducible appointments.',
    file: '/playbooks/Setter_Script_ETC_v3_final.pdf',
    readerRoute: '/members/playbooks/setter-script',
  },
  {
    id: 'call-review',
    level: 3, tier: 'execution', category: 'skill', order: 1,
    titleDe: 'Call Review System',
    titleEn: 'Call Review System',
    previewDe: 'Wie du jeden Call analysierst, Schwächen erkennst und gezielt eliminierst. Das Review-Framework der Top-Performer.',
    previewEn: 'How to analyze every call, identify weaknesses, and eliminate them. The review framework of top performers.',
    file: '/playbooks/call_review_system.pdf',
  },
  {
    id: 'auszahlungspolitik',
    level: 3, tier: 'execution', category: 'policy', order: 2,
    titleDe: 'Auszahlungspolitik ETC v2',
    titleEn: 'Payout Policy ETC v2',
    previewDe: 'Die offizielle Auszahlungspolitik: Eligibility-Fenster, Batch-Logik, Status-Übergänge und manueller Zahlungsprozess. Pflichtlektüre vor der ersten Provision.',
    previewEn: 'The official payout policy: eligibility window, batch logic, status transitions and manual payment process. Required reading before the first commission.',
    file: '/playbooks/auszahlungspolitik_etc_v2.pdf',
  },
  {
    id: 'closer',
    level: 4, tier: 'execution', category: 'skill', order: 1,
    titleDe: 'Closer System',
    titleEn: 'Closer System',
    previewDe: 'Das komplette Closer-Skript. Diskovery, Pitch, Einwandbehandlung, Close. Für ethisches Closing auf höchstem Niveau.',
    previewEn: 'The complete closer script. Discovery, pitch, objections, close. For ethical closing at the highest level.',
    file: '/playbooks/closer_system.pdf',
  },
  {
    id: 'operator',
    level: 5, tier: 'execution', category: 'skill', order: 1,
    titleDe: 'Operator Playbook',
    titleEn: 'Operator Playbook',
    previewDe: 'Das Playbook für Operatoren. Team-Steuerung, Pipeline-Management, Performance-Hebel. Wie du ein System führst, statt nur Calls zu nehmen.',
    previewEn: 'The operator playbook. Team steering, pipeline management, performance levers. How to lead a system instead of just taking calls.',
    file: '/playbooks/operator_playbook.pdf',
  },
  {
    id: 'execution',
    level: 6, tier: 'control', category: 'system', order: 1,
    titleDe: 'Execution System',
    titleEn: 'Execution System',
    previewDe: 'Kontrollierte Ausführung unter realen Bedingungen. Hier wird Performance bewiesen.',
    previewEn: 'Controlled execution under real conditions. This is where performance is proven.',
    file: '/playbooks/execution_playbook.pdf',
  },
  {
    id: 'governance',
    level: 6, tier: 'control', category: 'system', order: 2,
    titleDe: 'Governance System',
    titleEn: 'Governance System',
    previewDe: 'Du bedienst das System nicht. Du entscheidest, wie es sich entwickelt.',
    previewEn: 'You don\'t operate the system. You decide how the system evolves.',
    file: '/playbooks/governance_playbook.pdf',
  },
];

const LEVEL_LABELS: Record<number, { de: string; en: string }> = {
  1: { de: 'Opener', en: 'Opener' },
  2: { de: 'Setter', en: 'Setter' },
  3: { de: 'Setter · Skill + Policy', en: 'Setter · Skill + Policy' },
  4: { de: 'Closer', en: 'Closer' },
  5: { de: 'Operator', en: 'Operator' },
  6: { de: 'System Control', en: 'System Control' },
};

function categoryBadge(cat: PlaybookCategory, lang: 'de' | 'en'): string | null {
  if (cat === 'core') return lang === 'de' ? 'Pflichtdokument' : 'Required';
  if (cat === 'policy') return lang === 'de' ? 'Policy' : 'Policy';
  if (cat === 'system') return lang === 'de' ? 'System' : 'System';
  return null;
}

export default function Playbooks() {
  const { profile, isAdmin, user } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();

  const stageIndex = useMemo(() => {
    if (isAdmin) return 99;
    const stage = normalizeBusinessStage((profile as any)?.business_stage || 'opener');
    return STAGE_INDEX_ORDER.indexOf(stage);
  }, [profile, isAdmin]);

  const unlockedCount = PLAYBOOKS.filter((p) => stageIndex >= p.level).length;
  const total = PLAYBOOKS.length;
  const progressPct = (unlockedCount / total) * 100;

  /** Map<playbook_key, firstAccessISO> — only "granted" results count. */
  const [accessed, setAccessed] = useState<Map<string, string>>(new Map());

  const fetchAccessed = useCallback(async () => {
    if (!user?.id) {
      setAccessed(new Map());
      return;
    }
    const { data } = await supabase
      .from('playbook_access_log')
      .select('playbook_key, created_at')
      .eq('user_id', user.id)
      .eq('result', 'granted')
      .order('created_at', { ascending: true });
    const map = new Map<string, string>();
    for (const row of (data ?? []) as { playbook_key: string; created_at: string }[]) {
      if (!map.has(row.playbook_key)) map.set(row.playbook_key, row.created_at);
    }
    setAccessed(map);
  }, [user?.id]);

  useEffect(() => { fetchAccessed(); }, [fetchAccessed]);

  /** Acknowledgment state: Set<playbook_key> */
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [ackLoading, setAckLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await (supabase as any)
        .from('playbook_acknowledgments')
        .select('playbook_key')
        .eq('user_id', user.id);
      if (data) setAcknowledged(new Set((data as any[]).map(r => r.playbook_key)));
    })();
  }, [user?.id]);

  const handleAcknowledge = async (playbookKey: string) => {
    if (!user?.id || acknowledged.has(playbookKey)) return;
    setAckLoading(playbookKey);
    const { error } = await (supabase as any)
      .from('playbook_acknowledgments')
      .insert({ user_id: user.id, playbook_key: playbookKey });
    if (!error) {
      setAcknowledged(prev => new Set([...prev, playbookKey]));
      toast({
        title: lang === 'de' ? 'Bestätigt' : 'Confirmed',
        description: lang === 'de' ? 'Du hast dieses Playbook als gelesen markiert.' : 'You have marked this playbook as read.',
      });
    }
    setAckLoading(null);
  };

  /** Core playbooks — shown prominently at the top */
  const corePlaybooks = PLAYBOOKS.filter(p => p.category === 'core');

  /** Map<playbook_key, current version number> from playbook_versions (is_current=true). */
  const [versions, setVersions] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('playbook_versions')
        .select('playbook_key, version')
        .eq('is_current', true);
      if (cancelled) return;
      const map = new Map<string, number>();
      for (const row of (data ?? []) as { playbook_key: string; version: number }[]) {
        map.set(row.playbook_key, row.version);
      }
      setVersions(map);
    })();
    return () => { cancelled = true; };
  }, []);

  const accessedUnlockedCount = PLAYBOOKS.filter(
    (p) => stageIndex >= p.level && accessed.has(p.id),
  ).length;
  const accessedPct = unlockedCount > 0 ? (accessedUnlockedCount / unlockedCount) * 100 : 0;

  /** Group by level, sub-sort by order, then deterministic id. */
  const groupedByLevel = useMemo(() => {
    const map = new Map<number, Playbook[]>();
    for (const pb of PLAYBOOKS) {
      if (pb.category === 'core') continue; // shown separately above
      const arr = map.get(pb.level) ?? [];
      arr.push(pb);
      map.set(pb.level, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, []);

  const [pendingId, setPendingId] = useState<string | null>(null);

  /**
   * Last-visited level memory.
   * Stored per-user in localStorage so a returning login resumes at the
   * same playbook section. Pure client-side, no DB write needed.
   */
  const storageKey = user?.id ? `etc:playbooks:lastLevel:${user.id}` : null;
  const [restoredLevel, setRestoredLevel] = useState<number | null>(null);
  const [restoreDismissed, setRestoreDismissed] = useState(false);
  const [activeLevel, setActiveLevel] = useState<number | null>(null);

  // Restore on mount: scroll to saved section if it exists & is unlocked.
  useEffect(() => {
    if (!storageKey) return;
    const raw = localStorage.getItem(storageKey);
    const saved = raw ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(saved)) return;
    if (stageIndex < saved) return; // don't jump to a locked level
    setRestoredLevel(saved);
    // Defer to next frame so sections are mounted.
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-playbook-level="${saved}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Observe which level section is currently in view → persist it.
  useEffect(() => {
    if (!storageKey) return;
    const sections = document.querySelectorAll<HTMLElement>('[data-playbook-level]');
    if (!sections.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const lvl = parseInt(visible.target.getAttribute('data-playbook-level') || '', 10);
        if (Number.isFinite(lvl)) {
          setActiveLevel(lvl);
          localStorage.setItem(storageKey, String(lvl));
        }
      },
      { rootMargin: '-30% 0px -50% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [storageKey, groupedByLevel.length]);

  /**
   * Server-authoritative download.
   * Calls the `playbook-download` edge function which validates JWT + stage
   * via `can_access_playbook_level()` and returns a 60s signed URL.
   * Client-side stage is only for UX — the server is the source of truth.
   */
  async function handleDownload(pb: Playbook, mode: 'download' | 'open') {
    setPendingId(pb.id);
    try {
      const { data, error } = await supabase.functions.invoke('playbook-download', {
        body: { playbook_key: pb.id },
      });

      if (error || !data?.url) {
        const status = (error as any)?.context?.status;
        const msg =
          status === 403
            ? lang === 'de'
              ? `Dieses Playbook ist erst ab Level ${pb.level} verfügbar.`
              : `This playbook unlocks at Level ${pb.level}.`
            : status === 401
              ? lang === 'de' ? 'Bitte erneut anmelden.' : 'Please sign in again.'
              : lang === 'de' ? 'Download nicht möglich.' : 'Download failed.';
        toast({
          title: lang === 'de' ? 'Zugriff verweigert' : 'Access denied',
          description: msg,
          variant: 'destructive',
        });
        return;
      }

      if (mode === 'download') {
        const a = document.createElement('a');
        a.href = data.url;
        a.download = data.file_name ?? '';
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      }
      // Refresh access log so the "Geöffnet" badge appears immediately.
      fetchAccessed();
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8 md:py-12">
      {/* Header */}
      <header className="mb-8 md:mb-12">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          {lang === 'de' ? 'Execution Playbooks' : 'Execution Playbooks'}
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
          {lang === 'de'
            ? 'Die Systeme hinter Performance. Schritt für Schritt freigeschaltet.'
            : 'The systems behind performance. Unlocked step by step.'}
        </p>

        {/* Progress: unlocked + accessed */}
        <div className="mt-6 grid max-w-md gap-4 sm:max-w-2xl sm:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">
                {lang === 'de'
                  ? `${unlockedCount} / ${total} freigeschaltet`
                  : `${unlockedCount} / ${total} unlocked`}
              </span>
              <span className="font-mono text-[hsl(39,41%,55%)]">
                {Math.round(progressPct)}%
              </span>
            </div>
            <Progress value={progressPct} className="h-1.5" />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">
                {lang === 'de'
                  ? `${accessedUnlockedCount} / ${unlockedCount} geöffnet`
                  : `${accessedUnlockedCount} / ${unlockedCount} opened`}
              </span>
              <span className="font-mono text-emerald-500/80">
                {Math.round(accessedPct)}%
              </span>
            </div>
            <Progress value={accessedPct} className="h-1.5" />
          </div>
        </div>
      </header>

      {/* Resume banner — shown if a saved level was restored on mount */}
      {restoredLevel != null && !restoreDismissed && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-[hsl(39,41%,55%)]/30 bg-[hsl(39,41%,55%)]/5 px-4 py-2.5">
          <p className="text-xs text-foreground">
            <span className="mr-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-[hsl(39,41%,55%)]">
              {lang === 'de' ? 'Fortgesetzt' : 'Resumed'}
            </span>
            {lang === 'de'
              ? `Du warst zuletzt bei Level ${restoredLevel}.`
              : `You were last on Level ${restoredLevel}.`}
          </p>
          <button
            type="button"
            onClick={() => setRestoreDismissed(true)}
            className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {lang === 'de' ? 'Schließen' : 'Dismiss'}
          </button>
        </div>
      )}

      {/* Live Intelligence (AI-improved script blocks from real calls) */}
      <LiveScriptViewer />

      {/* ═══ CORE PLAYBOOKS — Pflichtdokumente ═══ */}
      {corePlaybooks.length > 0 && stageIndex >= 1 && (
        <section className="mb-10">
          <div className="mb-4 flex items-center gap-2 border-b border-[hsl(39,41%,55%)]/40 pb-2">
            <ShieldCheck className="h-5 w-5 text-[hsl(39,41%,55%)]" />
            <h2 className="font-serif text-xl font-semibold text-foreground md:text-2xl">
              {lang === 'de' ? 'Pflichtdokumente' : 'Core Playbooks'}
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {corePlaybooks.map((pb) => {
              const title = lang === 'de' ? pb.titleDe : pb.titleEn;
              const preview = lang === 'de' ? pb.previewDe : pb.previewEn;
              const isAccessed = accessed.has(pb.id);
              const isAcknowledged = acknowledged.has(pb.id);
              const currentVersion = versions.get(pb.id) ?? null;
              return (
                <Card
                  key={pb.id}
                  className="relative overflow-hidden border-[hsl(39,41%,55%)]/40 bg-gradient-to-br from-[hsl(39,41%,55%)]/5 to-transparent p-6 transition-all hover:border-[hsl(39,41%,55%)]/60 hover:shadow-xl hover:shadow-[hsl(39,41%,55%)]/10"
                >
                  {/* Ribbon */}
                  <div className="absolute right-0 top-0 flex items-center gap-1 bg-[hsl(39,41%,55%)]/15 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-[hsl(39,41%,65%)]">
                    <AlertTriangle className="h-3 w-3" />
                    {lang === 'de' ? 'Pflichtlektüre' : 'Required Reading'}
                  </div>

                  <div className="mb-3 flex items-center gap-2 pt-4">
                    <span className="rounded-sm border border-[hsl(39,41%,55%)]/50 bg-[hsl(39,41%,55%)]/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[hsl(39,41%,55%)]">
                      {lang === 'de' ? 'Pflichtdokument' : 'Required'}
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">L1+</span>
                    {currentVersion != null && (
                      <span className="rounded-sm border border-border/60 bg-muted/30 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase text-muted-foreground">
                        v{currentVersion}
                      </span>
                    )}
                  </div>

                  <h3 className="mb-2 font-serif text-lg font-semibold text-foreground">{title}</h3>
                  <p className="mb-5 text-sm text-muted-foreground">{preview}</p>

                  {/* Actions */}
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      {pb.readerRoute && (
                        <Button
                          size="sm"
                          onClick={() => navigate(pb.readerRoute!)}
                          className="flex-1 bg-[hsl(39,41%,55%)] text-[hsl(220,15%,8%)] hover:bg-[hsl(39,41%,50%)]"
                        >
                          <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                          {lang === 'de' ? 'Lesen' : 'Read'}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={pb.readerRoute ? 'outline' : 'default'}
                        disabled={pendingId === pb.id}
                        onClick={() => handleDownload(pb, 'download')}
                        className={pb.readerRoute ? 'border-border/60' : 'flex-1 bg-[hsl(39,41%,55%)] text-[hsl(220,15%,8%)] hover:bg-[hsl(39,41%,50%)]'}
                      >
                        {pendingId === pb.id ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {!pb.readerRoute && 'Download'}
                      </Button>
                    </div>

                    {/* Acknowledgment checkbox */}
                    <div
                      className={cn(
                        'flex items-start gap-3 rounded-lg border px-3 py-2.5',
                        isAcknowledged
                          ? 'border-emerald-500/30 bg-emerald-500/5'
                          : 'border-[hsl(39,41%,55%)]/30 bg-[hsl(39,41%,55%)]/5'
                      )}
                    >
                      <Checkbox
                        id={`ack-${pb.id}`}
                        checked={isAcknowledged}
                        disabled={isAcknowledged || ackLoading === pb.id}
                        onCheckedChange={() => handleAcknowledge(pb.id)}
                        className="mt-0.5"
                      />
                      <label htmlFor={`ack-${pb.id}`} className="text-xs leading-relaxed cursor-pointer">
                        {isAcknowledged ? (
                          <span className="flex items-center gap-1.5 font-medium text-emerald-500">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {lang === 'de' ? 'Gelesen und verstanden' : 'Read and understood'}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {lang === 'de'
                              ? 'Ich habe dieses Playbook gelesen und verstanden'
                              : 'I have read and understood this playbook'}
                          </span>
                        )}
                      </label>
                    </div>

                    {/* Access status */}
                    {isAccessed && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-500/80">
                        <CheckCircle2 className="h-3 w-3" />
                        {lang === 'de' ? 'Bereits geöffnet' : 'Already accessed'}
                      </span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Grouped by level */}
      <div className="space-y-10">
        {groupedByLevel.map(([level, items]) => {
          const levelUnlocked = stageIndex >= level;
          const labelObj = LEVEL_LABELS[level];
          const label = labelObj ? (lang === 'de' ? labelObj.de : labelObj.en) : '';
          const unlockedInLevel = items.filter((p) => stageIndex >= p.level).length;
          const accessedInLevel = items.filter(
            (p) => stageIndex >= p.level && accessed.has(p.id),
          ).length;

          return (
            <section
              key={level}
              data-playbook-level={level}
              aria-labelledby={`level-${level}-heading`}
              className="scroll-mt-24"
            >
              {/* Level header */}
              <div className="mb-4 flex items-baseline justify-between border-b border-border/40 pb-2">
                <div className="flex items-baseline gap-3">
                  <span
                    className={cn(
                      'font-mono text-xs font-bold tracking-widest',
                      levelUnlocked ? 'text-[hsl(39,41%,55%)]' : 'text-muted-foreground'
                    )}
                  >
                    L{level}
                  </span>
                  <h2
                    id={`level-${level}-heading`}
                    className={cn(
                      'font-serif text-lg font-semibold md:text-xl',
                      levelUnlocked ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {label}
                  </h2>
                </div>
                <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span>{unlockedInLevel} / {items.length}</span>
                  {unlockedInLevel > 0 && (
                    <span className="inline-flex items-center gap-1 text-emerald-500/80">
                      <CheckCircle2 className="h-3 w-3" />
                      {accessedInLevel} / {unlockedInLevel} {lang === 'de' ? 'gelesen' : 'opened'}
                    </span>
                  )}
                </div>
              </div>

              {/* Cards within level */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {items.map((pb) => {
                  const unlocked = stageIndex >= pb.level;
                  const title = lang === 'de' ? pb.titleDe : pb.titleEn;
                  const preview = lang === 'de' ? pb.previewDe : pb.previewEn;
                  const isControl = pb.tier === 'control';
                  const catLabel = categoryBadge(pb.category, lang);
                  const accessedAt = accessed.get(pb.id);
                  const isAccessed = !!accessedAt && unlocked;
                  const accessedDate = accessedAt
                    ? new Date(accessedAt).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })
                    : null;
                  const currentVersion = versions.get(pb.id) ?? null;

                  return (
                    <Card
                      key={pb.id}
                      className={cn(
                        'relative overflow-hidden p-5 transition-all',
                        isControl
                          ? 'border-[hsl(39,41%,55%)]/30 bg-gradient-to-br from-[hsl(220,15%,6%)] to-[hsl(220,15%,9%)]'
                          : 'border-border/40 bg-card',
                        unlocked
                          ? isControl
                            ? 'hover:border-[hsl(39,41%,55%)]/60 hover:shadow-2xl hover:shadow-[hsl(39,41%,55%)]/10'
                            : 'hover:border-[hsl(39,41%,55%)]/40 hover:shadow-lg'
                          : 'opacity-60'
                      )}
                    >
                      {/* Control layer ribbon */}
                      {isControl && (
                        <div className="absolute right-0 top-0 bg-[hsl(39,41%,55%)]/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[hsl(39,41%,65%)]">
                          System Control Layer
                        </div>
                      )}

                      {/* Top row: order pip + category badge + state icon */}
                      <div className="mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'inline-flex h-5 w-5 items-center justify-center rounded-full border font-mono text-[10px] font-bold',
                              unlocked
                                ? 'border-[hsl(39,41%,55%)]/50 text-[hsl(39,41%,55%)]'
                                : 'border-border text-muted-foreground'
                            )}
                            aria-label={`Position ${pb.order}`}
                          >
                            {pb.order}
                          </span>
                          {catLabel && (
                            <span
                              className={cn(
                                'rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider',
                                pb.category === 'policy'
                                  ? 'border-[hsl(39,41%,55%)]/40 bg-[hsl(39,41%,55%)]/5 text-[hsl(39,41%,55%)]'
                                  : 'border-border/60 text-muted-foreground'
                              )}
                            >
                              {catLabel}
                            </span>
                          )}
                          {currentVersion != null && (
                            <span
                              className="rounded-sm border border-border/60 bg-muted/30 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-muted-foreground"
                              title={lang === 'de' ? 'Aktueller Versionsstand' : 'Current version'}
                            >
                              v{currentVersion}
                            </span>
                          )}
                        </div>
                        {!unlocked ? (
                          <Lock className="h-4 w-4 text-muted-foreground" />
                        ) : isAccessed ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-emerald-500/90"
                            title={accessedDate ? `${lang === 'de' ? 'Zuletzt geöffnet' : 'Last opened'}: ${accessedDate}` : undefined}
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            {lang === 'de' ? 'Geöffnet' : 'Opened'}
                          </span>
                        ) : (
                          <FileText className={cn('h-4 w-4', isControl ? 'text-[hsl(39,41%,55%)]' : 'text-muted-foreground')} />
                        )}
                      </div>

                      {/* Title */}
                      <h3 className={cn(
                        'mb-1 font-serif text-lg font-semibold',
                        isControl ? 'text-[hsl(39,41%,75%)]' : 'text-foreground'
                      )}>
                        {title}
                      </h3>
                      {isAccessed && accessedDate && (
                        <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-emerald-500/70">
                          {lang === 'de' ? 'Erstmals geöffnet' : 'First opened'}: {accessedDate}
                        </p>
                      )}

                      {/* Preview */}
                      <p
                        className={cn(
                          'mb-5 text-sm text-muted-foreground',
                          !unlocked && 'select-none blur-sm'
                        )}
                      >
                        {preview}
                      </p>

                      {/* Actions */}
                      {unlocked ? (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            {pb.readerRoute && (
                              <Button
                                size="sm"
                                onClick={() => navigate(pb.readerRoute!)}
                                className="flex-1 bg-[hsl(39,41%,55%)] text-[hsl(220,15%,8%)] hover:bg-[hsl(39,41%,50%)]"
                              >
                                <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                                {lang === 'de' ? 'Lesen' : 'Read'}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant={pb.readerRoute ? 'outline' : 'default'}
                              disabled={pendingId === pb.id}
                              onClick={() => handleDownload(pb, 'download')}
                              className={pb.readerRoute ? 'border-border/60' : 'flex-1 bg-[hsl(39,41%,55%)] text-[hsl(220,15%,8%)] hover:bg-[hsl(39,41%,50%)]'}
                            >
                              {pendingId === pb.id ? (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Download className="mr-1.5 h-3.5 w-3.5" />
                              )}
                              {!pb.readerRoute && (lang === 'de' ? 'Download' : 'Download')}
                            </Button>
                          </div>
                          {pb.id === 'auszahlungspolitik' && (
                            <Link
                              to="/members/playbooks/auszahlungspolitik"
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-[hsl(39,41%,55%)] hover:text-[hsl(39,41%,65%)]"
                            >
                              <Info className="h-3 w-3" />
                              {lang === 'de' ? 'Details & Versionsstand' : 'Details & version'}
                            </Link>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                          <Lock className="h-3 w-3" />
                          <span>
                            {lang === 'de'
                              ? `Freigeschaltet ab Level ${pb.level}`
                              : `Unlocked at Level ${pb.level}`}
                          </span>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>

              {/* L3 Self-Check — appears once user has opened ≥ 1 L3 PDF */}
              {level === 3 && levelUnlocked && accessedInLevel > 0 && (
                <Level3SelfCheck />
              )}
            </section>
          );
        })}
      </div>

      {/* Footer note */}
      <p className="mt-10 text-center text-xs text-muted-foreground">
        {lang === 'de'
          ? 'Jedes Playbook entspricht einer realen Executions-Stufe. Zugang wird durch Karrierefortschritt erworben.'
          : 'Each playbook matches a real execution stage. Access is earned through career progression.'}
      </p>
    </div>
  );
}
