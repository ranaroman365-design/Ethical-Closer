import { useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CheckCircle2, BookOpen } from 'lucide-react';
import type { DailyReflection } from '@/hooks/useDailyExecution';

interface Props {
  reflection: DailyReflection | null;
  onSubmit: (data: { worked_well: string; did_not_work: string; improve_tomorrow: string }) => Promise<void>;
}

export default function DailyReflectionBlock({ reflection, onSubmit }: Props) {
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => lang === 'de' ? de : en;

  const [workedWell, setWorkedWell] = useState(reflection?.worked_well || '');
  const [didNotWork, setDidNotWork] = useState(reflection?.did_not_work || '');
  const [improveTomorrow, setImproveTomorrow] = useState(reflection?.improve_tomorrow || '');
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(!!reflection);

  const handleSubmit = async () => {
    if (!workedWell.trim() || !didNotWork.trim() || !improveTomorrow.trim()) return;
    setSubmitting(true);
    await onSubmit({ worked_well: workedWell, did_not_work: didNotWork, improve_tomorrow: improveTomorrow });
    setSubmitting(false);
    setSaved(true);
  };

  if (saved && reflection) {
    return (
      <Card className="border-green-500/20 bg-green-500/[0.03]">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            {tl('Tagesreflexion abgeschlossen', 'Daily Reflection Complete')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p><strong>✓</strong> {reflection.worked_well}</p>
          <p><strong>✗</strong> {reflection.did_not_work}</p>
          <p><strong>→</strong> {reflection.improve_tomorrow}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/15">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <BookOpen className="h-4 w-4 text-primary" />
          {tl('Tagesreflexion', 'Daily Reflection')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-xs">{tl('Was hat heute funktioniert?', 'What worked today?')}</Label>
          <Textarea value={workedWell} onChange={e => setWorkedWell(e.target.value)} rows={2} className="mt-1 text-sm" />
        </div>
        <div>
          <Label className="text-xs">{tl('Was hat nicht funktioniert?', 'What didn\'t work?')}</Label>
          <Textarea value={didNotWork} onChange={e => setDidNotWork(e.target.value)} rows={2} className="mt-1 text-sm" />
        </div>
        <div>
          <Label className="text-xs">{tl('Was wirst du morgen besser machen?', 'What will you do better tomorrow?')}</Label>
          <Textarea value={improveTomorrow} onChange={e => setImproveTomorrow(e.target.value)} rows={2} className="mt-1 text-sm" />
        </div>
        <Button
          onClick={handleSubmit}
          disabled={!workedWell.trim() || !didNotWork.trim() || !improveTomorrow.trim() || submitting}
          className="w-full"
          size="sm"
        >
          {submitting ? '...' : tl('Reflexion speichern', 'Save Reflection')}
        </Button>
      </CardContent>
    </Card>
  );
}
