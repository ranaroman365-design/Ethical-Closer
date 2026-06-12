import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Check, Circle, PlayCircle, User, BookOpen, Target, FileText,
  ArrowRight, Loader2, ChevronRight, Sparkles, Phone, Camera,
  MessageSquare, Calendar, Shield, Briefcase, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { getProductName } from '@/config/product';

type Lang = 'de' | 'en';

/* ─── step definitions ─── */
const STEPS: { id: string; label: { de: string; en: string }; icon: any; description: { de: string; en: string } }[] = [
  { id: 'intro_video', label: { de: 'Einführungsvideo ansehen', en: 'Watch Introduction Video' }, icon: PlayCircle, description: { de: 'Lerne das System und deinen Weg kennen.', en: 'Get to know the system and your path.' } },
  { id: 'profile_complete', label: { de: 'Profil vervollständigen', en: 'Complete Profile' }, icon: User, description: { de: 'Dein professionelles Profil einrichten.', en: 'Set up your professional profile.' } },
  { id: 'community_rules', label: { de: 'Community-Regeln bestätigen', en: 'Confirm Community Rules' }, icon: BookOpen, description: { de: 'Ethische Standards und Verhaltensregeln.', en: 'Ethical standards and code of conduct.' } },
  { id: 'tools_setup', label: { de: 'Tools einrichten', en: 'Set Up Tools' }, icon: Phone, description: { de: 'WhatsApp Business, Calendly & Co.', en: 'WhatsApp Business, Calendly & more.' } },
  { id: 'learning_goal', label: { de: 'Erstes Lernziel setzen', en: 'Set First Learning Goal' }, icon: Target, description: { de: 'Dein 30/60/90-Tage-Zeithorizont.', en: 'Your 30/60/90-day time horizon.' } },
  { id: 'start_here', label: { de: 'Plattform-Guide abschließen', en: 'Complete Platform Guide' }, icon: FileText, description: { de: `So funktioniert ${getProductName()}.`, en: `How ${getProductName()} works.` } },
];

const COMMUNITY_RULES: { de: string; en: string }[] = [
  { de: 'Ich kommuniziere respektvoll und wertschätzend mit allen Community-Mitgliedern.', en: 'I communicate respectfully and appreciatively with all community members.' },
  { de: `Ich halte mich an die ethischen Verkaufsstandards von ${getProductName()}.`, en: `I adhere to the ethical sales standards of ${getProductName()}.` },
  { de: 'Ich teile keine vertraulichen Inhalte aus dem Memberbereich.', en: 'I do not share confidential content from the member area.' },
  { de: 'Ich bin offen für Feedback und unterstütze andere auf ihrem Weg.', en: 'I am open to feedback and support others on their path.' },
  { de: 'Ich nutze die Plattform ausschließlich für den vorgesehenen Zweck.', en: 'I use the platform exclusively for its intended purpose.' },
  { de: 'Ich erscheine pünktlich und vorbereitet zu Calls und Trainings.', en: 'I show up on time and prepared for calls and trainings.' },
];

const TOOLS_CHECKLIST: { key: string; label: { de: string; en: string }; desc: { de: string; en: string } }[] = [
  { key: 'whatsapp', label: { de: 'WhatsApp Business installiert & eingerichtet', en: 'WhatsApp Business installed & set up' }, desc: { de: 'Professionelles Profil mit Foto, Business-Info und Begrüßungsnachricht.', en: 'Professional profile with photo, business info, and welcome message.' } },
  { key: 'calendly', label: { de: 'Calendly-Account erstellt', en: 'Calendly account created' }, desc: { de: 'Terminbuchungs-Link für Setter- und Closer-Calls eingerichtet.', en: 'Booking link for setter and closer calls set up.' } },
  { key: 'headset', label: { de: 'Headset & ruhigen Arbeitsplatz vorbereitet', en: 'Headset & quiet workspace prepared' }, desc: { de: 'Gutes Audio ist entscheidend für professionelle Calls.', en: 'Good audio is essential for professional calls.' } },
  { key: 'calendar', label: { de: 'Feste Call-Zeiten im Kalender geblockt', en: 'Fixed call times blocked in calendar' }, desc: { de: 'Mindestens 3 feste Zeitfenster pro Woche für deine Sales-Calls.', en: 'At least 3 fixed time slots per week for your sales calls.' } },
  { key: 'crm', label: { de: 'CRM / Notion Workspace vorbereitet', en: 'CRM / Notion Workspace prepared' }, desc: { de: 'Dein System für Lead-Tracking und Follow-ups.', en: 'Your system for lead tracking and follow-ups.' } },
];

