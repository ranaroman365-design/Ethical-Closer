import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Save, Video } from 'lucide-react';

interface LiveCall {
  id: string;
  title: string;
  weekday: string;
  time_slot: string;
  description: string;
  join_link: string;
  is_active: boolean;
  sort_order: number;
}

export default function LiveCallsAdmin() {
  const { toast } = useToast();
  const [calls, setCalls] = useState<LiveCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('live_calls').select('*').order('sort_order').then(({ data }) => {
      setCalls((data as LiveCall[]) ?? []);
      setLoading(false);
    });
  }, []);

  const updateCall = (id: string, field: string, value: any) => {
    setCalls(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const saveCall = async (call: LiveCall) => {
    setSaving(call.id);
    const { error } = await supabase.from('live_calls').update({
      title: call.title,
      weekday: call.weekday,
      time_slot: call.time_slot,
      description: call.description,
      join_link: call.join_link,
      is_active: call.is_active,
      updated_at: new Date().toISOString(),
    }).eq('id', call.id);
    setSaving(null);
    if (error) {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Gespeichert' });
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Lade…</p>;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Verwalte die wiederkehrenden Live-Trainings. Änderungen werden sofort für alle Mitglieder sichtbar.
      </p>
      {calls.map(call => (
        <div key={call.id} className="rounded-xl border border-border/40 bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">{call.weekday} · {call.time_slot}</span>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-[11px] text-muted-foreground">Aktiv</Label>
              <Switch checked={call.is_active} onCheckedChange={v => updateCall(call.id, 'is_active', v)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-[11px]">Titel</Label>
              <Input value={call.title} onChange={e => updateCall(call.id, 'title', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-[11px]">Wochentag</Label>
              <Input value={call.weekday} onChange={e => updateCall(call.id, 'weekday', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-[11px]">Uhrzeit</Label>
              <Input value={call.time_slot} onChange={e => updateCall(call.id, 'time_slot', e.target.value)} className="mt-1" />
            </div>
          </div>

          <div>
            <Label className="text-[11px]">Beschreibung</Label>
            <Textarea value={call.description} onChange={e => updateCall(call.id, 'description', e.target.value)} className="mt-1 min-h-[60px]" />
          </div>

          <div>
            <Label className="text-[11px]">Einwahllink / Meeting-Link</Label>
            <Input value={call.join_link} onChange={e => updateCall(call.id, 'join_link', e.target.value)} placeholder="https://zoom.us/j/..." className="mt-1" />
          </div>

          <Button size="sm" className="text-xs" onClick={() => saveCall(call)} disabled={saving === call.id}>
            <Save className="mr-1 h-3 w-3" />
            {saving === call.id ? 'Speichern…' : 'Speichern'}
          </Button>
        </div>
      ))}
    </div>
  );
}
