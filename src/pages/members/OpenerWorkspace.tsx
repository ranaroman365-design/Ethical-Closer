import { useEffect, useState, useMemo } from 'react';
import { WhatsAppButton } from '@/components/leads/WhatsAppButton';
import { PRODUCT } from '@/config/product';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/hooks/useAuth';
import { useAcademyData } from '@/hooks/useAcademyData';
import { supabase } from '@/integrations/supabase/client';
import {
  Phone, ArrowRight, Timer, CheckCircle2, XCircle, RotateCcw,
  UserPlus, AlertTriangle, Zap, Instagram, Linkedin, Globe,
  MessageCircle, Users, TrendingUp, Copy, BookOpen, Sparkles, Target, Play,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/LanguageContext';
import { Link, useNavigate } from 'react-router-dom';
import WorkspaceAnalytics from '@/components/members/WorkspaceAnalytics';

/* ─── Types ─── */
interface LeadRecord {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  stage: string;
  source: string;
  quiz_score: number | null;
  contact_count: number;
  first_action_at: string | null;
  last_action_at: string | null;
  timer_expires_at: string | null;
  setter_notes: string | null;
  setter_id: string | null;
  owner_id: string | null;
  qualification_checklist: Record<string, boolean> | null;
  [key: string]: any;
}

/* ─── Orientation Data ─── */
const ORIENTATION = {
  de: [
    { title: `Willkommen bei ${PRODUCT.name}`, desc: 'Verstehe das System, die Philosophie und deinen Weg.', to: '/members/start', icon: Sparkles },
    { title: 'Opener-Grundlagen', desc: 'Lerne die Basics des Openings und der ersten Kontaktaufnahme.', to: '/members/academy', icon: BookOpen },
    { title: 'Global Closer Network', desc: 'Vernetze dich mit anderen Trainees und lerne im Team.', to: '/members/community', icon: Users },
    { title: 'Erstes Lernziel setzen', desc: 'Setze dir ein konkretes Ziel für die nächsten 30 Tage.', to: '/members/start', icon: Target },
  ],
  en: [
    { title: `Welcome to ${PRODUCT.name}`, desc: 'Understand the system, philosophy, and your path.', to: '/members/start', icon: Sparkles },
    { title: 'Opener Fundamentals', desc: 'Learn the basics of opening and initial contact.', to: '/members/academy', icon: BookOpen },
    { title: 'Global Closer Network', desc: 'Connect with other trainees and learn as a team.', to: '/members/community', icon: Users },
    { title: 'Set Your First Goal', desc: 'Set a concrete goal for the next 30 days.', to: '/members/start', icon: Target },
  ],
};

/* ─── Constants ─── */
const OPENER_STAGES = ['new', 'in_pool', 'assigned_setter'];

const STAGE_LABELS: Record<string, { de: string; en: string }> = {
  new: { de: 'Neuer Lead', en: 'New Lead' },
  in_pool: { de: 'Kontaktiert', en: 'Contacted' },
  assigned_setter: { de: 'An Setter übergeben', en: 'Handed to Setter' },
};

const LEAD_SOURCES = [
  { key: 'warm', labelDe: 'Warm (Inbound)', labelEn: 'Warm (Inbound)', icon: Zap, color: 'text-amber-500' },
  { key: 'cold', labelDe: 'Cold (Outbound)', labelEn: 'Cold (Outbound)', icon: Phone, color: 'text-blue-400' },
  { key: 'self_sourced', labelDe: 'Self-Sourced', labelEn: 'Self-Sourced', icon: Users, color: 'text-emerald-500' },
];

const SCRIPTS = {
  de: [
    { title: 'Erstkontakt (Cold)', content: '"Hey [Name], ich bin [Dein Name] von [Firma]. Mir ist aufgefallen, dass du [Kontext]. Kurze Frage – hast du gerade 2 Minuten?"' },
    { title: 'Follow-Up', content: '"Hey [Name], wir hatten letzte Woche kurz gesprochen. Wollte mich kurz melden – hast du dir schon Gedanken gemacht?"' },
    { title: 'Qualifizierung', content: '"Was ist gerade deine größte Herausforderung in dem Bereich? Und was hast du bisher versucht?"' },
    { title: 'Termin-Closing', content: '"Basierend auf dem, was du gesagt hast, glaube ich dass ein kurzes Gespräch mit [Setter] dir wirklich helfen kann. Ich kann dir [Tag] um [Uhrzeit] anbieten – passt das?"' },
  ],
  en: [
    { title: 'First Contact (Cold)', content: '"Hey [Name], I\'m [Your Name] from [Company]. I noticed you [Context]. Quick question – do you have 2 minutes?"' },
    { title: 'Follow-Up', content: '"Hey [Name], we briefly spoke last week. Just checking in – have you had a chance to think about it?"' },
    { title: 'Qualification', content: '"What\'s your biggest challenge in that area right now? And what have you tried so far?"' },
    { title: 'Booking Close', content: '"Based on what you said, I believe a quick call with [Setter] would really help you. I can offer [Day] at [Time] – does that work?"' },
  ],
};

const LEAD_SOURCE_GUIDE = {
  de: [
    { platform: 'Instagram', icon: Instagram, tips: ['Content + DM Outreach', 'Story Replies → Gespräch', 'Kommentare → DM'] },
    { platform: 'LinkedIn', icon: Linkedin, tips: ['Profiloptimierung', 'Connection Requests + Value Message', 'Content Engagement → DM'] },
    { platform: 'Facebook Gruppen', icon: Globe, tips: ['Wertvolle Kommentare', 'Gruppenmitglieder → DM', 'Eigene Beiträge mit CTA'] },
    { platform: 'Empfehlungen', icon: Users, tips: ['Bestehende Kontakte fragen', 'Referral-Programm nutzen', 'Warm Introductions'] },
  ],
  en: [
    { platform: 'Instagram', icon: Instagram, tips: ['Content + DM Outreach', 'Story Replies → Conversation', 'Comments → DM'] },
    { platform: 'LinkedIn', icon: Linkedin, tips: ['Profile Optimization', 'Connection Requests + Value Message', 'Content Engagement → DM'] },
    { platform: 'Facebook Groups', icon: Globe, tips: ['Valuable comments', 'Group members → DM', 'Own posts with CTA'] },
    { platform: 'Referrals', icon: Users, tips: ['Ask existing contacts', 'Use referral program', 'Warm Introductions'] },
  ],
};

export default function OpenerWorkspace() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const { modules, progress } = useAcademyData();
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState<LeadRecord | null>(null);

  const completedModules = progress.filter(p => p.completed).length;
  const totalModules = modules.length;
  const progressPercent = totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0;

  const tl = (de: string, en: string) => lang === 'de' ? de : en;

  useEffect(() => {
    if (!user) return;
    supabase.from('leads').select('*').eq('owner_id', user.id)
      .in('stage', OPENER_STAGES)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setLeads((data as LeadRecord[]) ?? []);
        setLoading(false);
      });
  }, [user]);

  const stats = useMemo(() => ({
    total: leads.length,
    new: leads.filter(l => l.stage === 'new').length,
    contacted: leads.filter(l => l.stage === 'in_pool').length,
    handed: leads.filter(l => l.stage === 'assigned_setter').length,
    selfSourced: leads.filter(l => l.source === 'self_sourced').length,
  }), [leads]);

  const transition = async (lead: LeadRecord, newStage: string) => {
    const now = new Date().toISOString();
    const updates: Record<string, any> = { stage: newStage, updated_at: now, last_action_at: now };
    if (newStage === 'in_pool') {
      if (!lead.first_action_at) updates.first_action_at = now;
      updates.contact_count = (lead.contact_count || 0) + 1;
    }
    const { error } = await supabase.from('leads').update(updates as any).eq('id', lead.id);
    if (!error) {
      await supabase.from('lead_transitions').insert({ lead_id: lead.id, previous_stage: lead.stage, new_stage: newStage, changed_by: user!.id });
      const updated = { ...lead, ...updates } as LeadRecord;
      setLeads(prev => prev.map(l => l.id === lead.id ? updated : l));
      toast({ title: `→ ${STAGE_LABELS[newStage]?.[lang] || newStage}` });
    }
  };

  const saveNotes = async (lead: LeadRecord) => {
    await supabase.from('leads').update({ setter_notes: notes }).eq('id', lead.id);
    toast({ title: tl('Notizen gespeichert', 'Notes saved') });
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const orientationItems = lang === 'de' ? ORIENTATION.de : ORIENTATION.en;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          Opener Workspace
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tl(
            'Dein Startpunkt – Orientierung, Grundlagen und operative Praxis als Sales Opener.',
            'Your starting point – orientation, fundamentals, and hands-on practice as a Sales Opener.'
          )}
        </p>
      </div>

      {/* ─── ORIENTATION SECTION ─── */}
      <div className="rounded-xl border border-border/40 bg-card p-5 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {tl('Orientierung & Einstieg', 'Orientation & Getting Started')}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {tl('Die ersten Schritte auf deinem Weg.', 'Your first steps on the path.')}
          </p>
        </div>

        {/* Progress */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-foreground">{tl('Dein Fortschritt', 'Your Progress')}</p>
            <span className="text-[10px] text-muted-foreground">{completedModules} / {totalModules} {tl('Module', 'Modules')}</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {progressPercent < 100
              ? tl(`Noch ${totalModules - completedModules} Module bis zur nächsten Stufe.`, `${totalModules - completedModules} modules to the next level.`)
              : tl('Alle Module abgeschlossen – bereit für die Zertifizierung.', 'All modules completed – ready for certification.')}
          </p>
        </div>

        {/* 4 Orientation Tiles */}
        <div className="grid gap-3 sm:grid-cols-2">
          {orientationItems.map((item, i) => (
            <Link
              key={i}
              to={item.to}
              className="group flex items-start gap-3 rounded-xl border border-border/40 bg-background p-4 transition-all hover:border-primary/30 hover:shadow-sm"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <item.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-foreground group-hover:text-primary transition-colors">{item.title}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50 group-hover:text-primary transition-colors mt-0.5" />
            </Link>
          ))}
        </div>

        {/* Quick Start CTA */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex items-center gap-4">
          <Play className="h-8 w-8 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">{tl('Bereit loszulegen?', 'Ready to start?')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{tl('Starte jetzt mit deinem ersten Modul in der Academy.', 'Start your first module in the Academy now.')}</p>
          </div>
          <Link
            to="/members/academy"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
          >
            Academy <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* ─── OPERATIVE WORKSPACE ─── */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-4">
          {tl('Operative Arbeit', 'Operations')}
        </h2>

        {/* KPI Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: tl('Gesamt', 'Total'), value: stats.total },
            { label: tl('Neu', 'New'), value: stats.new },
            { label: tl('Kontaktiert', 'Contacted'), value: stats.contacted },
            { label: tl('Übergeben', 'Handed Off'), value: stats.handed },
            { label: 'Self-Sourced', value: stats.selfSourced },
          ].map(s => (
            <div key={s.label} className="rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-2xl font-semibold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        <Tabs defaultValue="kanban" className="space-y-6">
          <TabsList className="bg-muted/30 border border-border">
            <TabsTrigger value="kanban">Leads</TabsTrigger>
            <TabsTrigger value="sources">{tl('Lead-Quellen', 'Lead Sources')}</TabsTrigger>
            <TabsTrigger value="scripts">Scripts & Templates</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="simulator" onClick={() => navigate('/members/opener-simulator')}>Simulator</TabsTrigger>
          </TabsList>

          {/* ─── KANBAN TAB ─── */}
          <TabsContent value="kanban">
            {leads.length === 0 ? (
              <div className="rounded-lg border border-border bg-card py-16 text-center">
                <Phone className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {tl('Keine Leads zugewiesen.', 'No leads assigned.')}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {['new', 'in_pool', 'assigned_setter'].map(stage => {
                  const stageLeads = leads.filter(l => l.stage === stage);
                  if (stageLeads.length === 0) return null;
                  return (
                    <div key={stage}>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        {STAGE_LABELS[stage]?.[lang] || stage}
                        <span className="ml-2 text-muted-foreground/50">({stageLeads.length})</span>
                      </h3>
                      <div className="rounded-lg border border-border bg-card divide-y divide-border/50">
                        {stageLeads.map(lead => (
                          <div key={lead.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors">
                            <button onClick={() => { setSelected(lead); setNotes(lead.setter_notes || ''); }} className="text-left flex-1">
                              <p className="text-sm font-medium text-foreground">{lead.name}</p>
                              <p className="text-xs text-muted-foreground">{lead.email || lead.phone || '—'}</p>
                              {lead.source === 'self_sourced' && (
                                <Badge variant="outline" className="mt-1 text-[9px] border-emerald-500/30 text-emerald-500">Self-Sourced · €500</Badge>
                              )}
                            </button>
                            <WhatsAppButton phone={lead.phone} leadName={lead.name} leadId={lead.id} compact sourceComponent="OpenerWorkspace" />
                            <div className="flex items-center gap-2">
                              {lead.stage === 'new' && (
                                <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => transition(lead, 'in_pool')}>
                                  <Phone className="mr-1 h-3 w-3" />
                                  {tl('Kontaktieren', 'Contact')}
                                </Button>
                              )}
                              {lead.stage === 'in_pool' && (
                                <Button size="sm" className="h-7 text-[11px]" onClick={() => transition(lead, 'assigned_setter')}>
                                  <UserPlus className="mr-1 h-3 w-3" />
                                  {tl('An Setter', 'To Setter')}
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Detail Panel */}
                {selected && (
                  <div className="rounded-lg border border-border bg-card p-6 mt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-serif text-lg font-semibold text-foreground">{selected.name}</h3>
                        <div className="flex gap-2 mt-1 text-sm text-muted-foreground">
                          {selected.email && <span>{selected.email}</span>}
                          {selected.phone && <span>· {selected.phone}</span>}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="rounded-md bg-muted/20 px-3 py-2">
                        <p className="text-[10px] text-muted-foreground">{tl('Kontakte', 'Contacts')}</p>
                        <p className="text-lg font-semibold text-foreground">{selected.contact_count || 0}</p>
                      </div>
                      <div className="rounded-md bg-muted/20 px-3 py-2">
                        <p className="text-[10px] text-muted-foreground">{tl('Quelle', 'Source')}</p>
                        <p className="text-sm font-medium text-foreground">{selected.source}</p>
                      </div>
                      <div className="rounded-md bg-muted/20 px-3 py-2">
                        <p className="text-[10px] text-muted-foreground">Score</p>
                        <p className="text-lg font-semibold text-foreground">{selected.quiz_score ?? '—'}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        {tl('Notizen', 'Notes')}
                      </p>
                      <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="min-h-[100px] text-sm" placeholder={tl('Gesprächsnotizen…', 'Call notes…')} />
                      <Button variant="outline" size="sm" className="mt-2 text-xs" onClick={() => saveNotes(selected)}>
                        {tl('Speichern', 'Save')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* ─── LEAD SOURCES TAB ─── */}
          <TabsContent value="sources">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(lang === 'de' ? LEAD_SOURCE_GUIDE.de : LEAD_SOURCE_GUIDE.en).map(source => (
                <div key={source.platform} className="rounded-lg border border-border bg-card p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <source.icon className="h-5 w-5 text-muted-foreground" />
                    <h3 className="font-serif text-sm font-semibold text-foreground">{source.platform}</h3>
                  </div>
                  <ul className="space-y-1.5">
                    {source.tips.map((tip, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <ArrowRight className="h-3 w-3 mt-1 shrink-0 text-primary/50" />
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Self-Sourced Premium */}
            <div className="mt-6 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-5">
              <div className="flex items-center gap-3 mb-2">
                <Zap className="h-5 w-5 text-emerald-500" />
                <h3 className="font-serif text-sm font-semibold text-foreground">
                  {tl('Self-Sourced Leads – Premium Vergütung', 'Self-Sourced Leads – Premium Commission')}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                {tl(
                  'Leads, die du selbst generierst, werden mit €500 pro geschlossenem Deal vergütet.',
                  'Leads you generate yourself earn €500 per closed deal.'
                )}
              </p>
              <div className="flex gap-4 text-xs text-muted-foreground/70">
                <span>1 Close = €500</span>
                <span>3 Closes = €1.500</span>
                <span>5 Closes = €2.500</span>
              </div>
            </div>
          </TabsContent>

          {/* ─── SCRIPTS TAB ─── */}
          <TabsContent value="scripts">
            <div className="space-y-4">
              {(lang === 'de' ? SCRIPTS.de : SCRIPTS.en).map((script, i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-serif text-sm font-semibold text-foreground">{script.title}</h3>
                    <Button variant="ghost" size="sm" className="h-7 text-[11px] text-muted-foreground"
                      onClick={() => { navigator.clipboard.writeText(script.content); toast({ title: tl('Kopiert', 'Copied') }); }}>
                      <Copy className="mr-1 h-3 w-3" />
                      {tl('Kopieren', 'Copy')}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground italic leading-relaxed">{script.content}</p>
                </div>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="analytics">
            <WorkspaceAnalytics roleOverride="opener" />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
