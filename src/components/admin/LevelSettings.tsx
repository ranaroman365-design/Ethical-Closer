import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lock } from 'lucide-react';

interface LevelEntry {
  level: number;
  key: string;
  de: string;
  en: string;
  role: string | null;
}

interface Props {
  levels: LevelEntry[];
  onSave: (levels: LevelEntry[]) => Promise<void>;
  saving: boolean;
}

export default function LevelSettings({ levels, onSave, saving }: Props) {
  const [state, setState] = useState<LevelEntry[]>(
    [...levels].sort((a, b) => a.level - b.level)
  );

  const handleChange = (index: number, field: 'de' | 'en' | 'role', value: string) => {
    setState(prev => prev.map((entry, i) =>
      i === index ? { ...entry, [field]: field === 'role' ? (value || null) : value } : entry
    ));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Karrierestufen</CardTitle>
          <CardDescription>
            Die Stufenstruktur (L0–L8) ist fest. Du kannst nur Namen und Beschreibungen anpassen.
            Änderungen werden global übernommen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.map((entry, index) => (
            <div key={entry.key} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">
                  L{entry.level}
                </Badge>
                <span className="text-xs text-muted-foreground font-mono">{entry.key}</span>
                <Lock className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-xs">Name (DE)</Label>
                  <Input
                    value={entry.de || ''}
                    onChange={(e) => handleChange(index, 'de', e.target.value)}
                    className="h-8 text-sm"
                    maxLength={40}
                  />
                </div>
                <div>
                  <Label className="text-xs">Name (EN)</Label>
                  <Input
                    value={entry.en || ''}
                    onChange={(e) => handleChange(index, 'en', e.target.value)}
                    className="h-8 text-sm"
                    maxLength={40}
                  />
                </div>
                <div>
                  <Label className="text-xs">Rolle / Titel</Label>
                  <Input
                    value={entry.role || ''}
                    onChange={(e) => handleChange(index, 'role', e.target.value)}
                    className="h-8 text-sm"
                    placeholder="z.B. Senior Associate"
                    maxLength={40}
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => onSave(state)} disabled={saving}>
          {saving ? 'Speichern…' : 'Level-Namen speichern'}
        </Button>
      </div>
    </div>
  );
}
