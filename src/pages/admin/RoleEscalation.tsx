import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UserPlus, Clock, CheckCircle2, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

interface EscalationRequest {
  id: string;
  requester_id: string;
  requested_role: string;
  reason: string;
  duration_minutes: number;
  status: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_notes: string | null;
  active_until: string | null;
  created_at: string;
}

export default function RoleEscalation() {
  const { can, isOwner } = usePermissions();
  const { user } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<EscalationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!can('role_escalation')) return;
    supabase
      .from('role_escalation_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setRequests((data as EscalationRequest[]) ?? []);
        setLoading(false);
      });
  }, [can]);

  if (!can('role_escalation')) {
    return <Navigate to="/members" replace />;
  }

  /** Server-side approval via edge function — NO client-side writes */
  const handleDecision = async (id: string, decision: 'approved' | 'denied') => {
    if (!user) return;
    setActionLoading(id);

    try {
      const { data, error } = await supabase.functions.invoke('secure-admin-action', {
        body: {
          action: decision === 'approved' ? 'approve_escalation' : 'deny_escalation',
          target_id: id,
          notes: null,
        },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error ?? 'Unknown error');

      setRequests(prev => prev.map(r =>
        r.id === id ? { ...r, status: decision, active_until: data.valid_until } : r
      ));
      toast({ title: decision === 'approved' ? 'Zugang gewährt' : 'Anfrage abgelehnt' });
    } catch (err: any) {
      toast({ title: 'Fehler', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const pending = requests.filter(r => r.status === 'pending');
  const decided = requests.filter(r => r.status !== 'pending');

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-6">
      <div className="flex items-center gap-3">
        <UserPlus className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Role Escalation</h1>
          <p className="text-sm text-muted-foreground">Temporäre Rechteerweiterungen mit Genehmigung</p>
        </div>
      </div>

      {!isOwner && (
        <Card className="border-border/50 bg-muted/30">
          <CardContent className="pt-4 pb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground">
              Nur der Owner kann Eskalationsanfragen genehmigen oder ablehnen. Administratoren können nur anfragen.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Pending */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" /> Offene Anfragen ({pending.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine offenen Anfragen.</p>
          ) : pending.map(req => (
            <div key={req.id} className="p-4 rounded-lg border border-border/50 bg-card/50 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-[10px]">{req.requested_role}</Badge>
                <span className="text-xs text-muted-foreground">{req.duration_minutes} Min</span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {new Date(req.created_at).toLocaleString('de-DE')}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{req.reason}</p>
              {/* OWNER ONLY — administrators cannot approve */}
              {isOwner && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleDecision(req.id, 'approved')}
                    disabled={actionLoading === req.id}
                  >
                    {actionLoading === req.id && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                    Genehmigen
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDecision(req.id, 'denied')}
                    disabled={actionLoading === req.id}
                  >
                    Ablehnen
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Verlauf ({decided.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
          {decided.map(req => (
            <div key={req.id} className="p-3 rounded-lg border border-border/50 bg-card/50 flex items-center gap-2">
              {req.status === 'approved' ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" /> : <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
              <Badge variant="outline" className="text-[10px]">{req.requested_role}</Badge>
              <span className="text-xs text-muted-foreground flex-1">{req.reason}</span>
              {req.active_until && (
                <span className="text-[10px] text-muted-foreground">
                  bis {new Date(req.active_until).toLocaleString('de-DE')}
                </span>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
