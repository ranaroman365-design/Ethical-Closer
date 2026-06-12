import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';

interface Membership {
  id: string;
  user_id: string;
  tenant_id: string;
  role: string;
  membership_status: string | null;
  tenant_name?: string;
  user_name?: string;
}

export default function TenantAccessMatrix() {
  const { isSecurityPrivileged } = usePermissions();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSecurityPrivileged) return;
    supabase.from('tenant_memberships').select('*').limit(500)
      .then(async ({ data }) => {
        const items = (data ?? []) as Membership[];
        // Enrich with tenant names
        const tIds = [...new Set(items.map(m => m.tenant_id))];
        if (tIds.length > 0) {
          const { data: tenants } = await supabase.from('tenants').select('id, name').in('id', tIds);
          const tMap = Object.fromEntries((tenants ?? []).map(t => [t.id, t.name]));
          items.forEach(m => m.tenant_name = tMap[m.tenant_id] ?? '?');
        }
        setMemberships(items);
        setLoading(false);
      });
  }, [isSecurityPrivileged]);

  if (!isSecurityPrivileged) return <Navigate to="/members" replace />;

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-6">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Tenant Access Matrix</h1>
          <p className="text-sm text-muted-foreground">User × Tenant × Rolle — Übersicht aller Zuweisungen</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{memberships.length} Zuweisungen</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground">Lade…</p> : memberships.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Tenant-Zuweisungen.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50 text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium">Tenant</th>
                    <th className="text-left py-2 px-2 font-medium">User ID</th>
                    <th className="text-left py-2 px-2 font-medium">Rolle</th>
                    <th className="text-left py-2 px-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {memberships.map(m => (
                    <tr key={m.id} className="border-b border-border/20">
                      <td className="py-2 px-2 text-foreground">{m.tenant_name ?? m.tenant_id.slice(0, 8)}</td>
                      <td className="py-2 px-2 text-muted-foreground font-mono">{m.user_id.slice(0, 12)}…</td>
                      <td className="py-2 px-2"><Badge variant="secondary" className="text-[10px]">{m.role}</Badge></td>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className="text-[10px]">{m.membership_status ?? 'active'}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
