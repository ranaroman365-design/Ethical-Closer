import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Eye, Palette, BarChart3, Users, Layers,
  Tags, Check, X, Shield,
} from 'lucide-react';

function getLaunchChecklist(config: any): Array<{ category: string; label: string; ok: boolean }> {
  return [
    // Branding
    { category: 'Branding', label: 'Produktname gesetzt', ok: !!config?.branding?.product_name },
    { category: 'Branding', label: 'Theme gesetzt', ok: !!config?.branding?.theme_key },
    { category: 'Branding', label: 'Markenname gesetzt', ok: !!config?.branding?.brand_name },
    // Commercial
    { category: 'Commercial', label: 'Provisionsstruktur konfiguriert', ok: !!(config?.commission_rates && Object.keys(config.commission_rates).length > 0) },
    { category: 'Commercial', label: 'KPI-Toggles konfiguriert', ok: !!(config?.kpi_toggles && Object.values(config.kpi_toggles).some((v: any) => v)) },
    { category: 'Commercial', label: 'Lead-Typen definiert', ok: !!(config?.lead_types && config.lead_types.length > 0) },
    // Operations
    { category: 'Operations', label: 'Level-Labels konfiguriert', ok: !!(config?.levels && config.levels.length > 0) },
    { category: 'Operations', label: 'Community-Mapping aktiv', ok: !!(config?.community_mapping && Object.keys(config.community_mapping).length > 0) },
    { category: 'Operations', label: 'Beförderungsschwellen definiert', ok: !!(config?.promotion_thresholds && Object.keys(config.promotion_thresholds).length > 0) },
    // Public
    { category: 'Public', label: 'Login/Entry-Branding aufgelöst', ok: !!config?.branding?.product_name },
    { category: 'Public', label: 'Partner-Provisionen konfiguriert', ok: !!(config?.partner_commission) },
  ];
}

export default function ProductPreview() {
  const { productKey } = useParams<{ productKey: string }>();
  const navigate = useNavigate();
  const [config, setConfig] = useState<any>(null);
  const [status, setStatus] = useState('draft');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!productKey) return;
    supabase
      .from('product_config')
      .select('config, status')
      .eq('product_key', productKey)
      .maybeSingle()
      .then(({ data }) => {
        setConfig((data as any)?.config || {});
        setStatus((data as any)?.status || 'draft');
        setLoading(false);
      });
  }, [productKey]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Produkt nicht gefunden.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>Zurück</Button>
      </div>
    );
  }

  const branding = config.branding || {};
  const checklist = getLaunchChecklist(config);
  const categories = [...new Set(checklist.map(c => c.category))];
  const completedCount = checklist.filter(c => c.ok).length;
  const totalCount = checklist.length;
  const pct = Math.round((completedCount / totalCount) * 100);

  const kpiToggles = config.kpi_toggles || {};
  const activeKpis = Object.entries(kpiToggles).filter(([, v]) => v).map(([k]) => k);
  const levels = config.levels || [];
  const leadTypes = config.lead_types || [];
  const commissions = config.commission_rates || {};

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/members/admin/products')}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Zurück
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            <h1 className="font-serif text-xl font-bold text-foreground">
              Produkt-Preview: {branding.product_name || productKey}
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            <code className="font-mono">{productKey}</code> · Status: <span className="font-medium">{status}</span>
          </p>
        </div>
      </div>

      {/* Launch Readiness */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Launch-Readiness Checklist
            </h2>
            <span className={`text-sm font-bold ${pct >= 75 ? 'text-green-500' : pct >= 50 ? 'text-yellow-500' : 'text-destructive'}`}>
              {completedCount}/{totalCount} ({pct}%)
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden mb-4">
            <div
              className={`h-full rounded-full transition-all ${pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-destructive'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {categories.map(cat => (
            <div key={cat} className="mb-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">{cat}</p>
              <div className="space-y-1">
                {checklist.filter(c => c.category === cat).map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {c.ok ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-destructive" />
                    )}
                    <span className={c.ok ? 'text-foreground' : 'text-muted-foreground'}>{c.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Branding Preview */}
      <Card>
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
            <Palette className="h-4 w-4" /> Branding
          </h2>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg border border-border/40 p-3">
              <p className="text-muted-foreground mb-0.5">Produktname</p>
              <p className="font-medium text-foreground">{branding.product_name || '–'}</p>
            </div>
            <div className="rounded-lg border border-border/40 p-3">
              <p className="text-muted-foreground mb-0.5">Markenname</p>
              <p className="font-medium text-foreground">{branding.brand_name || '–'}</p>
            </div>
            <div className="rounded-lg border border-border/40 p-3">
              <p className="text-muted-foreground mb-0.5">Theme</p>
              <p className="font-medium text-foreground">{branding.theme_key || '–'}</p>
            </div>
            <div className="rounded-lg border border-border/40 p-3">
              <p className="text-muted-foreground mb-0.5">Logo</p>
              <p className="font-medium text-foreground">{branding.logo_url ? 'Gesetzt' : 'Nicht gesetzt'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active KPIs */}
      <Card>
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4" /> Aktive KPIs ({activeKpis.length})
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {activeKpis.length > 0 ? activeKpis.map(k => (
              <Badge key={k} variant="secondary" className="text-[10px]">{k}</Badge>
            )) : (
              <p className="text-xs text-muted-foreground">Keine KPIs aktiviert</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Levels */}
      <Card>
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
            <Layers className="h-4 w-4" /> Level ({levels.length})
          </h2>
          <div className="space-y-1">
            {levels.map((l: any) => (
              <div key={l.key} className="flex items-center gap-2 text-xs rounded-lg border border-border/30 px-3 py-1.5">
                <Badge variant="outline" className="font-mono text-[9px]">L{l.level}</Badge>
                <span className="font-medium text-foreground">{l.de}</span>
                <span className="text-muted-foreground">/ {l.en}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Lead Types */}
      <Card>
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
            <Tags className="h-4 w-4" /> Lead-Typen ({leadTypes.length})
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {leadTypes.map((lt: any) => (
              <Badge key={lt.key} variant={lt.active ? 'default' : 'outline'} className="text-[10px]">
                {lt.label} {!lt.active && '(inaktiv)'}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Commissions */}
      <Card>
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
            <Users className="h-4 w-4" /> Provisionsstruktur
          </h2>
          <div className="space-y-1">
            {Object.entries(commissions).map(([key, val]: [string, any]) => (
              <div key={key} className="flex items-center justify-between text-xs rounded-lg border border-border/30 px-3 py-1.5">
                <span className="text-foreground">{val.label || key}</span>
                <span className="font-mono font-medium text-primary">{(val.rate * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
