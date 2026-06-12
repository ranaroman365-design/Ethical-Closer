import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getQualityDisplay, mapLegacyQualityGrade } from "@/lib/canonical-decision-engine";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, Users, Zap, RefreshCw, Crown, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useBrandConfig } from "@/hooks/useBrandConfig";

interface PerformerData {
  user_id: string;
  full_name: string;
  business_stage: string;
  closing_rate: number | null;
  show_rate: number | null;
  revenue_closed: number | null;
  calls_handled: number | null;
  earnings_per_call: number | null;
  score: number;
}

interface LeadDistribution {
  quality: string;
  count: number;
}

/** Build stage→short-label map from config levels, with static fallback */
function buildStageShort(levels: Array<{ level: number; key: string; de: string; role: string | null }>): Record<string, string> {
  const fallback: Record<string, string> = {
    setter: "Setter", associate_setter: "A-Setter", senior_associate: "Sr. Setter", senior_setter: "Sr. Setter",
    junior_manager: "Jr. Closer", manager: "Closer", senior_manager: "Sr. Closer", director: "Director",
  };
  if (!levels || levels.length === 0) return fallback;
  const map: Record<string, string> = {};
  for (const l of levels) {
    map[l.key] = l.de || l.key;
  }
  return { ...fallback, ...map };
}

