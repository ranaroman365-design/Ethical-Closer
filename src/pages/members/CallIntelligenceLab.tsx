import { useState, useEffect, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Loader2, BarChart3, FileAudio, Trophy, ArrowRight, ArrowLeft, AlertTriangle, CheckCircle2, Target, MessageSquare, Zap, TrendingUp } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ─── Types ────────────────────────────────────────────────────
interface CallRecord {
  id: string;
  file_url: string | null;
  transcript: string | null;
  call_type: string;
  funnel_stage: string;
  offer_type: string;
  price_point: number;
  awareness_level: string;
  emotional_state: string;
  lead_source: string;
  result: string;
  deal_size: number;
  objection_type: string | null;
  self_rating: number;
  self_breakpoint: string | null;
  self_uncertainty: string | null;
  status: string;
  created_at: string;
}

interface CallAnalysis {
  id: string;
  call_id: string;
  overall_score: number;
  opening_score: number;
  rapport_score: number;
  qualification_score: number;
  pain_score: number;
  desire_score: number;
  pitch_score: number;
  closing_score: number;
  talk_ratio: number;
  question_depth_score: number;
  engagement_score: number;
  objection_score: number;
  closing_efficiency: number;
  top_3_mistakes: string[];
  objections_detected: { type: string; objection: string; handling: string; improvement: string }[];
  language_feedback: { issue: string; example: string; alternative: string }[];
  closing_feedback: { observation: string; recommendation: string }[];
  action_plan: { priority: string; action: string; expected_impact: string }[];
  created_at: string;
}

interface PerformanceMetrics {
  avg_call_score: number;
  closing_rate: number;
  objection_score: number;
  trend_score: number;
  total_calls: number;
}

// ─── Metadata form defaults ──────────────────────────────────
const defaultMeta = {
  call_type: 'closer',
  funnel_stage: 'warm',
  offer_type: 'high_ticket',
  price_point: 0,
  awareness_level: 'problem_aware',
  emotional_state: 'curious',
  lead_source: 'organic',
  result: 'no_decision',
  deal_size: 0,
  objection_type: '',
  self_rating: 5,
  self_breakpoint: '',
  self_uncertainty: '',
};

// ─── Score color helper ──────────────────────────────────────
function scoreColor(score: number, max = 10) {
  const pct = score / max;
  if (pct >= 0.8) return 'text-primary';
  if (pct >= 0.6) return 'text-accent';
  return 'text-destructive';
}

function scoreBg(score: number, max = 10) {
  const pct = score / max;
  if (pct >= 0.8) return 'bg-primary/10';
  if (pct >= 0.6) return 'bg-accent/10';
  return 'bg-destructive/10';
}

