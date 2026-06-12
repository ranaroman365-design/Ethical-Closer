import { useState, useEffect, useCallback, useMemo } from 'react';
import { WhatsAppButton } from '@/components/leads/WhatsAppButton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import LeadDetailDrawer, { type LeadRecord } from '@/components/members/LeadDetailDrawer';
import { Users, ArrowRight, Clock, RefreshCw, Search, CheckCircle2, XCircle, Plus, UserPlus, Flame } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function timeSince(dateStr: string | null): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return '<1h';
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

const QUALITY_STYLES: Record<string, string> = {
  A: 'bg-primary/10 text-primary border-primary/20',
  B: 'bg-accent/10 text-accent border-accent/20',
  C: 'bg-muted text-muted-foreground border-border',
};

const PIPELINE_STAGES = [
  { key: 'new', label: 'Neu' },
  { key: 'backlog', label: 'Backlog' },
  { key: 'recycled', label: 'Recycelt' },
  { key: 'booked', label: 'Termin gebucht (neu)' },
  { key: 'assigned_setter', label: 'Setter zugewiesen' },
  { key: 'setter_attempting', label: 'Kontakt versucht' },
  { key: 'setter_no_response', label: 'Keine Antwort' },
  { key: 'setter_qualified', label: 'Qualifiziert' },
  { key: 'setter_booked', label: 'Closer Call gebucht' },
  { key: 'ready_for_closer', label: 'Bereit für Closer' },
  { key: 'assigned_closer', label: 'Closer zugewiesen' },
  { key: 'closer_in_progress', label: 'In Bearbeitung' },
  { key: 'offer_made', label: 'Angebot gemacht' },
  { key: 'follow_up', label: 'Follow-Up' },
  { key: 'closed_won', label: 'Closed Won' },
  { key: 'closed_lost', label: 'Closed Lost' },
];

const STAGE_MAP = Object.fromEntries(PIPELINE_STAGES.map(s => [s.key, s.label]));

const LEVEL_STYLES: Record<string, string> = {
  L0: 'bg-muted text-muted-foreground',
  L1: 'bg-primary/10 text-primary border-primary/20',
};

const STATUS_STYLES: Record<string, string> = {
  new: 'bg-background text-foreground border-border',
  closed_won: 'bg-primary/5 text-primary border-primary/15',
  closed_lost: 'bg-destructive/5 text-destructive border-destructive/15',
};

interface AttributionEntry { lead_id: string; utm_source: string | null; utm_campaign: string | null; fbclid: string | null; gclid: string | null }

interface ProfileEntry { id: string; full_name: string | null; business_stage: string }

