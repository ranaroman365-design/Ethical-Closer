/**
 * Auto-Fix Engine Panel (Layer 46 UI)
 * -----------------------------------
 * Mounted inside Conversion Intelligence below the bottleneck banner.
 * Detects problems from current KPIs, persists them to auto_fix_queue,
 * and surfaces a prioritized Fix Queue with status workflow + L36 proposal.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Wrench, CheckCircle2, Loader2, ArrowUpRight, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  detectAutoFixes,
  type AutoFixCandidate,
  type AutoFixInputMetrics,
} from "@/lib/canonical-auto-fix";
import { cn } from "@/lib/utils";
import { playCue } from "@/lib/sound-design";

interface QueuedFix {
  id: string;
  funnel_key: string | null;
  stage_key: string;
  problem_class: string;
  severity: "weak" | "critical";
  metric_key: string;
  metric_value: number;
  metric_threshold: number;
  impact_score: number;
  effort_score: number;
  priority_rank: number;
  problem_label: string;
  problem_explanation: string;
  recommendations: string[];
  deep_links: { label: string; href: string }[];
  status: "open" | "acknowledged" | "in_progress" | "done" | "dismissed";
  baseline_metric: number | null;
  current_metric: number | null;
  resolved_at: string | null;
  resolution_note: string | null;
  detected_at: string;
  self_opt_proposal_id: string | null;
}

interface Props {
  metrics: AutoFixInputMetrics;
}

const STATUS_LABEL: Record<QueuedFix["status"], string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  in_progress: "In progress",
  done: "Done",
  dismissed: "Dismissed",
};

export function AutoFixEnginePanel({ metrics }: Props) {
  const [queue, setQueue] = useState<QueuedFix[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<QueuedFix | null>(null);

  const candidates = useMemo(() => detectAutoFixes(metrics), [metrics]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("auto_fix_queue" as never)
        .select("*")
        .in("status", ["open", "acknowledged", "in_progress", "done"])
        .order("status", { ascending: true })
        .order("priority_rank", { ascending: false })
        .limit(20);
      if (error) {
        console.error("[AutoFix] load error:", error);
        toast.error("Could not load Fix Queue");
      } else {
        setQueue((data ?? []) as unknown as QueuedFix[]);
      }
    } catch (e) {
      console.error("[AutoFix] load exception:", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Sync current_metric on existing open fixes whenever metrics change
  useEffect(() => {
    if (!queue.length) return;
    const updates = queue
      .filter((q) => q.status !== "done")
      .map((q) => {
        const live = (metrics as Record<string, number | null | undefined>)[q.metric_key];
        if (live == null || live === q.current_metric) return null;
        return supabase
          .from("auto_fix_queue" as never)
          .update({ current_metric: live } as never)
          .eq("id", q.id);
      })
      .filter(Boolean);
    if (updates.length) Promise.all(updates.map((u) => Promise.resolve(u)));
    // We intentionally do not refetch here — purely passive sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics]);

  const runScan = async () => {
    setScanning(true);
    try {
      // Re-detect from current metrics
      const freshCandidates = detectAutoFixes(metrics);

      if (!freshCandidates.length) {
        toast.success("No problems detected — funnel is healthy ✓");
        playCue("success");
        setScanning(false);
        return;
      }

      // Dedupe against existing open/acknowledged/in_progress fixes
      const existing = new Set(
        queue
          .filter((q) => q.status !== "done" && q.status !== "dismissed")
          .map((q) => `${q.funnel_key ?? "_global_"}:${q.stage_key}:${q.metric_key}`),
      );

      const toInsert = freshCandidates
        .filter(
          (c) =>
            !existing.has(`${c.funnelKey ?? "_global_"}:${c.stageKey}:${c.metricKey}`),
        )
        .map((c) => ({
          funnel_key: c.funnelKey,
          scope_label: c.scopeLabel,
          stage_key: c.stageKey,
          problem_class: c.problemClass,
          severity: c.severity,
          metric_key: c.metricKey,
          metric_value: c.metricValue,
          metric_threshold: c.metricThreshold,
          impact_score: c.impactScore,
          effort_score: c.effortScore,
          priority_rank: c.priorityRank,
          problem_label: c.problemLabel,
          problem_explanation: c.problemExplanation,
          recommendations: c.recommendations,
          deep_links: c.deepLinks,
          baseline_metric: c.metricValue,
          current_metric: c.metricValue,
          dedupe_key: `${c.funnelKey ?? "_global_"}:${c.stageKey}:${c.metricKey}`,
        }));

      // Also update metric values on existing open fixes
      const toUpdate = freshCandidates.filter((c) =>
        existing.has(`${c.funnelKey ?? "_global_"}:${c.stageKey}:${c.metricKey}`),
      );
      for (const c of toUpdate) {
        await supabase
          .from("auto_fix_queue" as never)
          .update({
            metric_value: c.metricValue,
            current_metric: c.metricValue,
            severity: c.severity,
            impact_score: c.impactScore,
            priority_rank: c.priorityRank,
            problem_explanation: c.problemExplanation,
          } as never)
          .eq("metric_key", c.metricKey)
          .eq("stage_key", c.stageKey)
          .in("status", ["open", "acknowledged", "in_progress"]);
      }

      if (toInsert.length > 0) {
        const { error } = await supabase
          .from("auto_fix_queue" as never)
          .insert(toInsert as never);
        if (error) {
          console.error("[AutoFix] insert error:", error);
          throw new Error(error.message);
        }
        toast.success(`${toInsert.length} new fix(es) queued`);
        playCue("success");
      } else if (toUpdate.length > 0) {
        toast.success(`${toUpdate.length} existing fix(es) updated with current metrics`);
      } else {
        toast.info("All detected problems are already in the queue");
      }

      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Scan failed";
      console.error("[AutoFix] scan error:", msg);
      toast.error(`Scan failed: ${msg}`);
      playCue("error");
    } finally {
      setScanning(false);
    }
  };

  const updateStatus = async (
    fix: QueuedFix,
    status: QueuedFix["status"],
    note?: string,
  ) => {
    const patch: Record<string, unknown> = { status };
    if (status === "done") {
      patch.resolution_note = note ?? null;
      const { data: u } = await supabase.auth.getUser();
      patch.resolved_by = u.user?.id ?? null;
    }
    const { error } = await supabase
      .from("auto_fix_queue" as never)
      .update(patch as never)
      .eq("id", fix.id);
    if (error) {
      toast.error(error.message);
      playCue("error");
      return;
    }
    toast.success(`Marked ${STATUS_LABEL[status]}`);
    if (status === "done") playCue("success");
    await load();
    if (selected?.id === fix.id) setSelected(null);
  };

  const proposeToSelfOpt = async (fix: QueuedFix) => {
    // Map problem_class → L36 v2 module
    const moduleMap: Record<string, string> = {
      booking: "message_ab",
      setter: "ai_setter_script",
      showing: "no_show_recovery",
    };
    const mod = moduleMap[fix.problem_class];
    if (!mod) {
      toast.info("This fix is manual-only. Use the deep links to act.");
      return;
    }
    try {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("self_optimization_proposals" as never)
        .insert({
          funnel_key: fix.funnel_key,
          module: mod,
          rule_id: `auto_fix:${fix.problem_class}`,
          scope: { source: "auto_fix_engine", auto_fix_id: fix.id },
          rationale: `${fix.problem_label}. ${fix.problem_explanation}`,
          before_state: {
            metric_key: fix.metric_key,
            value: fix.baseline_metric ?? fix.metric_value,
          },
          after_state: {
            metric_key: fix.metric_key,
            target: fix.metric_threshold,
          },
          baseline_metric: fix.baseline_metric ?? fix.metric_value,
          status: "pending",
          expires_at: expiresAt,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      await supabase
        .from("auto_fix_queue" as never)
        .update({
          self_opt_proposal_id: (data as unknown as { id: string }).id,
          status: "in_progress",
        } as never)
        .eq("id", fix.id);
      toast.success("Proposed to Self-Optimization for review");
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not create proposal";
      toast.error(msg);
    }
  };

  const top3 = queue.filter((q) => q.status !== "done").slice(0, 3);
  const recent = queue.filter((q) => q.status === "done").slice(0, 5);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Auto-Fix Engine
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Detected problems · prioritized by impact ÷ effort
            </p>
          </div>
          <Button onClick={runScan} disabled={scanning} variant="outline" size="sm">
            {scanning ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Scan now
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : top3.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No active fixes. Click <span className="font-medium">Scan now</span> to check
              the funnel against thresholds.
              {candidates.length > 0 && (
                <div className="mt-2 text-xs">
                  ({candidates.length} candidate{candidates.length === 1 ? "" : "s"} ready
                  to queue.)
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {top3.map((fix, i) => {
                const delta =
                  fix.baseline_metric != null && fix.current_metric != null
                    ? fix.current_metric - fix.baseline_metric
                    : null;
                return (
                  <button
                    key={fix.id}
                    onClick={() => setSelected(fix)}
                    className={cn(
                      "w-full text-left rounded-xl border p-4 transition hover:bg-muted/30",
                      fix.severity === "critical"
                        ? "border-destructive/40"
                        : "border-amber-500/30",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-muted-foreground">
                            #{i + 1}
                          </span>
                          <Badge
                            variant={fix.severity === "critical" ? "destructive" : "secondary"}
                            className="capitalize"
                          >
                            {fix.severity}
                          </Badge>
                          <Badge variant="outline" className="capitalize">
                            {STATUS_LABEL[fix.status]}
                          </Badge>
                        </div>
                        <div className="font-medium truncate">{fix.problem_label}</div>
                        <div className="text-sm text-muted-foreground truncate">
                          {fix.problem_explanation}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-muted-foreground">Priority</div>
                        <div className="text-lg font-semibold tabular-nums">
                          {fix.priority_rank}
                        </div>
                        {delta != null && Math.abs(delta) >= 0.5 && (
                          <div
                            className={cn(
                              "text-xs tabular-nums",
                              delta > 0 ? "text-emerald-600" : "text-destructive",
                            )}
                          >
                            {delta > 0 ? "+" : ""}
                            {delta.toFixed(1)}pp
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {recent.length > 0 && (
            <div className="mt-6 pt-4 border-t">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Recently resolved
              </div>
              <div className="space-y-1">
                {recent.map((r) => {
                  const delta =
                    r.baseline_metric != null && r.current_metric != null
                      ? r.current_metric - r.baseline_metric
                      : null;
                  return (
                    <div
                      key={r.id}
                      className="flex items-center justify-between text-sm py-1"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span className="truncate">{r.problem_label}</span>
                      </div>
                      {delta != null && (
                        <span
                          className={cn(
                            "text-xs tabular-nums shrink-0 ml-2",
                            delta > 0 ? "text-emerald-600" : "text-muted-foreground",
                          )}
                        >
                          {r.baseline_metric?.toFixed(1)}% → {r.current_metric?.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.problem_label}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {selected.problem_explanation}
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-lg border p-2">
                      <div className="text-xs text-muted-foreground">Impact</div>
                      <div className="text-lg font-semibold tabular-nums">
                        {selected.impact_score}
                      </div>
                    </div>
                    <div className="rounded-lg border p-2">
                      <div className="text-xs text-muted-foreground">Effort</div>
                      <div className="text-lg font-semibold tabular-nums">
                        {selected.effort_score}
                      </div>
                    </div>
                    <div className="rounded-lg border p-2">
                      <div className="text-xs text-muted-foreground">Priority</div>
                      <div className="text-lg font-semibold tabular-nums">
                        {selected.priority_rank}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    Recommended actions
                  </div>
                  <ul className="space-y-1.5 text-sm">
                    {selected.recommendations.map((r, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-muted-foreground">·</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {selected.deep_links?.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-2">
                      Open
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selected.deep_links.map((d) => (
                        <Button key={d.href} variant="outline" size="sm" asChild>
                          <Link to={d.href}>
                            {d.label}
                            <ArrowUpRight className="ml-1 h-3 w-3" />
                          </Link>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">Status</div>
                  <Select
                    value={selected.status}
                    onValueChange={(v) =>
                      updateStatus(selected, v as QueuedFix["status"])
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="acknowledged">Acknowledged</SelectItem>
                      <SelectItem value="in_progress">In progress</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                      <SelectItem value="dismissed">Dismissed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {["booking", "setter", "showing"].includes(selected.problem_class) && (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="text-xs font-medium mb-1">Self-Optimization</div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Send this fix to Self-Optimization (L36) for review and
                      controlled rollout.
                    </p>
                    <Button
                      size="sm"
                      variant="default"
                      disabled={!!selected.self_opt_proposal_id}
                      onClick={() => proposeToSelfOpt(selected)}
                    >
                      {selected.self_opt_proposal_id
                        ? "Proposal created"
                        : "Propose to Self-Optimization"}
                    </Button>
                  </div>
                )}

                {selected.baseline_metric != null && selected.current_metric != null && (
                  <div className="rounded-lg border p-3 text-sm">
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      Before / now
                    </div>
                    <div className="flex items-center justify-between tabular-nums">
                      <span>{selected.baseline_metric.toFixed(1)}%</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium">
                        {selected.current_metric.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
