import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Key, RotateCw, XCircle, Shield } from 'lucide-react';
import { toast } from 'sonner';

export default function IntegrationRegistry() {
  const { isSecurityPrivileged } = usePermissions();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSecurityPrivileged) return;
    supabase.from('integration_credentials_registry').select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => { setItems(data ?? []); setLoading(false); });
  }, [isSecurityPrivileged]);

  if (!isSecurityPrivileged) return <Navigate to="/members" replace />;

  const handleAction = async (id: string, action: 'rotate' | 'revoke') => {
    const { error } = await supabase.functions.invoke('secure-admin-action', {
      body: { action: 'rotate_credential', target_id: id },
    });
    if (error) { toast.error(error.message); return; }
    toast.success(action === 'rotate' ? 'Credential rotated' : 'Credential revoked');
    const { data } = await supabase.from('integration_credentials_registry').select('*').order('created_at', { ascending: false });
    setItems(data ?? []);
  };

  const STATUS_COLORS: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-600',
    rotated: 'bg-amber-500/10 text-amber-600',
    revoked: 'bg-destructive/10 text-destructive',
    expired: 'bg-muted text-muted-foreground',
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-6">
      <div className="flex items-center gap-3">
        <Key className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Integration Registry</h1>
          <p className="text-sm text-muted-foreground">Credentials, Tokens & Verbindungen — keine Secrets sichtbar</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{items.length} Einträge</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground">Lade…</p> : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Credentials registriert.</p>
          ) : (
            <div className="space-y-2">
              {items.map(item => (
                <div key={item.id} className="p-3 rounded-lg border border-border/50 bg-card/50 flex items-center gap-3">
                  <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{item.service_name || item.integration_key || 'Unknown'}</span>
                      <Badge className={STATUS_COLORS[item.status] ?? 'bg-muted text-muted-foreground'} variant="secondary">
                        {item.status}
                      </Badge>
                      {item.provider && <Badge variant="outline" className="text-[10px]">{item.provider}</Badge>}
                      {item.environment && <Badge variant="outline" className="text-[10px]">{item.environment}</Badge>}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {item.last_rotated_at ? `Letzte Rotation: ${new Date(item.last_rotated_at).toLocaleDateString('de-DE')}` : 'Nie rotiert'}
                      {item.scope_description && ` · ${item.scope_description}`}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleAction(item.id, 'rotate')}>
                      <RotateCw className="h-3 w-3 mr-1" /> Rotieren
                    </Button>
                    <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleAction(item.id, 'revoke')}>
                      <XCircle className="h-3 w-3 mr-1" /> Revoke
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
