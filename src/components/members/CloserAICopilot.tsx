import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Brain, Send, Loader2, ChevronDown, ChevronUp,
  Eye, Target, Shield, AlertTriangle, Zap, Activity,
  FileText, CheckCircle2, XCircle, Clock,
} from 'lucide-react';

/* ─── Types ─── */
type Phase = 'rapport' | 'discovery' | 'qualification' | 'objection' | 'closing' | 'follow_up';
type ObjectionType = 'price' | 'timing' | 'trust' | 'uncertainty' | 'decision_authority' | 'overwhelm' | 'unclear_fit' | 'none';

interface AnalysisResult {
  phase: Phase;
  objection_type: ObjectionType;
  suggested_response: string;
  next_action: string;
  backup_action?: string;
  confidence: 'low' | 'medium' | 'high';
}

interface PostCallSummary {
  summary: string;
  main_concern: string;
  decision_status: string;
  went_well: string[];
  blocked_deal: string[];
  next_steps: string[];
  suggested_outcome: 'closed_won' | 'follow_up' | 'closed_lost';
}

interface LeadContext {
  id: string;
  name: string;
  source_funnel?: string;
  qualification_score?: number;
  qualification_bucket?: string;
  stage?: string;
  deal_value?: number;
  setter_notes?: string;
  closer_notes?: string;
  ai_setter_summary?: string;
  ai_setter_recommendation?: string;
  setter_budget_readiness?: string;
  setter_decision_readiness?: string;
  setter_problem_clarity?: string;
}

const PHASE_META: Record<Phase, { icon: React.ComponentType<any>; label: string; color: string }> = {
  rapport: { icon: Eye, label: 'Rapport', color: 'text-muted-foreground' },
  discovery: { icon: Target, label: 'Discovery', color: 'text-blue-600' },
  qualification: { icon: Shield, label: 'Qualifizierung', color: 'text-yellow-600' },
  objection: { icon: AlertTriangle, label: 'Einwand', color: 'text-destructive' },
  closing: { icon: Zap, label: 'Closing', color: 'text-primary' },
  follow_up: { icon: Activity, label: 'Follow-Up', color: 'text-violet-600' },
};

const OBJECTION_LABELS: Record<ObjectionType, string> = {
  price: 'Preis',
  timing: 'Timing',
  trust: 'Vertrauen',
  uncertainty: 'Unsicherheit',
  decision_authority: 'Entscheidungskompetenz',
  overwhelm: 'Überforderung',
  unclear_fit: 'Unklarer Fit',
  none: 'Kein Einwand',
};

const CONFIDENCE_STYLES = {
  low: 'bg-destructive/10 text-destructive',
  medium: 'bg-yellow-500/10 text-yellow-700',
  high: 'bg-primary/10 text-primary',
};

const OUTCOME_META: Record<string, { icon: React.ComponentType<any>; label: string; color: string }> = {
  closed_won: { icon: CheckCircle2, label: 'Closed Won', color: 'text-primary' },
  follow_up: { icon: Clock, label: 'Follow-Up', color: 'text-yellow-600' },
  closed_lost: { icon: XCircle, label: 'Closed Lost', color: 'text-destructive' },
};

interface Props {
  lead: LeadContext;
}

