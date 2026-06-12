import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, GripVertical, Save } from 'lucide-react';

const CTA_OPTIONS = [
  { value: 'chat', label: 'Chat → /members/community' },
  { value: 'learn', label: 'Learn → /members/academy' },
  { value: 'support', label: 'Support → /members/help' },
  { value: 'none', label: 'Keine Aktion' },
];

const ICON_OPTIONS = ['TrendingUp', 'MessageSquare', 'Info', 'Headphones', 'Shield', 'Users', 'Target', 'Zap'];

interface SectionSettings {
  id: string;
  section_title: string;
  section_subtitle: string;
  is_enabled: boolean;
}

interface CardRow {
  id: string;
  title: string;
  description: string;
  cta_label: string;
  cta_action: string;
  icon_name: string;
  sort_order: number;
  is_enabled: boolean;
}

interface MemberRow {
  id: string;
  name: string;
  role: string;
  initials: string;
  sort_order: number;
  is_enabled: boolean;
}

export default function SupportTeamAdmin() {
  const { toast } = useToast();
  const [section, setSection] = useState<SectionSettings | null>(null);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    const [secRes, cardsRes, membersRes] = await Promise.all([
      supabase.from('support_team_section').select('*').limit(1).single(),
      supabase.from('support_team_cards').select('*').order('sort_order'),
      supabase.from('support_team_members').select('*').order('sort_order'),
    ]);
    if (secRes.data) setSection(secRes.data as any);
    setCards((cardsRes.data as any[]) ?? []);
    setMembers((membersRes.data as any[]) ?? []);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const saveSection = async () => {
    if (!section) return;
    setSaving(true);
    await supabase.from('support_team_section').update({
      section_title: section.section_title,
      section_subtitle: section.section_subtitle,
      is_enabled: section.is_enabled,
      updated_at: new Date().toISOString(),
    }).eq('id', section.id);
    toast({ title: 'Sektion gespeichert' });
    setSaving(false);
  };

  const saveCard = async (card: CardRow) => {
    await supabase.from('support_team_cards').update({
      title: card.title,
      description: card.description,
      cta_label: card.cta_label,
      cta_action: card.cta_action,
      icon_name: card.icon_name,
      sort_order: card.sort_order,
      is_enabled: card.is_enabled,
      updated_at: new Date().toISOString(),
    }).eq('id', card.id);
    toast({ title: `Karte "${card.title}" gespeichert` });
  };

  const addCard = async () => {
    const maxOrder = cards.reduce((m, c) => Math.max(m, c.sort_order), -1);
    const { data } = await supabase.from('support_team_cards').insert({
      title: 'Neue Karte',
      description: 'Beschreibung hinzufügen',
      cta_label: 'Mehr erfahren',
      cta_action: 'none',
      icon_name: 'Info',
      sort_order: maxOrder + 1,
    }).select().single();
    if (data) setCards(prev => [...prev, data as any]);
  };

  const deleteCard = async (id: string) => {
    await supabase.from('support_team_cards').delete().eq('id', id);
    setCards(prev => prev.filter(c => c.id !== id));
    toast({ title: 'Karte gelöscht' });
  };

  const saveMember = async (member: MemberRow) => {
    await supabase.from('support_team_members').update({
      name: member.name,
      role: member.role,
      initials: member.initials,
      sort_order: member.sort_order,
      is_enabled: member.is_enabled,
      updated_at: new Date().toISOString(),
    }).eq('id', member.id);
    toast({ title: `"${member.name}" gespeichert` });
  };

  const addMember = async () => {
    const maxOrder = members.reduce((m, p) => Math.max(m, p.sort_order), -1);
    const { data } = await supabase.from('support_team_members').insert({
      name: 'Neue Person',
      role: 'Rolle',
      initials: 'NP',
      sort_order: maxOrder + 1,
    }).select().single();
    if (data) setMembers(prev => [...prev, data as any]);
  };

  const deleteMember = async (id: string) => {
    await supabase.from('support_team_members').delete().eq('id', id);
    setMembers(prev => prev.filter(m => m.id !== id));
    toast({ title: 'Person gelöscht' });
  };

  const updateCard = (id: string, patch: Partial<CardRow>) => {
    setCards(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  };

  const updateMember = (id: string, patch: Partial<MemberRow>) => {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
  };

  if (!section) return <p className="text-sm text-muted-foreground py-8 text-center">Lade…</p>;

  return (
    <div className="space-y-8">
      {/* Section Settings */}
      <div className="rounded-xl border border-border/40 bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Sektions-Einstellungen</h3>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Aktiv</Label>
            <Switch checked={section.is_enabled} onCheckedChange={v => setSection({ ...section, is_enabled: v })} />
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Titel</Label>
          <Input value={section.section_title} onChange={e => setSection({ ...section, section_title: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Untertitel</Label>
          <Textarea value={section.section_subtitle} onChange={e => setSection({ ...section, section_subtitle: e.target.value })} className="mt-1" rows={2} />
        </div>
        <Button size="sm" onClick={saveSection} disabled={saving}>
          <Save className="mr-1.5 h-3 w-3" /> Speichern
        </Button>
      </div>

      {/* Role Cards */}
      <div className="rounded-xl border border-border/40 bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Rollen-Karten</h3>
          <Button variant="outline" size="sm" onClick={addCard}><Plus className="mr-1 h-3 w-3" /> Karte</Button>
        </div>
        {cards.map((card, idx) => (
          <div key={card.id} className="rounded-lg border border-border/30 bg-background p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30" />
                <span className="text-xs font-medium text-muted-foreground">#{card.sort_order + 1}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Label className="text-[10px] text-muted-foreground">Aktiv</Label>
                  <Switch checked={card.is_enabled} onCheckedChange={v => updateCard(card.id, { is_enabled: v })} />
                </div>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteCard(card.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] text-muted-foreground">Titel</Label>
                <Input value={card.title} onChange={e => updateCard(card.id, { title: e.target.value })} className="mt-0.5 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Icon</Label>
                <Select value={card.icon_name} onValueChange={v => updateCard(card.id, { icon_name: v })}>
                  <SelectTrigger className="mt-0.5 h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{ICON_OPTIONS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Beschreibung</Label>
              <Textarea value={card.description} onChange={e => updateCard(card.id, { description: e.target.value })} className="mt-0.5 text-sm" rows={2} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-[10px] text-muted-foreground">CTA Label</Label>
                <Input value={card.cta_label} onChange={e => updateCard(card.id, { cta_label: e.target.value })} className="mt-0.5 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">CTA Aktion</Label>
                <Select value={card.cta_action} onValueChange={v => updateCard(card.id, { cta_action: v })}>
                  <SelectTrigger className="mt-0.5 h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{CTA_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Reihenfolge</Label>
                <Input type="number" value={card.sort_order} onChange={e => updateCard(card.id, { sort_order: Number(e.target.value) })} className="mt-0.5 h-8 text-sm" />
              </div>
            </div>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => saveCard(card)}>
              <Save className="mr-1 h-3 w-3" /> Speichern
            </Button>
          </div>
        ))}
      </div>

      {/* Team Members */}
      <div className="rounded-xl border border-border/40 bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Team-Mitglieder</h3>
          <Button variant="outline" size="sm" onClick={addMember}><Plus className="mr-1 h-3 w-3" /> Person</Button>
        </div>
        {members.map(member => (
          <div key={member.id} className="rounded-lg border border-border/30 bg-background p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30" />
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                  {member.initials}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Label className="text-[10px] text-muted-foreground">Aktiv</Label>
                  <Switch checked={member.is_enabled} onCheckedChange={v => updateMember(member.id, { is_enabled: v })} />
                </div>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteMember(member.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <Label className="text-[10px] text-muted-foreground">Name</Label>
                <Input value={member.name} onChange={e => updateMember(member.id, { name: e.target.value })} className="mt-0.5 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Rolle</Label>
                <Input value={member.role} onChange={e => updateMember(member.id, { role: e.target.value })} className="mt-0.5 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Initialen</Label>
                <Input value={member.initials} onChange={e => updateMember(member.id, { initials: e.target.value })} className="mt-0.5 h-8 text-sm" maxLength={3} />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Reihenfolge</Label>
                <Input type="number" value={member.sort_order} onChange={e => updateMember(member.id, { sort_order: Number(e.target.value) })} className="mt-0.5 h-8 text-sm" />
              </div>
            </div>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => saveMember(member)}>
              <Save className="mr-1 h-3 w-3" /> Speichern
            </Button>
          </div>
        ))}
        {members.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Keine Team-Mitglieder. Füge eine Person hinzu.</p>
        )}
      </div>
    </div>
  );
}
