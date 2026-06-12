import { useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { LOST_REASONS, WIN_REASONS } from '@/hooks/useDailyExecution';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, XCircle, UserX, Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  callId?: string;
  onSubmit: (data: any) => Promise<void>;
  onClose: () => void;
}

export default function CallOutcomeModal({ open, callId, onSubmit, onClose }: Props) {
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => lang === 'de' ? de : en;

  const [outcome, setOutcome] = useState<'won' | 'lost' | 'no_show' | ''>('');
  const [recordingStatus, setRecordingStatus] = useState<'transcript_uploaded' | 'recording_pending' | 'no_recording' | ''>('');
  const [recordingReason, setRecordingReason] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [soldOffer, setSoldOffer] = useState('');
  const [winReasons, setWinReasons] = useState<string[]>([]);
  const [lostReason, setLostReason] = useState('');
  const [comment, setComment] = useState('');
  const [reschedulePlanned, setReschedulePlanned] = useState(false);
  const [selfRating, setSelfRating] = useState('');
  const [improvementNote, setImprovementNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [aiAccepted, setAiAccepted] = useState<boolean | null>(null);

  const toggleWinReason = (value: string) => {
    setWinReasons(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
  };

  const handleAiSuggest = async () => {
    if (!outcome) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('deal-analysis', {
        body: {
          call_id: callId || null,
          outcome,
          comment: comment || null,
          deal_value: dealValue ? parseFloat(dealValue) : null,
        },
      });
      if (error) throw error;
      if (data?.suggested_loss_reason && outcome === 'lost') {
        setLostReason(data.suggested_loss_reason);
      }
      if (data?.suggested_win_reasons && outcome === 'won') {
        setWinReasons(data.suggested_win_reasons);
      }
      if (data?.summary) {
        setAiSummary(data.summary);
      }
      setAiAccepted(null);
      toast.success(tl('KI-Vorschlag geladen', 'AI suggestion loaded'));
    } catch {
      toast.error(tl('KI-Analyse fehlgeschlagen', 'AI analysis failed'));
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!outcome) return;
    if (!recordingStatus) return;
    if (recordingStatus === 'no_recording' && !recordingReason.trim()) return;
    setSubmitting(true);

    // Annotate comment with the recording-status proof so analytics can join.
    const recordingNote = recordingStatus === 'transcript_uploaded'
      ? '[recording_status: transcript_uploaded]'
      : recordingStatus === 'recording_pending'
        ? '[recording_status: recording_pending]'
        : `[recording_status: no_recording — ${recordingReason.trim()}]`;
    const composedComment = [comment?.trim(), recordingNote].filter(Boolean).join(' ');

    const payload = {
      call_id: callId || null,
      outcome,
      deal_value: outcome === 'won' ? parseFloat(dealValue) || 0 : 0,
      sold_offer: outcome === 'won' ? soldOffer || null : null,
      win_reasons: outcome === 'won' ? winReasons : [],
      lost_reason: outcome === 'lost' ? lostReason || null : null,
      comment: composedComment || null,
      reschedule_planned: outcome === 'no_show' ? reschedulePlanned : null,
      self_rating: selfRating ? parseInt(selfRating) : null,
      improvement_note: improvementNote || null,
      ai_suggested_loss_reason: outcome === 'lost' && aiSummary ? lostReason : null,
      ai_suggested_win_reasons: outcome === 'won' && aiSummary ? winReasons : null,
      ai_summary: aiSummary || null,
      ai_suggestion_accepted: aiAccepted,
    };

    await onSubmit(payload);

    // Event tracking — recording_status now part of payload for AI Learning health.
    supabase.from('lead_events').insert({
      event_type: 'deal_analyzed',
      notes: `Outcome: ${outcome}, Value: ${payload.deal_value || 0}`,
      metadata: {
        outcome,
        deal_value: payload.deal_value,
        has_ai: !!aiSummary,
        recording_status: recordingStatus,
        recording_reason: recordingStatus === 'no_recording' ? recordingReason.trim() : null,
      },
    } as any).then(() => {});

    if (outcome === 'lost' && lostReason) {
      supabase.from('lead_events').insert({
        event_type: 'loss_reason_selected',
        notes: `Reason: ${lostReason}`,
        metadata: { loss_reason: lostReason, ai_suggested: !!aiSummary, ai_accepted: aiAccepted },
      } as any).then(() => {});
    }

    setSubmitting(false);
    setOutcome('');
    setRecordingStatus('');
    setRecordingReason('');
    setDealValue('');
    setSoldOffer('');
    setWinReasons([]);
    setLostReason('');
    setComment('');
    setSelfRating('');
    setImprovementNote('');
    setAiSummary('');
    setAiAccepted(null);
    onClose();
  };

  const outcomeButtons = [
    { key: 'won' as const, icon: CheckCircle2, label: 'Won', color: 'bg-green-500/10 border-green-500/30 text-green-600 hover:bg-green-500/20' },
    { key: 'lost' as const, icon: XCircle, label: 'Lost', color: 'bg-red-500/10 border-red-500/30 text-red-600 hover:bg-red-500/20' },
    { key: 'no_show' as const, icon: UserX, label: 'No-Show', color: 'bg-amber-500/10 border-amber-500/30 text-amber-600 hover:bg-amber-500/20' },
  ];

  // Feedback hints based on outcome
  const feedbackHint = outcome === 'lost' && lostReason
    ? {
        price: tl('💡 Tipp: Value vor Preis stärker aufbauen', '💡 Tip: Build value before discussing price'),
        no_trust: tl('💡 Tipp: Mehr Rapport und Social Proof einsetzen', '💡 Tip: Use more rapport and social proof'),
        no_need: tl('💡 Tipp: Pain Discovery vertiefen', '💡 Tip: Deepen pain discovery'),
        bad_timing: tl('💡 Tipp: Dringlichkeit stärker herausarbeiten', '💡 Tip: Emphasize urgency more'),
        no_fit: tl('💡 Tipp: Qualification früher klären', '💡 Tip: Clarify qualification earlier'),
        bad_call: tl('💡 Tipp: Call-Struktur und Framework Review', '💡 Tip: Review call structure and framework'),
      }[lostReason] || null
    : null;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" onPointerDownOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{tl('Call-Ergebnis eintragen', 'Log Call Outcome')}</DialogTitle>
          <DialogDescription>{tl('Pflichtfeld — dieser Call ist erst abgeschlossen, wenn das Ergebnis erfasst ist.', 'Required — this call is only complete once the outcome is logged.')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Outcome Selection */}
          <div className="grid grid-cols-3 gap-2">
            {outcomeButtons.map(btn => (
              <button
                key={btn.key}
                onClick={() => setOutcome(btn.key)}
                className={`flex flex-col items-center gap-1 rounded-xl border p-3 transition-all ${outcome === btn.key ? btn.color + ' ring-2 ring-offset-1' : 'border-border hover:bg-muted/50'}`}
              >
                <btn.icon className="h-5 w-5" />
                <span className="text-xs font-medium">{btn.label}</span>
              </button>
            ))}
          </div>

          {/* Won fields */}
          {outcome === 'won' && (
            <div className="space-y-3 animate-in fade-in-0 slide-in-from-top-2">
              <div>
                <Label>{tl('Deal-Wert (€)', 'Deal Value (€)')}</Label>
                <Input type="number" value={dealValue} onChange={e => setDealValue(e.target.value)} placeholder="z.B. 3000" />
              </div>
              <div>
                <Label>{tl('Verkauftes Angebot (optional)', 'Sold Offer (optional)')}</Label>
                <Input value={soldOffer} onChange={e => setSoldOffer(e.target.value)} placeholder={tl('z.B. Premium Paket', 'e.g. Premium Package')} />
              </div>
              <div>
                <Label>{tl('Gewinn-Gründe', 'Win Reasons')}</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {WIN_REASONS.map(r => (
                    <button
                      key={r.value}
                      onClick={() => toggleWinReason(r.value)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${winReasons.includes(r.value) ? 'bg-green-500/15 border-green-500/40 text-green-700' : 'border-border text-muted-foreground hover:bg-muted/50'}`}
                    >
                      {lang === 'de' ? r.label : r.labelEn}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Lost fields */}
          {outcome === 'lost' && (
            <div className="space-y-3 animate-in fade-in-0 slide-in-from-top-2">
              <div>
                <Label>{tl('Verlustgrund', 'Lost Reason')}</Label>
                <Select value={lostReason} onValueChange={setLostReason}>
                  <SelectTrigger><SelectValue placeholder={tl('Grund auswählen', 'Select reason')} /></SelectTrigger>
                  <SelectContent>
                    {LOST_REASONS.map(r => (
                      <SelectItem key={r.value} value={r.value}>{lang === 'de' ? r.label : r.labelEn}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {feedbackHint && (
                <div className="text-xs bg-amber-500/10 text-amber-700 border border-amber-500/20 rounded-lg p-2.5 animate-in fade-in-0">
                  {feedbackHint}
                </div>
              )}
              <div>
                <Label>{tl('Kommentar (optional)', 'Comment (optional)')}</Label>
                <Textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} />
              </div>
            </div>
          )}

          {/* No-Show fields */}
          {outcome === 'no_show' && (
            <div className="space-y-3 animate-in fade-in-0 slide-in-from-top-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={reschedulePlanned} onChange={e => setReschedulePlanned(e.target.checked)} className="rounded" />
                {tl('Reschedule geplant?', 'Reschedule planned?')}
              </label>
            </div>
          )}

          {/* AI Suggest Button */}
          {outcome && (
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAiSuggest}
                disabled={aiLoading}
                className="w-full gap-2 text-xs"
              >
                {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {tl('🤖 Analyse vorschlagen', '🤖 Suggest analysis')}
              </Button>
              {aiSummary && (
                <div className="text-xs bg-primary/5 border border-primary/20 rounded-lg p-2.5 animate-in fade-in-0">
                  <p className="font-medium mb-1">{tl('KI-Zusammenfassung:', 'AI Summary:')}</p>
                  <p className="text-muted-foreground">{aiSummary}</p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setAiAccepted(true)}
                      className={`text-xs px-2 py-1 rounded border transition-all ${aiAccepted === true ? 'bg-green-500/15 border-green-500/40 text-green-700' : 'border-border hover:bg-muted/50'}`}
                    >
                      ✓ {tl('Übernehmen', 'Accept')}
                    </button>
                    <button
                      onClick={() => setAiAccepted(false)}
                      className={`text-xs px-2 py-1 rounded border transition-all ${aiAccepted === false ? 'bg-red-500/15 border-red-500/40 text-red-700' : 'border-border hover:bg-muted/50'}`}
                    >
                      ✗ {tl('Ändern', 'Modify')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recording / Transcript status — required */}
          {outcome && (
            <div className="space-y-2 border-t pt-3 animate-in fade-in-0">
              <Label>
                {tl('Aufnahme- / Transkript-Status', 'Recording / Transcript status')}
                <span className="text-destructive ml-1">*</span>
              </Label>
              <div className="grid grid-cols-1 gap-1.5 text-xs">
                {[
                  { key: 'transcript_uploaded' as const, de: 'Transkript hochgeladen / verfügbar', en: 'Transcript uploaded / available' },
                  { key: 'recording_pending' as const, de: 'Recording vorhanden — Upload geplant', en: 'Recording exists — upload pending' },
                  { key: 'no_recording' as const, de: 'Kein Recording (Grund angeben)', en: 'No recording (provide reason)' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setRecordingStatus(opt.key)}
                    className={`text-left rounded-lg border px-3 py-2 transition-all ${
                      recordingStatus === opt.key
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground hover:bg-muted/50'
                    }`}
                  >
                    {lang === 'de' ? opt.de : opt.en}
                  </button>
                ))}
              </div>
              {recordingStatus === 'no_recording' && (
                <Input
                  value={recordingReason}
                  onChange={e => setRecordingReason(e.target.value)}
                  placeholder={tl('Grund (z.B. Lead lehnte Aufnahme ab)', 'Reason (e.g. lead declined recording)')}
                  className="text-xs"
                />
              )}
              <p className="text-[11px] text-muted-foreground">
                {tl('Pflicht — ohne Status kein Abschluss. Treibt das AI-Learning.', 'Required — call cannot be closed without status. Powers AI learning.')}
              </p>
            </div>
          )}

          {/* Self-assessment */}
          {outcome && (
            <div className="space-y-3 border-t pt-3 animate-in fade-in-0">
              <div>
                <Label>{tl('Self-Rating (1–10)', 'Self-Rating (1–10)')}</Label>
                <Input type="number" min={1} max={10} value={selfRating} onChange={e => setSelfRating(e.target.value)} />
              </div>
              <div>
                <Label>{tl('Was hätte ich besser machen können?', 'What could I have done better?')}</Label>
                <Textarea value={improvementNote} onChange={e => setImprovementNote(e.target.value)} rows={2} />
              </div>
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={
              !outcome ||
              (outcome === 'lost' && !lostReason) ||
              !recordingStatus ||
              (recordingStatus === 'no_recording' && !recordingReason.trim()) ||
              submitting
            }
            className="w-full"
          >
            {submitting ? '...' : tl('Ergebnis speichern', 'Save Outcome')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