export default function CloserAICopilot({ lead }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [sessionNotes, setSessionNotes] = useState<string[]>([]);
  const [summary, setSummary] = useState<PostCallSummary | null>(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  // Load AI Setter context
  const [aiSetterContext, setAiSetterContext] = useState<{ summary_text?: string; ai_recommendation?: string } | null>(null);

  useEffect(() => {
    if (!lead.id) return;
    supabase
      .from('ai_setter_sessions')
      .select('summary_text, ai_recommendation')
      .eq('lead_id', lead.id)
      .eq('chat_completed', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setAiSetterContext(data);
      });
  }, [lead.id]);

  const buildLeadContext = useCallback(() => ({
    ...lead,
    ai_setter_summary: aiSetterContext?.summary_text,
    ai_setter_recommendation: aiSetterContext?.ai_recommendation,
  }), [lead, aiSetterContext]);

  /* ─── Analyse ─── */
  const analyze = useCallback(async () => {
    if (!input.trim()) return;
    const note = input.trim();
    setSessionNotes(prev => [...prev, note]);
    setInput('');
    setAnalyzing(true);

    try {
      const { data, error } = await supabase.functions.invoke('closer-copilot-v2', {
        body: {
          input: note,
          lead_context: buildLeadContext(),
          mode: 'analyze',
          session_notes: sessionNotes,
          language: 'de',
        },
      });

      if (error) throw error;

      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      setAnalysis(parsed as AnalysisResult);

      // Store interaction
      if (user?.id && lead.id) {
        await supabase.from('copilot_interactions' as any).insert({
          lead_id: lead.id,
          closer_id: user.id,
          raw_input: note,
          detected_phase: parsed.phase,
          detected_objection: parsed.objection_type,
          suggested_response: parsed.suggested_response,
          suggested_next_action: parsed.next_action,
          confidence: parsed.confidence,
          session_notes: [...sessionNotes, note],
          lead_context: buildLeadContext(),
        });
      }
    } catch (e) {
      console.error('Copilot error:', e);
      toast({ title: 'Analyse fehlgeschlagen', variant: 'destructive' });
    } finally {
      setAnalyzing(false);
    }
  }, [input, sessionNotes, buildLeadContext, user, lead.id]);

  /* ─── Post-Call Summary ─── */
  const generateSummary = useCallback(async () => {
    if (sessionNotes.length === 0) {
      toast({ title: 'Keine Notizen vorhanden', variant: 'destructive' });
      return;
    }
    setGeneratingSummary(true);

    try {
      const { data, error } = await supabase.functions.invoke('closer-copilot-v2', {
        body: {
          input: sessionNotes.join('\n'),
          lead_context: buildLeadContext(),
          mode: 'summary',
          session_notes: sessionNotes,
          language: 'de',
        },
      });

      if (error) throw error;
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      setSummary(parsed as PostCallSummary);

      // Store summary interaction
      if (user?.id && lead.id) {
        await supabase.from('copilot_interactions' as any).insert({
          lead_id: lead.id,
          closer_id: user.id,
          raw_input: sessionNotes.join('\n'),
          detected_phase: analysis?.phase,
          detected_objection: analysis?.objection_type,
          summary_text: parsed.summary,
          suggested_outcome: parsed.suggested_outcome,
          session_notes: sessionNotes,
          lead_context: buildLeadContext(),
        });
      }
    } catch (e) {
      console.error('Summary error:', e);
      toast({ title: 'Zusammenfassung fehlgeschlagen', variant: 'destructive' });
    } finally {
      setGeneratingSummary(false);
    }
  }, [sessionNotes, buildLeadContext, user, lead.id, analysis]);

  const PhaseIcon = analysis ? PHASE_META[analysis.phase].icon : Brain;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-4">
      <CollapsibleTrigger asChild>
        <button className={cn(
          'w-full flex items-center justify-between rounded-lg border px-4 py-3 transition-colors',
          open ? 'border-primary/30 bg-primary/[0.03]' : 'border-border bg-muted/20 hover:bg-muted/40'
        )}>
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">AI Copilot</span>
            {analysis && (
              <Badge variant="outline" className={cn('text-[9px] ml-1', PHASE_META[analysis.phase].color)}>
                {PHASE_META[analysis.phase].label}
              </Badge>
            )}
          </div>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="rounded-b-lg border border-t-0 border-border bg-card px-4 py-4 space-y-4">
        {/* AI Setter Context Badge */}
        {aiSetterContext && (
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2 flex items-center gap-2">
            <Brain className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">AI Setter: </span>
            <Badge variant="outline" className="text-[9px]">
              {aiSetterContext.ai_recommendation === 'closable' ? '✓ Closable' :
               aiSetterContext.ai_recommendation === 'needs_call' ? '→ Gespräch' : 'Nicht bereit'}
            </Badge>
          </div>
        )}

        {/* Input */}
        <div className="space-y-2">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Was sagt/tut der Prospect?
          </label>
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder='z.B. "zu teuer", "muss überlegen", "klingt gut aber..."'
              className="min-h-[60px] text-sm resize-none flex-1"
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); analyze(); }
              }}
            />
          </div>
          <Button
            onClick={analyze}
            disabled={analyzing || !input.trim()}
            size="sm"
            className="w-full gap-2"
          >
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Analyse
          </Button>
        </div>

        {/* ── Analysis Results: 4 Blocks ── */}
        {analysis && (
          <div className="space-y-3">
            {/* Block A: Phase */}
            <div className="rounded-lg border border-border p-3 bg-muted/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PhaseIcon className={cn('h-4 w-4', PHASE_META[analysis.phase].color)} />
                  <span className={cn('text-xs font-semibold', PHASE_META[analysis.phase].color)}>
                    Phase: {PHASE_META[analysis.phase].label}
                  </span>
                </div>
                <Badge variant="outline" className={cn('text-[9px]', CONFIDENCE_STYLES[analysis.confidence])}>
                  {analysis.confidence}
                </Badge>
              </div>
            </div>

            {/* Block B: Objection */}
            {analysis.objection_type !== 'none' && (
              <div className="rounded-lg border border-destructive/20 p-3 bg-destructive/5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  <span className="text-[11px] font-semibold text-destructive uppercase tracking-wider">
                    Einwand: {OBJECTION_LABELS[analysis.objection_type]}
                  </span>
                </div>
              </div>
            )}

            {/* Block C: Suggested Response */}
            <div className="rounded-lg border border-primary/20 p-3 bg-primary/5">
              <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1.5">
                Empfohlene Antwort
              </p>
              <p className="text-sm text-foreground leading-relaxed">
                „{analysis.suggested_response}"
              </p>
            </div>

            {/* Block D: Next Action */}
            <div className="rounded-lg border border-border p-3 bg-muted/10">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Nächster Schritt
              </p>
              <p className="text-sm text-foreground">{analysis.next_action}</p>
              {analysis.backup_action && (
                <p className="text-[12px] text-muted-foreground mt-1 italic">
                  Alternativ: {analysis.backup_action}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Session Notes */}
        {sessionNotes.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Notizen ({sessionNotes.length})
            </p>
            <div className="space-y-1 max-h-24 overflow-y-auto">
              {sessionNotes.map((n, i) => (
                <p key={i} className="text-[11px] text-muted-foreground bg-muted/30 rounded px-2 py-1 truncate">
                  {n}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Post-Call Summary Button */}
        {sessionNotes.length > 0 && !summary && (
          <Button
            onClick={generateSummary}
            disabled={generatingSummary}
            variant="outline"
            size="sm"
            className="w-full gap-2"
          >
            {generatingSummary ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Call zusammenfassen
          </Button>
        )}

        {/* Post-Call Summary */}
        {summary && (
          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Call-Zusammenfassung</span>
            </div>

            <p className="text-[13px] text-muted-foreground leading-relaxed">{summary.summary}</p>

            {/* Main Concern */}
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Hauptbedenken</p>
              <p className="text-sm text-foreground">{summary.main_concern}</p>
            </div>

            {/* What went well */}
            <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
              <p className="text-[10px] text-primary uppercase font-semibold mb-1">Was gut lief</p>
              {summary.went_well.map((s, i) => (
                <div key={i} className="flex items-start gap-1.5 mb-0.5">
                  <CheckCircle2 className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                  <p className="text-[12px] text-foreground">{s}</p>
                </div>
              ))}
            </div>

            {/* What blocked */}
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2">
              <p className="text-[10px] text-destructive uppercase font-semibold mb-1">Was blockiert hat</p>
              {summary.blocked_deal.map((s, i) => (
                <div key={i} className="flex items-start gap-1.5 mb-0.5">
                  <XCircle className="h-3 w-3 text-destructive mt-0.5 shrink-0" />
                  <p className="text-[12px] text-foreground">{s}</p>
                </div>
              ))}
            </div>

            {/* Suggested Outcome */}
            {OUTCOME_META[summary.suggested_outcome] && (
              <div className="rounded-md border border-border bg-muted/20 px-3 py-2 flex items-center gap-2">
                {(() => { const O = OUTCOME_META[summary.suggested_outcome]; return (
                  <>
                    <O.icon className={cn('h-4 w-4', O.color)} />
                    <span className={cn('text-sm font-medium', O.color)}>{O.label}</span>
                    <span className="text-[11px] text-muted-foreground ml-auto">AI-Empfehlung — du entscheidest</span>
                  </>
                ); })()}
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!analysis && !summary && sessionNotes.length === 0 && (
          <div className="text-center py-4">
            <p className="text-[12px] text-muted-foreground">
              Gib ein, was der Prospect sagt oder tut. Der Copilot analysiert die Situation und gibt taktische Empfehlungen.
            </p>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
