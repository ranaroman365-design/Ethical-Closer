import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Brain, AlertTriangle } from 'lucide-react';

interface Insights {
  avgScore: number;
  tierA: number;
  tierB: number;
  tierC: number;
  highRiskPct: number;
  totalScored: number;
}

export default function AiInsightsPanel({ range }: { range: string }) {
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, [range]);

  async function load() {
    setLoading(true);
    const since = rangeToDate(range);

    // Lead scores from applicant_scores
    const { data: scores } = await supabase
      .from('applicant_scores')
      .select('total_score')
      .gte('created_at', since);

    // No-show risk
    const { data: risks } = await supabase
      .from('no_show_risk_scores')
      .select('risk_score')
      .gte('created_at', since);

    const scoreArr = (scores ?? []).map((s: any) => s.total_score ?? 0);
    const avg = scoreArr.length > 0 ? Math.round(scoreArr.reduce((a: number, b: number) => a + b, 0) / scoreArr.length) : 0;

    // Tier distribution based on total_score (out of 50 max from 5 categories * 10)
    const tierA = scoreArr.filter((s: number) => s >= 35).length;
    const tierB = scoreArr.filter((s: number) => s >= 20 && s < 35).length;
    const tierC = scoreArr.filter((s: number) => s < 20).length;

    const riskArr = (risks ?? []).map((r: any) => r.risk_score ?? 0);
    const highRisk = riskArr.filter((r: number) => r >= 70).length;
    const highRiskPct = riskArr.length > 0 ? Math.round((highRisk / riskArr.length) * 100) : 0;

    setData({ avgScore: avg, tierA, tierB, tierC, highRiskPct, totalScored: scoreArr.length });
    setLoading(false);
  }

  if (loading) return <Skeleton className="h-40 rounded-xl" />;
  if (!data) return null;

  const total = data.tierA + data.tierB + data.tierC || 1;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="h-4 w-4 text-accent" /> AI Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border/40 bg-background p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg Lead Score</p>
            <p className="text-lg font-bold text-foreground">{data.avgScore}</p>
          </div>
          <div className="rounded-lg border border-border/40 bg-background p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Scored Leads</p>
            <p className="text-lg font-bold text-foreground">{data.totalScored}</p>
          </div>
        </div>

        {/* Tier distribution bar */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Lead Tier Distribution</p>
          <div className="flex rounded-md overflow-hidden h-5">
            {data.tierA > 0 && (
              <div className="bg-primary/70 flex items-center justify-center" style={{ width: `${(data.tierA / total) * 100}%` }}>
                <span className="text-[9px] font-bold text-primary-foreground">A {Math.round((data.tierA / total) * 100)}%</span>
              </div>
            )}
            {data.tierB > 0 && (
              <div className="bg-accent/50 flex items-center justify-center" style={{ width: `${(data.tierB / total) * 100}%` }}>
                <span className="text-[9px] font-bold text-accent-foreground">B {Math.round((data.tierB / total) * 100)}%</span>
              </div>
            )}
            {data.tierC > 0 && (
              <div className="bg-muted flex items-center justify-center" style={{ width: `${(data.tierC / total) * 100}%` }}>
                <span className="text-[9px] font-bold text-muted-foreground">C {Math.round((data.tierC / total) * 100)}%</span>
              </div>
            )}
          </div>
        </div>

        {/* High risk alert */}
        {data.highRiskPct > 15 && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-xs font-medium text-destructive">High Risk Leads heute: {data.highRiskPct}%</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function rangeToDate(range: string): string {
  const now = new Date();
  if (range === 'today') now.setHours(0, 0, 0, 0);
  else if (range === '7d') now.setDate(now.getDate() - 7);
  else now.setDate(now.getDate() - 30);
  return now.toISOString();
}
