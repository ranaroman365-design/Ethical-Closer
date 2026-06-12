import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClipboardCheck, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function ApprovalQueue() {
  const { isSecurityPrivileged, isOwner } = usePermissions();
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase.from('approval_requests')
      .select('*').in('status', ['pending']).order('created_at', { ascending: false }).limit(100);
    setItems(data ?? []);
    setLoading(false);
  };

  useEffect(() => { if (isSecurityPrivileged) load(); }, [isSecurityPrivileged]);

  if (!isSecurityPrivileged) return <Navigate to="/members" replace />;

  const decide = async (id: string, approved: boolean) => {
    await supabase.from('approval_requests').update({
      status: approved ? 'approved' : 'denied',
      ...(approved ? { decided_by: user?.id, decided_at: new Date().toISOString() } : { denied_by: user?.id, denied_at: new Date().toISOString() }),
    }).eq('id', id);
    toast.success(approved ? 'Genehmigt' : 'Abgelehnt');
    load();
  };

  const TYPE_LABELS: Record<string, string> = {
    export: 'Export', role_escalation: 'Escalation', workflow_change: 'Workflow',
    config_change: 'Config', token_rotation: 'Token', prompt_access: 'Prompt',
    experiment_launch: 'Experiment',
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-6">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Approval Queue</h1>
          <p className="text-sm text-muted-foreground">Freigabe-Anfragen für Exports, Escalations, Workflows & Config</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{items.length} ausstehend</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground">Lade…</p> : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine offenen Freigaben.</p>
          ) : (
            <div className="space-y-2">
              {items.map(item => (
                <div key={item.id} className="p-3 rounded-lg border border-border/50 bg-card/50 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-[10px]">
                        {TYPE_LABELS[item.approval_type ?? item.request_type] ?? item.request_type}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">{item.status}</Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {item.reason || item.decision_notes || 'Keine Begründung'}
                      {' · '}{new Date(item.created_at).toLocaleDateString('de-DE')}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600" onClick={() => decide(item.id, true)}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Genehmigen
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={() => decide(item.id, false)}>
                      <XCircle className="h-3 w-3 mr-1" /> Ablehnen
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
