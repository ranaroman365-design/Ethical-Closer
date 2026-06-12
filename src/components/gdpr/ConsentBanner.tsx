import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Shield } from 'lucide-react';

const CONSENT_TYPES = [
  { key: 'platform_usage', label: 'Nutzung der Plattform', required: true },
  { key: 'data_processing', label: 'Datenverarbeitung gemäß DSGVO', required: true },
  { key: 'analytics', label: 'Anonymisierte Analyse zur Verbesserung', required: false },
  { key: 'marketing', label: 'Marketing-Kommunikation', required: false },
] as const;

export default function ConsentBanner({ userId, onComplete }: { userId: string; onComplete: () => void }) {
  const [consents, setConsents] = useState<Record<string, boolean>>(
    Object.fromEntries(CONSENT_TYPES.map(c => [c.key, c.required]))
  );
  const [existing, setExisting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from('user_consents')
      .select('consent_type')
      .eq('user_id', userId)
      .eq('consent_given', true)
      .then(({ data }) => {
        if (data && data.length >= CONSENT_TYPES.filter(c => c.required).length) {
          setExisting(true);
          onComplete();
        }
      });
  }, [userId, onComplete]);

  if (existing) return null;

  const allRequiredChecked = CONSENT_TYPES.filter(c => c.required).every(c => consents[c.key]);

  const handleSave = async () => {
    setSaving(true);
    const rows = Object.entries(consents).map(([key, given]) => ({
      user_id: userId,
      consent_type: key,
      consent_given: given,
      consent_version: '1.0',
      legal_basis: CONSENT_TYPES.find(c => c.key === key)?.required ? 'contract' : 'consent',
    }));
    await supabase.from('user_consents').insert(rows);
    setSaving(false);
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <Card className="max-w-lg w-full shadow-lg">
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Datenschutz-Einwilligung</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Um die Plattform nutzen zu können, benötigen wir deine Zustimmung zur Datenverarbeitung gemäß DSGVO.
          </p>
          <div className="space-y-3">
            {CONSENT_TYPES.map(c => (
              <label key={c.key} className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={consents[c.key]}
                  disabled={c.required}
                  onCheckedChange={(v) => setConsents(prev => ({ ...prev, [c.key]: !!v }))}
                  className="mt-0.5"
                />
                <span className="text-sm text-foreground">
                  {c.label}
                  {c.required && <span className="text-destructive ml-1">*</span>}
                </span>
              </label>
            ))}
          </div>
          <div className="flex justify-between items-center pt-2">
            <a href="/datenschutz" className="text-xs text-muted-foreground underline">Datenschutzerklärung</a>
            <Button onClick={handleSave} disabled={!allRequiredChecked || saving}>
              {saving ? 'Speichern…' : 'Zustimmen & Fortfahren'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
