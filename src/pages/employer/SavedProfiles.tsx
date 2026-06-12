import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useEmployerAccess } from '@/hooks/useEmployerAccess';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Trash2, MessageSquare } from 'lucide-react';

interface SavedEntry {
  id: string;
  candidate_user_id: string;
  created_at: string;
  profiles?: { full_name: string | null; business_stage: string; certified: boolean } | null;
}

export default function SavedProfiles() {
  const { companyId } = useEmployerAccess();
  const { toast } = useToast();
  const [entries, setEntries] = useState<SavedEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    (supabase as any)
      .from('employer_saved_profiles')
      .select('id, candidate_user_id, created_at, profiles:candidate_user_id(full_name, business_stage, certified)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setEntries((data ?? []) as unknown as SavedEntry[]);
        setLoading(false);
      });
  }, [companyId]);

  async function remove(id: string) {
    await supabase.from('employer_saved_profiles').delete().eq('id', id);
    setEntries(prev => prev.filter(e => e.id !== id));
    toast({ title: 'Removed from saved' });
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-xl font-semibold text-foreground">Saved Profiles</h2>
        <p className="text-sm text-muted-foreground">{entries.length} profiles saved</p>
      </div>

      {entries.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground">No saved profiles yet.</p>
      ) : (
        <div className="space-y-3">
          {entries.map(e => (
            <div key={e.id} className="flex items-center justify-between rounded-xl border border-border/40 bg-card p-4">
              <div>
                <p className="font-semibold text-foreground">{(e.profiles as any)?.full_name || 'Anonymous'}</p>
                <p className="text-xs text-muted-foreground capitalize">{(e.profiles as any)?.business_stage?.replace(/_/g, ' ')}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => remove(e.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
