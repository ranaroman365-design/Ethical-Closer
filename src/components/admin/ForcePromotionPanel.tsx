import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowUpCircle, Search, CheckCircle2, XCircle } from 'lucide-react';

interface ProfileResult {
  id: string;
  full_name: string | null;
  business_stage: string | null;
}

const VALID_STAGES = [
  'prospect', 'opener', 'setter', 'senior_associate',
  'senior_setter', 'junior_manager', 'manager',
  'senior_manager', 'director', 'partner',
];

export default function ForcePromotionPanel() {
  const { isAdmin } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileResult[]>([]);
  const [selected, setSelected] = useState<ProfileResult | null>(null);
  const [targetStage, setTargetStage] = useState('opener');
  const [promoting, setPromoting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!isAdmin) return null;

  const search = async (q: string) => {
    setQuery(q);
    if (q.length < 2) { setResults([]); return; }
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, business_stage')
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(10);
    setResults((data as ProfileResult[]) || []);
  };

  const promote = async () => {
    if (!selected) return;
    setPromoting(true);
    setResult(null);
    try {
      const { data, error } = await supabase.rpc('promote_user', {
        p_user_id: selected.id,
        p_admin_id: (await supabase.auth.getUser()).data.user?.id,
      });
      if (error) throw error;
      // Re-fetch to confirm
      const { data: updated } = await supabase
        .from('profiles')
        .select('business_stage')
        .eq('id', selected.id)
        .single();
      setSelected({ ...selected, business_stage: (updated as any)?.business_stage || targetStage });
      setResult({ success: true, message: `✓ Befördert zu ${(updated as any)?.business_stage || targetStage}` });
    } catch (err: any) {
      setResult({ success: false, message: `✗ ${err.message || 'Fehler'}` });
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <ArrowUpCircle className="h-5 w-5 text-accent" />
        Manuelle Beförderung
      </h2>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="User suchen (Name oder E-Mail)..."
          className="pl-9 text-sm"
        />
      </div>

      {results.length > 0 && !selected && (
        <div className="rounded-lg border border-border/40 bg-card divide-y divide-border/20 max-h-48 overflow-y-auto">
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => { setSelected(p); setResults([]); setQuery(p.full_name || ''); }}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 text-sm text-left"
            >
              <span className="text-foreground">{p.full_name || 'Unbekannt'}</span>
              <Badge variant="outline" className="text-[10px]">{p.business_stage}</Badge>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="rounded-lg border border-border/40 bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{selected.full_name}</p>
              <p className="text-xs text-muted-foreground">Aktuell: {selected.business_stage}</p>
            </div>
            <button onClick={() => { setSelected(null); setQuery(''); setResult(null); }} className="text-xs text-muted-foreground hover:text-foreground">
              Ändern
            </button>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Ziel-Stage</label>
            <select
              value={targetStage}
              onChange={(e) => setTargetStage(e.target.value)}
              className="w-full rounded border border-border/40 bg-background px-2 py-2 text-sm"
            >
              {VALID_STAGES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <Button onClick={promote} disabled={promoting} className="w-full text-sm gap-2">
            <ArrowUpCircle className="h-4 w-4" />
            {promoting ? 'Befördere...' : 'Befördern'}
          </Button>

          {result && (
            <div className={`flex items-center gap-2 text-sm ${result.success ? 'text-green-500' : 'text-destructive'}`}>
              {result.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {result.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