const START_HERE_SECTIONS: { title: { de: string; en: string }; description: { de: string; en: string }; icon: any }[] = [
  { title: { de: `Willkommen bei ${getProductName()}`, en: `Welcome to ${getProductName()}` }, description: { de: 'Das Fundament: Warum ethisches Closing die Zukunft ist.', en: 'The foundation: Why ethical closing is the future.' }, icon: Sparkles },
  { title: { de: 'Das System verstehen', en: 'Understanding the System' }, description: { de: 'Opener → Setter → Closer → Manager: Dein Karriereweg.', en: 'Opener → Setter → Closer → Manager: Your career path.' }, icon: Briefcase },
  { title: { de: 'Rollen im Sales', en: 'Roles in Sales' }, description: { de: 'Was genau macht ein Setter? Ein Closer? Ein Manager?', en: 'What exactly does a Setter do? A Closer? A Manager?' }, icon: MessageSquare },
  { title: { de: 'Dein Erfolgsfahrplan', en: 'Your Success Roadmap' }, description: { de: 'Von Onboarding bis Placement — Schritt für Schritt.', en: 'From onboarding to placement — step by step.' }, icon: ArrowRight },
  { title: { de: 'Academy & Zertifizierung', en: 'Academy & Certification' }, description: { de: 'So funktioniert das Lern- und Prüfungssystem.', en: 'How the learning and exam system works.' }, icon: Shield },
  { title: { de: 'Community & Support', en: 'Community & Support' }, description: { de: 'Wie du Hilfe bekommst und dich vernetzt.', en: 'How to get help and connect.' }, icon: BookOpen },
  { title: { de: 'Lead Pool & Workspaces', en: 'Lead Pool & Workspaces' }, description: { de: 'Wie Leads verteilt werden und du deinen Workspace nutzt.', en: 'How leads are distributed and how to use your workspace.' }, icon: Calendar },
  { title: { de: 'KPIs & Karriere-Aufstieg', en: 'KPIs & Career Advancement' }, description: { de: 'Diese Zahlen bestimmen deinen Fortschritt.', en: 'These numbers determine your progress.' }, icon: Target },
];

