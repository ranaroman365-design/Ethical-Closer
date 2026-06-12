import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import MatchingResults from '@/components/placement/MatchingResults';
import {
  Plus, ChevronDown, ChevronUp, CheckCircle2, XCircle, Target,
  Building2, Users, FileText, Trash2, Zap,
} from 'lucide-react';

interface Opportunity {
  id: string;
  company: string;
  industry: string;
  offer_type: string;
  commission_model: string;
  call_volume: string;
  status: string;
  description: string | null;
  niche: string | null;
  language: string | null;
  region: string | null;
  min_close_rate: number | null;
  min_show_rate: number | null;
  experience_level: string | null;
  created_at: string;
}

interface ApplicationRow {
  id: string;
  user_id: string;
  opportunity_id: string;
  status: string;
  match_score: number;
  user_notes: string | null;
  admin_notes: string | null;
  created_at: string;
  placed_at: string | null;
}

interface ProfileMin {
  id: string;
  full_name: string | null;
  email: string | null;
  business_stage: string;
  placement_ready: boolean;
}

const APP_STATUSES = ['submitted', 'under_review', 'shortlisted', 'interview', 'matched', 'declined', 'placed'] as const;
const APP_STATUS_LABELS: Record<string, string> = {
  submitted: 'Eingereicht', under_review: 'In Prüfung', shortlisted: 'Shortlist',
  interview: 'Interview', matched: 'Matched', declined: 'Abgelehnt', placed: 'Platziert',
};

type SubTab = 'opportunities' | 'applications' | 'ready_users' | 'matching';

