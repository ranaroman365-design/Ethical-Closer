import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { fmtRate, fmtRevenue, fmtDuration, type CallStatsRow, type CallAbEvaluation, type ObjectionStat } from "@/lib/canonical-voice-performance";

interface Settings {
  enabled: boolean;
  auto_promote_enabled: boolean;
  ai_analysis_enabled: boolean;
  significance_p_value: number;
  min_sample_size: number;
  attribution_window_hours: number;
}

export default function VoicePerformanceAdmin() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [stats, setStats] = useState<CallStatsRow[]>([]);
  const [objections, setObjections] = useState<ObjectionStat[]>([]);
  const [evals, setEvals] = useState<CallAbEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: s }, { data: st }, { data: ob }] = await Promise.all([
      supabase.from("call_performance_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("call_stats").select("*").order("revenue_per_call", { ascending: false }).limit(500),
      supabase.from("call_objection_stats").select("*").order("share_pct", { ascending: false }).limit(500),
    ]);
    setSettings(s as any);
    setStats((st as any) ?? []);
    setObjections((ob as any) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function saveSettings(patch: Partial<Settings>) {
    if (!settings) return;
    const { error } = await supabase.from("call_performance_settings").update(patch).eq("id", 1);
    if (error) { toast.error(error.message); return; }
    setSettings({ ...settings, ...patch });
    toast.success("Saved");
  }

  async function refresh() {
    setBusy(true);
    const { data, error } = await supabase.rpc("refresh_call_stats");
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Refreshed ${data ?? 0} rows`);
    load();
  }

  async function runEvaluator() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("voice-performance-evaluate", { body: {} });
      if (error) throw error;
      setEvals((data as any)?.evaluations ?? []);
      toast.success(`Evaluated ${(data as any)?.scripts_evaluated ?? 0} scripts · ${(data as any)?.auto_promotions ?? 0} auto-promoted`);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Evaluation failed");
    } finally { setBusy(false); }
  }

  async function promote(script_key: string, winner: string) {
    if (!confirm(`Promote ${winner} as sole winner for ${script_key}?`)) return;
    const { error } = await supabase.rpc("apply_call_ab_winner", {
      p_script_key: script_key, p_winner_variant: winner,
      p_decision_type: "manual", p_reason: "Manual promotion via admin",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Winner applied");
    load();
  }

  const grouped = useMemo(() => {
    const m = new Map<string, ObjectionStat[]>();
    for (const o of objections) {
      const arr = m.get(o.script_key) ?? [];
      arr.push(o);
      m.set(o.script_key, arr);
    }
    return Array.from(m.entries());
  }, [objections]);

  if (loading) return <div className="p-8">Loading…</div>;

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-serif">Voice Performance</h1>
        <p className="text-muted-foreground">Layer 33 — Call-Funnel-Tracking, Script-A/B & Auto-Promotion. Silent bis aktiviert.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Tracking aktiv</Label>
              <p className="text-sm text-muted-foreground">Master-Switch. RPC `record_call_event` schreibt nur, wenn aktiv.</p>
            </div>
            <Switch checked={settings?.enabled ?? false} onCheckedChange={(v) => saveSettings({ enabled: v })} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-Promotion (Script-Winner)</Label>
              <p className="text-sm text-muted-foreground">Setzt variant_weight automatisch auf Winner bei p ≤ Schwelle und n ≥ Min.</p>
            </div>
            <Switch checked={settings?.auto_promote_enabled ?? false} onCheckedChange={(v) => saveSettings({ auto_promote_enabled: v })} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>AI Call Analysis</Label>
              <p className="text-sm text-muted-foreground">OFF in Phase 1. Späteres Hook für Lovable AI Intent/Objection/Sentiment-Extraktion.</p>
            </div>
            <Switch checked={settings?.ai_analysis_enabled ?? false} onCheckedChange={(v) => saveSettings({ ai_analysis_enabled: v })} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>p-Value Schwelle</Label>
              <Input type="number" step="0.001" min="0.001" max="0.5"
                value={settings?.significance_p_value ?? 0.05}
                onChange={(e) => saveSettings({ significance_p_value: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Min. Sample (Dialed)</Label>
              <Input type="number" min="10" value={settings?.min_sample_size ?? 100}
                onChange={(e) => saveSettings({ min_sample_size: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Attribution Window (h)</Label>
              <Input type="number" min="1" max="720" value={settings?.attribution_window_hours ?? 168}
                onChange={(e) => saveSettings({ attribution_window_hours: Number(e.target.value) })} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={refresh} disabled={busy} variant="outline">Refresh Aggregates</Button>
            <Button onClick={runEvaluator} disabled={busy}>Run A/B Evaluation</Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="leaderboard">
        <TabsList>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="ab">Script A/B</TabsTrigger>
          <TabsTrigger value="objections">Objection Heatmap</TabsTrigger>
        </TabsList>

        <TabsContent value="leaderboard">
          <Card>
            <CardHeader><CardTitle>Top scripts (by revenue/call)</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Script</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead className="text-right">Dialed</TableHead>
                    <TableHead className="text-right">Answer</TableHead>
                    <TableHead className="text-right">Engage</TableHead>
                    <TableHead className="text-right">Qualify</TableHead>
                    <TableHead className="text-right">Book</TableHead>
                    <TableHead className="text-right">Show</TableHead>
                    <TableHead className="text-right">Close</TableHead>
                    <TableHead className="text-right">Avg dur</TableHead>
                    <TableHead className="text-right">€/call</TableHead>
                    <TableHead className="text-right">€ total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.slice(0, 50).map((r) => (
                    <TableRow key={`${r.script_key}-${r.variant_key}-${r.funnel_id ?? 'all'}`}>
                      <TableCell className="font-mono text-xs">{r.script_key}</TableCell>
                      <TableCell><Badge variant="outline">{r.variant_key}</Badge></TableCell>
                      <TableCell className="text-right">{r.dialed_count}</TableCell>
                      <TableCell className="text-right">{fmtRate(r.answer_rate)}</TableCell>
                      <TableCell className="text-right">{fmtRate(r.engagement_rate)}</TableCell>
                      <TableCell className="text-right">{fmtRate(r.qualification_rate)}</TableCell>
                      <TableCell className="text-right">{fmtRate(r.booking_rate)}</TableCell>
                      <TableCell className="text-right">{fmtRate(r.show_rate_after_call)}</TableCell>
                      <TableCell className="text-right">{fmtRate(r.close_rate_after_call)}</TableCell>
                      <TableCell className="text-right">{fmtDuration(r.avg_duration_seconds)}</TableCell>
                      <TableCell className="text-right">{fmtRevenue(r.revenue_per_call)}</TableCell>
                      <TableCell className="text-right">{fmtRevenue(r.revenue_total)}</TableCell>
                    </TableRow>
                  ))}
                  {stats.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                        Noch keine Call-Daten. Aktiviere Tracking und sende Events vom AI Setter.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ab">
          <Card>
            <CardHeader><CardTitle>Script A/B Evaluations</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Script</TableHead>
                    <TableHead>Winner</TableHead>
                    <TableHead>Loser</TableHead>
                    <TableHead className="text-right">Win rate</TableHead>
                    <TableHead className="text-right">Lose rate</TableHead>
                    <TableHead className="text-right">Lift</TableHead>
                    <TableHead className="text-right">p</TableHead>
                    <TableHead className="text-right">n</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evals.map((e) => (
                    <TableRow key={e.script_key}>
                      <TableCell className="font-mono text-xs">{e.script_key}</TableCell>
                      <TableCell><Badge>{e.winner_variant}</Badge></TableCell>
                      <TableCell><Badge variant="outline">{e.loser_variant}</Badge></TableCell>
                      <TableCell className="text-right">{fmtRate(e.winner_rate)}</TableCell>
                      <TableCell className="text-right">{fmtRate(e.loser_rate)}</TableCell>
                      <TableCell className="text-right">{e.lift != null ? `${(e.lift * 100).toFixed(1)}%` : "—"}</TableCell>
                      <TableCell className="text-right">{e.approx_p_value?.toFixed(4)}</TableCell>
                      <TableCell className="text-right">{e.total_sample}</TableCell>
                      <TableCell>{e.is_significant ? <Badge className="bg-green-600">Significant</Badge> : <Badge variant="outline">Inconclusive</Badge>}</TableCell>
                      <TableCell><Button size="sm" variant="outline" onClick={() => promote(e.script_key, e.winner_variant)}>Promote</Button></TableCell>
                    </TableRow>
                  ))}
                  {evals.length === 0 && (
                    <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Noch keine Auswertung.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="objections">
          <Card>
            <CardHeader><CardTitle>Objection Heatmap</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              {grouped.map(([scriptKey, list]) => (
                <div key={scriptKey}>
                  <h3 className="font-mono text-sm mb-2">{scriptKey}</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Variant</TableHead>
                        <TableHead>Objection</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                        <TableHead className="text-right">Share</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.map((o) => (
                        <TableRow key={`${o.script_key}-${o.variant_key}-${o.objection_type}`}>
                          <TableCell><Badge variant="outline">{o.variant_key}</Badge></TableCell>
                          <TableCell>{o.objection_type}</TableCell>
                          <TableCell className="text-right">{o.occurrences}</TableCell>
                          <TableCell className="text-right">{fmtRate(o.share_pct)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
              {grouped.length === 0 && (
                <p className="text-center text-muted-foreground py-8">Noch keine Objection-Daten.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
