import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import type { CommissionEntry } from '@/hooks/useBrandConfig';

interface LevelInfo {
  level: number;
  key: string;
  de: string;
  en: string;
  role: string | null;
}

interface Props {
  commissions: Record<string, CommissionEntry>;
  levels: LevelInfo[];
  onSave: (commissions: Record<string, CommissionEntry>) => Promise<void>;
  saving: boolean;
}

export default function CommissionSettings({ commissions, levels, onSave, saving }: Props) {
  const [state, setState] = useState<Record<string, CommissionEntry>>({ ...commissions });

  const sortedKeys = levels
    .filter(l => l.level >= 1)
    .sort((a, b) => a.level - b.level)
    .map(l => l.key);

  const handleRateChange = (key: string, rawValue: string) => {
    const numericValue = parseFloat(rawValue);
    if (isNaN(numericValue)) return;
    const rate = Math.min(Math.max(numericValue / 100, 0), 1);
    setState(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        rate,
        label: `${rawValue}% ${prev[key]?.role || 'Provision'}`,
      },
    }));
  };

  const handleLabelChange = (key: string, label: string) => {
    setState(prev => ({
      ...prev,
      [key]: { ...prev[key], label },
    }));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Provisionssätze</CardTitle>
          <CardDescription>
            Definiere den Provisionssatz pro Karrierestufe. Änderungen gelten für alle zukünftigen Berechnungen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {sortedKeys.map(key => {
              const entry = state[key];
              const level = levels.find(l => l.key === key);
              if (!entry || !level) return null;

              return (
                <div key={key} className="grid grid-cols-[1fr_100px_1fr] items-end gap-3 rounded-lg border p-3">
                  <div>
                    <p className="text-xs text-muted-foreground">L{level.level}</p>
                    <p className="text-sm font-medium">{level.de}</p>
                    <p className="text-xs text-muted-foreground">{entry.role}</p>
                  </div>
                  <div>
                    <Label htmlFor={`rate-${key}`} className="text-xs">Rate %</Label>
                    <Input
                      id={`rate-${key}`}
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={Math.round(entry.rate * 10000) / 100}
                      onChange={(e) => handleRateChange(key, e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`label-${key}`} className="text-xs">Bezeichnung</Label>
                    <Input
                      id={`label-${key}`}
                      value={entry.label}
                      onChange={(e) => handleLabelChange(key, e.target.value)}
                      className="h-8 text-sm"
                      maxLength={40}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => onSave(state)} disabled={saving}>
          {saving ? 'Speichern…' : 'Provisionen speichern'}
        </Button>
      </div>
    </div>
  );
}