export default function PlacementAdmin() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [subTab, setSubTab] = useState<SubTab>('applications');
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [matchingOpp, setMatchingOpp] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ProfileMin[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  // New opportunity form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    company: '', industry: '', offer_type: '', commission_model: '', call_volume: '',
    description: '', niche: '', language: 'Deutsch', region: '', min_close_rate: '20', min_show_rate: '60',
    experience_level: 'placement', ticket_size: '', target_audience: '', call_type: 'warm',
    expected_volume: '', product_type: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [oppRes, appRes, profRes] = await Promise.all([
      supabase.from('placement_opportunities').select('*').order('created_at', { ascending: false }),
      supabase.from('placement_applications').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email, business_stage, placement_ready').order('created_at'),
    ]);
    setOpportunities((oppRes.data as Opportunity[]) ?? []);
    setApplications((appRes.data as ApplicationRow[]) ?? []);
    setProfiles((profRes.data as ProfileMin[]) ?? []);
    setLoading(false);
  }

  const profileMap = new Map(profiles.map(p => [p.id, p]));
  const readyUsers = profiles.filter(p => p.placement_ready);

  async function createOpportunity() {
    if (!form.company.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from('placement_opportunities').insert({
      company: form.company, industry: form.industry, offer_type: form.offer_type,
      commission_model: form.commission_model, call_volume: form.call_volume,
      description: form.description || null, niche: form.niche || null,
      language: form.language || 'Deutsch', region: form.region || null,
      min_close_rate: Number(form.min_close_rate) || 0,
      min_show_rate: Number(form.min_show_rate) || 0,
      experience_level: form.experience_level,
      ticket_size: form.ticket_size || null, target_audience: form.target_audience || null,
      call_type: form.call_type || 'warm', expected_volume: form.expected_volume || null,
      product_type: form.product_type || null,
      status: 'open',
    }).select().single();
    setSaving(false);
    if (error) { toast({ title: 'Fehler', description: error.message, variant: 'destructive' }); return; }
    setOpportunities(prev => [data as Opportunity, ...prev]);
    setForm({ company: '', industry: '', offer_type: '', commission_model: '', call_volume: '', description: '', niche: '', language: 'Deutsch', region: '', min_close_rate: '20', min_show_rate: '60', experience_level: 'placement', ticket_size: '', target_audience: '', call_type: 'warm', expected_volume: '', product_type: '' });
    setShowForm(false);
    toast({ title: 'Opportunity erstellt' });
  }

  async function updateOppStatus(id: string, status: string) {
    await supabase.from('placement_opportunities').update({ status }).eq('id', id);
    setOpportunities(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    toast({ title: `Status → ${status}` });
  }

  async function deleteOpp(id: string) {
    await supabase.from('placement_opportunities').delete().eq('id', id);
    setOpportunities(prev => prev.filter(o => o.id !== id));
    toast({ title: 'Gelöscht' });
  }

  async function updateAppStatus(app: ApplicationRow, newStatus: string) {
    setProcessing(app.id);
    const update: any = { status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === 'placed') update.placed_at = new Date().toISOString();
    const note = adminNotes[app.id];
    if (note) update.admin_notes = note;

    await supabase.from('placement_applications').update(update).eq('id', app.id);

    // If placed, update profile
    if (newStatus === 'placed') {
      await supabase.from('profiles').update({ placement_ready: true, updated_at: new Date().toISOString() }).eq('id', app.user_id);
      await supabase.from('audit_logs').insert({
        action: 'placement_completed',
        actor_id: user?.id,
        target_user_id: app.user_id,
        source_type: 'admin',
        after_state: { opportunity_id: app.opportunity_id, status: 'placed' },
        note: note || 'Placement erfolgreich abgeschlossen',
      });
    }

    setApplications(prev => prev.map(a => a.id === app.id ? { ...a, ...update } : a));
    setProcessing(null);
    toast({ title: `Bewerbung → ${APP_STATUS_LABELS[newStatus]}` });
  }

  if (loading) return <div className="py-8 text-center text-sm text-muted-foreground">Lade Placement-Daten…</div>;

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 rounded-lg border border-border/30 bg-muted/20 p-0.5">
        {([
          { key: 'applications' as SubTab, label: 'Bewerbungen', icon: FileText, count: applications.length },
          { key: 'matching' as SubTab, label: 'Matching Engine', icon: Zap, count: 0 },
          { key: 'opportunities' as SubTab, label: 'Opportunities', icon: Building2, count: opportunities.length },
          { key: 'ready_users' as SubTab, label: 'Ready Users', icon: Users, count: readyUsers.length },
        ]).map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${subTab === t.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            <t.icon className="h-3 w-3" />{t.label}
            <span className="text-[9px] opacity-60">({t.count})</span>
          </button>
        ))}
      </div>

      {/* Applications */}
      {subTab === 'applications' && (
        <div className="space-y-2">
          {applications.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Keine Bewerbungen vorhanden.</p>}
          {applications.map(app => {
            const opp = opportunities.find(o => o.id === app.opportunity_id);
            const profile = profileMap.get(app.user_id);
            const expanded = expandedApp === app.id;
            return (
              <div key={app.id} className="rounded-xl border border-border/40 bg-card overflow-hidden">
                <button onClick={() => setExpandedApp(expanded ? null : app.id)}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">{profile?.full_name || profile?.email || 'Unbekannt'}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{opp?.company ?? '—'} · {opp?.offer_type ?? ''}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-primary">
                      <Target className="h-3 w-3" />{app.match_score}%
                    </div>
                    <Badge variant="outline" className="text-[10px]">{APP_STATUS_LABELS[app.status]}</Badge>
                    {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </button>
                {expanded && (
                  <div className="border-t border-border/30 p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div><span className="text-muted-foreground">Stage:</span> <span className="font-medium">{profile?.business_stage}</span></div>
                      <div><span className="text-muted-foreground">Placement Ready:</span> <span className="font-medium">{profile?.placement_ready ? '✓' : '✗'}</span></div>
                      <div><span className="text-muted-foreground">Eingereicht:</span> <span className="font-medium">{new Date(app.created_at).toLocaleDateString('de-DE')}</span></div>
                      <div><span className="text-muted-foreground">Match Score:</span> <span className="font-bold text-primary">{app.match_score}%</span></div>
                    </div>
                    {app.user_notes && (
                      <div className="rounded-lg bg-muted/30 p-2.5">
                        <p className="text-[10px] font-semibold text-muted-foreground mb-1">Notiz vom Bewerber</p>
                        <p className="text-[11px] text-foreground">{app.user_notes}</p>
                      </div>
                    )}
                    <Textarea placeholder="Admin-Notiz…" value={adminNotes[app.id] ?? app.admin_notes ?? ''} onChange={e => setAdminNotes(p => ({ ...p, [app.id]: e.target.value }))} rows={2} className="text-xs" />
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">Status ändern</p>
                      <div className="flex flex-wrap gap-1.5">
                        {APP_STATUSES.filter(s => s !== app.status).map(s => (
                          <Button key={s} variant="outline" size="sm" className="text-[10px] h-7"
                            disabled={processing === app.id} onClick={() => updateAppStatus(app, s)}>
                            {s === 'placed' && <CheckCircle2 className="mr-1 h-3 w-3 text-primary" />}
                            {s === 'declined' && <XCircle className="mr-1 h-3 w-3 text-destructive" />}
                            {APP_STATUS_LABELS[s]}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Opportunities */}
      {subTab === 'opportunities' && (
        <div>
          <div className="mb-3 flex justify-end">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowForm(true)}>
              <Plus className="mr-1 h-3 w-3" />Neue Opportunity
            </Button>
          </div>
          <Dialog open={showForm} onOpenChange={setShowForm}>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Neue Placement Opportunity</DialogTitle><DialogDescription>Erstelle eine strukturierte Opportunity mit Matching-Kriterien.</DialogDescription></DialogHeader>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[11px]">Unternehmen *</Label><Input value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} className="mt-1" /></div>
                  <div><Label className="text-[11px]">Branche</Label><Input value={form.industry} onChange={e => setForm(p => ({ ...p, industry: e.target.value }))} className="mt-1" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[11px]">Angebot / Offer</Label><Input value={form.offer_type} onChange={e => setForm(p => ({ ...p, offer_type: e.target.value }))} className="mt-1" /></div>
                  <div><Label className="text-[11px]">Nische</Label><Input value={form.niche} onChange={e => setForm(p => ({ ...p, niche: e.target.value }))} className="mt-1" /></div>
                </div>
                <div><Label className="text-[11px]">Beschreibung</Label><Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} className="mt-1 text-xs" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[11px]">Provisionsmodell</Label><Input value={form.commission_model} onChange={e => setForm(p => ({ ...p, commission_model: e.target.value }))} className="mt-1" /></div>
                  <div><Label className="text-[11px]">Call-Volumen</Label><Input value={form.call_volume} onChange={e => setForm(p => ({ ...p, call_volume: e.target.value }))} className="mt-1" /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label className="text-[11px]">Sprache</Label><Input value={form.language} onChange={e => setForm(p => ({ ...p, language: e.target.value }))} className="mt-1" /></div>
                  <div><Label className="text-[11px]">Region</Label><Input value={form.region} onChange={e => setForm(p => ({ ...p, region: e.target.value }))} className="mt-1" /></div>
                  <div>
                    <Label className="text-[11px]">Min. Level</Label>
                    <select value={form.experience_level} onChange={e => setForm(p => ({ ...p, experience_level: e.target.value }))} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-2 text-[12px]">
                      <option value="junior_manager">Closer (Placement Track)</option>
                      <option value="manager">Managing Closer</option>
                      <option value="senior_manager">Senior Closer</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[11px]">Min. Close Rate (%)</Label><Input type="number" value={form.min_close_rate} onChange={e => setForm(p => ({ ...p, min_close_rate: e.target.value }))} className="mt-1" /></div>
                  <div><Label className="text-[11px]">Min. Show Rate (%)</Label><Input type="number" value={form.min_show_rate} onChange={e => setForm(p => ({ ...p, min_show_rate: e.target.value }))} className="mt-1" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[11px]">Produkt-Typ</Label><Input placeholder="z.B. Coaching, SaaS, Consulting" value={form.product_type} onChange={e => setForm(p => ({ ...p, product_type: e.target.value }))} className="mt-1" /></div>
                  <div><Label className="text-[11px]">Ticketgröße</Label>
                    <select value={form.ticket_size} onChange={e => setForm(p => ({ ...p, ticket_size: e.target.value }))} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-2 text-[12px]">
                      <option value="">—</option>
                      <option value="low">Low (unter 1k)</option>
                      <option value="mid">Mid (1k–5k)</option>
                      <option value="high">High (5k–15k)</option>
                      <option value="premium">Premium (15k+)</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-[11px]">Zielgruppe</Label><Input placeholder="z.B. B2B SaaS Founder" value={form.target_audience} onChange={e => setForm(p => ({ ...p, target_audience: e.target.value }))} className="mt-1" /></div>
                  <div><Label className="text-[11px]">Call-Typ</Label>
                    <select value={form.call_type} onChange={e => setForm(p => ({ ...p, call_type: e.target.value }))} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-2 text-[12px]">
                      <option value="warm">Warm</option>
                      <option value="cold">Cold</option>
                      <option value="inbound">Inbound</option>
                    </select>
                  </div>
                </div>
                <div><Label className="text-[11px]">Erwartetes Volumen</Label><Input placeholder="z.B. 20 Calls/Woche" value={form.expected_volume} onChange={e => setForm(p => ({ ...p, expected_volume: e.target.value }))} className="mt-1" /></div>
                <Button onClick={createOpportunity} disabled={saving} className="w-full text-xs">
                  {saving ? 'Erstellen…' : 'Opportunity erstellen'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <div className="space-y-2">
            {opportunities.map(opp => {
              const appCount = applications.filter(a => a.opportunity_id === opp.id).length;
              return (
                <div key={opp.id} className="rounded-xl border border-border/40 bg-card p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-foreground">{opp.company}</p>
                      <p className="text-[11px] text-muted-foreground">{opp.industry}{opp.niche ? ` · ${opp.niche}` : ''} · {opp.offer_type}</p>
                      {opp.description && <p className="text-[10px] text-muted-foreground mt-1">{opp.description}</p>}
                      <div className="flex gap-3 mt-1.5 text-[10px] text-muted-foreground">
                        <span>CR ≥ {opp.min_close_rate ?? 0}%</span>
                        <span>SR ≥ {opp.min_show_rate ?? 0}%</span>
                        <span>{opp.language}</span>
                        {opp.region && <span>{opp.region}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-muted-foreground">{appCount} Bew.</span>
                      <select value={opp.status} onChange={e => updateOppStatus(opp.id, e.target.value)}
                        className="rounded border border-border/40 bg-background px-2 py-1 text-[11px]">
                        <option value="open">Offen</option>
                        <option value="paused">Pausiert</option>
                        <option value="filled">Besetzt</option>
                        <option value="archived">Archiviert</option>
                      </select>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { if (confirm('Löschen?')) deleteOpp(opp.id); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
            {opportunities.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Keine Opportunities.</p>}
          </div>
        </div>
      )}

      {/* Ready Users */}
      {subTab === 'ready_users' && (
        <div className="space-y-2">
          {readyUsers.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Keine placement-ready User.</p>}
          {readyUsers.map(u => {
            const userApps = applications.filter(a => a.user_id === u.id);
            return (
              <div key={u.id} className="rounded-xl border border-border/40 bg-card p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">{u.full_name || 'Kein Name'}</p>
                  <p className="text-[11px] text-muted-foreground">{u.email} · {u.business_stage}</p>
                </div>
                <Badge variant="outline" className="text-[10px] text-primary border-primary/30">Ready</Badge>
                <span className="text-[10px] text-muted-foreground">{userApps.length} Bew.</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Matching Engine */}
      {subTab === 'matching' && (
        <div className="space-y-4">
          {!matchingOpp ? (
            <div>
              <p className="text-xs text-muted-foreground mb-3">Wähle eine Opportunity für das Matching:</p>
              <div className="space-y-2">
                {opportunities.filter(o => o.status === 'open').map(opp => (
                  <button key={opp.id} onClick={() => setMatchingOpp(opp.id)}
                    className="w-full rounded-xl border border-border/40 bg-card p-4 text-left hover:bg-muted/30 transition-colors">
                    <p className="text-[13px] font-semibold text-foreground">{opp.company}</p>
                    <p className="text-[11px] text-muted-foreground">{opp.industry} · {opp.offer_type}</p>
                  </button>
                ))}
                {opportunities.filter(o => o.status === 'open').length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">Keine offenen Opportunities.</p>
                )}
              </div>
            </div>
          ) : (
            <div>
              <Button variant="ghost" size="sm" className="text-xs mb-3" onClick={() => setMatchingOpp(null)}>← Zurück</Button>
              <MatchingResults
                opportunityId={matchingOpp}
                opportunityTitle={opportunities.find(o => o.id === matchingOpp)?.company ?? ''}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