export default function PerformanceRankingAdmin() {
  const { toast } = useToast();
  const { levels } = useBrandConfig();
  const STAGE_SHORT = buildStageShort(levels);
  const [setters, setSetters] = useState<PerformerData[]>([]);
  const [closers, setClosers] = useState<PerformerData[]>([]);
  const [leadDist, setLeadDist] = useState<LeadDistribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);

    // Fetch profiles + KPIs
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, business_stage")
      .not("business_stage", "is", null)
      .not("business_stage", "in", "(prospect,inner_circle)");

    if (!profiles) { setLoading(false); return; }

    const ids = profiles.map(p => p.id);
    const { data: kpis } = await supabase
      .from("member_kpis")
      .select("user_id, closing_rate, show_rate, revenue_closed, calls_handled, earnings_per_call, handover_rate, qualification_accuracy, crm_hygiene_score, storno_rate, commission_earned")
      .in("user_id", ids);

    const kpiMap = new Map((kpis ?? []).map(k => [k.user_id, k]));

    const setterList: PerformerData[] = [];
    const closerList: PerformerData[] = [];

    for (const p of profiles) {
      const k = kpiMap.get(p.id);
      const isSetter = ["setter", "associate_setter", "senior_associate", "senior_setter"].includes(p.business_stage || "");
      const isCloser = ["junior_manager", "manager", "senior_manager", "director"].includes(p.business_stage || "");

      if (isSetter) {
        const score = k ? Math.round(
          (k.show_rate ?? 0) * 0.30 +
          (k.handover_rate ?? 0) * 0.25 +
          (k.qualification_accuracy ?? 0) * 0.20 +
          Math.min((k.calls_handled ?? 0) / 20 * 100, 100) * 0.15 +
          (k.crm_hygiene_score ?? 0) * 0.10
        ) : 0;
        setterList.push({ user_id: p.id, full_name: p.full_name || "–", business_stage: p.business_stage!, ...k as any, score });
      }

      if (isCloser) {
        const score = k ? Math.round(
          (k.closing_rate ?? 0) * 0.35 +
          (k.show_rate ?? 0) * 0.20 +
          Math.min((k.earnings_per_call ?? 0) / 500 * 100, 100) * 0.25 +
          Math.min((k.revenue_closed ?? 0) / 50000 * 100, 100) * 0.10 +
          (100 - (k.storno_rate ?? 0)) * 0.10
        ) : 0;
        closerList.push({ user_id: p.id, full_name: p.full_name || "–", business_stage: p.business_stage!, ...k as any, score });
      }
    }

    setSetters(setterList.sort((a, b) => b.score - a.score));
    setClosers(closerList.sort((a, b) => b.score - a.score));

    // Lead quality distribution
    const { data: leadCounts } = await supabase
      .from("leads")
      .select("lead_quality")
      .not("stage", "in", "(closed_won,closed_lost,cancelled,converted_to_L1)");

    const dist: Record<string, number> = { A: 0, B: 0, C: 0 };
    for (const l of leadCounts ?? []) {
      const q = (l as any).lead_quality || "C";
      dist[q] = (dist[q] || 0) + 1;
    }
    setLeadDist(Object.entries(dist).map(([quality, count]) => ({ quality, count })));

    setLoading(false);
  }

  async function triggerBatchScoring() {
    setScoring(true);
    try {
      const res = await supabase.functions.invoke("score-lead", { body: { batch: true } });
      const data = res.data;
      toast({
        title: "Scoring abgeschlossen",
        description: `${data?.scored || 0} Leads gescort (A: ${data?.distribution?.A || 0}, B: ${data?.distribution?.B || 0}, C: ${data?.distribution?.C || 0})`,
      });
      loadData();
    } catch {
      toast({ title: "Fehler beim Scoring", variant: "destructive" });
    }
    setScoring(false);
  }

  if (loading) return <div className="py-8 text-center text-sm text-muted-foreground">Lade Performance-Daten…</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-accent" />
          <h2 className="font-serif text-lg font-semibold text-foreground">Performance & Lead Intelligence</h2>
        </div>
        <Button onClick={triggerBatchScoring} disabled={scoring} variant="outline" size="sm" className="text-xs">
          <Zap className="mr-1.5 h-3.5 w-3.5" />
          {scoring ? "Scoring läuft…" : "Batch Scoring"}
        </Button>
      </div>

      {/* Lead Quality Distribution */}
      <Card className="p-4 border-border/40">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-3">Lead-Qualitätsverteilung</p>
        <div className="flex gap-3">
          {leadDist.map(d => {
            const canonical = mapLegacyQualityGrade(d.quality);
            const display = getQualityDisplay(canonical);
            return (
              <div key={d.quality} className={`flex-1 rounded-lg p-3 text-center border ${display.bgClass}`}>
                <span className={`text-2xl font-bold ${display.textClass}`}>{d.count}</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">{display.label}-Leads</p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Setter Ranking */}
      <RankingTable title="Setter Ranking" icon={Users} data={setters} type="setter" stageShort={STAGE_SHORT} />

      {/* Closer Ranking */}
      <RankingTable title="Closer Ranking" icon={Crown} data={closers} type="closer" stageShort={STAGE_SHORT} />
    </div>
  );
}

function RankingTable({ title, icon: Icon, data, type, stageShort }: { title: string; icon: any; data: PerformerData[]; type: "setter" | "closer"; stageShort: Record<string, string> }) {
  if (data.length === 0) return null;

  return (
    <Card className="p-4 border-border/40">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-accent" />
        <p className="text-[12px] font-semibold text-foreground">{title}</p>
        <Badge variant="outline" className="text-[9px] ml-auto">{data.length} aktiv</Badge>
      </div>

      <div className="space-y-2">
        {data.map((d, i) => (
          <div key={d.user_id} className={`flex items-center gap-3 rounded-lg p-2.5 ${
            i === 0 ? 'bg-accent/5 border border-accent/20' : 'bg-muted/20'
          }`}>
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${
              i === 0 ? 'bg-accent text-accent-foreground' :
              i === 1 ? 'bg-primary/10 text-primary' :
              i === 2 ? 'bg-muted text-muted-foreground' :
              'bg-muted/50 text-muted-foreground'
            }`}>
              {i + 1}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-foreground truncate">{d.full_name}</p>
              <p className="text-[10px] text-muted-foreground">{stageShort[d.business_stage] || d.business_stage}</p>
            </div>

            <div className="flex items-center gap-3 text-right">
              {type === "setter" ? (
                <>
                  <Stat label="Show" value={`${d.show_rate?.toFixed(0) ?? 0}%`} />
                  <Stat label="Calls" value={`${d.calls_handled ?? 0}`} />
                </>
              ) : (
                <>
                  <Stat label="Close" value={`${d.closing_rate?.toFixed(0) ?? 0}%`} />
                  <Stat label="€/Call" value={`${d.earnings_per_call?.toFixed(0) ?? 0}`} />
                  <Stat label="Revenue" value={`${((d.revenue_closed ?? 0) / 1000).toFixed(0)}k`} />
                </>
              )}

              <div className={`rounded-md px-2 py-1 text-[11px] font-bold ${
                d.score >= 70 ? 'bg-green-500/10 text-green-600' :
                d.score >= 40 ? 'bg-amber-500/10 text-amber-600' :
                'bg-red-500/10 text-red-500'
              }`}>
                {d.score}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center min-w-[40px]">
      <p className="text-[11px] font-semibold text-foreground">{value}</p>
      <p className="text-[8px] text-muted-foreground">{label}</p>
    </div>
  );
}
