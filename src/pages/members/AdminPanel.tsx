import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { MEMBER_STATUS_LABELS, MEMBER_STATUSES, CERT_STATUS_LABELS, CERT_STATUSES } from '@/types/members';
import {
  Users, BookOpen, Award, Briefcase, Megaphone,
  Settings, Plus, X, CheckCircle2, BarChart3, Video, Mic, Link as LinkIcon, Save,
  Mail, Copy, Trash2, Eye, EyeOff, ChevronDown, ChevronUp, Shield, UserPlus, TrendingUp, Gift, CreditCard,
  DollarSign, Calendar, History as HistoryIcon,
} from 'lucide-react';
import AdminVideoRecorder from '@/components/members/AdminVideoRecorder';
import AdminCommunicationToggles from '@/components/members/AdminCommunicationToggles';
import PromotionQueue from '@/components/members/PromotionQueue';
import PlacementAdmin from '@/components/members/PlacementAdmin';
import MentorAssignmentManager from '@/components/members/MentorAssignmentManager';
import MentorControlPanel from '@/components/admin/MentorControlPanel';
import BenefitsAdmin from '@/components/members/BenefitsAdmin';
import ReferralsAdmin from '@/components/members/ReferralsAdmin';
import ReferralStatusAudit from '@/components/members/ReferralStatusAudit';
import ApplicantScoringAdmin from '@/components/members/ApplicantScoringAdmin';
import PerformanceRankingAdmin from '@/components/members/PerformanceRankingAdmin';
import LiveCallsAdmin from '@/components/members/LiveCallsAdmin';
import AcademyContentAdmin from '@/components/members/AcademyContentAdmin';
import ChatModerationAdmin from '@/components/members/ChatModerationAdmin';
import InlineContentEditor from '@/components/members/InlineContentEditor';
import AdminSystemOverview from '@/components/admin/AdminSystemOverview';
import AdminFeatureControls from '@/components/admin/AdminFeatureControls';
import ForcePromotionPanel from '@/components/admin/ForcePromotionPanel';
import SupportTeamAdmin from '@/components/admin/SupportTeamAdmin';
import AdminCreditsPanel from '@/components/admin/AdminCreditsPanel';
import CertificationAdmin from '@/components/admin/CertificationAdmin';
import EmployerAdmin from '@/components/admin/EmployerAdmin';
import PaymentReadinessPanel from '@/components/admin/PaymentReadinessPanel';
import PricingAdmin from '@/components/admin/PricingAdmin';
import KpiVerificationAdmin from '@/components/admin/KpiVerificationAdmin';
import BookingConfirmationAdmin from '@/components/admin/BookingConfirmationAdmin';
import AdminAppointmentMonitor from '@/components/admin/AdminAppointmentMonitor';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useBrandConfig } from '@/hooks/useBrandConfig';

interface ProfileRow {
  id: string; email: string | null; full_name: string | null;
  current_phase: number; certified: boolean; placement_ready: boolean;
  onboarding_completed: boolean; member_status: string; certification_status: string; cohort: string | null;
  business_stage?: string;
  realtime_simulator_enabled?: boolean;
}
interface ModuleRow { id: string; title: string; description: string | null; phase_id: number; sort_order: number; video_url: string | null; worksheet_url: string | null; }
interface AnnouncementRow { id: string; title: string; content: string; published: boolean; created_at: string; }
interface OpportunityRow { id: string; company: string; industry: string; offer_type: string; commission_model: string; call_volume: string; status: string; }
interface InviteRow { id: string; email: string; token: string; initial_stage: string | null; used: boolean; expires_at: string; created_at: string; }
interface AuditRow { id: string; action: string; actor_id: string | null; target_user_id: string | null; source_type: string | null; note: string | null; created_at: string; before_state: any; after_state: any; }

type Tab = 'overview' | 'feature_controls' | 'members' | 'modules' | 'announcements' | 'opportunities' | 'kpis' | 'invites' | 'audit' | 'promotions' | 'mentors' | 'benefits' | 'referrals' | 'referrals_audit' | 'scoring' | 'performance' | 'live_calls' | 'academy_content' | 'chat_moderation' | 'content_editor' | 'communication' | 'force_promotion' | 'support_team' | 'credits' | 'certification' | 'employer' | 'kpi_verification' | 'payment_email' | 'pricing' | 'booking_confirm' | 'appointment_monitor';

const DEFAULT_STAGE_LABELS: Record<string, string> = { prospect: 'L0 Bewerber', opener: 'L1 Trainee', setter: 'L2 Associate Setter', senior_associate: 'L3 Senior Setter', junior_manager: 'L4 Closer (Placement Track)', manager: 'L5 Managing Closer', senior_manager: 'L6 Senior Closer', director: 'L7 Director', partner: 'L8 Partner', inner_circle: 'Inner Circle' };

function InviteStageSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { levels } = useBrandConfig();
  const options = levels.length > 0
    ? levels.filter(l => l.level >= 1).map(l => ({ value: l.key, label: `L${l.level} — ${l.de}` }))
    : [
        { value: 'opener', label: 'L1 — Opener' },
        { value: 'setter', label: 'L2 — Setter' },
        { value: 'senior_associate', label: 'L3 — Closer' },
        { value: 'junior_manager', label: 'L4 — Placement' },
        { value: 'manager', label: 'L5 — Advanced Lab' },
        { value: 'senior_manager', label: 'L6 — Community' },
        { value: 'director', label: 'L7 — Director' },
        { value: 'partner', label: 'L8 — Partner' },
      ];
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-2 text-[12px]">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

const STAGE_LABELS = DEFAULT_STAGE_LABELS;

export default function AdminPanel() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<ProfileRow[]>([]);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [memberRoles, setMemberRoles] = useState<Record<string, string>>({});

  const [showAnnForm, setShowAnnForm] = useState(false);
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [annSaving, setAnnSaving] = useState(false);

  const [showOppForm, setShowOppForm] = useState(false);
  const [oppForm, setOppForm] = useState({ company: '', industry: '', offer_type: '', commission_model: '', call_volume: '' });
  const [oppSaving, setOppSaving] = useState(false);
  const [editingModule, setEditingModule] = useState<ModuleRow | null>(null);
  const [moduleVideoUrl, setModuleVideoUrl] = useState('');
  const [moduleWorksheetUrl, setModuleWorksheetUrl] = useState('');
  const [showRecorder, setShowRecorder] = useState<'video' | 'audio' | null>(null);

  // User creation state
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', full_name: '', role: 'member', business_stage: 'opener' });
  const [creatingUser, setCreatingUser] = useState(false);

  // Invite state
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStage, setInviteStage] = useState('opener');
  const [inviteSaving, setInviteSaving] = useState(false);

  // Member detail
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [m, mod, ann, opp, inv, audit, roles] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name, current_phase, certified, placement_ready, onboarding_completed, member_status, certification_status, cohort, business_stage, realtime_simulator_enabled').order('created_at'),
      supabase.from('modules').select('id, title, description, phase_id, sort_order, video_url, worksheet_url').order('phase_id').order('sort_order'),
      supabase.from('announcements').select('*').order('created_at', { ascending: false }),
      supabase.from('placement_opportunities').select('*').order('created_at', { ascending: false }),
      supabase.from('invite_tokens').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('user_roles').select('user_id, role'),
    ]);
    setMembers((m.data as ProfileRow[]) ?? []);
    setModules((mod.data as ModuleRow[]) ?? []);
    setAnnouncements((ann.data as AnnouncementRow[]) ?? []);
    setOpportunities((opp.data as OpportunityRow[]) ?? []);
    setInvites((inv.data as InviteRow[]) ?? []);
    setAuditLogs((audit.data as AuditRow[]) ?? []);
    const rolesMap: Record<string, string> = {};
    ((roles.data as any[]) ?? []).forEach(r => { rolesMap[r.user_id] = r.role; });
    setMemberRoles(rolesMap);
    setLoading(false);
  }

  async function updateMemberField(id: string, field: string, value: any) {
    const update: any = { [field]: value, updated_at: new Date().toISOString() };
    if (field === 'certification_status' && value === 'certified') update.certified = true;
    if (field === 'certification_status' && value === 'failed') update.certified = false;
    if (field === 'member_status' && value === 'placement_ready') update.placement_ready = true;
    await supabase.from('profiles').update(update).eq('id', id);
    setMembers(prev => prev.map(m => m.id === id ? { ...m, ...update } : m));
    toast({ title: 'Aktualisiert' });
  }

  async function toggleCertified(id: string, current: boolean) {
    await supabase.from('profiles').update({ certified: !current, certification_status: !current ? 'certified' : 'not_started', updated_at: new Date().toISOString() }).eq('id', id);
    setMembers(prev => prev.map(m => m.id === id ? { ...m, certified: !current, certification_status: !current ? 'certified' : 'not_started' } : m));
    toast({ title: !current ? 'Zertifizierung erteilt' : 'Zertifizierung entzogen' });
  }

  async function togglePlacementReady(id: string, current: boolean) {
    await supabase.from('profiles').update({ placement_ready: !current, updated_at: new Date().toISOString() }).eq('id', id);
    setMembers(prev => prev.map(m => m.id === id ? { ...m, placement_ready: !current } : m));
  }

  async function toggleRealtimeSimulator(id: string, current: boolean) {
    await supabase.from('profiles').update({ realtime_simulator_enabled: !current, updated_at: new Date().toISOString() } as any).eq('id', id);
    setMembers(prev => prev.map(m => m.id === id ? { ...m, realtime_simulator_enabled: !current } : m));
  }

  async function createAnnouncement() {
    if (!annTitle.trim()) return;
    setAnnSaving(true);
    const { data, error } = await supabase.from('announcements').insert({ title: annTitle.trim(), content: annContent.trim(), published: true }).select().single();
    setAnnSaving(false);
    if (error) { toast({ title: 'Fehler', description: error.message }); return; }
    setAnnouncements(prev => [data as AnnouncementRow, ...prev]);
    setAnnTitle(''); setAnnContent(''); setShowAnnForm(false);
    toast({ title: 'Ankündigung veröffentlicht' });
  }

  async function toggleAnnPublished(id: string, current: boolean) {
    await supabase.from('announcements').update({ published: !current }).eq('id', id);
    setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, published: !current } : a));
  }

  async function deleteAnnouncement(id: string) {
    await supabase.from('announcements').delete().eq('id', id);
    setAnnouncements(prev => prev.filter(a => a.id !== id));
  }

  async function createOpportunity() {
    if (!oppForm.company.trim()) return;
    setOppSaving(true);
    const { data, error } = await supabase.from('placement_opportunities').insert({ ...oppForm, status: 'open' }).select().single();
    setOppSaving(false);
    if (error) { toast({ title: 'Fehler', description: error.message }); return; }
    setOpportunities(prev => [data as OpportunityRow, ...prev]);
    setOppForm({ company: '', industry: '', offer_type: '', commission_model: '', call_volume: '' });
    setShowOppForm(false);
    toast({ title: 'Opportunity erstellt' });
  }

  async function deleteOpportunity(id: string) {
    const { error } = await supabase.from('placement_opportunities').delete().eq('id', id);
    if (error) { toast({ title: 'Fehler', description: error.message, variant: 'destructive' }); return; }
    setOpportunities(prev => prev.filter(o => o.id !== id));
    toast({ title: 'Opportunity gelöscht' });
  }

  async function saveModuleContent(mod: ModuleRow) {
    const { error } = await supabase.from('modules').update({
      video_url: moduleVideoUrl || null,
      worksheet_url: moduleWorksheetUrl || null,
    }).eq('id', mod.id);
    if (error) { toast({ title: 'Fehler', description: error.message, variant: 'destructive' }); return; }
    setModules(prev => prev.map(m => m.id === mod.id ? { ...m, video_url: moduleVideoUrl || null, worksheet_url: moduleWorksheetUrl || null } : m));
    setEditingModule(null);
    toast({ title: 'Modul-Inhalt aktualisiert' });
  }

  async function createInvite() {
    if (!inviteEmail.trim()) return;
    setInviteSaving(true);
    const token = crypto.randomUUID().replace(/-/g, '');
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase.from('invite_tokens').insert({
      email: inviteEmail.trim().toLowerCase(),
      token,
      initial_stage: inviteStage,
      expires_at: expires,
    }).select().single();
    setInviteSaving(false);
    if (error) { toast({ title: 'Fehler', description: error.message, variant: 'destructive' }); return; }
    setInvites(prev => [data as InviteRow, ...prev]);
    setInviteEmail(''); setInviteStage('opener'); setShowInviteForm(false);
    const link = `${window.location.origin}/members/register?token=${token}`;
    await navigator.clipboard.writeText(link);
    toast({ title: 'Einladung erstellt & Link kopiert', description: link });
  }

  async function deleteInvite(id: string) {
    await supabase.from('invite_tokens').delete().eq('id', id);
    setInvites(prev => prev.filter(i => i.id !== id));
  }

  async function evaluateThresholds(userId: string) {
    const { data, error } = await supabase.functions.invoke('evaluate-thresholds', { body: { user_id: userId } });
    if (error) { toast({ title: 'Fehler', description: error.message, variant: 'destructive' }); return; }
    if (data?.results?.some((r: any) => r.promoted_to)) {
      toast({ title: 'Stage Promotion!', description: `User wurde befördert.` });
      loadAll();
    } else {
      toast({ title: 'Evaluation abgeschlossen', description: 'Keine Promotion. Bedingungen noch nicht erfüllt.' });
    }
  }

  const tabGroups: { group: string; tabs: { key: Tab; label: string; icon: typeof Users }[] }[] = [
    { group: 'SYSTEM', tabs: [
      { key: 'overview', label: 'Übersicht', icon: BarChart3 },
      { key: 'feature_controls', label: 'Feature Controls', icon: Settings },
      { key: 'audit', label: 'Audit Log', icon: Shield },
      { key: 'communication', label: 'Kommunikation', icon: Settings },
      { key: 'payment_email', label: 'Payment & Email', icon: CreditCard },
      { key: 'pricing', label: 'Preise', icon: DollarSign },
      { key: 'booking_confirm', label: 'Buchungen', icon: CheckCircle2 },
      { key: 'appointment_monitor', label: 'Termine', icon: Calendar },
    ]},
    { group: 'NUTZER', tabs: [
      { key: 'members', label: 'Mitglieder', icon: Users },
      { key: 'invites', label: 'Einladungen', icon: Mail },
      { key: 'promotions', label: 'Promotions', icon: TrendingUp },
      { key: 'force_promotion', label: 'Force Promotion', icon: TrendingUp },
      { key: 'credits', label: 'Credits', icon: Gift },
      { key: 'mentors', label: 'Mentoren', icon: UserPlus },
      { key: 'support_team', label: 'Begleit-Team', icon: Users },
    ]},
    { group: 'ZERTIFIZIERUNG', tabs: [
      { key: 'certification', label: 'Zertifizierung', icon: Award },
      { key: 'kpi_verification', label: 'KPI Review', icon: BarChart3 },
      { key: 'kpis', label: 'KPI Übersicht', icon: BarChart3 },
    ]},
    { group: 'EMPLOYER', tabs: [
      { key: 'employer', label: 'Employer System', icon: Briefcase },
    ]},
    { group: 'CONTENT', tabs: [
      { key: 'modules', label: 'Module', icon: BookOpen },
      { key: 'academy_content', label: 'Academy Links', icon: LinkIcon },
      { key: 'content_editor', label: 'Inhalte', icon: Save },
      { key: 'announcements', label: 'Ankündigungen', icon: Megaphone },
    ]},
    { group: 'PERFORMANCE', tabs: [
      { key: 'opportunities', label: 'Placement', icon: Briefcase },
      { key: 'scoring', label: 'Scoring', icon: BarChart3 },
      { key: 'performance', label: 'Rankings', icon: TrendingUp },
      { key: 'benefits', label: 'Benefits', icon: Gift },
      { key: 'referrals', label: 'Referrals', icon: Users },
      { key: 'referrals_audit', label: 'Referral Audit', icon: HistoryIcon },
      { key: 'live_calls', label: 'Live Calls', icon: Video },
      { key: 'chat_moderation', label: 'Chat', icon: Megaphone },
    ]},
  ];

  if (loading) {
    return <div className="mx-auto max-w-5xl px-5 py-8 lg:px-10 space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-12 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  const certifiedCount = members.filter(m => m.certified).length;
  const placementReadyCount = members.filter(m => m.placement_ready).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">Admin Control Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">Zentrales Steuerungspanel für die gesamte Plattform.</p>
        </div>
        <Badge className="bg-accent/15 text-accent border-0 text-[11px]"><Settings className="mr-1 h-3 w-3" />Admin</Badge>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Mitglieder', value: members.length },
          { label: 'Zertifiziert', value: certifiedCount },
          { label: 'Placement Ready', value: placementReadyCount },
          { label: 'Einladungen', value: invites.filter(i => !i.used).length },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border/40 bg-card p-4 text-center">
            <p className="text-xl font-bold text-foreground">{s.value}</p>
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Grouped Tabs */}
      <div className="mb-6 rounded-xl border border-border/40 bg-card p-2 space-y-1 max-h-[280px] overflow-y-auto">
        {tabGroups.map(group => (
          <div key={group.group}>
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 px-2 pt-2 pb-1">{group.group}</p>
            <div className="flex flex-wrap gap-1">
              {group.tabs.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap ${tab === t.key ? 'bg-accent/10 text-accent' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}>
                  <t.icon className="h-3 w-3" />{t.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && <AdminSystemOverview />}

      {/* Payment & Email Tab */}
      {tab === 'payment_email' && <PaymentReadinessPanel />}

      {/* Pricing Tab */}
      {tab === 'pricing' && <PricingAdmin />}

      {/* Booking Confirmation Tab */}
      {tab === 'booking_confirm' && <BookingConfirmationAdmin />}

      {/* Appointment Monitor Tab */}
      {tab === 'appointment_monitor' && <AdminAppointmentMonitor />}

      {/* Feature Controls Tab */}
      {tab === 'feature_controls' && <AdminFeatureControls />}

      {/* Members Tab */}
      {tab === 'members' && (
        <div className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowInviteForm(true)}><Mail className="mr-1 h-3 w-3" />Einladen</Button>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowCreateUser(true)}><Plus className="mr-1 h-3 w-3" />Direkt anlegen</Button>
          </div>

          {/* Create User Dialog */}
          <Dialog open={showCreateUser} onOpenChange={setShowCreateUser}>
            <DialogContent>
              <DialogHeader><DialogTitle>Neuen User anlegen</DialogTitle><DialogDescription>Erstelle einen neuen Mitglieder-Account direkt (ohne Einladung).</DialogDescription></DialogHeader>
              <div className="space-y-3">
                <div><Label className="text-[12px]">Name</Label><Input placeholder="Vor- und Nachname" value={newUser.full_name} onChange={e => setNewUser(p => ({ ...p, full_name: e.target.value }))} className="mt-1" /></div>
                <div><Label className="text-[12px]">E-Mail</Label><Input placeholder="email@example.com" type="email" value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} className="mt-1" /></div>
                <div><Label className="text-[12px]">Passwort</Label><Input placeholder="Min. 6 Zeichen" type="text" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} className="mt-1" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[12px]">Rolle</Label>
                    <select value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-2 text-[12px]">
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-[12px]">Stage</Label>
                    <select value={newUser.business_stage} onChange={e => setNewUser(p => ({ ...p, business_stage: e.target.value }))} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-2 text-[12px]">
                      {Object.entries(STAGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                </div>
                <Button onClick={async () => {
                  if (!newUser.email || !newUser.password || !newUser.full_name) {
                    toast({ title: 'Fehler', description: 'Name, E-Mail und Passwort sind erforderlich.', variant: 'destructive' });
                    return;
                  }
                  setCreatingUser(true);
                  try {
                    const { data, error } = await supabase.functions.invoke('create-test-user', {
                      body: { email: newUser.email, password: newUser.password, full_name: newUser.full_name, role: newUser.role, business_stage: newUser.business_stage },
                    });
                    // FunctionsHttpError carries the parsed JSON body in `context.json` / `context.body`.
                    let serverMsg: string | undefined = data?.error;
                    if (error && !serverMsg) {
                      const ctx: any = (error as any).context;
                      try {
                        if (ctx?.json) serverMsg = ctx.json.error;
                        else if (typeof ctx?.body === 'string') serverMsg = JSON.parse(ctx.body)?.error;
                        else if (ctx?.response && typeof ctx.response.text === 'function') {
                          const txt = await ctx.response.text();
                          serverMsg = JSON.parse(txt)?.error;
                        }
                      } catch (parseErr) {
                        console.warn('[create-test-user] could not parse error body', parseErr);
                      }
                    }
                    if (error || data?.error) {
                      console.error('[create-test-user] failed', { error, data });
                      toast({ title: 'Fehler', description: serverMsg || error?.message || 'Unbekannter Serverfehler', variant: 'destructive' });
                    } else {
                      toast({ title: 'User erstellt', description: `${newUser.email} wurde angelegt.` });
                      setNewUser({ email: '', password: '', full_name: '', role: 'member', business_stage: 'opener' });
                      setShowCreateUser(false);
                      loadAll();
                    }
                  } catch (err: any) {
                    console.error('[create-test-user] threw', err);
                    toast({ title: 'Fehler', description: err.message, variant: 'destructive' });
                  }
                  setCreatingUser(false);
                }} disabled={creatingUser} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 text-xs">
                  {creatingUser ? 'Wird erstellt…' : 'User erstellen'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Invite Dialog */}
          <Dialog open={showInviteForm} onOpenChange={setShowInviteForm}>
            <DialogContent>
              <DialogHeader><DialogTitle>Einladung versenden</DialogTitle><DialogDescription>Erstelle einen Einladungslink. Der Link wird automatisch kopiert.</DialogDescription></DialogHeader>
              <div className="space-y-3">
                <div><Label className="text-[12px]">E-Mail</Label><Input placeholder="email@example.com" type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="mt-1" /></div>
                <div>
                  <Label className="text-[12px]">Einstiegs-Stage</Label>
                   <select value={inviteStage} onChange={e => setInviteStage(e.target.value)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-2 text-[12px]">
                    {Object.entries(STAGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <Button onClick={createInvite} disabled={inviteSaving} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 text-xs">
                  {inviteSaving ? 'Wird erstellt…' : 'Einladung erstellen & Link kopieren'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Member list */}
          <div className="space-y-2">
          {members.map(m => (
            <div key={m.id} className="rounded-xl border border-border/40 bg-card p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground truncate">{m.full_name || 'Kein Name'}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{m.email}</p>
                </div>
                <Badge variant="outline" className="text-[10px]">{STAGE_LABELS[m.business_stage ?? 'opener'] ?? m.business_stage}</Badge>
                <button onClick={() => setExpandedMember(expandedMember === m.id ? null : m.id)} className="text-muted-foreground hover:text-foreground">
                  {expandedMember === m.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mb-2 items-center">
                <Switch checked={m.certified} onCheckedChange={() => toggleCertified(m.id, m.certified)} />
                <span className="text-[10px] text-muted-foreground">Cert</span>
                <Switch checked={m.placement_ready} onCheckedChange={() => togglePlacementReady(m.id, m.placement_ready)} />
                <span className="text-[10px] text-muted-foreground">Place</span>
                <Switch checked={!!m.realtime_simulator_enabled} onCheckedChange={() => toggleRealtimeSimulator(m.id, !!m.realtime_simulator_enabled)} />
                <span className="text-[10px] text-muted-foreground">RT-Sim</span>
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-border accent-accent"
                  checked={memberRoles[m.id] === 'admin'}
                  onChange={async (e) => {
                    const makeAdmin = e.target.checked;
                    if (makeAdmin) {
                      await supabase.from('user_roles').upsert({ user_id: m.id, role: 'admin' } as any, { onConflict: 'user_id,role' } as any);
                      setMemberRoles(prev => ({ ...prev, [m.id]: 'admin' }));
                      toast({ title: 'Admin-Rolle erteilt' });
                    } else {
                      await supabase.from('user_roles').update({ role: 'member' } as any).eq('user_id', m.id);
                      setMemberRoles(prev => ({ ...prev, [m.id]: 'member' }));
                      toast({ title: 'Admin-Rolle entzogen' });
                    }
                  }}
                />
                <span className="text-[10px] text-muted-foreground">Admin</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <select value={m.member_status} onChange={e => updateMemberField(m.id, 'member_status', e.target.value)} className="rounded border border-border/40 bg-background px-2 py-1 text-[11px] text-foreground">
                  {MEMBER_STATUSES.map(s => <option key={s} value={s}>{MEMBER_STATUS_LABELS[s]}</option>)}
                </select>
                <select value={m.certification_status} onChange={e => updateMemberField(m.id, 'certification_status', e.target.value)} className="rounded border border-border/40 bg-background px-2 py-1 text-[11px] text-foreground">
                  {CERT_STATUSES.map(s => <option key={s} value={s}>{CERT_STATUS_LABELS[s]}</option>)}
                </select>
                <select value={m.business_stage ?? 'opener'} onChange={e => updateMemberField(m.id, 'business_stage', e.target.value)} className="rounded border border-border/40 bg-background px-2 py-1 text-[11px] text-foreground">
                  {Object.entries(STAGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>

              {/* Expanded detail */}
              {expandedMember === m.id && (
                <div className="mt-4 border-t border-border/30 pt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-[11px]">
                    <div><span className="text-muted-foreground">Phase:</span> <span className="font-medium text-foreground">{m.current_phase}</span></div>
                    <div><span className="text-muted-foreground">Kohorte:</span> <span className="font-medium text-foreground">{m.cohort || '—'}</span></div>
                    <div><span className="text-muted-foreground">Onboarding:</span> <span className="font-medium text-foreground">{m.onboarding_completed ? '✓' : '✗'}</span></div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="text-[10px] h-7" onClick={() => evaluateThresholds(m.id)}>
                      <Award className="mr-1 h-3 w-3" />Threshold prüfen
                    </Button>
                    <select value={m.current_phase} onChange={e => updateMemberField(m.id, 'current_phase', Number(e.target.value))} className="rounded border border-border/40 bg-background px-2 py-1 text-[11px] text-foreground">
                      {[1,2,3,4,5,6,7,8].map(p => <option key={p} value={p}>Phase {p}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>
          ))}
          </div>
        </div>
      )}

      {/* Promotions Tab */}
      {tab === 'promotions' && <PromotionQueue />}

      {/* Mentors Tab */}
      {tab === 'mentors' && (
        <div className="space-y-8">
          <MentorControlPanel />
          <div className="border-t border-border/30 pt-6">
            <h3 className="text-sm font-semibold text-foreground mb-3">Legacy Drag & Drop Zuweisungen</h3>
            <MentorAssignmentManager />
          </div>
        </div>
      )}

      {/* Benefits Tab */}
      {tab === 'benefits' && <BenefitsAdmin />}

      {/* Referrals Tab */}
      {tab === 'referrals' && <ReferralsAdmin />}

      {/* Referral Status Audit Tab */}
      {tab === 'referrals_audit' && <ReferralStatusAudit />}

      {/* Scoring Tab */}
      {tab === 'scoring' && <ApplicantScoringAdmin />}

      {/* Performance Ranking Tab */}
      {tab === 'performance' && <PerformanceRankingAdmin />}

      {/* Live Calls Tab */}
      {tab === 'live_calls' && <LiveCallsAdmin />}

      {/* Academy Content Tab */}
      {tab === 'academy_content' && <AcademyContentAdmin />}

      {/* Chat Moderation Tab */}
      {tab === 'chat_moderation' && <ChatModerationAdmin />}

      {/* Content Editor Tab */}
      {tab === 'content_editor' && <InlineContentEditor />}

      {/* Communication Toggles Tab */}
      {tab === 'communication' && <AdminCommunicationToggles />}

      {/* Force Promotion Tab */}
      {tab === 'force_promotion' && <ForcePromotionPanel />}

      {/* Support Team Content Tab */}
      {tab === 'support_team' && <SupportTeamAdmin />}

      {/* Credits & Subscriptions Tab */}
      {tab === 'credits' && <AdminCreditsPanel />}

      {/* Certification Tab */}
      {tab === 'certification' && <CertificationAdmin />}

      {/* Invites Tab */}
      {tab === 'invites' && (
        <div>
          <div className="mb-4 flex justify-end">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowInviteForm(true)}><Plus className="mr-1 h-3 w-3" />Neue Einladung</Button>
          </div>
          <div className="space-y-2">
            {invites.map(inv => (
              <div key={inv.id} className="flex items-center gap-3 rounded-xl border border-border/40 bg-card p-4">
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground truncate">{inv.email}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {STAGE_LABELS[inv.initial_stage ?? 'opener']} · Gültig bis {new Date(inv.expires_at).toLocaleDateString('de-DE')}
                  </p>
                </div>
                <Badge variant="outline" className={`text-[10px] ${inv.used ? 'text-primary border-primary/30' : 'text-muted-foreground'}`}>
                  {inv.used ? 'Verwendet' : 'Offen'}
                </Badge>
                {!inv.used && (
                  <button onClick={async () => {
                    const link = `${window.location.origin}/members/register?token=${inv.token}`;
                    await navigator.clipboard.writeText(link);
                    toast({ title: 'Link kopiert' });
                  }} className="text-muted-foreground hover:text-foreground"><Copy className="h-3.5 w-3.5" /></button>
                )}
                <button onClick={() => deleteInvite(inv.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            {invites.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Noch keine Einladungen.</p>}
          </div>
        </div>
      )}

      {/* Modules Tab */}
      {tab === 'modules' && (
        <div className="space-y-2">
          {modules.map(mod => (
            <div key={mod.id} className="rounded-xl border border-border/40 bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-[11px] font-bold text-accent">{mod.phase_id}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground truncate">{mod.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{mod.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {mod.video_url ? <Video className="h-3.5 w-3.5 text-primary" /> : <Video className="h-3.5 w-3.5 text-muted-foreground/30" />}
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">#{mod.sort_order}</Badge>
                  <Button variant="ghost" size="sm" className="text-[11px] h-7" onClick={() => { setEditingModule(mod); setModuleVideoUrl(mod.video_url || ''); setModuleWorksheetUrl(mod.worksheet_url || ''); }}>
                    <LinkIcon className="h-3 w-3 mr-1" />Inhalt
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {/* Module Content Dialog */}
          <Dialog open={!!editingModule} onOpenChange={(open) => { if (!open) { setEditingModule(null); setShowRecorder(null); } }}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Modul-Inhalt: {editingModule?.title}</DialogTitle>
                <DialogDescription>Video aufnehmen, externen Link hinzufügen oder Worksheet verlinken.</DialogDescription>
              </DialogHeader>

              {showRecorder && editingModule ? (
                <AdminVideoRecorder
                  moduleId={editingModule.id}
                  moduleTitle={editingModule.title}
                  mode={showRecorder}
                  onUploaded={(url) => {
                    setModuleVideoUrl(url);
                    setModules(prev => prev.map(m => m.id === editingModule.id ? { ...m, video_url: url } : m));
                    setShowRecorder(null);
                  }}
                  onClose={() => setShowRecorder(null)}
                />
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label className="text-[12px] mb-2 block">Direkt aufnehmen</Label>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => setShowRecorder('video')}><Video className="mr-1.5 h-3.5 w-3.5" />Video aufnehmen</Button>
                      <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => setShowRecorder('audio')}><Mic className="mr-1.5 h-3.5 w-3.5" />Audio aufnehmen</Button>
                    </div>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border/40" /></div>
                    <div className="relative flex justify-center"><span className="bg-background px-2 text-[10px] text-muted-foreground">oder externen Link</span></div>
                  </div>
                  <div>
                    <Label className="text-[12px]">Video URL</Label>
                    <Input placeholder="https://youtube.com/watch?v=... oder Loom/Vimeo" value={moduleVideoUrl} onChange={e => setModuleVideoUrl(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-[12px]">Worksheet URL</Label>
                    <Input placeholder="https://docs.google.com/... oder PDF-Link" value={moduleWorksheetUrl} onChange={e => setModuleWorksheetUrl(e.target.value)} className="mt-1" />
                  </div>
                  <Button onClick={() => editingModule && saveModuleContent(editingModule)} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 text-xs">
                    <Save className="mr-1.5 h-3.5 w-3.5" />Inhalt speichern
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* KPIs Tab */}
      {tab === 'kpis' && (
        <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
          <div className="border-b border-border/30 px-4 py-3">
            <p className="text-[12px] text-muted-foreground">Mitglieder-KPIs Übersicht</p>
          </div>
          {members.map(m => (
            <div key={m.id} className="flex items-center gap-3 border-b border-border/20 px-4 py-3 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-foreground truncate">{m.full_name || m.email}</p>
              </div>
              <Badge variant="outline" className="text-[10px]">{STAGE_LABELS[m.business_stage ?? 'opener']}</Badge>
              <Badge variant="outline" className={`text-[10px] ${m.certified ? 'text-primary border-primary/30' : ''}`}>
                {CERT_STATUS_LABELS[m.certification_status]}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {/* Opportunities / Placement Tab */}
      {tab === 'opportunities' && <PlacementAdmin />}

      {/* Announcements Tab */}
      {tab === 'announcements' && (
        <div>
          <div className="mb-4 flex justify-end">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowAnnForm(true)}><Plus className="mr-1 h-3 w-3" />Neue Ankündigung</Button>
          </div>
          <Dialog open={showAnnForm} onOpenChange={setShowAnnForm}>
            <DialogContent>
              <DialogHeader><DialogTitle>Neue Ankündigung</DialogTitle><DialogDescription>Erstelle eine Ankündigung für alle Mitglieder.</DialogDescription></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Titel" value={annTitle} onChange={e => setAnnTitle(e.target.value)} />
                <Textarea placeholder="Inhalt" value={annContent} onChange={e => setAnnContent(e.target.value)} rows={4} />
                <Button onClick={createAnnouncement} disabled={annSaving} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 text-xs">{annSaving ? 'Veröffentlichen…' : 'Veröffentlichen'}</Button>
              </div>
            </DialogContent>
          </Dialog>
          <div className="space-y-2">
            {announcements.map(a => (
              <div key={a.id} className="flex items-center gap-3 rounded-xl border border-border/40 bg-card p-4">
                <Megaphone className="h-4 w-4 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground">{a.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{a.content}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch checked={a.published} onCheckedChange={() => toggleAnnPublished(a.id, a.published)} />
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteAnnouncement(a.id)}><X className="h-3 w-3" /></Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit Log Tab */}
      {tab === 'audit' && (
        <div className="space-y-2">
          {auditLogs.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Noch keine Audit-Einträge.</p>}
          {auditLogs.map(log => (
            <div key={log.id} className="rounded-xl border border-border/40 bg-card p-4">
              <div className="flex items-center gap-3 mb-1">
                <Badge variant="outline" className="text-[10px]">{log.action}</Badge>
                <span className="text-[10px] text-muted-foreground">{log.source_type}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">{new Date(log.created_at).toLocaleString('de-DE')}</span>
              </div>
              {log.note && <p className="text-[12px] text-foreground">{log.note}</p>}
              {(log.before_state || log.after_state) && (
                <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
                  {log.before_state && <span>Vorher: {JSON.stringify(log.before_state)}</span>}
                  {log.after_state && <span>Nachher: {JSON.stringify(log.after_state)}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'employer' && <EmployerAdmin />}
      {tab === 'kpi_verification' && <KpiVerificationAdmin />}

      {/* Global Invite Dialog - accessible from any tab */}
      <Dialog open={showInviteForm} onOpenChange={setShowInviteForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Einladung versenden</DialogTitle><DialogDescription>Erstelle einen Einladungslink. Der Link wird automatisch kopiert.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-[12px]">E-Mail</Label><Input placeholder="email@example.com" type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="mt-1" /></div>
            <div>
              <Label className="text-[12px]">Einstiegs-Stage</Label>
              <InviteStageSelect value={inviteStage} onChange={setInviteStage} />
            </div>
            <Button onClick={createInvite} disabled={inviteSaving} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 text-xs">
              {inviteSaving ? 'Wird erstellt…' : 'Einladung erstellen & Link kopieren'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
