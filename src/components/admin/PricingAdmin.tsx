import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Save, RefreshCw, DollarSign } from 'lucide-react';

interface PricingConfig {
  starter_track: number;
  closer_track: number;
  high_ticket_track: number;
  upgrade_handling_fee: number;
  booster_direct: number;
  booster_after_pause: number;
  radiant_base: number;
  radiant_delayed: number;
  scale_lab_base: number;
  scale_lab_delayed: number;
  quarterly_crossing_base: number;
  quarterly_crossing_delayed: number;
  inner_circle_membership: number;
  inner_circle_mentoring: number;
}

const DEFAULT_PRICING: PricingConfig = {
  starter_track: 1600,
  closer_track: 4400,
  high_ticket_track: 7300,
  upgrade_handling_fee: 150,
  booster_direct: 297,
  booster_after_pause: 397,
  radiant_base: 3997,
  radiant_delayed: 4997,
  scale_lab_base: 3997,
  scale_lab_delayed: 4997,
  quarterly_crossing_base: 97,
  quarterly_crossing_delayed: 127,
  inner_circle_membership: 333,
  inner_circle_mentoring: 777,
};

const FIELD_LABELS: Record<keyof PricingConfig, { label: string; group: string; suffix: string }> = {
  starter_track: { label: 'Starter Track', group: 'Frontend Tracks', suffix: '€' },
  closer_track: { label: 'Closer Track', group: 'Frontend Tracks', suffix: '€' },
  high_ticket_track: { label: 'High-Ticket Track', group: 'Frontend Tracks', suffix: '€' },
  upgrade_handling_fee: { label: 'Upgrade Handling Fee', group: 'Frontend Tracks', suffix: '€' },
  booster_direct: { label: 'Booster – Direktanschluss', group: 'Booster', suffix: '€/Monat' },
  booster_after_pause: { label: 'Booster – Nach Pause', group: 'Booster', suffix: '€/Monat' },
  radiant_base: { label: 'Radiant – Basispreis', group: 'Radiant', suffix: '€' },
  radiant_delayed: { label: 'Radiant – Nach Verzögerung', group: 'Radiant', suffix: '€' },
  scale_lab_base: { label: 'Scale Lab – Basispreis', group: 'Advanced Scale Lab', suffix: '€' },
  scale_lab_delayed: { label: 'Scale Lab – Nach Verzögerung', group: 'Advanced Scale Lab', suffix: '€' },
  quarterly_crossing_base: { label: 'Quarterly Crossing – Basis', group: 'Quarterly Crossing', suffix: '€/Monat' },
  quarterly_crossing_delayed: { label: 'Quarterly Crossing – Nach Verzögerung', group: 'Quarterly Crossing', suffix: '€/Monat' },
  inner_circle_membership: { label: 'Inner Circle – Membership', group: 'Inner Circle', suffix: '€/Monat' },
  inner_circle_mentoring: { label: 'Inner Circle + 1:1 Mentoring', group: 'Inner Circle', suffix: '€/Monat' },
};

export default function PricingAdmin() {
  const [pricing, setPricing] = useState<PricingConfig>(DEFAULT_PRICING);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('product_config')
      .select('config')
      .eq('product_key', 'etc')
      .single();

    const cfg = data?.config as Record<string, any> | null;
    if (cfg?.pricing) {
      setPricing({ ...DEFAULT_PRICING, ...cfg.pricing });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    // Get current config first
    const { data: current } = await supabase
      .from('product_config')
      .select('config')
      .eq('product_key', 'etc')
      .single();

    const currentCfg = (current?.config ?? {}) as Record<string, any>;
    const updatedConfig = { ...currentCfg, pricing };

    const { error } = await supabase
      .from('product_config')
      .update({ config: updatedConfig, updated_at: new Date().toISOString() } as any)
      .eq('product_key', 'etc');

    setSaving(false);
    if (error) {
      toast.error('Fehler beim Speichern: ' + error.message);
      return;
    }
    toast.success('Preise gespeichert');
  };

  const updateField = (key: keyof PricingConfig, value: string) => {
    const num = parseFloat(value) || 0;
    setPricing(prev => ({ ...prev, [key]: num }));
  };

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Group fields
  const groups = new Map<string, (keyof PricingConfig)[]>();
  for (const [key, meta] of Object.entries(FIELD_LABELS)) {
    const g = meta.group;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(key as keyof PricingConfig);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Preiskonfiguration</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="mr-1 h-3 w-3" /> Laden
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            <Save className="mr-1 h-3 w-3" /> {saving ? 'Speichert…' : 'Speichern'}
          </Button>
        </div>
      </div>

      {Array.from(groups.entries()).map(([groupName, fields]) => (
        <Card key={groupName}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{groupName}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {fields.map(key => {
                const meta = FIELD_LABELS[key];
                return (
                  <div key={key}>
                    <Label className="text-xs text-muted-foreground">{meta.label}</Label>
                    <div className="mt-1 flex items-center gap-2">
                      <Input
                        type="number"
                        value={pricing[key]}
                        onChange={e => updateField(key, e.target.value)}
                        className="text-sm"
                      />
                      <Badge variant="outline" className="shrink-0 text-[10px]">{meta.suffix}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
