import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Edit2, Gift } from 'lucide-react';

interface BenefitRow {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlock_type: string;
  unlock_value: string;
  reward_type: string;
  redeem_link: string | null;
  redeem_code: string | null;
  is_new: boolean;
  active: boolean;
}

const ICONS = ['Gift', 'Star', 'Sparkles', 'Award', 'Ticket', 'Key', 'Package', 'Zap'];
const REWARD_TYPES = [
  { value: 'voucher', label: 'Voucher' },
  { value: 'access', label: 'Access' },
  { value: 'digital', label: 'Digital' },
  { value: 'physical', label: 'Physical' },
];
const UNLOCK_TYPES = [
  { value: 'level_based', label: 'Level-basiert' },
  { value: 'milestone_based', label: 'Milestone-basiert' },
];

const emptyForm = {
  title: '', description: '', icon: 'Gift', unlock_type: 'level_based',
  unlock_value: '1', reward_type: 'digital', redeem_link: '', redeem_code: '',
  is_new: true, active: true,
};

export default function BenefitsAdmin() {
  const { toast } = useToast();
  const [benefits, setBenefits] = useState<BenefitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase.from('benefits' as any).select('*').order('unlock_value');
    setBenefits((data as unknown as BenefitRow[]) ?? []);
    setLoading(false);
  }

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(b: BenefitRow) {
    setForm({
      title: b.title, description: b.description, icon: b.icon,
      unlock_type: b.unlock_type, unlock_value: b.unlock_value,
      reward_type: b.reward_type, redeem_link: b.redeem_link || '',
      redeem_code: b.redeem_code || '', is_new: b.is_new, active: b.active,
    });
    setEditingId(b.id);
    setShowForm(true);
  }

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      icon: form.icon,
      unlock_type: form.unlock_type,
      unlock_value: form.unlock_value,
      reward_type: form.reward_type,
      redeem_link: form.redeem_link || null,
      redeem_code: form.redeem_code || null,
      is_new: form.is_new,
      active: form.active,
      updated_at: new Date().toISOString(),
    };

    if (editingId) {
      await (supabase.from('benefits' as any) as any).update(payload).eq('id', editingId);
      toast({ title: 'Benefit aktualisiert' });
    } else {
      await (supabase.from('benefits' as any) as any).insert(payload);
      toast({ title: 'Benefit erstellt' });
    }
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function deleteBenefit(id: string) {
    await (supabase.from('benefits' as any) as any).delete().eq('id', id);
    setBenefits(prev => prev.filter(b => b.id !== id));
    toast({ title: 'Benefit gelöscht' });
  }

  async function toggleActive(id: string, current: boolean) {
    await (supabase.from('benefits' as any) as any).update({ active: !current }).eq('id', id);
    setBenefits(prev => prev.map(b => b.id === id ? { ...b, active: !current } : b));
  }

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Lade Benefits…</p>;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button variant="outline" size="sm" className="text-xs" onClick={openCreate}>
          <Plus className="mr-1 h-3 w-3" />Neuer Benefit
        </Button>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Benefit bearbeiten' : 'Neuer Benefit'}</DialogTitle>
            <DialogDescription>Definiere Titel, Unlock-Bedingung und Belohnung.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div><Label className="text-[12px]">Titel</Label><Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className="mt-1" /></div>
            <div><Label className="text-[12px]">Beschreibung</Label><Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px]">Icon</Label>
                <select value={form.icon} onChange={e => setForm(p => ({ ...p, icon: e.target.value }))} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-2 text-[12px]">
                  {ICONS.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-[12px]">Reward Typ</Label>
                <select value={form.reward_type} onChange={e => setForm(p => ({ ...p, reward_type: e.target.value }))} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-2 text-[12px]">
                  {REWARD_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px]">Unlock Typ</Label>
                <select value={form.unlock_type} onChange={e => setForm(p => ({ ...p, unlock_type: e.target.value }))} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-2 text-[12px]">
                  {UNLOCK_TYPES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-[12px]">Unlock Wert (Level # oder Milestone ID)</Label>
                <Input value={form.unlock_value} onChange={e => setForm(p => ({ ...p, unlock_value: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div><Label className="text-[12px]">Redeem Link (optional)</Label><Input value={form.redeem_link} onChange={e => setForm(p => ({ ...p, redeem_link: e.target.value }))} placeholder="https://..." className="mt-1" /></div>
            <div><Label className="text-[12px]">Redeem Code (optional)</Label><Input value={form.redeem_code} onChange={e => setForm(p => ({ ...p, redeem_code: e.target.value }))} placeholder="VOUCHER-123" className="mt-1" /></div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_new} onCheckedChange={v => setForm(p => ({ ...p, is_new: v }))} />
              <span className="text-[12px] text-muted-foreground">Als "NEW" markieren</span>
              <Switch checked={form.active} onCheckedChange={v => setForm(p => ({ ...p, active: v }))} />
              <span className="text-[12px] text-muted-foreground">Aktiv</span>
            </div>
            <Button onClick={save} disabled={saving} className="w-full bg-accent text-accent-foreground hover:bg-accent/90 text-xs">
              {saving ? 'Speichern…' : editingId ? 'Aktualisieren' : 'Erstellen'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-2">
        {benefits.map(b => (
          <div key={b.id} className="flex items-center gap-3 rounded-xl border border-border/40 bg-card p-4">
            <Gift className="h-4 w-4 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-medium text-foreground truncate">{b.title}</p>
                {b.is_new && <Badge className="bg-accent/15 text-accent border-0 text-[9px]">NEW</Badge>}
              </div>
              <p className="text-[10px] text-muted-foreground">
                {b.unlock_type === 'level_based' ? `Level ${b.unlock_value}` : `Milestone: ${b.unlock_value}`} · {b.reward_type}
                {b.redeem_code && ` · Code: ${b.redeem_code}`}
              </p>
            </div>
            <Switch checked={b.active} onCheckedChange={() => toggleActive(b.id, b.active)} />
            <button onClick={() => openEdit(b)} className="text-muted-foreground hover:text-foreground"><Edit2 className="h-3.5 w-3.5" /></button>
            <button onClick={() => deleteBenefit(b.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
        {benefits.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Noch keine Benefits erstellt.</p>}
      </div>
    </div>
  );
}
