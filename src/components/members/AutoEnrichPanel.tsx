import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, Loader2, Check, Edit2, Heart, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface EnrichResult {
  has_data: boolean;
  besonderheit?: string;
  hauptziel?: string;
  hauptproblem?: string;
  kaufbereitschaft?: string;
  kaufwahrscheinlichkeit?: number;
  emotionale_trigger?: string[];
  einwaende?: string[];
  closer_summary?: string[];
  suggested_loss_reason?: string | null;
  suggested_win_reasons?: string[];
  gespraechs_zusammenfassung?: string;
  fallback_questions?: { key: string; label: string }[];
}

interface Props {
  leadId: string;
  currentNotes: string;
  onApply: (data: { setter_notes: string; enrichment: EnrichResult }) => void;
}

export default function AutoEnrichPanel({ leadId, currentNotes, onApply }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EnrichResult | null>(null);
  const [editing, setEditing] = useState(false);
  const [editedBesonderheit, setEditedBesonderheit] = useState('');
  const [editedZiel, setEditedZiel] = useState('');
  const [editedProblem, setEditedProblem] = useState('');
  const [fallbackAnswers, setFallbackAnswers] = useState<Record<string, string>>({});

  const handleEnrich = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-enrich-lead', {
        body: { lead_id: leadId },
      });
      if (error) throw error;
      setResult(data as EnrichResult);
      if (data?.besonderheit) setEditedBesonderheit(data.besonderheit);
      if (data?.hauptziel) setEditedZiel(data.hauptziel);
      if (data?.hauptproblem) setEditedProblem(data.hauptproblem);
      toast.success('KI-Analyse abgeschlossen');
    } catch {
      toast.error('Auto-Enrichment fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!result) return;

    const enrichedNotes = [
      currentNotes,
      '',
      '--- KI-Analyse ---',
      result.besonderheit ? `Besonderheit: ${editing ? editedBesonderheit : result.besonderheit}` : '',
      result.hauptziel ? `Ziel: ${editing ? editedZiel : result.hauptziel}` : '',
      result.hauptproblem ? `Problem: ${editing ? editedProblem : result.hauptproblem}` : '',
      result.kaufbereitschaft ? `Kaufbereitschaft: ${result.kaufbereitschaft.toUpperCase()}` : '',
      result.kaufwahrscheinlichkeit != null ? `Kaufwahrscheinlichkeit: ${result.kaufwahrscheinlichkeit}/10` : '',
      result.emotionale_trigger?.length ? `Emotionale Trigger: ${result.emotionale_trigger.join(', ')}` : '',
      result.einwaende?.length ? `Einwände: ${result.einwaende.join(', ')}` : '',
      result.closer_summary?.length ? `\nCloser Summary:\n${result.closer_summary.map(s => `• ${s}`).join('\n')}` : '',
      result.gespraechs_zusammenfassung ? `\nZusammenfassung: ${result.gespraechs_zusammenfassung}` : '',
    ].filter(Boolean).join('\n');

    await supabase.from('lead_events').insert({
      lead_id: leadId,
      event_type: editing ? 'ai_override' : 'ai_fields_applied',
      notes: `AI enrichment ${editing ? 'modified and ' : ''}applied | Buy prob: ${result.kaufwahrscheinlichkeit}/10`,
      metadata: { edited: editing, kaufbereitschaft: result.kaufbereitschaft, kaufwahrscheinlichkeit: result.kaufwahrscheinlichkeit },
    } as any);

    onApply({ setter_notes: enrichedNotes, enrichment: result });
    toast.success('Daten übernommen');
  };

  const handleFallbackSubmit = () => {
    const manualNotes = [
      currentNotes,
      '',
      '--- Setter Eingabe ---',
      fallbackAnswers.goal ? `Ziel: ${fallbackAnswers.goal}` : '',
      fallbackAnswers.problem ? `Problem: ${fallbackAnswers.problem}` : '',
      fallbackAnswers.timing ? `Timing: ${fallbackAnswers.timing}` : '',
    ].filter(Boolean).join('\n');

    onApply({
      setter_notes: manualNotes,
      enrichment: { has_data: false, hauptziel: fallbackAnswers.goal, hauptproblem: fallbackAnswers.problem },
    });
    toast.success('Daten gespeichert');
  };

  const kaufBadgeColor: Record<string, string> = {
    high: 'bg-green-500/15 text-green-700 border-green-500/30',
    medium: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
    low: 'bg-red-500/15 text-red-700 border-red-500/30',
  };

  const probColor = (score: number) => {
    if (score >= 7) return 'text-green-600';
    if (score >= 4) return 'text-amber-600';
    return 'text-red-500';
  };

  return (
    <div className="space-y-3">
      {!result && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleEnrich}
          disabled={loading}
          className="w-full gap-2"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          🤖 Analyse starten
        </Button>
      )}

      {result && !result.has_data && result.fallback_questions && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-3 animate-in fade-in-0">
          <p className="text-xs font-medium text-amber-700">Nicht genug Daten — bitte manuell beantworten:</p>
          {result.fallback_questions.map(q => (
            <div key={q.key}>
              <Label className="text-xs">{q.label}</Label>
              <Input
                className="mt-1 text-sm"
                value={fallbackAnswers[q.key] || ''}
                onChange={e => setFallbackAnswers(prev => ({ ...prev, [q.key]: e.target.value }))}
              />
            </div>
          ))}
          <Button size="sm" className="w-full" onClick={handleFallbackSubmit}>
            Speichern
          </Button>
        </div>
      )}

      {result && result.has_data && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3 animate-in fade-in-0 slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-primary">🤖 KI-Analyse</p>
            <button
              onClick={() => setEditing(!editing)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <Edit2 className="h-3 w-3" /> {editing ? 'Vorschau' : 'Bearbeiten'}
            </button>
          </div>

          {/* Kaufwahrscheinlichkeit + Kaufbereitschaft row */}
          <div className="flex items-center gap-3">
            {result.kaufwahrscheinlichkeit != null && (
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground uppercase">Kaufwahrsch.</span>
                <span className={cn('text-sm font-bold', probColor(result.kaufwahrscheinlichkeit))}>
                  {result.kaufwahrscheinlichkeit}/10
                </span>
              </div>
            )}
            {result.kaufbereitschaft && (
              <Badge variant="outline" className={cn('text-[10px]', kaufBadgeColor[result.kaufbereitschaft] || '')}>
                {result.kaufbereitschaft.toUpperCase()}
              </Badge>
            )}
          </div>

          {/* Emotionale Trigger */}
          {result.emotionale_trigger && result.emotionale_trigger.length > 0 && (
            <div>
              <Label className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
                <Heart className="h-3 w-3" /> Emotionale Trigger
              </Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {result.emotionale_trigger.map((t, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] border-pink-500/30 text-pink-700 bg-pink-500/5">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Besonderheit */}
          {result.besonderheit && (
            <div>
              <Label className="text-[10px] text-muted-foreground uppercase">Besonderheit</Label>
              {editing ? (
                <Textarea className="mt-1 text-xs" rows={2} value={editedBesonderheit} onChange={e => setEditedBesonderheit(e.target.value)} />
              ) : (
                <p className="text-xs text-foreground mt-0.5">{result.besonderheit}</p>
              )}
            </div>
          )}

          {/* Ziel & Problem */}
          <div className="grid grid-cols-2 gap-2">
            {result.hauptziel && (
              <div>
                <Label className="text-[10px] text-muted-foreground uppercase">Ziel</Label>
                {editing ? (
                  <Input className="mt-1 text-xs" value={editedZiel} onChange={e => setEditedZiel(e.target.value)} />
                ) : (
                  <p className="text-xs text-foreground mt-0.5">{result.hauptziel}</p>
                )}
              </div>
            )}
            {result.hauptproblem && (
              <div>
                <Label className="text-[10px] text-muted-foreground uppercase">Problem</Label>
                {editing ? (
                  <Input className="mt-1 text-xs" value={editedProblem} onChange={e => setEditedProblem(e.target.value)} />
                ) : (
                  <p className="text-xs text-foreground mt-0.5">{result.hauptproblem}</p>
                )}
              </div>
            )}
          </div>

          {/* Einwände */}
          {result.einwaende && result.einwaende.length > 0 && (
            <div>
              <Label className="text-[10px] text-muted-foreground uppercase">Erkannte Einwände</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {result.einwaende.map((e, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] border-amber-500/30 text-amber-700 bg-amber-500/5">
                    {e}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Closer Summary */}
          {result.closer_summary && result.closer_summary.length > 0 && (
            <div>
              <Label className="text-[10px] text-muted-foreground uppercase">Closer Summary</Label>
              <ul className="mt-1 space-y-1">
                {result.closer_summary.map((s, i) => (
                  <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                    <span className="text-primary mt-0.5">•</span> {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Zusammenfassung */}
          {result.gespraechs_zusammenfassung && (
            <div>
              <Label className="text-[10px] text-muted-foreground uppercase">Zusammenfassung</Label>
              <p className="text-xs text-foreground mt-0.5 italic">{result.gespraechs_zusammenfassung}</p>
            </div>
          )}

          {/* Apply button */}
          <Button size="sm" className="w-full gap-2" onClick={handleApply}>
            <Check className="h-3.5 w-3.5" /> Übernehmen
          </Button>
        </div>
      )}
    </div>
  );
}