export default function StartHere() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { lang } = useLanguage();
  const t = (de: string, en: string) => lang === 'de' ? de : en;

  const [completedItems, setCompletedItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState(0);

  const [videoProgress, setVideoProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [bio, setBio] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  const [rulesChecked, setRulesChecked] = useState<boolean[]>(new Array(COMMUNITY_RULES.length).fill(false));

  const [toolsChecked, setToolsChecked] = useState<Record<string, boolean>>({});

  const [learningGoal, setLearningGoal] = useState('');

  const [sectionsRead, setSectionsRead] = useState<Set<number>>(new Set());

  const [showPromotion, setShowPromotion] = useState(false);

  /* ─── load existing progress ─── */
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    supabase
      .from('onboarding_progress')
      .select('item_key')
      .eq('user_id', user.id)
      .eq('completed', true)
      .then(({ data }) => {
        if (data) {
          const done = new Set(data.map((d: any) => d.item_key));
          setCompletedItems(done);
          const firstIncomplete = STEPS.findIndex(s => !done.has(s.id));
          setActiveStep(firstIncomplete === -1 ? STEPS.length - 1 : firstIncomplete);
        }
        setLoading(false);
      });

    if (profile) {
      const parts = (profile.full_name || '').split(' ');
      setFirstName(parts[0] || '');
      setLastName(parts.slice(1).join(' ') || '');
      setPhone((profile as any).phone || '');
      setCountry((profile as any).country || '');
      setBio((profile as any).bio || '');
      setLearningGoal((profile as any).learning_goal || '');
    }
  }, [user, profile]);

  /* ─── mark step complete ─── */
  const markComplete = useCallback(async (key: string) => {
    if (!user || completedItems.has(key)) return;
    const next = new Set(completedItems);
    next.add(key);
    setCompletedItems(next);

    await supabase.from('onboarding_progress').upsert({
      user_id: user.id,
      item_key: key,
      completed: true,
      completed_at: new Date().toISOString(),
    }, { onConflict: 'user_id,item_key' });

    const nextIdx = STEPS.findIndex(s => !next.has(s.id));
    if (nextIdx !== -1) setActiveStep(nextIdx);

    if (STEPS.every(s => next.has(s.id))) {
      await handleOnboardingComplete();
    }
  }, [user, completedItems]);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const pct = (videoRef.current.currentTime / videoRef.current.duration) * 100;
    setVideoProgress(pct);
    if (pct >= 90 && !completedItems.has('intro_video')) markComplete('intro_video');
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !country.trim()) {
      toast({ title: t('Bitte fülle alle Pflichtfelder aus.', 'Please fill in all required fields.'), variant: 'destructive' });
      return;
    }
    setProfileSaving(true);
    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const { error } = await supabase.from('profiles').update({
      full_name: fullName,
      phone: phone.trim(),
      country: country.trim(),
      bio: bio.trim(),
      updated_at: new Date().toISOString(),
    } as any).eq('id', user.id);
    setProfileSaving(false);
    if (error) {
      toast({ title: t('Fehler beim Speichern', 'Error saving'), variant: 'destructive' });
    } else {
      markComplete('profile_complete');
      toast({ title: t('Profil gespeichert ✓', 'Profile saved ✓') });
    }
  };

  const handleConfirmRules = () => {
    if (!rulesChecked.every(Boolean)) {
      toast({ title: t('Bitte bestätige alle Regeln.', 'Please confirm all rules.'), variant: 'destructive' });
      return;
    }
    markComplete('community_rules');
    toast({ title: t('Community-Regeln bestätigt ✓', 'Community rules confirmed ✓') });
  };

  const handleToolsComplete = () => {
    const allChecked = TOOLS_CHECKLIST.every(tc => toolsChecked[tc.key]);
    if (!allChecked) {
      toast({ title: t('Bitte bestätige alle Tools als eingerichtet.', 'Please confirm all tools as set up.'), variant: 'destructive' });
      return;
    }
    markComplete('tools_setup');
    toast({ title: t('Tools eingerichtet ✓', 'Tools set up ✓') });
  };

  const handleSaveLearningGoal = async () => {
    if (!user || !learningGoal) {
      toast({ title: t('Bitte wähle ein Lernziel.', 'Please choose a learning goal.'), variant: 'destructive' });
      return;
    }
    await supabase.from('profiles').update({
      learning_goal: learningGoal,
      updated_at: new Date().toISOString(),
    } as any).eq('id', user.id);
    markComplete('learning_goal');
    toast({ title: t('Lernziel gesetzt ✓', 'Learning goal set ✓') });
  };

  const toggleSectionRead = (idx: number) => {
    const next = new Set(sectionsRead);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    setSectionsRead(next);
    if (next.size >= START_HERE_SECTIONS.length) markComplete('start_here');
  };

  const handleOnboardingComplete = async () => {
    if (!user) return;
    setShowPromotion(true);
    await supabase.from('profiles').update({
      business_stage: 'opener',
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);
    await supabase.from('audit_logs').insert({
      action: 'onboarding_complete',
      target_user_id: user.id,
      source_type: 'system',
      after_state: { business_stage: 'opener' },
    });
    setTimeout(() => navigate('/members'), 4000);
  };

  const completed = completedItems.size;
  const progress = Math.round((completed / STEPS.length) * 100);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (showPromotion) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-[80vh] flex-col items-center justify-center px-6 text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.3 }}>
          <Sparkles className="mx-auto mb-6 h-16 w-16 text-accent" />
        </motion.div>
        <motion.h1 initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }} className="font-serif text-3xl font-bold text-foreground">
          {t('Geschafft', 'You did it')}, {firstName || profile?.full_name?.split(' ')[0] || 'Closer'}!
        </motion.h1>
        <motion.p initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.9 }} className="mt-3 text-lg text-muted-foreground">
          {t('Du bist jetzt', 'You are now')} <span className="font-semibold text-accent">Trainee</span>. {t('Dein nächster Schritt: Modul 1 starten.', 'Your next step: Start Module 1.')}
        </motion.p>
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1.4 }} className="mt-4 rounded-full bg-accent/10 px-4 py-1.5 text-sm font-medium text-accent">
          {t('Weiterleitung zum Dashboard...', 'Redirecting to dashboard...')}
        </motion.div>
      </motion.div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">Start Here</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(`Dein Onboarding in ${STEPS.length} Schritten — schließe alle ab, um als Trainee durchzustarten.`, `Your onboarding in ${STEPS.length} steps — complete all to get started as a Trainee.`)}
        </p>
      </div>

      {/* Progress */}
      <div className="mb-8 rounded-xl border border-accent/20 bg-accent/[0.03] p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-base font-semibold text-foreground">
            {t('Schritt', 'Step')} {Math.min(completed + 1, STEPS.length)} {t('von', 'of')} {STEPS.length}
          </h2>
          <span className="text-xs font-semibold text-accent">{progress}%</span>
        </div>
        <Progress value={progress} className="mb-5 h-1.5 bg-muted" />

        <div className="space-y-1">
          {STEPS.map((step, i) => {
            const isDone = completedItems.has(step.id);
            const isActive = i === activeStep && !isDone;
            return (
              <button
                key={step.id}
                onClick={() => !isDone && setActiveStep(i)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  isActive ? 'bg-accent/[0.08] ring-1 ring-accent/20' : 'hover:bg-accent/[0.04]'
                }`}
              >
                {isDone ? (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Check className="h-3.5 w-3.5" />
                  </div>
                ) : (
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                    isActive ? 'border-accent text-accent' : 'border-muted-foreground/30 text-muted-foreground/40'
                  }`}>
                    <span className="text-[10px] font-bold">{i + 1}</span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <span className={`text-[13px] font-medium ${isDone ? 'text-muted-foreground line-through' : isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {step.label[lang]}
                  </span>
                  {isActive && <p className="text-[11px] text-muted-foreground mt-0.5">{step.description[lang]}</p>}
                </div>
                {isActive && <ChevronRight className="h-4 w-4 text-accent" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Step Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeStep}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.2 }}
          className="rounded-xl border border-border/40 bg-card p-5 sm:p-6"
        >
          {/* Step 0: Video */}
          {activeStep === 0 && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <PlayCircle className="h-5 w-5 text-accent" />
                <h3 className="font-serif text-lg font-semibold text-foreground">{t('Einführungsvideo', 'Introduction Video')}</h3>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                {t(`Willkommen bei ${getProductName()} — schaue das Video bis zum Ende an (mind. 90%), um fortzufahren.`, `Welcome to ${getProductName()} — watch the video to at least 90% to continue.`)}
              </p>
              <div className="aspect-video w-full overflow-hidden rounded-lg bg-muted">
                <video ref={videoRef} className="h-full w-full object-cover" controls autoPlay onTimeUpdate={handleTimeUpdate} poster="/placeholder.svg">
                  <source src="" type="video/mp4" />
                </video>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t('Fortschritt', 'Progress')}: {Math.round(videoProgress)}%</span>
                {completedItems.has('intro_video') ? (
                  <span className="text-xs font-medium text-primary">✓ {t('Abgeschlossen', 'Completed')}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">{t('Mind. 90% ansehen', 'Watch at least 90%')}</span>
                )}
              </div>
              {!completedItems.has('intro_video') && (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => markComplete('intro_video')}>
                  {t('Video als gesehen markieren (Demo)', 'Mark video as watched (Demo)')}
                </Button>
              )}
            </div>
          )}

          {/* Step 1: Profile */}
          {activeStep === 1 && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <User className="h-5 w-5 text-accent" />
                <h3 className="font-serif text-lg font-semibold text-foreground">{t('Profil vervollständigen', 'Complete Profile')}</h3>
              </div>
              <p className="mb-5 text-sm text-muted-foreground">
                {t('Ein vollständiges Profil ist Voraussetzung für die Zusammenarbeit mit Partnern und die Community.', 'A complete profile is required for working with partners and the community.')}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="firstName">{t('Vorname *', 'First Name *')}</Label>
                  <Input id="firstName" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder={t('Max', 'John')} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="lastName">{t('Nachname *', 'Last Name *')}</Label>
                  <Input id="lastName" value={lastName} onChange={e => setLastName(e.target.value)} placeholder={t('Mustermann', 'Doe')} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="phone">{t('Telefonnummer *', 'Phone Number *')}</Label>
                  <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+49 170 123 4567" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="country">{t('Land *', 'Country *')}</Label>
                  <Input id="country" value={country} onChange={e => setCountry(e.target.value)} placeholder={t('Deutschland', 'Germany')} className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="bio">{t('Kurze Bio', 'Short Bio')}</Label>
                  <Textarea id="bio" value={bio} onChange={e => setBio(e.target.value)} placeholder={t('Erzähl uns kurz etwas über dich und deine Ziele...', 'Tell us briefly about yourself and your goals...')} className="mt-1" rows={3} />
                </div>
              </div>
              <Button onClick={handleSaveProfile} disabled={profileSaving || completedItems.has('profile_complete')} className="mt-5 bg-accent text-accent-foreground hover:bg-accent/90">
                {profileSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {completedItems.has('profile_complete') ? t('Gespeichert ✓', 'Saved ✓') : t('Profil speichern', 'Save Profile')}
              </Button>
            </div>
          )}

          {/* Step 2: Community Rules */}
          {activeStep === 2 && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <BookOpen className="h-5 w-5 text-accent" />
                <h3 className="font-serif text-lg font-semibold text-foreground">{t('Community-Regeln', 'Community Rules')}</h3>
              </div>
              <p className="mb-5 text-sm text-muted-foreground">
                {t('Unsere ethischen Standards sind das Fundament dieser Community. Bitte lies und bestätige jeden Punkt.', 'Our ethical standards are the foundation of this community. Please read and confirm each point.')}
              </p>
              <div className="space-y-3">
                {COMMUNITY_RULES.map((rule, i) => (
                  <label key={i} className="flex items-start gap-3 rounded-lg border border-border/40 p-3 transition-colors hover:bg-accent/[0.03] cursor-pointer">
                    <Checkbox
                      checked={rulesChecked[i]}
                      onCheckedChange={(checked) => {
                        const next = [...rulesChecked];
                        next[i] = !!checked;
                        setRulesChecked(next);
                      }}
                      className="mt-0.5"
                    />
                    <span className="text-sm text-foreground leading-relaxed">{rule[lang]}</span>
                  </label>
                ))}
              </div>
              <Button onClick={handleConfirmRules} disabled={completedItems.has('community_rules')} className="mt-5 bg-accent text-accent-foreground hover:bg-accent/90">
                {completedItems.has('community_rules') ? t('Bestätigt ✓', 'Confirmed ✓') : t('Regeln bestätigen', 'Confirm Rules')}
              </Button>
            </div>
          )}

          {/* Step 3: Tools Setup */}
          {activeStep === 3 && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <Phone className="h-5 w-5 text-accent" />
                <h3 className="font-serif text-lg font-semibold text-foreground">{t('Tools einrichten', 'Set Up Tools')}</h3>
              </div>
              <p className="mb-5 text-sm text-muted-foreground">
                {t('Diese Tools brauchst du für professionelle Sales-Arbeit. Richte sie jetzt ein und bestätige jeden Punkt.', 'You need these tools for professional sales work. Set them up now and confirm each item.')}
              </p>
              <div className="space-y-3">
                {TOOLS_CHECKLIST.map((tool) => (
                  <label key={tool.key} className="flex items-start gap-3 rounded-lg border border-border/40 p-3.5 transition-colors hover:bg-accent/[0.03] cursor-pointer">
                    <Checkbox
                      checked={!!toolsChecked[tool.key]}
                      onCheckedChange={(checked) => setToolsChecked(prev => ({ ...prev, [tool.key]: !!checked }))}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-medium text-foreground">{tool.label[lang]}</span>
                      <p className="text-[12px] text-muted-foreground mt-0.5">{tool.desc[lang]}</p>
                    </div>
                  </label>
                ))}
              </div>
              <Button onClick={handleToolsComplete} disabled={completedItems.has('tools_setup')} className="mt-5 bg-accent text-accent-foreground hover:bg-accent/90">
                {completedItems.has('tools_setup') ? t('Eingerichtet ✓', 'Set Up ✓') : t('Alle Tools bestätigen', 'Confirm All Tools')}
              </Button>
            </div>
          )}

          {/* Step 4: Learning Goal */}
          {activeStep === 4 && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <Target className="h-5 w-5 text-accent" />
                <h3 className="font-serif text-lg font-semibold text-foreground">{t('Dein erstes Lernziel', 'Your First Learning Goal')}</h3>
              </div>
              <p className="mb-5 text-sm text-muted-foreground">
                {t('Setze dir einen klaren Zeithorizont. Wann möchtest du deine Zertifizierung abschließen?', 'Set a clear time horizon. When do you want to complete your certification?')}
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { value: '30_days', label: t('30 Tage', '30 Days'), desc: t('Intensiv & fokussiert', 'Intensive & focused') },
                  { value: '60_days', label: t('60 Tage', '60 Days'), desc: t('Gleichmäßiges Tempo', 'Steady pace') },
                  { value: '90_days', label: t('90 Tage', '90 Days'), desc: t('Neben dem Beruf', 'Alongside your job') },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setLearningGoal(opt.value)}
                    className={`rounded-xl border p-4 text-left transition-all ${
                      learningGoal === opt.value
                        ? 'border-accent bg-accent/[0.06] ring-1 ring-accent/30'
                        : 'border-border/40 hover:border-accent/30 hover:bg-accent/[0.02]'
                    }`}
                  >
                    <span className="text-base font-semibold text-foreground">{opt.label}</span>
                    <p className="text-[12px] text-muted-foreground mt-1">{opt.desc}</p>
                  </button>
                ))}
              </div>
              <Button onClick={handleSaveLearningGoal} disabled={completedItems.has('learning_goal')} className="mt-5 bg-accent text-accent-foreground hover:bg-accent/90">
                {completedItems.has('learning_goal') ? t('Gespeichert ✓', 'Saved ✓') : t('Lernziel speichern', 'Save Learning Goal')}
              </Button>
            </div>
          )}

          {/* Step 5: Platform Guide */}
          {activeStep === 5 && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <FileText className="h-5 w-5 text-accent" />
                <h3 className="font-serif text-lg font-semibold text-foreground">{t('Plattform-Guide', 'Platform Guide')}</h3>
              </div>
              <p className="mb-5 text-sm text-muted-foreground">
                {t('Lies jeden Abschnitt durch und markiere ihn als gelesen. So verstehst du, wie alles zusammenhängt.', 'Read each section and mark it as read. This helps you understand how everything fits together.')}
              </p>
              <div className="space-y-2">
                {START_HERE_SECTIONS.map((section, i) => {
                  const Icon = section.icon;
                  const isRead = sectionsRead.has(i);
                  return (
                    <button
                      key={i}
                      onClick={() => toggleSectionRead(i)}
                      className={`flex w-full items-center gap-3.5 rounded-lg border p-3.5 text-left transition-all ${
                        isRead
                          ? 'border-primary/20 bg-primary/[0.04]'
                          : 'border-border/40 hover:border-accent/30 hover:bg-accent/[0.02]'
                      }`}
                    >
                      {isRead ? (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                      ) : (
                        <Icon className="h-5 w-5 shrink-0 text-muted-foreground/60" />
                      )}
                      <div className="min-w-0 flex-1">
                        <span className={`text-sm font-medium ${isRead ? 'text-foreground' : 'text-foreground'}`}>
                          {section.title[lang]}
                        </span>
                        <p className="text-[12px] text-muted-foreground mt-0.5">{section.description[lang]}</p>
                      </div>
                      {isRead && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{sectionsRead.size} / {START_HERE_SECTIONS.length} {t('gelesen', 'read')}</span>
                {sectionsRead.size >= START_HERE_SECTIONS.length && (
                  <span className="font-medium text-primary">— {t('Alle gelesen ✓', 'All read ✓')}</span>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
