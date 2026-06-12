import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  fmtRate,
  fmtRevenue,
  type AbEvaluation,
  type MessageStatsRow,
} from "@/lib/canonical-message-performance";

interface Settings {
  enabled: boolean;
  auto_promote_enabled: boolean;
  significance_p_value: number;
  min_sample_size: number;
  attribution_window_hours: number;
}

export default function MessagePerformanceAdmin() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [stats, setStats] = useState<MessageStatsRow[]>([]);
  const [evals, setEvals] = useState<AbEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: s }, { data: st }] = await Promise.all([
      supabase.from("message_performance_settings").select("*").eq("id", 1).maybeSingle(),
      supabase
        .from("message_stats")
        .select("*")
        .order("revenue_per_message", { ascending: false })
        .limit(500),
    ]);
    setSettings(s as any);
    setStats((st as any) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function saveSettings(patch: Partial<Settings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    const { error } = await supabase
      .from("message_performance_settings")
      .update(patch)
      .eq("id", 1);
    if (error) { toast.error(error.message); return; }
    setSettings(next);
    toast.success("Saved");
  }

  async function refresh() {
    setBusy(true);
    const { data, error } = await supabase.rpc("refresh_message_stats");
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Refreshed ${data ?? 0} rows`);
    load();
  }

  async function runEvaluator() {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "message-performance-evaluate",
        { body: {} },
      );
      if (error) throw error;
      setEvals((data as any)?.evaluations ?? []);
      toast.success(
        `Evaluated ${(data as any)?.templates_evaluated ?? 0} templates · ${(data as any)?.auto_promotions ?? 0} auto-promoted`,
      );
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Evaluation failed");
    } finally {
      setBusy(false);
    }
  }

  async function promote(template_key: string, winner: string) {
    if (!confirm(`Promote ${winner} as sole winner for ${template_key}?`)) return;
    const { error } = await supabase.rpc("apply_ab_winner", {
      p_template_key: template_key,
      p_winner_variant: winner,
      p_decision_type: "manual",
      p_reason: "Manual promotion via admin",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Winner applied");
    load();
  }

  // Group stats per template
  const grouped = useMemo(() => {
    const m = new Map<string, MessageStatsRow[]>();
    for (const r of stats) {
      const arr = m.get(r.template_key) ?? [];
      arr.push(r);
      m.set(r.template_key, arr);
    }
    return Array.from(m.entries()).map(([k, rows]) => ({
      template_key: k,
      rows,
      total_sent: rows.reduce((s, r) => s + r.sent_count, 0),
      total_revenue: rows.reduce((s, r) => s + Number(r.revenue_total), 0),
    }));
  }, [stats]);

  if (loading) return <div className="p-8">Loading…</div>;

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-serif">Message Performance</h1>
        <p className="text-muted-foreground">
          Layer 32 — Tracking, A/B-Auswertung & Auto-Promotion. Silent bis aktiviert.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Tracking aktiv</Label>
              <p className="text-sm text-muted-foreground">
                Globaler Master-Switch. RPC `record_message_event` schreibt nur, wenn aktiv.
              </p>
            </div>
            <Switch
              checked={settings?.enabled ?? false}
              onCheckedChange={(v) => saveSettings({ enabled: v })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-Promotion</Label>
              <p className="text-sm text-muted-foreground">
                System schiebt Variant-Weight automatisch auf Winner bei p ≤ Schwelle und n ≥ Min.
              </p>
            </div>
            <Switch
              checked={settings?.auto_promote_enabled ?? false}
              onCheckedChange={(v) => saveSettings({ auto_promote_enabled: v })}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>p-Value Schwelle</Label>
              <Input
                type="number" step="0.001" min="0.001" max="0.5"
                value={settings?.significance_p_value ?? 0.05}
                onChange={(e) =>
                  saveSettings({ significance_p_value: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <Label>Min. Sample Size</Label>
              <Input
                type="number" min="10"
                value={settings?.min_sample_size ?? 100}
                onChange={(e) =>
                  saveSettings({ min_sample_size: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <Label>Attribution Window (h)</Label>
              <Input
                type="number" min="1" max="720"
                value={settings?.attribution_window_hours ?? 72}
                onChange={(e) =>
                  saveSettings({ attribution_window_hours: Number(e.target.value) })
                }
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={refresh} disabled={busy} variant="outline">
              Refresh Aggregates
            </Button>
            <Button onClick={runEvaluator} disabled={busy}>
              Run A/B Evaluation
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="leaderboard">
        <TabsList>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="ab">A/B Tests</TabsTrigger>
          <TabsTrigger value="raw">Raw Stats</TabsTrigger>
        </TabsList>

        <TabsContent value="leaderboard">
          <Card>
            <CardHeader>
              <CardTitle>Top performing templates (by revenue/message)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Template</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead className="text-right">Sent</TableHead>
                    <TableHead className="text-right">Open</TableHead>
                    <TableHead className="text-right">Click</TableHead>
                    <TableHead className="text-right">Reply</TableHead>
                    <TableHead className="text-right">Conv</TableHead>
                    <TableHead className="text-right">€/msg</TableHead>
                    <TableHead className="text-right">€ total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.slice(0, 50).map((r) => (
                    <TableRow key={`${r.template_key}-${r.variant_key}-${r.funnel_id ?? 'all'}`}>
                      <TableCell className="font-mono text-xs">{r.template_key}</TableCell>
                      <TableCell><Badge variant="outline">{r.variant_key}</Badge></TableCell>
                      <TableCell className="text-right">{r.sent_count}</TableCell>
                      <TableCell className="text-right">{fmtRate(r.open_rate)}</TableCell>
                      <TableCell className="text-right">{fmtRate(r.click_rate)}</TableCell>
                      <TableCell className="text-right">{fmtRate(r.reply_rate)}</TableCell>
                      <TableCell className="text-right">{fmtRate(r.conversion_rate)}</TableCell>
                      <TableCell className="text-right">{fmtRevenue(r.revenue_per_message)}</TableCell>
                      <TableCell className="text-right">{fmtRevenue(r.revenue_total)}</TableCell>
                    </TableRow>
                  ))}
                  {stats.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        Noch keine Performance-Daten. Aktiviere Tracking und sende Events.
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
            <CardHeader>
              <CardTitle>A/B Evaluations</CardTitle>
              <p className="text-sm text-muted-foreground">
                Klicke "Run A/B Evaluation" um zu aktualisieren.
              </p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Template</TableHead>
                    <TableHead>Winner</TableHead>
                    <TableHead>Loser</TableHead>
                    <TableHead className="text-right">Winner rate</TableHead>
                    <TableHead className="text-right">Loser rate</TableHead>
                    <TableHead className="text-right">Lift</TableHead>
                    <TableHead className="text-right">p</TableHead>
                    <TableHead className="text-right">n</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evals.map((e) => (
                    <TableRow key={e.template_key}>
                      <TableCell className="font-mono text-xs">{e.template_key}</TableCell>
                      <TableCell><Badge>{e.winner_variant}</Badge></TableCell>
                      <TableCell><Badge variant="outline">{e.loser_variant}</Badge></TableCell>
                      <TableCell className="text-right">{fmtRate(e.winner_rate)}</TableCell>
                      <TableCell className="text-right">{fmtRate(e.loser_rate)}</TableCell>
                      <TableCell className="text-right">
                        {e.lift != null ? `${(e.lift * 100).toFixed(1)}%` : "—"}
                      </TableCell>
                      <TableCell className="text-right">{e.approx_p_value?.toFixed(4)}</TableCell>
                      <TableCell className="text-right">{e.total_sample}</TableCell>
                      <TableCell>
                        {e.is_significant
                          ? <Badge className="bg-green-600">Significant</Badge>
                          : <Badge variant="outline">Inconclusive</Badge>}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline"
                          onClick={() => promote(e.template_key, e.winner_variant)}>
                          Promote
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {evals.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        Noch keine Auswertung.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="raw">
          <Card>
            <CardHeader>
              <CardTitle>Templates Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Template</TableHead>
                    <TableHead className="text-right">Variants</TableHead>
                    <TableHead className="text-right">Total sent</TableHead>
                    <TableHead className="text-right">Total revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grouped.map((g) => (
                    <TableRow key={g.template_key}>
                      <TableCell className="font-mono text-xs">{g.template_key}</TableCell>
                      <TableCell className="text-right">{g.rows.length}</TableCell>
                      <TableCell className="text-right">{g.total_sent}</TableCell>
                      <TableCell className="text-right">{fmtRevenue(g.total_revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
