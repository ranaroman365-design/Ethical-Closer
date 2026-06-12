import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { KpiToggle } from '@/hooks/useBrandConfig';

const KPI_META: { key: keyof KpiToggle; label: string; description: string; category: 'core' | 'pipeline' | 'quality' }[] = [
  { key: 'show_rate', label: 'Show Rate', description: 'Anteil erschienener Termine', category: 'core' },
  { key: 'close_rate', label: 'Close Rate', description: 'Abschlussquote aller Calls', category: 'core' },
  { key: 'calls', label: 'Calls', description: 'Anzahl bearbeiteter Calls', category: 'core' },
  { key: 'revenue', label: 'Revenue', description: 'Gesamtumsatz', category: 'core' },
  { key: 'earnings_per_call', label: 'Earnings per Call', description: 'Durchschnittlicher Umsatz pro Call', category: 'core' },
  { key: 'lead_to_booking_rate', label: 'Lead-to-Booking Rate', description: 'Conversion von Lead zu Termin', category: 'pipeline' },
  { key: 'contact_rate', label: 'Contact Rate', description: 'Erreichbarkeitsquote', category: 'pipeline' },
  { key: 'speed_to_lead', label: 'Speed to Lead', description: 'Reaktionszeit auf neue Leads', category: 'pipeline' },
  { key: 'follow_up_rate', label: 'Follow-Up Rate', description: 'Nachfass-Quote', category: 'pipeline' },
  { key: 'qualification_accuracy', label: 'Qualification Accuracy', description: 'Qualifikationsgenauigkeit', category: 'quality' },
];

interface Props {
  toggles: KpiToggle;
  onSave: (toggles: KpiToggle) => Promise<void>;
  saving: boolean;
}

export default function KpiSettings({ toggles, onSave, saving }: Props) {
  const [state, setState] = useState<KpiToggle>({ ...toggles });

  const activeCount = Object.values(state).filter(Boolean).length;

  const handleToggle = (key: keyof KpiToggle) => {
    setState(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const categories = [
    { key: 'core', label: 'Core KPIs', description: 'Kern-Leistungskennzahlen' },
    { key: 'pipeline', label: 'Pipeline KPIs', description: 'Lead- und Prozess-Metriken' },
    { key: 'quality', label: 'Quality KPIs', description: 'Qualitätssicherung' },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Badge variant={activeCount >= 5 ? 'default' : 'destructive'}>
          {activeCount}/10 aktiv
        </Badge>
        <p className="text-sm text-muted-foreground">
          Nur aktive KPIs werden berechnet, angezeigt und für Beförderungen verwendet.
        </p>
      </div>

      {categories.map(cat => (
        <Card key={cat.key}>
          <CardHeader>
            <CardTitle className="text-lg">{cat.label}</CardTitle>
            <CardDescription>{cat.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {KPI_META.filter(k => k.category === cat.key).map(kpi => (
              <div key={kpi.key} className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <Label htmlFor={kpi.key} className="text-sm font-medium">{kpi.label}</Label>
                  <p className="text-xs text-muted-foreground">{kpi.description}</p>
                </div>
                <Switch
                  id={kpi.key}
                  checked={state[kpi.key]}
                  onCheckedChange={() => handleToggle(kpi.key)}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end">
        <Button onClick={() => onSave(state)} disabled={saving}>
          {saving ? 'Speichern…' : 'KPI-Einstellungen speichern'}
        </Button>
      </div>
    </div>
  );
}