// ─── Main Component ──────────────────────────────────────────
export default function CallIntelligenceLab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [mainTab, setMainTab] = useState('upload');
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [analyses, setAnalyses] = useState<Map<string, CallAnalysis>>(new Map());
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState<{ call: CallRecord; analysis: CallAnalysis } | null>(null);
  const [analysisTab, setAnalysisTab] = useState('overview');

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [meta, setMeta] = useState({ ...defaultMeta });
  const [transcript, setTranscript] = useState('');
  const [uploadStep, setUploadStep] = useState(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Fetch data
  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [callsRes, metricsRes] = await Promise.all([
        supabase.from('calls').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('performance_metrics').select('*').eq('user_id', user.id).single(),
      ]);
      const callsList = (callsRes.data || []) as CallRecord[];
      setCalls(callsList);
      if (metricsRes.data) setMetrics(metricsRes.data as PerformanceMetrics);

      // Fetch analyses for analyzed calls
      const analyzedIds = callsList.filter(c => c.status === 'analyzed').map(c => c.id);
      if (analyzedIds.length > 0) {
        const { data: analysesData } = await supabase
          .from('call_analysis')
          .select('*')
          .in('call_id', analyzedIds);
        if (analysesData) {
          const map = new Map<string, CallAnalysis>();
          for (const a of analysesData as unknown as CallAnalysis[]) map.set(a.call_id, a);
          setAnalyses(map);
        }
      }
    };
    fetchData();
  }, [user]);

  // File select
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadStep(2);
    }
  };

  // Upload + create call
  const handleSubmit = async () => {
    if (!user || !selectedFile) return;
    setUploading(true);
    try {
      const filePath = `${user.id}/${Date.now()}_${selectedFile.name}`;
      const { error: uploadError } = await supabase.storage.from('call-recordings').upload(filePath, selectedFile);
      if (uploadError) throw uploadError;

      const { data, error } = await supabase.from('calls').insert({
        user_id: user.id,
        file_url: filePath,
        transcript: transcript || null,
        ...meta,
        status: 'uploaded',
      }).select().single();

      if (error) throw error;
      const newCall = data as CallRecord;
      setCalls(prev => [newCall, ...prev]);
      toast({ title: 'Call hochgeladen', description: 'Starte jetzt die AI-Analyse.' });

      // Reset form
      setMeta({ ...defaultMeta });
      setTranscript('');
      setSelectedFile(null);
      setUploadStep(1);
      if (fileRef.current) fileRef.current.value = '';

      // Auto-start analysis
      startAnalysis(newCall.id);
    } catch (err: any) {
      toast({ title: 'Fehler', description: err.message });
    }
    setUploading(false);
  };

  // Start AI analysis
  const startAnalysis = async (callId: string) => {
    setAnalyzing(callId);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-call', {
        body: { callId },
      });
      if (error) throw error;
      const analysis = data.analysis as CallAnalysis;
      setAnalyses(prev => new Map(prev).set(callId, analysis));
      setCalls(prev => prev.map(c => c.id === callId ? { ...c, status: 'analyzed' } : c));

      // Refresh metrics
      const { data: metricsData } = await supabase.from('performance_metrics').select('*').eq('user_id', user!.id).single();
      if (metricsData) setMetrics(metricsData as PerformanceMetrics);

      toast({ title: 'Analyse abgeschlossen', description: `Score: ${analysis.overall_score}/10` });
    } catch (err: any) {
      toast({ title: 'Analyse fehlgeschlagen', description: err.message });
    }
    setAnalyzing(null);
  };

  const viewAnalysis = (call: CallRecord) => {
    const analysis = analyses.get(call.id);
    if (analysis) {
      setSelectedAnalysis({ call, analysis });
      setAnalysisTab('overview');
    }
  };

  // ─── Render ────────────────────────────────────────────────
  if (selectedAnalysis) {
    return <AnalysisDetail
      call={selectedAnalysis.call}
      analysis={selectedAnalysis.analysis}
      activeTab={analysisTab}
      onTabChange={setAnalysisTab}
      onBack={() => setSelectedAnalysis(null)}
    />;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
      <div className="mb-8">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">Call Intelligence Lab</h1>
        <p className="mt-1 text-sm text-muted-foreground">Precision analysis for real performance improvement.</p>
      </div>

      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="mb-6 w-full grid grid-cols-4">
          <TabsTrigger value="upload" className="text-xs"><Upload className="mr-1.5 h-3.5 w-3.5" />Upload</TabsTrigger>
          <TabsTrigger value="analyses" className="text-xs"><FileAudio className="mr-1.5 h-3.5 w-3.5" />Analysen</TabsTrigger>
          <TabsTrigger value="dashboard" className="text-xs"><BarChart3 className="mr-1.5 h-3.5 w-3.5" />Dashboard</TabsTrigger>
          <TabsTrigger value="best" className="text-xs"><Trophy className="mr-1.5 h-3.5 w-3.5" />Best Calls</TabsTrigger>
        </TabsList>

        {/* ─── UPLOAD TAB ──────────────────────────────── */}
        <TabsContent value="upload">
          <div className="rounded-xl border border-border/40 bg-card p-6">
            <h2 className="font-serif text-lg font-semibold text-foreground mb-1">Upload Call</h2>
            <p className="text-xs text-muted-foreground mb-6">Analyze your conversations. Identify what actually drives results.</p>

            {uploadStep === 1 && (
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/50 bg-muted/20 p-10">
                <Upload className="mb-3 h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm font-medium text-muted-foreground">Call-Aufnahme hochladen</p>
                <p className="mt-1 text-xs text-muted-foreground/60">.mp3, .wav, .mp4 — max 20 MB</p>
                <input ref={fileRef} type="file" accept=".mp3,.wav,.mp4,audio/*,video/*" onChange={handleFileSelect} className="hidden" />
                <Button variant="outline" size="sm" className="mt-4 text-xs" onClick={() => fileRef.current?.click()}>
                  Datei auswählen
                </Button>

                <div className="mt-6 w-full max-w-md">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Oder Transkript einfügen:</p>
                  <Textarea
                    value={transcript}
                    onChange={e => setTranscript(e.target.value)}
                    placeholder="Transkript hier einfügen..."
                    className="text-xs min-h-[80px]"
                  />
                  {transcript && (
                    <Button variant="outline" size="sm" className="mt-2 text-xs" onClick={() => { setSelectedFile(new File([''], 'transcript.txt')); setUploadStep(2); }}>
                      Weiter mit Transkript <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            )}

            {uploadStep === 2 && (
              <div className="space-y-6">
                <div className="flex items-center gap-2 mb-4">
                  <Button variant="ghost" size="sm" onClick={() => setUploadStep(1)}><ArrowLeft className="h-3.5 w-3.5 mr-1" />Zurück</Button>
                  <Badge variant="outline" className="text-[10px]">{selectedFile?.name}</Badge>
                </div>

                {/* Call Context */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Call Context</h3>
                  <p className="text-[11px] text-muted-foreground/70 mb-3">Define the strategic environment of this call.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <SelectField label="Call-Typ" value={meta.call_type} onChange={v => setMeta(p => ({ ...p, call_type: v }))}
                      options={[['setter', 'Setter'], ['closer', 'Closer'], ['follow_up', 'Follow-Up']]} />
                    <SelectField label="Funnel-Stufe" value={meta.funnel_stage} onChange={v => setMeta(p => ({ ...p, funnel_stage: v }))}
                      options={[['cold', 'Cold'], ['warm', 'Warm'], ['qualified', 'Qualified']]} />
                    <SelectField label="Angebot" value={meta.offer_type} onChange={v => setMeta(p => ({ ...p, offer_type: v }))}
                      options={[['low_ticket', 'Low Ticket'], ['high_ticket', 'High Ticket']]} />
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground">Preis (€)</label>
                      <Input type="number" value={meta.price_point} onChange={e => setMeta(p => ({ ...p, price_point: Number(e.target.value) }))} className="mt-1 text-xs h-9" />
                    </div>
                  </div>
                </div>

                {/* Lead Profile */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Lead Profile</h3>
                  <p className="text-[11px] text-muted-foreground/70 mb-3">Understand who you were speaking to.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <SelectField label="Awareness" value={meta.awareness_level} onChange={v => setMeta(p => ({ ...p, awareness_level: v }))}
                      options={[['unaware', 'Unaware'], ['problem_aware', 'Problem Aware'], ['solution_aware', 'Solution Aware'], ['ready', 'Ready']]} />
                    <SelectField label="Emotionaler Zustand" value={meta.emotional_state} onChange={v => setMeta(p => ({ ...p, emotional_state: v }))}
                      options={[['skeptical', 'Skeptisch'], ['curious', 'Neugierig'], ['urgent', 'Dringend'], ['resistant', 'Widerständig']]} />
                    <SelectField label="Quelle" value={meta.lead_source} onChange={v => setMeta(p => ({ ...p, lead_source: v }))}
                      options={[['ad', 'Ad'], ['organic', 'Organisch'], ['referral', 'Empfehlung']]} />
                  </div>
                </div>

                {/* Outcome */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Outcome</h3>
                  <p className="text-[11px] text-muted-foreground/70 mb-3">Capture the result objectively.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <SelectField label="Ergebnis" value={meta.result} onChange={v => setMeta(p => ({ ...p, result: v }))}
                      options={[['won', 'Won'], ['lost', 'Lost'], ['no_decision', 'No Decision']]} />
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground">Deal-Größe (€)</label>
                      <Input type="number" value={meta.deal_size} onChange={e => setMeta(p => ({ ...p, deal_size: Number(e.target.value) }))} className="mt-1 text-xs h-9" />
                    </div>
                    <SelectField label="Einwand-Typ" value={meta.objection_type} onChange={v => setMeta(p => ({ ...p, objection_type: v }))}
                      options={[['price', 'Preis'], ['trust', 'Vertrauen'], ['timing', 'Timing'], ['authority', 'Autorität'], ['', 'Keiner']]} />
                  </div>
                </div>

                {/* Self Assessment */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Self Assessment</h3>
                  <p className="text-[11px] text-muted-foreground/70 mb-3">Compare perception vs reality.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground">Selbstbewertung (1–10)</label>
                      <Input type="number" min={1} max={10} value={meta.self_rating} onChange={e => setMeta(p => ({ ...p, self_rating: Number(e.target.value) }))} className="mt-1 text-xs h-9" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[11px] font-medium text-muted-foreground">Wo brach das Gespräch?</label>
                      <Input value={meta.self_breakpoint} onChange={e => setMeta(p => ({ ...p, self_breakpoint: e.target.value }))} className="mt-1 text-xs h-9" placeholder="z.B. Nach der Preisnennung" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[11px] font-medium text-muted-foreground">Wo war Unsicherheit?</label>
                      <Input value={meta.self_uncertainty} onChange={e => setMeta(p => ({ ...p, self_uncertainty: e.target.value }))} className="mt-1 text-xs h-9" placeholder="z.B. Bei der Einwandbehandlung" />
                    </div>
                  </div>
                </div>

                <Button onClick={handleSubmit} disabled={uploading} className="w-full">
                  {uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Hochladen & Analysieren…</> : <>Upload & AI-Analyse starten<ArrowRight className="ml-2 h-4 w-4" /></>}
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ─── PAST ANALYSES ──────────────────────────── */}
        <TabsContent value="analyses">
          <div className="space-y-3">
            {calls.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">Noch keine Calls hochgeladen.</p>}
            {calls.map(call => {
              const analysis = analyses.get(call.id);
              const isAnalyzed = call.status === 'analyzed' && analysis;
              return (
                <div key={call.id} className="rounded-xl border border-border/40 bg-card p-4">
                  <div className="flex items-center gap-3">
                    <FileAudio className="h-4 w-4 shrink-0 text-accent" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-foreground truncate">
                        {call.call_type === 'setter' ? 'Setter' : call.call_type === 'follow_up' ? 'Follow-Up' : 'Closer'} Call — {call.offer_type === 'high_ticket' ? 'High Ticket' : 'Low Ticket'}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{new Date(call.created_at).toLocaleDateString('de-DE')} · {call.result === 'won' ? 'Won' : call.result === 'lost' ? 'Lost' : 'No Decision'}</p>
                    </div>
                    {isAnalyzed ? (
                      <Badge className={`text-[10px] ${scoreBg(analysis.overall_score)} ${scoreColor(analysis.overall_score)} border-0`}>
                        {analysis.overall_score}/10
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">{call.status === 'uploaded' ? 'Warte auf Analyse' : call.status}</Badge>
                    )}
                  </div>
                  <div className="mt-3 flex gap-2">
                    {isAnalyzed ? (
                      <Button variant="outline" size="sm" className="text-xs flex-1" onClick={() => viewAnalysis(call)}>
                        Analyse ansehen <ArrowRight className="ml-1 h-3 w-3" />
                      </Button>
                    ) : call.status === 'uploaded' ? (
                      <Button variant="outline" size="sm" className="text-xs flex-1" onClick={() => startAnalysis(call.id)} disabled={analyzing === call.id}>
                        {analyzing === call.id ? <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" />Analysiert…</> : <>AI-Analyse starten<Zap className="ml-1 h-3 w-3" /></>}
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ─── DASHBOARD ──────────────────────────────── */}
        <TabsContent value="dashboard">
          <div className="space-y-4">
            {!metrics ? (
              <p className="text-sm text-muted-foreground text-center py-10">Lade Calls hoch, um dein Dashboard zu füllen.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MetricCard label="Avg. Call Score" value={`${metrics.avg_call_score}/10`} sub="Top 1%: 8.9+" />
                  <MetricCard label="Closing Rate" value={`${metrics.closing_rate}%`} sub="Benchmark: 30%+" />
                  <MetricCard label="Objection Score" value={`${metrics.objection_score}/10`} sub="Benchmark: 8.0+" />
                  <MetricCard label="Total Calls" value={`${metrics.total_calls}`} sub="Analysiert" />
                </div>

                {/* Recent scores */}
                <div className="rounded-xl border border-border/40 bg-card p-5">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Letzte Analysen</h3>
                  <div className="space-y-2">
                    {calls.filter(c => c.status === 'analyzed').slice(0, 5).map(call => {
                      const a = analyses.get(call.id);
                      if (!a) return null;
                      return (
                        <div key={call.id} className="flex items-center justify-between py-2 border-b border-border/20 last:border-0">
                          <span className="text-[12px] text-foreground">{new Date(call.created_at).toLocaleDateString('de-DE')} — {call.call_type}</span>
                          <span className={`text-[12px] font-semibold ${scoreColor(a.overall_score)}`}>{a.overall_score}/10</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </TabsContent>

        {/* ─── BEST CALLS ─────────────────────────────── */}
        <TabsContent value="best">
          <div className="space-y-3">
            {(() => {
              const analyzedCalls = calls.filter(c => analyses.has(c.id));
              const sorted = [...analyzedCalls].sort((a, b) => (analyses.get(b.id)!.overall_score - analyses.get(a.id)!.overall_score));
              if (sorted.length === 0) return <p className="text-sm text-muted-foreground text-center py-10">Noch keine analysierten Calls vorhanden.</p>;
              return sorted.slice(0, 10).map((call, i) => {
                const a = analyses.get(call.id)!;
                return (
                  <div key={call.id} className="rounded-xl border border-border/40 bg-card p-4 flex items-center gap-3 cursor-pointer hover:border-border/70 transition-colors" onClick={() => viewAnalysis(call)}>
                    <span className="text-lg font-serif font-semibold text-muted-foreground/50 w-8 text-center">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-foreground">{call.call_type} · {call.offer_type}</p>
                      <p className="text-[11px] text-muted-foreground">{new Date(call.created_at).toLocaleDateString('de-DE')}</p>
                    </div>
                    <Badge className={`${scoreBg(a.overall_score)} ${scoreColor(a.overall_score)} border-0 text-[11px]`}>
                      {a.overall_score}/10
                    </Badge>
                  </div>
                );
              });
            })()}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Analysis Detail View ────────────────────────────────────
function AnalysisDetail({ call, analysis, activeTab, onTabChange, onBack }: {
  call: CallRecord; analysis: CallAnalysis; activeTab: string; onTabChange: (t: string) => void; onBack: () => void;
}) {
  const structureScores = [
    { key: 'Opening', score: analysis.opening_score },
    { key: 'Rapport', score: analysis.rapport_score },
    { key: 'Qualification', score: analysis.qualification_score },
    { key: 'Pain Extraction', score: analysis.pain_score },
    { key: 'Desire Amplification', score: analysis.desire_score },
    { key: 'Pitch', score: analysis.pitch_score },
    { key: 'Closing', score: analysis.closing_score },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4 text-xs"><ArrowLeft className="mr-1 h-3.5 w-3.5" />Zurück</Button>

      {/* Score Header */}
      <div className="mb-6 rounded-xl border border-border/40 bg-card p-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="font-serif text-xl font-semibold text-foreground">Your Call Score: {analysis.overall_score}</h1>
            <p className="text-xs text-muted-foreground mt-1">Top performers operate at 8.9+</p>
          </div>
          <div className={`text-4xl font-serif font-bold ${scoreColor(analysis.overall_score)}`}>{analysis.overall_score}</div>
        </div>
        <div className="flex gap-2 flex-wrap mt-3">
          <Badge variant="outline" className="text-[10px]">{call.call_type}</Badge>
          <Badge variant="outline" className="text-[10px]">{call.offer_type}</Badge>
          <Badge variant="outline" className="text-[10px]">{call.result}</Badge>
          <Badge variant="outline" className="text-[10px]">{new Date(call.created_at).toLocaleDateString('de-DE')}</Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList className="mb-6 w-full grid grid-cols-6">
          <TabsTrigger value="overview" className="text-[11px]">Overview</TabsTrigger>
          <TabsTrigger value="structure" className="text-[11px]">Struktur</TabsTrigger>
          <TabsTrigger value="objections" className="text-[11px]">Einwände</TabsTrigger>
          <TabsTrigger value="language" className="text-[11px]">Sprache</TabsTrigger>
          <TabsTrigger value="closing" className="text-[11px]">Closing</TabsTrigger>
          <TabsTrigger value="action" className="text-[11px]">Action Plan</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard label="Talk Ratio" value={`${analysis.talk_ratio}%`} sub="Ideal: 30–40%" />
              <MetricCard label="Fragenqualität" value={`${analysis.question_depth_score}/10`} sub="" />
              <MetricCard label="Engagement" value={`${analysis.engagement_score}/10`} sub="" />
              <MetricCard label="Closing Effizienz" value={`${analysis.closing_efficiency}/10`} sub="" />
            </div>

            {/* Top 3 Mistakes */}
            <div className="rounded-xl border border-border/40 bg-card p-5">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> Top 3 Conversion Blockers
              </h3>
              <div className="space-y-2">
                {(analysis.top_3_mistakes as string[]).map((m, i) => (
                  <div key={i} className="flex gap-3 py-2 border-b border-border/20 last:border-0">
                    <span className="text-destructive font-semibold text-xs shrink-0">{i + 1}.</span>
                    <span className="text-[12px] text-foreground">{m}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Structure */}
        <TabsContent value="structure">
          <div className="rounded-xl border border-border/40 bg-card p-5">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Call Breakdown</h3>
            <p className="text-[11px] text-muted-foreground/70 mb-4">Where performance was gained — and lost.</p>
            <div className="space-y-3">
              {structureScores.map(s => (
                <div key={s.key}>
                  <div className="flex justify-between mb-1">
                    <span className="text-[12px] font-medium text-foreground">{s.key}</span>
                    <span className={`text-[12px] font-semibold ${scoreColor(s.score)}`}>{s.score}/10</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted">
                    <div className={`h-full rounded-full ${s.score >= 8 ? 'bg-primary' : s.score >= 6 ? 'bg-accent' : 'bg-destructive'}`} style={{ width: `${s.score * 10}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Objections */}
        <TabsContent value="objections">
          <div className="rounded-xl border border-border/40 bg-card p-5">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Detected Objections</h3>
            <p className="text-[11px] text-muted-foreground/70 mb-4">Surface vs real resistance.</p>
            <div className="space-y-4">
              {(analysis.objections_detected as any[]).map((obj, i) => (
                <div key={i} className="rounded-lg border border-border/30 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={`text-[10px] border-0 ${obj.type === 'real' ? 'bg-destructive/10 text-destructive' : 'bg-accent/10 text-accent'}`}>
                      {obj.type === 'real' ? 'Echter Einwand' : 'Oberflächlich'}
                    </Badge>
                  </div>
                  <p className="text-[12px] font-medium text-foreground mb-1">"{obj.objection}"</p>
                  <p className="text-[11px] text-muted-foreground"><strong>Handling:</strong> {obj.handling}</p>
                  <div className="mt-2 rounded-lg bg-primary/5 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-primary mb-1">Besserer Ansatz</p>
                    <p className="text-[12px] text-foreground">{obj.improvement}</p>
                  </div>
                </div>
              ))}
              {(analysis.objections_detected as any[]).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Keine Einwände erkannt.</p>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Language */}
        <TabsContent value="language">
          <div className="rounded-xl border border-border/40 bg-card p-5">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Communication Quality</h3>
            <p className="text-[11px] text-muted-foreground/70 mb-4">Authority, clarity, and influence.</p>
            <div className="space-y-4">
              {(analysis.language_feedback as any[]).map((fb, i) => (
                <div key={i} className="rounded-lg border border-border/30 p-4">
                  <p className="text-[12px] font-medium text-foreground mb-2"><MessageSquare className="inline h-3.5 w-3.5 mr-1 text-accent" />{fb.issue}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-destructive/5 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-destructive mb-1">Gesagt</p>
                      <p className="text-[12px] text-foreground italic">"{fb.example}"</p>
                    </div>
                    <div className="rounded-lg bg-primary/5 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-primary mb-1">Besser</p>
                      <p className="text-[12px] text-foreground">"{fb.alternative}"</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Closing */}
        <TabsContent value="closing">
          <div className="rounded-xl border border-border/40 bg-card p-5">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Closing Execution</h3>
            <p className="text-[11px] text-muted-foreground/70 mb-4">Was the decision moment properly created?</p>
            <div className="space-y-3">
              {(analysis.closing_feedback as any[]).map((fb, i) => (
                <div key={i} className="rounded-lg border border-border/30 p-4">
                  <p className="text-[12px] text-foreground mb-2"><Target className="inline h-3.5 w-3.5 mr-1 text-accent" />{fb.observation}</p>
                  <div className="rounded-lg bg-primary/5 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-primary mb-1">Empfehlung</p>
                    <p className="text-[12px] text-foreground">{fb.recommendation}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Action Plan */}
        <TabsContent value="action">
          <div className="rounded-xl border border-border/40 bg-card p-5">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Next Call Focus</h3>
            <p className="text-[11px] text-muted-foreground/70 mb-4">One improvement that will move your conversion immediately.</p>
            <div className="space-y-3">
              {(analysis.action_plan as any[]).map((ap, i) => (
                <div key={i} className="rounded-lg border border-border/30 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={`text-[10px] border-0 ${ap.priority === 'high' ? 'bg-destructive/10 text-destructive' : ap.priority === 'medium' ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'}`}>
                      {ap.priority === 'high' ? 'Hoch' : ap.priority === 'medium' ? 'Mittel' : 'Niedrig'}
                    </Badge>
                  </div>
                  <p className="text-[12px] font-medium text-foreground mb-1">{ap.action}</p>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" />Erwarteter Impact: {ap.expected_impact}</p>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Helper Components ───────────────────────────────────────
function MetricCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card p-4">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-serif font-semibold text-foreground mt-1">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</p>}
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <div>
      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1 text-xs h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
