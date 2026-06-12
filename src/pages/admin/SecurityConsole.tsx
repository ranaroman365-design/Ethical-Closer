import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, AlertTriangle, Activity, Users, Key, Clock, Loader2, Zap } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

interface SecurityEvent {
  id: string;
  actor_user_id: string | null;
  actor_role: string | null;
  event_type: string;
  severity: string;
  risk_score: number;
  target_resource_type: string | null;
  target_resource_id: string | null;
  result: string;
  metadata: Record<string, any>;
  created_at: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-destructive text-destructive-foreground',
  high: 'bg-orange-600 text-white',
  medium: 'bg-yellow-600 text-white',
  low: 'bg-muted text-muted-foreground',
  info: 'bg-secondary text-secondary-foreground',
};

interface BreakGlassEvent {
  id: string;
  triggered_by_user_id: string;
  trigger_reason: string;
  activated_at: string;
  expires_at: string;
  status: string;
}

export default function SecurityConsole() {
  const { can, isSecurityPrivileged, isOwner } = usePermissions();
  const { user } = useAuth();
  const { toast } = useToast();
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [breakGlass, setBreakGlass] = useState<BreakGlassEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [bgLoading, setBgLoading] = useState(false);

  useEffect(() => {
    if (!isSecurityPrivileged) return;
    const query = supabase
      .from('security_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (filter !== 'all') {
      query.eq('severity', filter);
    }

    query.then(({ data }) => {
      setEvents((data as SecurityEvent[]) ?? []);
      setLoading(false);
    });

    // Load break-glass events (owner only via RLS)
    if (isOwner) {
      supabase.from('break_glass_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
        .then(({ data }) => setBreakGlass((data as BreakGlassEvent[]) ?? []));
    }
  }, [isSecurityPrivileged, isOwner, filter]);

  const handleRevokeBreakGlass = async (eventId: string) => {
    setBgLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('revoke-break-glass', {
        body: { event_id: eventId },
      });
      if (error) throw new Error(error.message);
      setBreakGlass(prev => prev.map(bg => bg.id === eventId ? { ...bg, status: 'revoked' } : bg));
      toast({ title: 'Break-Glass widerrufen' });
    } catch (err: any) {
      toast({ title: 'Fehler', description: err.message, variant: 'destructive' });
    } finally {
      setBgLoading(false);
    }
  };

  if (!isSecurityPrivileged) {
    return <Navigate to="/members" replace />;
  }

  const criticalCount = events.filter(e => e.severity === 'critical').length;
  const highCount = events.filter(e => e.severity === 'high').length;
  const recentExports = events.filter(e => e.event_type === 'export_requested').length;
  const roleChanges = events.filter(e => e.event_type === 'role_change').length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Security Console</h1>
          <p className="text-sm text-muted-foreground">Sicherheitsereignisse, Anomalien und Systemzustand</p>
        </div>
      </div>

      {/* Break-Glass Sessions — Owner Only */}
      {isOwner && breakGlass.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-destructive">
              <Zap className="h-4 w-4" /> Break-Glass Sessions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {breakGlass.map(bg => (
              <div key={bg.id} className="p-3 rounded-lg border border-destructive/20 bg-destructive/5 flex items-center gap-3">
                <Badge className={bg.status === 'active' ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground'}>
                  {bg.status}
                </Badge>
                <span className="text-xs text-foreground flex-1">{bg.trigger_reason}</span>
                <span className="text-[10px] text-muted-foreground">
                  bis {new Date(bg.expires_at).toLocaleString('de-DE')}
                </span>
                {bg.status === 'active' && (
                  <Button size="sm" variant="destructive" onClick={() => handleRevokeBreakGlass(bg.id)} disabled={bgLoading}>
                    {bgLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Widerrufen'}
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-2xl font-bold">{criticalCount}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Critical Events</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-orange-500" />
              <span className="text-2xl font-bold">{highCount}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">High Severity</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-primary" />
              <span className="text-2xl font-bold">{recentExports}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Export Requests</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-2xl font-bold">{roleChanges}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Role Changes</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="all">Alle</TabsTrigger>
          <TabsTrigger value="critical">Critical</TabsTrigger>
          <TabsTrigger value="high">High</TabsTrigger>
          <TabsTrigger value="medium">Medium</TabsTrigger>
          <TabsTrigger value="info">Info</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Event Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Security Event Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Lade Ereignisse…</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Ereignisse gefunden.</p>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {events.map(evt => (
                <div key={evt.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-card/50">
                  <Badge className={`${SEVERITY_COLORS[evt.severity] ?? SEVERITY_COLORS.info} shrink-0 text-[10px]`}>
                    {evt.severity}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{evt.event_type}</span>
                      {evt.risk_score >= 70 && (
                        <Badge variant="outline" className="text-[10px] border-destructive text-destructive">
                          Risk {evt.risk_score}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {evt.target_resource_type && <span>{evt.target_resource_type} → </span>}
                      <span>{new Date(evt.created_at).toLocaleString('de-DE')}</span>
                      {evt.actor_role && <span> · {evt.actor_role}</span>}
                    </div>
                    {evt.metadata && Object.keys(evt.metadata).length > 0 && (
                      <pre className="text-[10px] text-muted-foreground mt-1 bg-muted/30 rounded p-1 overflow-x-auto">
                        {JSON.stringify(evt.metadata, null, 2)}
                      </pre>
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
