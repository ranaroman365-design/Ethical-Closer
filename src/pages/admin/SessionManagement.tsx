import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Monitor, Globe, Smartphone } from 'lucide-react';
import { Navigate } from 'react-router-dom';

interface SessionEvent {
  id: string;
  user_id: string;
  event_type: string;
  ip_address: string | null;
  country: string | null;
  user_agent: string | null;
  device_fingerprint: string | null;
  created_at: string;
}

export default function SessionManagement() {
  const { isSecurityPrivileged } = usePermissions();
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSecurityPrivileged) return;
    supabase
      .from('session_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setEvents((data as SessionEvent[]) ?? []);
        setLoading(false);
      });
  }, [isSecurityPrivileged]);

  if (!isSecurityPrivileged) return <Navigate to="/members" replace />;

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-6">
      <div className="flex items-center gap-3">
        <Monitor className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Session Management</h1>
          <p className="text-sm text-muted-foreground">Aktive Sitzungen, Geräte und Login-Ereignisse</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{events.length} Session-Ereignisse</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Lade…</p>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {events.map(evt => (
                <div key={evt.id} className="p-3 rounded-lg border border-border/50 bg-card/50 flex items-center gap-3">
                  {evt.user_agent?.includes('Mobile') ? <Smartphone className="h-4 w-4 text-muted-foreground shrink-0" /> : <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">{evt.event_type}</Badge>
                      {evt.country && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Globe className="h-3 w-3" /> {evt.country}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                      {evt.ip_address && <span>{evt.ip_address} · </span>}
                      {new Date(evt.created_at).toLocaleString('de-DE')}
                    </div>
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
