import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Workflow } from 'lucide-react';

export default function WorkflowRegistry() {
  const { isSecurityPrivileged } = usePermissions();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSecurityPrivileged) return;
    supabase.from('workflow_registry').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setItems(data ?? []); setLoading(false); });
  }, [isSecurityPrivileged]);

  if (!isSecurityPrivileged) return <Navigate to="/members" replace />;

  const STATUS_COLORS: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-600',
    paused: 'bg-amber-500/10 text-amber-600',
    draft: 'bg-muted text-muted-foreground',
    deprecated: 'bg-destructive/10 text-destructive',
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-6">
      <div className="flex items-center gap-3">
        <Workflow className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Workflow Registry</h1>
          <p className="text-sm text-muted-foreground">Registrierte Automations-Workflows & Provider-Zuordnungen</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{items.length} Workflows</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground">Lade…</p> : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Workflows registriert.</p>
          ) : (
            <div className="space-y-2">
              {items.map(w => (
                <div key={w.id} className="p-3 rounded-lg border border-border/50 bg-card/50">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{w.name || w.workflow_key}</span>
                    <Badge className={STATUS_COLORS[w.status] ?? 'bg-muted text-muted-foreground'} variant="secondary">{w.status}</Badge>
                    {w.provider && <Badge variant="outline" className="text-[10px]">{w.provider}</Badge>}
                    {w.sensitivity_level && (
                      <Badge variant="outline" className="text-[10px]">{w.sensitivity_level?.toUpperCase()}</Badge>
                    )}
                    {w.owner_only && <Badge variant="destructive" className="text-[10px]">Owner Only</Badge>}
                  </div>
                  {w.description && <p className="text-[10px] text-muted-foreground mt-1">{w.description}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
