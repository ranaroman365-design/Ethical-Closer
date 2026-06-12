import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2 } from 'lucide-react';

export interface LeadType {
  key: string;
  label: string;
  description: string;
  active: boolean;
}

const DEFAULT_LEAD_TYPES: LeadType[] = [
  { key: 'identity', label: 'Identity', description: 'Identitäts- und Mindset-orientierte Leads', active: true },
  { key: 'lifestyle', label: 'Lifestyle', description: 'Lifestyle- und Freiheits-orientierte Leads', active: true },
  { key: 'income', label: 'Income', description: 'Einkommens- und Performance-orientierte Leads', active: true },
];

interface Props {
  leadTypes: LeadType[] | undefined;
  onSave: (types: LeadType[]) => Promise<void>;
  saving: boolean;
}

export default function LeadTypeSettings({ leadTypes, onSave, saving }: Props) {
  const [state, setState] = useState<LeadType[]>(
    leadTypes && leadTypes.length > 0 ? [...leadTypes] : [...DEFAULT_LEAD_TYPES]
  );
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const activeCount = state.filter(t => t.active).length;

  const handleToggle = (key: string) => {
    setState(prev => prev.map(t => t.key === key ? { ...t, active: !t.active } : t));
  };

  const handleLabelChange = (key: string, label: string) => {
    setState(prev => prev.map(t => t.key === key ? { ...t, label } : t));
  };

  const handleDescChange = (key: string, description: string) => {
    setState(prev => prev.map(t => t.key === key ? { ...t, description } : t));
  };

  const handleAdd = () => {
    const key = newKey.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!key || !newLabel.trim() || state.some(t => t.key === key)) return;
    setState(prev => [...prev, { key, label: newLabel.trim(), description: '', active: true }]);
    setNewKey('');
    setNewLabel('');
  };

  const handleRemove = (key: string) => {
    const isDefault = DEFAULT_LEAD_TYPES.some(d => d.key === key);
    if (isDefault) return; // Can't remove defaults, only disable
    setState(prev => prev.filter(t => t.key !== key));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Badge variant={activeCount >= 1 ? 'default' : 'destructive'}>
          {activeCount}/{state.length} aktiv
        </Badge>
        <p className="text-sm text-muted-foreground">
          Lead-Typen werden für Routing, Filterung und Pipeline-Zuordnung verwendet.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Lead-Klassifikation</CardTitle>
          <CardDescription>
            Standard-Typen können aktiviert/deaktiviert werden. Eigene Typen können hinzugefügt oder entfernt werden.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.map(type => {
            const isDefault = DEFAULT_LEAD_TYPES.some(d => d.key === type.key);
            return (
              <div key={type.key} className="flex items-start gap-3 rounded-lg border p-3">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={type.label}
                      onChange={(e) => handleLabelChange(type.key, e.target.value)}
                      className="h-7 w-40 text-sm font-medium"
                      maxLength={30}
                    />
                    <Badge variant="outline" className="font-mono text-[10px]">{type.key}</Badge>
                    {isDefault && <Badge variant="secondary" className="text-[10px]">Standard</Badge>}
                  </div>
                  <Input
                    value={type.description}
                    onChange={(e) => handleDescChange(type.key, e.target.value)}
                    className="h-7 text-xs"
                    placeholder="Beschreibung…"
                    maxLength={80}
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Switch
                    checked={type.active}
                    onCheckedChange={() => handleToggle(type.key)}
                  />
                  {!isDefault && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => handleRemove(type.key)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add new type */}
          <div className="rounded-lg border border-dashed p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Neuen Lead-Typ hinzufügen</p>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-[10px]">Schlüssel</Label>
                <Input
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="h-7 text-xs"
                  placeholder="z.B. b2b"
                  maxLength={20}
                />
              </div>
              <div className="flex-1">
                <Label className="text-[10px]">Bezeichnung</Label>
                <Input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="h-7 text-xs"
                  placeholder="z.B. B2B"
                  maxLength={30}
                />
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={handleAdd}
                  disabled={!newKey.trim() || !newLabel.trim()}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Hinzufügen
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => onSave(state)} disabled={saving}>
          {saving ? 'Speichern…' : 'Lead-Typen speichern'}
        </Button>
      </div>
    </div>
  );
}
