import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Power, AlertTriangle, Shield } from 'lucide-react';

interface FeatureSwitch {
  key: string;
  label: string;
  description: string;
  severity: 'critical' | 'standard';
}

const FEATURE_SWITCHES: FeatureSwitch[] = [
  {
    key: 'employer_dashboard_enabled',
    label: 'Employer Dashboard',
    description: 'Steuert den gesamten B2B-Bereich. Bei Deaktivierung wird das Employer-System für alle Unternehmen unsichtbar.',
    severity: 'critical',
  },
  {
    key: 'realtime_simulator_enabled',
    label: 'Real-Time Simulator',
    description: 'Aktiviert oder deaktiviert den Real-Time Voice Simulator global. Step Mode bleibt davon unberührt.',
    severity: 'critical',
  },
  {
    key: 'employer_marketplace_enabled',
    label: 'Employer Marketplace',
    description: 'Steuert, ob zertifizierte Kandidaten im Talent Pool für Arbeitgeber sichtbar sind.',
    severity: 'standard',
  },
  {
    key: 'certification_output_enabled',
    label: 'Zertifikats-Ausgabe',
    description: 'Erlaubt zertifizierten Nutzern, ihr Zertifikat als PDF herunterzuladen.',
    severity: 'standard',
  },
];

export default function AdminFeatureControls() {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('system_settings')
      .select('setting_key, setting_value')
      .in('setting_key', FEATURE_SWITCHES.map(f => f.key))
      .then(({ data }) => {
        const map: Record<string, boolean> = {};
        (data ?? []).forEach((row: any) => {
          map[row.setting_key] = row.setting_value === true;
        });
        setValues(map);
        setLoading(false);
      });
  }, []);

  async function toggle(key: string, newVal: boolean) {
    // Upsert into system_settings
    const { error } = await supabase
      .from('system_settings')
      .upsert(
        { setting_key: key, setting_value: newVal, updated_at: new Date().toISOString() } as any,
        { onConflict: 'setting_key' } as any
      );

    if (error) {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
      return;
    }

    setValues(prev => ({ ...prev, [key]: newVal }));

    // Audit log
    await supabase.from('audit_logs').insert({
      action: `feature_switch_${newVal ? 'enabled' : 'disabled'}`,
      source_type: 'admin',
      note: `${key} → ${newVal ? 'ON' : 'OFF'}`,
      after_state: { key, value: newVal },
    });

    toast({
      title: newVal ? 'Feature aktiviert' : 'Feature deaktiviert',
      description: FEATURE_SWITCHES.find(f => f.key === key)?.label,
    });
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Warning banner */}
      <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-foreground">System-Level Controls</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Diese Schalter wirken sich sofort auf alle Nutzer aus. Kritische Schalter können den Zugang zu ganzen Plattformbereichen sperren.
          </p>
        </div>
      </div>

      {/* Critical switches */}
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
          <Shield className="h-3.5 w-3.5" /> Kritische Systemschalter
        </h3>
        <div className="space-y-3">
          {FEATURE_SWITCHES.filter(f => f.severity === 'critical').map(feature => (
            <FeatureRow
              key={feature.key}
              feature={feature}
              value={values[feature.key] ?? false}
              onToggle={(v) => toggle(feature.key, v)}
            />
          ))}
        </div>
      </div>

      {/* Standard switches */}
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Weitere Feature-Schalter
        </h3>
        <div className="space-y-3">
          {FEATURE_SWITCHES.filter(f => f.severity === 'standard').map(feature => (
            <FeatureRow
              key={feature.key}
              feature={feature}
              value={values[feature.key] ?? false}
              onToggle={(v) => toggle(feature.key, v)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FeatureRow({ feature, value, onToggle }: { feature: FeatureSwitch; value: boolean; onToggle: (v: boolean) => void }) {
  return (
    <div className={`flex items-center gap-4 rounded-xl border p-4 transition-colors ${
      feature.severity === 'critical'
        ? value ? 'border-primary/30 bg-primary/5' : 'border-destructive/20 bg-destructive/5'
        : 'border-border/40 bg-card'
    }`}>
      <Power className={`h-4 w-4 shrink-0 ${value ? 'text-primary' : 'text-muted-foreground'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">{feature.label}</p>
          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${value ? 'text-primary border-primary/30' : 'text-muted-foreground'}`}>
            {value ? 'AKTIV' : 'AUS'}
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">{feature.description}</p>
      </div>
      <Switch checked={value} onCheckedChange={onToggle} />
    </div>
  );
}