export default function Pool() {
  const { user, isAdmin } = useAuth();
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [profiles, setProfiles] = useState<ProfileEntry[]>([]);
  const [attributions, setAttributions] = useState<Record<string, AttributionEntry>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [funnelFilter, setFunnelFilter] = useState('all');
  const [selectedLead, setSelectedLead] = useState<LeadRecord | null>(null);
  const [assignModal, setAssignModal] = useState<{ lead: LeadRecord; type: 'setter' | 'closer' } | null>(null);
  const [assignNote, setAssignNote] = useState('');
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [showCreateLead, setShowCreateLead] = useState(false);
  const [newLead, setNewLead] = useState({ name: '', email: '', phone: '', source: 'manual' });

  const profileMap = useMemo(() => {
    const m: Record<string, string> = {};
    profiles.forEach(p => { m[p.id] = p.full_name || 'Unbekannt'; });
    return m;
  }, [profiles]);

  const setterProfiles = useMemo(() => profiles.filter(p =>
    ['setter', 'senior_associate', 'opener'].includes(p.business_stage)
  ), [profiles]);

  const closerProfiles = useMemo(() => profiles.filter(p =>
    ['junior_manager', 'manager', 'senior_manager', 'director', 'partner'].includes(p.business_stage)
  ), [profiles]);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    const [{ data: leadsData }, { data: profilesData }, { data: attrData }] = await Promise.all([
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, business_stage'),
      supabase.from('lead_attribution').select('lead_id, utm_source, utm_campaign, fbclid, gclid'),
    ]);
    setLeads((leadsData as LeadRecord[]) ?? []);
    setProfiles((profilesData as ProfileEntry[]) ?? []);
    const attrMap: Record<string, AttributionEntry> = {};
    ((attrData as AttributionEntry[]) ?? []).forEach(a => { if (a.lead_id) attrMap[a.lead_id] = a; });
    setAttributions(attrMap);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const uniqueSources = useMemo(() => [...new Set(leads.map(l => l.source).filter(Boolean))].sort(), [leads]);
  const uniqueFunnels = useMemo(() => [...new Set(leads.map(l => (l as any).funnel_source).filter(Boolean))].sort(), [leads]);

  const filtered = useMemo(() => {
    let result = leads;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(l => l.name.toLowerCase().includes(q) || l.email?.toLowerCase().includes(q) || l.phone?.includes(q));
    }
    if (stageFilter !== 'all') result = result.filter(l => l.stage === stageFilter);
    if (levelFilter !== 'all') result = result.filter(l => (l as any).lead_level === levelFilter);
    if (sourceFilter !== 'all') result = result.filter(l => l.source === sourceFilter);
    if (funnelFilter !== 'all') result = result.filter(l => (l as any).funnel_source === funnelFilter);
    const qOrder: Record<string, number> = { A: 0, B: 1, C: 2 };
    result = [...result].sort((a, b) => {
      const qa = qOrder[(a as any).lead_quality] ?? 3;
      const qb = qOrder[(b as any).lead_quality] ?? 3;
      if (qa !== qb) return qa - qb;
      return ((b as any).lead_score ?? 0) - ((a as any).lead_score ?? 0);
    });
    return result;
  }, [leads, search, stageFilter, levelFilter, sourceFilter, funnelFilter]);

  const handleTakeLead = async (lead: LeadRecord) => {
    if (!user) return;
    const { data, error } = await supabase.rpc('pull_lead_secure', {
      p_lead_id: lead.id,
    });
    if (error) {
      toast.error(error.message || 'Fehler beim Übernehmen.');
      return;
    }
    const result = data as { success: boolean; error?: string } | null;
    if (!result?.success) {
      toast.error(result?.error || 'Lead konnte nicht übernommen werden.');
      return;
    }
    toast.success('Lead übernommen');
    fetchAll();
  };

  const stats = useMemo(() => ({
    total: leads.length,
    pool: leads.filter(l => ['new', 'backlog', 'recycled'].includes(l.stage)).length,
    active: leads.filter(l => !['new', 'backlog', 'recycled', 'closed_won', 'closed_lost'].includes(l.stage)).length,
    won: leads.filter(l => l.stage === 'closed_won').length,
    lost: leads.filter(l => l.stage === 'closed_lost').length,
  }), [leads]);

  const handleAssign = async () => {
    if (!assignModal || !selectedAssignee) return;
    const { lead, type } = assignModal;
    const newStage = type === 'setter' ? 'assigned_setter' : 'assigned_closer';
    const updates: Record<string, any> = {
      stage: newStage,
      updated_at: new Date().toISOString(),
      [`${type}_id`]: selectedAssignee,
      owner_id: selectedAssignee,
      owner_role: type,
    };
    if (type === 'setter') {
      updates.timer_expires_at = new Date(Date.now() + 72 * 3600000).toISOString();
    }
    if (assignNote) {
      updates[`${type}_notes`] = assignNote;
    }

    const { error } = await supabase.from('leads').update(updates as any).eq('id', lead.id);
    if (!error) {
      await supabase.from('lead_transitions').insert({
        lead_id: lead.id, previous_stage: lead.stage, new_stage: newStage, changed_by: user!.id,
      });

      // Send lead-assignment email notification
      const assigneeProfile = (type === 'setter' ? setterProfiles : closerProfiles).find(p => p.id === selectedAssignee);
      const assigneeFullProfile = profiles.find(p => p.id === selectedAssignee);
      const assigneeEmail = (assigneeFullProfile as any)?.email as string | undefined;
      if (assigneeProfile && assigneeEmail && assigneeEmail.includes('@')) {
        supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'lead-assigned',
            recipientEmail: assigneeEmail,
            idempotencyKey: `lead-assigned-${lead.id}-${selectedAssignee}`,
            templateData: {
              assigneeName: assigneeProfile.full_name || 'Team-Mitglied',
              leadName: lead.name,
              leadLevel: lead.lead_level,
              role: type === 'setter' ? 'Setter' : 'Closer',
              dashboardUrl: `https://ethical-closing.lovable.app/members/${type}`,
            },
          },
        }).catch(console.error);
      }

      toast.success(`${type === 'setter' ? 'Setter' : 'Closer'} zugewiesen`);
      setAssignModal(null);
      setSelectedAssignee('');
      setAssignNote('');
      fetchAll();
    }
  };

  const handleCreateLead = async () => {
    if (!newLead.name.trim()) return;
    const { error } = await supabase.from('leads').insert({
      name: newLead.name.trim(),
      email: newLead.email.trim() || null,
      phone: newLead.phone.trim() || null,
      source: newLead.source,
      stage: 'new',
      lead_level: 'L0',
      created_by: user!.id,
    } as any);
    if (!error) {
      toast.success('Lead erstellt');
      setShowCreateLead(false);
      setNewLead({ name: '', email: '', phone: '', source: 'manual' });
      fetchAll();
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">Lead Pool</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Alle L0 Bewerber und aktueller Zuweisungsstatus.
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowCreateLead(true)}>
              <Plus className="mr-1.5 h-3 w-3" /> Test Lead erstellen
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-xs" onClick={fetchAll}>
            <RefreshCw className="mr-1.5 h-3 w-3" /> Aktualisieren
          </Button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-5 gap-3 mb-8">
        {[
          { label: 'Gesamt', value: stats.total, icon: Users },
          { label: 'Im Pool', value: stats.pool, icon: Clock },
          { label: 'Aktiv', value: stats.active, icon: ArrowRight },
          { label: 'Won', value: stats.won, icon: CheckCircle2 },
          { label: 'Lost', value: stats.lost, icon: XCircle },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-2">
              <kpi.icon className="h-3.5 w-3.5 text-muted-foreground/40" />
              <span className="text-xs text-muted-foreground">{kpi.label}</span>
            </div>
            <p className="mt-1 text-2xl font-semibold text-foreground">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <Input
            placeholder="Name, E-Mail oder Telefon suchen…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-9 pl-9 text-sm border-border bg-card"
          />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="h-9 w-[180px] text-sm border-border bg-card">
            <SelectValue placeholder="Alle Stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Stages</SelectItem>
            {PIPELINE_STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="h-9 w-[120px] text-sm border-border bg-card">
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Level</SelectItem>
            <SelectItem value="L0">L0</SelectItem>
            <SelectItem value="L1">L1</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="h-9 w-[140px] text-sm border-border bg-card">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Sources</SelectItem>
            {uniqueSources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={funnelFilter} onValueChange={setFunnelFilter}>
          <SelectTrigger className="h-9 w-[160px] text-sm border-border bg-card">
            <SelectValue placeholder="Funnel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Funnels</SelectItem>
            {uniqueFunnels.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card py-16 text-center">
          <p className="text-sm text-muted-foreground">Keine Leads gefunden.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Qualität</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Herkunft</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Erfasst am</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Kontakt</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Level</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Setter</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filtered.map(lead => (
                <tr
                  key={lead.id}
                  className="transition-colors hover:bg-muted/20 cursor-pointer"
                  onClick={() => setSelectedLead(lead)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{lead.name}</p>
                      {lead.source === 'test' && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">Test</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {(lead as any).lead_quality ? (
                      <Badge variant="outline" className={cn('text-[10px] font-semibold', QUALITY_STYLES[(lead as any).lead_quality] || QUALITY_STYLES.C)}>
                        {(lead as any).lead_quality}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground/40 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-[11px] text-muted-foreground leading-relaxed">
                      <span className="font-medium text-foreground">{lead.source || '—'}</span>
                      {(lead as any).funnel_source && (
                        <span className="block text-[10px]">{(lead as any).funnel_source}</span>
                      )}
                      {attributions[lead.id]?.utm_source && (
                        <span className="block text-[10px]">utm: {attributions[lead.id].utm_source}</span>
                      )}
                      {attributions[lead.id]?.utm_campaign && (
                        <span className="block text-[10px]">camp: {attributions[lead.id].utm_campaign}</span>
                      )}
                      {(attributions[lead.id]?.fbclid || attributions[lead.id]?.gclid) && (
                        <span className="block text-[10px]">{attributions[lead.id]?.fbclid ? 'FB' : 'Google'} Ad</span>
                      )}
                      {(lead as any).is_simulation && (
                        <Badge variant="outline" className="text-[9px] mt-0.5 border-destructive/30 text-destructive">Simulation</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-[12px]">
                    {lead.created_at ? new Date(lead.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-[13px]">
                    <span className="inline-flex items-center gap-1">
                      {lead.email || lead.phone || '—'}
                      <WhatsAppButton phone={lead.phone} leadName={lead.name} leadId={lead.id} compact sourceComponent="Pool" />
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={cn('text-[10px] font-medium', LEVEL_STYLES[(lead as any).lead_level] || LEVEL_STYLES.L0)}>
                      {(lead as any).lead_level || 'L0'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={cn('text-[10px] font-normal', STATUS_STYLES[lead.stage] || 'bg-muted/50 text-muted-foreground border-border')}>
                      {STAGE_MAP[lead.stage] || lead.stage}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-[13px]">
                    {lead.setter_id ? profileMap[lead.setter_id] || '—' : '—'}
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1.5">
                      {['new', 'in_pool', 'backlog', 'recycled'].includes(lead.stage) && !lead.setter_id && (
                        <Button
                          variant="default"
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() => handleTakeLead(lead)}
                        >
                          <Flame className="mr-1 h-3 w-3" /> Übernehmen
                        </Button>
                      )}
                      {isAdmin && ['new', 'backlog', 'recycled'].includes(lead.stage) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() => setAssignModal({ lead, type: 'setter' })}
                        >
                          <UserPlus className="mr-1 h-3 w-3" /> Setter
                        </Button>
                      )}
                      {isAdmin && lead.stage === 'ready_for_closer' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() => setAssignModal({ lead, type: 'closer' })}
                        >
                          <UserPlus className="mr-1 h-3 w-3" /> Closer
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Drawer */}
      {selectedLead && (
        <LeadDetailDrawer lead={selectedLead} onClose={() => setSelectedLead(null)} profiles={profileMap} />
      )}

      {/* Assign Modal */}
      <Dialog open={!!assignModal} onOpenChange={open => !open && setAssignModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">
              {assignModal?.type === 'setter' ? 'Setter zuweisen' : 'Closer zuweisen'}
            </DialogTitle>
            <DialogDescription>
              {assignModal?.type === 'setter'
                ? 'Diesen Lead in den Setter-Workflow routen.'
                : 'Qualifizierten Lead an Closer übergeben.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-xs text-muted-foreground">Lead</Label>
              <p className="mt-1 font-medium text-foreground">{assignModal?.lead.name}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                {assignModal?.type === 'setter' ? 'Setter auswählen' : 'Closer auswählen'}
              </Label>
              <Select value={selectedAssignee} onValueChange={setSelectedAssignee}>
                <SelectTrigger className="mt-1 h-9 text-sm">
                  <SelectValue placeholder="Person auswählen…" />
                </SelectTrigger>
                <SelectContent>
                  {(assignModal?.type === 'setter' ? setterProfiles : closerProfiles).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name || 'N/A'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Notiz (optional)</Label>
              <Textarea
                value={assignNote}
                onChange={e => setAssignNote(e.target.value)}
                className="mt-1 text-sm"
                placeholder="Zusätzliche Informationen…"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setAssignModal(null)}>Abbrechen</Button>
              <Button size="sm" onClick={handleAssign} disabled={!selectedAssignee}>Zuweisen</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Test Lead Modal */}
      <Dialog open={showCreateLead} onOpenChange={setShowCreateLead}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Test Lead erstellen</DialogTitle>
            <DialogDescription>Neuen Lead manuell in den Pool einfügen.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={newLead.name} onChange={e => setNewLead(p => ({ ...p, name: e.target.value }))} placeholder="Max Mustermann" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">E-Mail</Label>
              <Input value={newLead.email} onChange={e => setNewLead(p => ({ ...p, email: e.target.value }))} placeholder="max@example.com" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Telefon</Label>
              <Input value={newLead.phone} onChange={e => setNewLead(p => ({ ...p, phone: e.target.value }))} placeholder="+49..." className="mt-1" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowCreateLead(false)}>Abbrechen</Button>
              <Button size="sm" onClick={handleCreateLead}>Erstellen</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}