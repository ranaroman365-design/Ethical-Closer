import { useState, useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Mic, Video, Upload, MessageSquare, CheckCircle2, Circle, Star, Loader2, Sparkles, Calendar } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/i18n/LanguageContext';
import { getUserLevel, STAGE_LABELS } from '@/components/members/CareerPath';
import type { PracticeCall } from '@/types/members';

const LEVEL_OPTIONS = [
  { key: 'opener', level: 1 },
  { key: 'setter', level: 2 },
  { key: 'senior_associate', level: 3 },
  { key: 'junior_manager', level: 4 },
  { key: 'manager', level: 5 },
  { key: 'senior_manager', level: 6 },
];

const practiceTypes = [
  { titleDe: 'Practice Calls', titleEn: 'Practice Calls', descDe: 'Übe strukturierte Gespräche mit deinen Peers.', descEn: 'Practice structured conversations with your peers.', icon: Mic },
  { titleDe: 'Rollenspiele', titleEn: 'Role Plays', descDe: 'Simulierte Verkaufsgespräche mit Feedback.', descEn: 'Simulated sales conversations with feedback.', icon: MessageSquare },
  { titleDe: 'Gesprächssimulationen', titleEn: 'Call Simulations', descDe: 'Realistische Szenarien zum Üben.', descEn: 'Realistic scenarios for practice.', icon: Video },
  { titleDe: 'Call Review Upload', titleEn: 'Call Review Upload', descDe: 'Lade deine Aufnahmen für Feedback hoch.', descEn: 'Upload your recordings for feedback.', icon: Upload },
];

const scorecardLabels: Record<string, string> = {
  rapport: 'Rapport', discovery: 'Discovery', active_listening: 'Aktives Zuhören',
  problem_depth: 'Problemtiefe', vision: 'Vision', objections: 'Einwandbehandlung',
  ethical_closing: 'Ethisches Closing', professionalism: 'Professionalität',
};

const ritualSteps = [
  { de: 'Kurze Atemübung (2–3 Minuten)', en: 'Short breathing exercise (2-3 minutes)' },
  { de: 'Emotionale Erdung', en: 'Emotional grounding' },
  { de: 'Intention für das Gespräch setzen', en: 'Set intention for the conversation' },
  { de: 'Fokus auf Klarheit und ethische Kommunikation', en: 'Focus on clarity and ethical communication' },
];

