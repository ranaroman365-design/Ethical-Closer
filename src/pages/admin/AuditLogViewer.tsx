import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { FileText, Search } from 'lucide-react';
import { Navigate } from 'react-router-dom';

interface AuditEntry {
  id: string;
  action: string;
  actor_id: string | null;
  target_user_id: string | null;
  note: string | null;
  source_type: string | null;
  before_state: any;
  after_state: any;
  created_at: string;
}

export default function AuditLogViewer() {
  const { can, isSecurityPrivileged } = usePermissions();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!can('audit_logs')) return;
    supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300)
      .then(({ data }) => {
        setLogs((data as AuditEntry[]) ?? []);
        setLoading(false);
      });
  }, [can]);

  if (!can('audit_logs')) {
    return <Navigate to="/members" replace />;
  }

  const filtered = search
    ? logs.filter(l =>
        l.action.toLowerCase().includes(search.toLowerCase()) ||
        l.note?.toLowerCase().includes(search.toLowerCase()) ||
        l.source_type?.toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-6">
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Audit Log</h1>
          <p className="text-sm text-muted-foreground">Vollständiges, unveränderliches Protokoll aller Systemaktionen</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Aktion, Quelle oder Notiz suchen…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{filtered.length} Einträge</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Lade…</p>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {filtered.map(log => (
                <div key={log.id} className="p-3 rounded-lg border border-border/50 bg-card/50">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-[10px]">{log.action}</Badge>
                    {log.source_type && <Badge variant="outline" className="text-[10px]">{log.source_type}</Badge>}
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {new Date(log.created_at).toLocaleString('de-DE')}
                    </span>
                  </div>
                  {log.note && <p className="text-xs text-muted-foreground mt-1">{log.note}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
