import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Award, Search, RefreshCw, Shield, Check, X } from 'lucide-react';

interface CertUser {
  id: string;
  email: string | null;
  full_name: string | null;
  certified: boolean;
  certification_status: string;
}

export default function CertificationAdmin() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<CertUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [recalculating, setRecalculating] = useState<string | null>(null);

  async function searchUsers() {
    if (!search.trim()) return;
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, email, full_name, certified, certification_status')
      .or(`email.ilike.%${search}%,full_name.ilike.%${search}%`)
      .limit(20);
    setUsers((data as CertUser[]) ?? []);
    setLoading(false);
  }

  async function toggleCertified(userId: string, current: boolean) {
    await supabase.from('profiles').update({
      certified: !current,
      certification_status: !current ? 'certified' : 'not_started',
      updated_at: new Date().toISOString(),
    }).eq('id', userId);

    // Update certification_status table with admin override
    if (!current) {
      await supabase.from('certification_status').upsert({
        user_id: userId,
        certification_title: 'Certified',
        admin_override: true,
        admin_override_at: new Date().toISOString(),
        certified_at: new Date().toISOString(),
        current_level: '0',
        updated_at: new Date().toISOString(),
      } as any, { onConflict: 'user_id' });
    } else {
      await supabase.from('certification_status').update({
        certification_title: 'In Progress',
        admin_override: true,
        admin_override_at: new Date().toISOString(),
        certified_at: null,
        updated_at: new Date().toISOString(),
      } as any).eq('user_id', userId);
    }

    setUsers(prev => prev.map(u => u.id === userId ? { ...u, certified: !current, certification_status: !current ? 'certified' : 'not_started' } : u));
    toast({ title: !current ? 'Zertifizierung erteilt' : 'Zertifizierung entzogen' });
  }

  async function recalcUser(userId: string) {
    setRecalculating(userId);
    const { data, error } = await supabase.rpc('recalculate_certification', { p_user_id: userId });
    setRecalculating(null);
    if (error) {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Zertifizierung neu berechnet', description: `Status: ${(data as any)?.status}` });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Award className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Zertifizierungs-Verwaltung</h3>
      </div>

      <p className="text-[11px] text-muted-foreground mb-3">
        Zertifizierung manuell überschreiben, KPI verifizieren oder Performance-Nachweis bestätigen.
      </p>

      {/* Search */}
      <div className="flex gap-2">
        <Input
          placeholder="Name oder E-Mail suchen..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && searchUsers()}
          className="text-[12px]"
        />
        <Button variant="outline" size="sm" onClick={searchUsers} disabled={loading}>
          <Search className="h-3 w-3 mr-1" /> Suchen
        </Button>
      </div>

      {/* Results */}
      {users.length > 0 && (
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.id} className="flex items-center justify-between rounded-lg border border-border/40 bg-card p-3">
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-foreground truncate">{u.full_name || u.email}</p>
                <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant="outline" className={`text-[9px] ${u.certified ? 'text-primary border-primary/30' : 'text-muted-foreground'}`}>
                  {u.certified ? 'Certified' : u.certification_status || 'In Progress'}
                </Badge>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">Zertifiziert</span>
                  <Switch checked={u.certified} onCheckedChange={() => toggleCertified(u.id, u.certified)} />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[10px]"
                  onClick={() => recalcUser(u.id)}
                  disabled={recalculating === u.id}
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${recalculating === u.id ? 'animate-spin' : ''}`} />
                  Berechnen
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {users.length === 0 && search && !loading && (
        <p className="text-[11px] text-muted-foreground text-center py-4">Keine Ergebnisse.</p>
      )}
    </div>
  );
}
