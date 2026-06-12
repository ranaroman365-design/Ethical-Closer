import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import {
  Package, Users, DollarSign, BarChart3, Eye, Play, Pause,
  CheckCircle2, AlertTriangle, Rocket, RefreshCw, ChevronRight,
} from 'lucide-react';

interface ProductRow {
  product_key: string;
  config: any;
  status: string;
  updated_at: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<any> }> = {
  draft: { label: 'Entwurf', color: 'bg-muted text-muted-foreground', icon: Package },
  setup_in_progress: { label: 'Setup läuft', color: 'bg-yellow-500/15 text-yellow-500', icon: RefreshCw },
  ready_to_launch: { label: 'Startbereit', color: 'bg-blue-500/15 text-blue-500', icon: CheckCircle2 },
  live: { label: 'Live', color: 'bg-green-500/15 text-green-500', icon: Play },
  paused: { label: 'Pausiert', color: 'bg-orange-500/15 text-orange-500', icon: Pause },
};

function getLaunchReadiness(config: any): { pct: number; missing: string[] } {
  const missing: string[] = [];
  const checks = [
    { ok: !!config?.branding?.product_name, label: 'Produktname' },
    { ok: !!config?.branding?.theme_key, label: 'Theme' },
    { ok: config?.commission_rates && Object.keys(config.commission_rates).length > 0, label: 'Provisionen' },
    { ok: config?.kpi_toggles && Object.values(config.kpi_toggles).some((v: any) => v), label: 'KPIs' },
    { ok: config?.levels && config.levels.length > 0, label: 'Level-Labels' },
    { ok: config?.lead_types && config.lead_types.length > 0, label: 'Lead-Typen' },
    { ok: config?.community_mapping && Object.keys(config.community_mapping).length > 0, label: 'Community-Mapping' },
    { ok: config?.promotion_thresholds && Object.keys(config.promotion_thresholds).length > 0, label: 'Beförderungsschwellen' },
  ];
  for (const c of checks) if (!c.ok) missing.push(c.label);
  const done = checks.filter(c => c.ok).length;
  return { pct: Math.round((done / checks.length) * 100), missing };
}

export default function ProductOperations() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [userCounts, setUserCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('product_config')
      .select('product_key, config, status, updated_at')
      .order('updated_at', { ascending: false });
    setProducts((data as any[]) ?? []);

    // Get user counts per product
    const { data: profiles } = await supabase
      .from('profiles')
      .select('product_key');
    const counts: Record<string, number> = {};
    (profiles ?? []).forEach((p: any) => {
      const pk = p.product_key || 'etc';
      counts[pk] = (counts[pk] || 0) + 1;
    });
    setUserCounts(counts);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (productKey: string, newStatus: string) => {
    const product = products.find(p => p.product_key === productKey);
    if (newStatus === 'live') {
      const { pct, missing } = getLaunchReadiness(product?.config);
      if (pct < 75) {
        toast.error(`Launch blockiert — fehlend: ${missing.join(', ')}`);
        return;
      }
    }
    const { error } = await supabase
      .from('product_config')
      .update({ status: newStatus, updated_at: new Date().toISOString() } as any)
      .eq('product_key', productKey);
    if (error) { toast.error(error.message); return; }
    toast.success(`Status → ${STATUS_CONFIG[newStatus]?.label || newStatus}`);
    load();
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-foreground">Produkt-Übersicht</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {products.length} Produkt{products.length !== 1 ? 'e' : ''} konfiguriert
          </p>
        </div>
        <Button onClick={() => navigate('/members/admin/create-product')} size="sm">
          <Rocket className="mr-1 h-4 w-4" /> Neues Produkt
        </Button>
      </div>

      <div className="space-y-4">
        {products.map((p) => {
          const config = p.config || {};
          const branding = config.branding || {};
          const { pct, missing } = getLaunchReadiness(config);
          const sc = STATUS_CONFIG[p.status] || STATUS_CONFIG.draft;
          const StatusIcon = sc.icon;
          const kpiCount = config.kpi_toggles ? Object.values(config.kpi_toggles).filter(Boolean).length : 0;
          const leadTypeCount = config.lead_types?.length || 0;
          const users = userCounts[p.product_key] || 0;

          return (
            <Card key={p.product_key} className="overflow-hidden">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Package className="h-6 w-6 text-primary" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-base font-semibold text-foreground truncate">
                        {branding.product_name || p.product_key}
                      </h3>
                      <Badge variant="outline" className="font-mono text-[10px]">{p.product_key}</Badge>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${sc.color}`}>
                        <StatusIcon className="h-3 w-3" />
                        {sc.label}
                      </span>
                    </div>

                    {/* Stats row */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        Theme: {branding.theme_key || '–'}
                      </span>
                      <span className="flex items-center gap-1">
                        <BarChart3 className="h-3 w-3" />
                        {kpiCount} KPIs
                      </span>
                      <span className="flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        {leadTypeCount} Lead-Typen
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {users} Nutzer
                      </span>
                    </div>

                    {/* Readiness bar */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[10px] mb-1">
                        <span className="font-medium text-muted-foreground">Launch-Readiness</span>
                        <span className={`font-bold ${pct >= 75 ? 'text-green-500' : pct >= 50 ? 'text-yellow-500' : 'text-destructive'}`}>
                          {pct}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-destructive'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {missing.length > 0 && (
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Fehlend: {missing.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1.5 shrink-0">
                    {p.status === 'draft' && (
                      <Button size="sm" variant="outline" className="text-xs h-7"
                        onClick={() => updateStatus(p.product_key, 'setup_in_progress')}>
                        Setup starten
                      </Button>
                    )}
                    {(p.status === 'setup_in_progress' || p.status === 'ready_to_launch') && (
                      <Button size="sm" className="text-xs h-7"
                        onClick={() => updateStatus(p.product_key, 'live')}>
                        <Play className="mr-1 h-3 w-3" /> Live schalten
                      </Button>
                    )}
                    {p.status === 'live' && (
                      <Button size="sm" variant="outline" className="text-xs h-7"
                        onClick={() => updateStatus(p.product_key, 'paused')}>
                        <Pause className="mr-1 h-3 w-3" /> Pausieren
                      </Button>
                    )}
                    {p.status === 'paused' && (
                      <Button size="sm" className="text-xs h-7"
                        onClick={() => updateStatus(p.product_key, 'live')}>
                        <Play className="mr-1 h-3 w-3" /> Reaktivieren
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-xs h-7"
                      onClick={() => navigate(`/members/admin/product-preview/${p.product_key}`)}>
                      <Eye className="mr-1 h-3 w-3" /> Preview
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {products.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Noch keine Produkte erstellt.</p>
            <Button className="mt-4" onClick={() => navigate('/members/admin/create-product')}>
              Erstes Produkt erstellen
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
