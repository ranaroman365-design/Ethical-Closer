import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Fingerprint } from 'lucide-react';

export default function OwnerIpConsole() {
  const { isOwner } = usePermissions();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOwner) return;
    supabase.from('ip_assets').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setAssets(data ?? []); setLoading(false); });
  }, [isOwner]);

  if (!isOwner) return <Navigate to="/members" replace />;

  const SEVERITY: Record<string, string> = {
    critical: 'bg-destructive/10 text-destructive',
    high: 'bg-amber-500/10 text-amber-600',
    medium: 'bg-primary/10 text-primary',
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-6">
      <div className="flex items-center gap-3">
        <Fingerprint className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">IP Console</h1>
          <p className="text-sm text-muted-foreground">Intellektuelles Eigentum, Logik-Maps & geschützte Assets — Owner Only</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{assets.length} IP-Assets</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground">Lade…</p> : assets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine IP-Assets registriert.</p>
          ) : (
            <div className="space-y-2">
              {assets.map(a => (
                <div key={a.id} className="p-3 rounded-lg border border-border/50 bg-card/50">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{a.title || a.asset_name}</span>
                    <Badge className={SEVERITY[a.sensitivity_level] ?? 'bg-muted text-muted-foreground'} variant="secondary">
                      {a.sensitivity_level?.toUpperCase()}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">{a.asset_type}</Badge>
                    {a.exportable && <Badge variant="outline" className="text-[10px] text-amber-600">Exportable</Badge>}
                    {!a.exportable && <Badge variant="outline" className="text-[10px] text-emerald-600">Locked</Badge>}
                  </div>
                  {a.description && <p className="text-[10px] text-muted-foreground mt-1">{a.description}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
