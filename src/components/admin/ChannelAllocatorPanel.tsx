/**
 * ChannelAllocatorPanel — Per-Channel Weights + Decision Log.
 *
 * Strictly additive admin view alongside AutoAllocatorPanel. Reads
 * `ab_channel_weights` and `ab_decision_log`. Never writes anywhere.
 * If no per-channel data exists yet (cron hasn't run / no traffic with UTM),
 * the panel renders an empty-state explanation — no global behavior changes.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Radio, History } from "lucide-react";
import { AB_CHANNELS, type AbChannel } from "@/lib/ab-auto/channel";

interface Experiment { id: string; key: string; name: string; status: string }
interface Variant { id: string; key: string; label: string; experiment_id: string }
interface ChannelRow {
  experiment_id: string;
  variant_id: string;
  channel: AbChannel;
  weight: number;
  trials: number;
  successes: number;
  reward_mode: string | null;
  last_recomputed_at: string;
}
interface DecisionRow {
  id: string;
  experiment_id: string;
  channel: string | null;
  action: string;
  reward_mode: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtRate = (s: number, t: number) => (t > 0 ? `${((s / t) * 100).toFixed(1)}%` : "—");

export default function ChannelAllocatorPanel() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [rows, setRows] = useState<ChannelRow[]>([]);
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: exps }, { data: vars }, { data: rs }, { data: ds }] = await Promise.all([
          supabase.from("ab_experiments").select("id, key, name, status").neq("status", "archived"),
          supabase.from("ab_variants").select("id, key, label, experiment_id").eq("is_active", true),
          supabase.from("ab_channel_weights").select("*"),
          supabase.from("ab_decision_log").select("*").order("created_at", { ascending: false }).limit(30),
        ]);
        setExperiments((exps ?? []) as Experiment[]);
        setVariants((vars ?? []) as Variant[]);
        setRows((rs ?? []) as ChannelRow[]);
        setDecisions((ds ?? []) as DecisionRow[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Card className="p-6 text-sm text-muted-foreground">Lade Per-Channel-Daten…</Card>;
  if (error) return <Card className="p-6 text-sm text-destructive">Fehler: {error}</Card>;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Radio className="h-4 w-4 text-primary" />
          <h3 className="font-serif text-xl">Per-Channel Allocator</h3>
          <Badge variant="outline" className="ml-auto text-xs">Additiv · Fallback auf globale Weights</Badge>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Traffic-Gewichte je Variante pro Quelle (Meta · TikTok · Google · Retargeting · Direct · Other).
          Jeder Kanal entwickelt seinen eigenen Gewinner. Wenn ein Kanal noch keine Daten hat,
          rendert er die globale Variant-Weight automatisch.
        </p>
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground p-4 bg-muted/30 rounded-lg">
            Noch keine Per-Channel-Daten. Der stündliche Cron <code>ab-recompute-weights</code> füllt
            <code className="ml-1">ab_channel_weights</code>, sobald Sessions mit UTM-Attribution eingehen.
          </div>
        ) : (
          experiments.map((exp) => {
            const expRows = rows.filter((r) => r.experiment_id === exp.id);
            if (expRows.length === 0) return null;
            const expVariants = variants.filter((v) => v.experiment_id === exp.id);
            return (
              <div key={exp.id} className="mb-6 last:mb-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium">{exp.name}</span>
                  <Badge variant="secondary" className="text-xs">{exp.key}</Badge>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3">Channel</th>
                        {expVariants.map((v) => (
                          <th key={v.id} className="py-2 pr-3" colSpan={3}>{v.label}</th>
                        ))}
                      </tr>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th></th>
                        {expVariants.map((v) => (
                          <th key={v.id} className="py-1 pr-3 font-normal" colSpan={3}>
                            <div className="flex gap-3"><span>Weight</span><span>Trials</span><span>Conv.</span></div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {AB_CHANNELS.map((ch) => {
                        const chRows = expRows.filter((r) => r.channel === ch);
                        if (chRows.length === 0) return null;
                        const mode = chRows[0]?.reward_mode ?? "primary";
                        return (
                          <tr key={ch} className="border-b last:border-0">
                            <td className="py-2 pr-3">
                              <div className="flex flex-col">
                                <span className="font-medium capitalize">{ch}</span>
                                <span className="text-xs text-muted-foreground">{mode}</span>
                              </div>
                            </td>
                            {expVariants.map((v) => {
                              const r = chRows.find((x) => x.variant_id === v.id);
                              if (!r) return <td key={v.id} className="py-2 pr-3 text-muted-foreground" colSpan={3}>—</td>;
                              const isMax = r.weight === Math.max(...chRows.map((x) => x.weight));
                              return (
                                <td key={v.id} className="py-2 pr-3" colSpan={3}>
                                  <div className="flex gap-3 items-center">
                                    <span className={isMax ? "font-medium text-primary" : ""}>{fmtPct(r.weight)}</span>
                                    <span className="text-muted-foreground tabular-nums">{r.trials}</span>
                                    <span className="text-muted-foreground tabular-nums">{fmtRate(r.successes, r.trials)}</span>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <History className="h-4 w-4 text-primary" />
          <h3 className="font-serif text-xl">Decision Log</h3>
          <Badge variant="outline" className="ml-auto text-xs">Letzte 30 Entscheidungen</Badge>
        </div>
        {decisions.length === 0 ? (
          <div className="text-sm text-muted-foreground p-4 bg-muted/30 rounded-lg">
            Noch keine Allocator-Entscheidungen protokolliert.
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {decisions.map((d) => {
              const exp = experiments.find((e) => e.id === d.experiment_id);
              return (
                <div key={d.id} className="text-xs border-l-2 border-muted pl-3 py-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-muted-foreground tabular-nums">{new Date(d.created_at).toLocaleString("de-DE")}</span>
                    <Badge variant={d.action === "freeze_winner" ? "default" : "secondary"} className="text-[10px]">
                      {d.action}
                    </Badge>
                    {d.channel && <Badge variant="outline" className="text-[10px] capitalize">{d.channel}</Badge>}
                    {d.reward_mode && <span className="text-muted-foreground">{d.reward_mode}</span>}
                    <span className="font-medium">{exp?.name ?? d.experiment_id}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
