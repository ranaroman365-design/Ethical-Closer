import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, CheckCircle2, Clock, XCircle, Shield, Loader2, FileDown } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

interface ExportRequest {
  id: string;
  export_type: string;
  resource_type: string;
  risk_level: string;
  row_count: number | null;
  status: string;
  reason: string | null;
  requested_by: string;
  approved_by: string | null;
  approved_at: string | null;
  file_path: string | null;
  forensic_marker: string | null;
  created_at: string;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  requested: <Clock className="h-3.5 w-3.5 text-warning" />,
  queued: <CheckCircle2 className="h-3.5 w-3.5 text-success" />,
  processing: <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />,
  completed: <Download className="h-3.5 w-3.5 text-primary" />,
  blocked: <XCircle className="h-3.5 w-3.5 text-destructive" />,
  failed: <XCircle className="h-3.5 w-3.5 text-destructive" />,
};

const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-600/20 text-green-400 border-green-600/30',
  medium: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30',
  high: 'bg-orange-600/20 text-orange-400 border-orange-600/30',
  critical: 'bg-destructive/20 text-destructive border-destructive/30',
};

export default function ExportCenter() {
  const { can, isSecurityPrivileged, isOwner } = usePermissions();
  const { user, session } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<ExportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!can('export_center')) return;
    supabase
      .from('export_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setRequests((data as ExportRequest[]) ?? []);
        setLoading(false);
      });
  }, [can]);

  if (!can('export_center')) {
    return <Navigate to="/members" replace />;
  }

  /** Server-side approval via edge function — NO client-side writes */
  const handleDecision = async (id: string, decision: 'approved' | 'denied') => {
    if (!user || !session) return;
    setActionLoading(id);

    try {
      const { data, error } = await supabase.functions.invoke('approve-export-request', {
        body: {
          export_request_id: id,
          decision,
          notes: null,
          step_up_token: session.access_token, // pass current token as step-up proof
        },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error ?? 'Unknown error');

      setRequests(prev => prev.map(r =>
        r.id === id ? { ...r, ...data.updated_request } : r
      ));
      toast({ title: data.user_message ?? (decision === 'approved' ? 'Export genehmigt' : 'Export abgelehnt') });
    } catch (err: any) {
      toast({ title: 'Fehler', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  /** Server-side export generation via edge function — NO client-side file creation */
  const handleGenerate = async (id: string) => {
    if (!user) return;
    setActionLoading(id);

    try {
      const { data, error } = await supabase.functions.invoke('generate-export', {
        body: { export_request_id: id },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error ?? 'Unknown error');

      setRequests(prev => prev.map(r =>
        r.id === id ? { ...r, status: 'completed', file_path: data.file_ref, forensic_marker: data.forensic_marker } : r
      ));
      toast({ title: `Export generiert — ${data.row_count} Zeilen` });
    } catch (err: any) {
      toast({ title: 'Fehler', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Export Center</h1>
          <p className="text-sm text-muted-foreground">Kontrollierte Datenexporte mit Genehmigungsworkflow</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{requests.length} Export-Anfragen</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Lade…</p>
          ) : requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Export-Anfragen vorhanden.</p>
          ) : (
            <div className="space-y-3">
              {requests.map(req => (
                <div key={req.id} className="p-4 rounded-lg border border-border/50 bg-card/50 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {STATUS_ICONS[req.status] ?? STATUS_ICONS.requested}
                    <span className="text-sm font-medium text-foreground">{req.resource_type}</span>
                    <Badge variant="outline" className="text-[10px]">{req.export_type}</Badge>
                    <Badge variant="outline" className={`text-[10px] ${RISK_COLORS[req.risk_level] ?? ''}`}>
                      {req.risk_level}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">{req.status}</Badge>
                    {req.forensic_marker && (
                      <span className="text-[10px] text-muted-foreground font-mono">{req.forensic_marker}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {new Date(req.created_at).toLocaleString('de-DE')}
                    </span>
                  </div>
                  {req.reason && <p className="text-xs text-muted-foreground">{req.reason}</p>}

                  <div className="flex gap-2 mt-2 flex-wrap">
                    {/* Approval buttons — OWNER ONLY for pending requests */}
                    {req.status === 'requested' && isOwner && (
                      <>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleDecision(req.id, 'approved')}
                          disabled={actionLoading === req.id}
                        >
                          {actionLoading === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
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
                      </>
                    )}

                    {/* Generate button — OWNER ONLY for approved/queued requests */}
                    {req.status === 'queued' && isOwner && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleGenerate(req.id)}
                        disabled={actionLoading === req.id}
                      >
                        {actionLoading === req.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                          : <FileDown className="h-3.5 w-3.5 mr-1" />}
                        Exportieren
                      </Button>
                    )}

                    {/* Completed — show file info */}
                    {req.status === 'completed' && req.file_path && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-success" />
                        Server-generiert · {req.file_path.startsWith('storage_error') ? 'Speicherfehler' : 'Bereit'}
                      </span>
                    )}
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