export default function Practice() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [scoring, setScoring] = useState<string | null>(null);
  const [calls, setCalls] = useState<PracticeCall[]>([]);
  const [ritualChecked, setRitualChecked] = useState<boolean[]>(ritualSteps.map(() => false));

  const t = (de: string, en: string) => lang === 'de' ? de : en;

  // Level-aware practice
  const userStage = (profile as any)?.business_stage || 'opener';
  const userLevel = getUserLevel(userStage);
  const [selectedLevel, setSelectedLevel] = useState(userStage);

  useEffect(() => {
    setSelectedLevel(userStage);
  }, [userStage]);

  useEffect(() => {
    if (!user) return;
    supabase.from('practice_calls').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setCalls((data as PracticeCall[]) ?? []));
  }, [user]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!ritualChecked.every(Boolean)) {
      toast({ title: t('Pre-Call Ritual erforderlich', 'Pre-Call Ritual required'), description: t('Bitte schließe das Pre-Call Alignment Ritual ab.', 'Please complete the Pre-Call Alignment Ritual.') });
      return;
    }
    setUploading(true);
    const filePath = `${user.id}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from('practice-calls').upload(filePath, file);
    if (uploadError) { toast({ title: 'Upload fehlgeschlagen', description: uploadError.message }); setUploading(false); return; }

    const { data, error } = await supabase.from('practice_calls')
      .insert({ user_id: user.id, file_path: filePath, file_name: file.name, status: 'uploaded' })
      .select().single();
    setUploading(false);
    if (error) { toast({ title: 'Fehler', description: error.message }); return; }
    setCalls(prev => [data as PracticeCall, ...prev]);
    toast({ title: t('Call hochgeladen', 'Call uploaded'), description: t('Deine Aufnahme wurde erfolgreich gespeichert.', 'Your recording has been saved successfully.') });
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleScore = async (callId: string) => {
    setScoring(callId);
    try {
      const { data, error } = await supabase.functions.invoke('score-call', { body: { practiceCallId: callId } });
      if (error) throw error;
      setCalls(prev => prev.map(c =>
        c.id === callId ? { ...c, status: data.status, total_score: data.totalScore, scorecard: data.scorecard } : c
      ));
      toast({ title: 'Scoring abgeschlossen', description: `Score: ${data.totalScore}/100` });
    } catch (err: any) {
      toast({ title: 'Scoring fehlgeschlagen', description: err.message || 'Bitte versuche es erneut.' });
    }
    setScoring(null);
  };

  const ritualComplete = ritualChecked.every(Boolean);
  const latestScoredCall = calls.find(c => c.status === 'scored' || c.status === 'passed' || c.status === 'needs_improvement');

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
      <div className="mb-8">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">Practice</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('Praxis schlägt Theorie.', 'Practice beats theory.')}</p>
      </div>

      {/* Level Selector */}
      <div className="mb-8 rounded-xl border border-border/40 bg-card p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-3">
          {t('ÜBUNGSMODUS — POSITION WÄHLEN', 'PRACTICE MODE — SELECT POSITION')}
        </p>
        <div className="flex flex-wrap gap-2">
          {LEVEL_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setSelectedLevel(opt.key)}
              className={`rounded-lg border px-3 py-2 text-[12px] font-medium transition-all ${
                selectedLevel === opt.key
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-border/40 text-muted-foreground hover:border-border/70'
              }`}
            >
              L{opt.level} · {STAGE_LABELS[opt.key]?.[lang] || opt.key}
              {opt.key === userStage && <span className="ml-1 text-[9px] opacity-60">({t('aktuell', 'current')})</span>}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          {t(
            `AI passt Schwierigkeit, Feedback und Erwartungen an "${STAGE_LABELS[selectedLevel]?.[lang] || selectedLevel}" an.`,
            `AI adapts difficulty, feedback, and expectations to "${STAGE_LABELS[selectedLevel]?.[lang] || selectedLevel}".`
          )}
        </p>
      </div>

      {/* Weekly Live Call Notice */}
      <div className="mb-8 rounded-xl border border-accent/20 bg-accent/[0.03] p-4 flex items-center gap-3">
        <Calendar className="h-5 w-5 text-accent shrink-0" />
        <div>
          <p className="text-[13px] font-semibold text-foreground">{t('Wöchentlicher Practice Live Call', 'Weekly Practice Live Call')}</p>
          <p className="text-[11px] text-muted-foreground">{t('Jeden Mittwoch — strukturiertes Üben mit Live-Feedback.', 'Every Wednesday — structured practice with live feedback.')}</p>
        </div>
      </div>

      {/* Pre-Call Alignment Ritual */}
      <div className="mb-8 rounded-xl border border-accent/20 bg-accent/[0.03] p-5">
        <h2 className="mb-3 font-serif text-base font-semibold text-foreground">Pre-Call Alignment Ritual</h2>
        <p className="mb-4 text-xs text-muted-foreground">{t('Radiant Nervous System Calibration — vor jedem Practice Call.', 'Radiant Nervous System Calibration — before every practice call.')}</p>
        <div className="space-y-2">
          {ritualSteps.map((item, i) => (
            <button key={i} onClick={() => setRitualChecked(prev => prev.map((v, j) => j === i ? !v : v))} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent/[0.04]">
              {ritualChecked[i] ? (
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"><CheckCircle2 className="h-3.5 w-3.5" /></div>
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-accent/50" />
              )}
              <span className={`text-[13px] font-medium ${ritualChecked[i] ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{item[lang]}</span>
            </button>
          ))}
        </div>
        {ritualComplete && <Badge className="mt-3 bg-primary/10 text-primary border-0 text-[10px]">✓ {t('Ritual abgeschlossen', 'Ritual completed')}</Badge>}
      </div>

      {/* Practice Types */}
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t('Übungsbereiche', 'Practice Areas')}</h2>
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {practiceTypes.map(pt => (
          <div key={pt.titleDe} className="rounded-xl border border-border/40 bg-card p-5 transition-all hover:border-border/70 hover:shadow-sm cursor-pointer">
            <pt.icon className="mb-3 h-5 w-5 text-accent" />
            <p className="text-[13px] font-semibold text-foreground">{lang === 'de' ? pt.titleDe : pt.titleEn}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{lang === 'de' ? pt.descDe : pt.descEn}</p>
          </div>
        ))}
      </div>

      {/* Upload Area */}
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Call Upload</h2>
      <div className="mb-8 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/50 bg-muted/20 p-8">
        <Upload className="mb-3 h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium text-muted-foreground">{t('Call Aufnahme hochladen', 'Upload Call Recording')}</p>
        <p className="mt-1 text-xs text-muted-foreground/60">{t('Audio oder Video für AI-Analyse', 'Audio or video for AI analysis')}</p>
        <input ref={fileRef} type="file" accept="audio/*,video/*" onChange={handleUpload} className="hidden" />
        <Button variant="outline" size="sm" className="mt-4 text-xs" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <><Loader2 className="mr-2 h-3 w-3 animate-spin" />{t('Hochladen…', 'Uploading…')}</> : t('Datei auswählen', 'Select file')}
        </Button>
        {!ritualComplete && <p className="mt-2 text-[11px] text-destructive">{t('Ritual muss zuerst abgeschlossen werden.', 'Ritual must be completed first.')}</p>}
      </div>

      {/* Uploaded Calls */}
      {calls.length > 0 && (
        <>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t('Deine Uploads', 'Your Uploads')} ({calls.length})</h2>
          <div className="space-y-2 mb-8">
            {calls.map(call => {
              const isScored = call.status === 'scored' || call.status === 'passed' || call.status === 'needs_improvement';
              return (
                <div key={call.id} className="rounded-xl border border-border/40 bg-card p-4">
                  <div className="flex items-center gap-3">
                    <Mic className="h-4 w-4 shrink-0 text-accent" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-foreground truncate">{call.file_name}</p>
                      <p className="text-[11px] text-muted-foreground">{new Date(call.created_at).toLocaleDateString('de-DE')}</p>
                    </div>
                    <Badge variant="outline" className={`text-[10px] ${isScored ? (call.total_score && call.total_score >= 80 ? 'border-primary/30 text-primary' : 'border-orange-500/30 text-orange-600') : ''}`}>
                      {isScored ? `Score: ${call.total_score}/100` : call.status === 'uploaded' ? t('Hochgeladen', 'Uploaded') : call.status}
                    </Badge>
                  </div>
                  {call.status === 'uploaded' && (
                    <Button variant="outline" size="sm" className="mt-3 text-xs w-full" onClick={() => handleScore(call.id)} disabled={scoring === call.id}>
                      {scoring === call.id ? <><Loader2 className="mr-2 h-3 w-3 animate-spin" />AI analysiert…</> : <><Sparkles className="mr-2 h-3 w-3" />AI Scoring starten</>}
                    </Button>
                  )}
                  {isScored && call.scorecard && (
                    <div className="mt-3 pt-3 border-t border-border/30 space-y-2">
                      {Object.entries(scorecardLabels).map(([key, label]) => {
                        const score = (call.scorecard as Record<string, any>)?.[key];
                        if (score === undefined) return null;
                        return (
                          <div key={key} className="flex items-center justify-between">
                            <span className="text-[12px] text-muted-foreground">{label}</span>
                            <span className={`text-[12px] font-semibold ${score >= 8 ? 'text-primary' : score >= 6 ? 'text-accent' : 'text-orange-600'}`}>{score}/10</span>
                          </div>
                        );
                      })}
                      {(call.scorecard as Record<string, any>)?.feedback && (
                        <div className="mt-2 rounded-lg bg-muted/50 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Feedback</p>
                          <p className="text-[12px] text-foreground leading-relaxed">{(call.scorecard as Record<string, any>).feedback}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {!latestScoredCall && (
        <>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Feedback Scorecard</h2>
          <div className="rounded-xl border border-border/40 bg-card p-5">
            <p className="text-xs text-muted-foreground text-center py-4">
              {t('Lade einen Call hoch und starte das AI Scoring, um deine erste Bewertung zu erhalten.', 'Upload a call and start AI scoring to receive your first evaluation.')}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
