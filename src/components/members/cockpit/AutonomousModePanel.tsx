import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AUTONOMOUS_MODULES,
  FORBIDDEN_AUTONOMOUS_MODULES,
  type AutonomousModule,
  type SelfOptModeV2,
} from "@/lib/canonical-self-optimization-v2";
import { Bot, Brain, Loader2, RotateCcw, ShieldAlert, Sparkles, Pause } from "lucide-react";
import { toast } from "sonner";

type ModeRow = {
  id: string;
  funnel_key: string;
  module: string;
  mode: SelfOptModeV2;
};

type Proposal = {
  id: string;
  rule_id: string;
  module: string | null;
  funnel_key: string | null;
  rationale: string;
  expected_lift_pct: number | null;
  sample_size: number | null;
  confidence: number | null;
  status: string;
  auto_applied: boolean;
  risk_score: number | null;
  verdict: string | null;
  actual_impact_pct: number | null;
  measurement_ends_at: string | null;
  rolled_back_at: string | null;
  created_at: string;
};

interface Props {
  funnelKey: string | null; // null = all funnels
  funnels: string[];
  isAdmin: boolean;
}

export function AutonomousModePanel({ funnelKey, funnels, isAdmin }: Props) {
  const [globalMode, setGlobalMode] = useState<SelfOptModeV2>("passive");
  const [autoRollback, setAutoRollback] = useState<boolean>(true);
  const [enabled, setEnabled] = useState<boolean>(false);
  const [l6MayEnable, setL6MayEnable] = useState<boolean>(false);
  const [modes, setModes] = useState<ModeRow[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const targetFunnels = useMemo(
    () => (funnelKey ? [funnelKey] : funnels),
    [funnelKey, funnels],
  );

  async function load() {
    setLoading(true);
    const [s, m, p] = await Promise.all([
      supabase.from("self_optimization_settings").select("*").limit(1).maybeSingle(),
      supabase
        .from("per_funnel_autonomy_modes")
        .select("id, funnel_key, module, mode")
        .in("funnel_key", targetFunnels.length > 0 ? targetFunnels : ["__none__"]),
      supabase
        .from("self_optimization_proposals")
        .select(
          "id, rule_id, module, funnel_key, rationale, expected_lift_pct, sample_size, confidence, status, auto_applied, risk_score, verdict, actual_impact_pct, measurement_ends_at, rolled_back_at, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

    if (s.data) {
      setGlobalMode((s.data as any).mode ?? "passive");
      setAutoRollback((s.data as any).auto_rollback_enabled ?? true);
      setEnabled((s.data as any).enabled ?? false);
      setL6MayEnable(((s.data as any).autonomy_config?.l6_may_enable_autonomous) ?? false);
    }
    if (m.data) setModes(m.data as any);
    if (p.data) {
      const filtered = funnelKey
        ? (p.data as any[]).filter((x) => x.funnel_key === funnelKey || x.funnel_key === null)
        : (p.data as any[]);
      setProposals(filtered as any);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnelKey, funnels.join(",")]);

  function moduleMode(funnel: string, mod: AutonomousModule): SelfOptModeV2 {
    return modes.find((r) => r.funnel_key === funnel && r.module === mod)?.mode ?? "passive";
  }

  async function setModuleMode(funnel: string, mod: AutonomousModule, mode: SelfOptModeV2) {
    setSaving(`${funnel}:${mod}`);
    const { error } = await supabase
      .from("per_funnel_autonomy_modes")
      .upsert(
        {
          funnel_key: funnel,
          module: mod,
          mode,
          enabled_at: mode !== "passive" ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        } as any,
        { onConflict: "funnel_key,module" },
      );
    setSaving(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${mod} → ${mode}`);
    void load();
  }

  async function pauseAll() {
    if (!isAdmin) return;
    setSaving("pause_all");
    const rows = targetFunnels.flatMap((f) =>
      AUTONOMOUS_MODULES.map((m) => ({
        funnel_key: f,
        module: m.id,
        mode: "passive" as const,
        enabled_at: null as null,
        updated_at: new Date().toISOString(),
      })),
    );
    const { error } = await supabase
      .from("per_funnel_autonomy_modes")
      .upsert(rows as any, { onConflict: "funnel_key,module" });
    setSaving(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("All modules → passive");
    void load();
  }

  async function rollback(id: string) {
    setSaving(`rb:${id}`);
    const { error } = await supabase.rpc("self_opt_rollback_proposal", {
      _proposal_id: id,
      _reason: "manual_rollback_from_cockpit",
    } as any);
    setSaving(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Rolled back");
    void load();
  }

  async function decide(id: string, decision: "approved" | "rejected") {
    setSaving(`dec:${id}`);
    const { error } = await supabase
      .from("self_optimization_proposals")
      .update({ status: decision, reviewed_at: new Date().toISOString() } as any)
      .eq("id", id);
    setSaving(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Proposal ${decision}`);
    void load();
  }

  const pending = proposals.filter((p) => p.status === "pending");
  const recentAuto = proposals.filter((p) => p.auto_applied).slice(0, 8);
  const measuring = proposals.filter(
    (p) => p.measurement_ends_at && !p.rolled_back_at && new Date(p.measurement_ends_at) > new Date(),
  );

  if (loading) {
    return (
      <Card className="p-8 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 font-serif text-xl font-light">
            <Brain className="h-4 w-4" />
            Autonomous Mode · Phase 2
          </CardTitle>
          <CardDescription className="mt-1">
            Self-learning inside admin-defined guardrails. Every change logged, versioned, reversible.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Badge variant={enabled ? "default" : "secondary"} className="uppercase">
            engine {enabled ? "on" : "off"}
          </Badge>
          <Badge variant="outline" className="uppercase">global: {globalMode}</Badge>
          <Badge variant={autoRollback ? "default" : "outline"} className="gap-1.5">
            <RotateCcw className="h-3 w-3" /> auto-rollback {autoRollback ? "on" : "off"}
          </Badge>
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={pauseAll}
              disabled={!!saving}
            >
              <Pause className="h-3.5 w-3.5" />
              Pause all autonomy
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-8">
        {/* Forbidden notice */}
        <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground flex items-start gap-2">
          <ShieldAlert className="h-3.5 w-3.5 mt-0.5 text-rose-600 shrink-0" />
          <span>
            <strong className="text-foreground">Hard-locked from autonomy:</strong>{" "}
            {FORBIDDEN_AUTONOMOUS_MODULES.join(" · ")}.
          </span>
        </div>

        {/* Per-funnel × per-module mode matrix */}
        <section>
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground mb-3">
            Module Modes {funnelKey ? `· ${funnelKey}` : "· all funnels"}
          </h3>
          {targetFunnels.length === 0 && (
            <p className="text-sm text-muted-foreground">No funnels available.</p>
          )}
          <div className="space-y-4">
            {targetFunnels.map((fk) => (
              <div key={fk} className="border rounded-md p-3">
                <p className="font-mono text-xs text-muted-foreground mb-3">{fk}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {AUTONOMOUS_MODULES.map((m) => {
                    const mode = moduleMode(fk, m.id);
                    const canAutonomous = isAdmin || l6MayEnable;
                    return (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-3 rounded-md bg-muted/20 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm truncate">{m.label}</p>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            risk: {m.risk}
                          </p>
                        </div>
                        <Select
                          value={mode}
                          onValueChange={(v) => setModuleMode(fk, m.id, v as SelfOptModeV2)}
                          disabled={saving === `${fk}:${m.id}`}
                        >
                          <SelectTrigger className="h-8 w-[150px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="passive">Passive</SelectItem>
                            <SelectItem value="assisted">Assisted</SelectItem>
                            <SelectItem value="autonomous" disabled={!canAutonomous}>
                              Autonomous {!canAutonomous && "(admin only)"}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pending recommendations */}
        <section>
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground mb-3 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" />
            Pending Recommendations
            {pending.length > 0 && <Badge>{pending.length}</Badge>}
          </h3>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending recommendations.</p>
          ) : (
            <div className="space-y-2">
              {pending.map((p) => (
                <div key={p.id} className="border rounded-md p-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{p.rule_id}</Badge>
                        {p.module && <Badge variant="secondary" className="text-[10px]">{p.module}</Badge>}
                        {p.funnel_key && <span className="text-[10px] text-muted-foreground">· {p.funnel_key}</span>}
                        {p.expected_lift_pct != null && (
                          <Badge className="text-[10px]">+{p.expected_lift_pct}%</Badge>
                        )}
                        {p.sample_size != null && (
                          <span className="text-[10px] text-muted-foreground">n={p.sample_size}</span>
                        )}
                        {p.confidence != null && (
                          <span className="text-[10px] text-muted-foreground">conf {Math.round(p.confidence * 100)}%</span>
                        )}
                        {p.risk_score != null && (
                          <span className="text-[10px] text-muted-foreground">risk {p.risk_score}</span>
                        )}
                      </div>
                      <p className="text-sm mt-1">{p.rationale}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => decide(p.id, "rejected")} disabled={saving === `dec:${p.id}`}>
                        Reject
                      </Button>
                      <Button size="sm" onClick={() => decide(p.id, "approved")} disabled={saving === `dec:${p.id}`}>
                        Approve
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent autonomous changes */}
        <section>
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground mb-3 flex items-center gap-2">
            <Bot className="h-3.5 w-3.5" />
            Recent Autonomous Changes
          </h3>
          {recentAuto.length === 0 ? (
            <p className="text-sm text-muted-foreground">No autonomous changes yet.</p>
          ) : (
            <div className="space-y-2">
              {recentAuto.map((p) => (
                <div key={p.id} className="border rounded-md p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="default" className="text-[10px]">auto</Badge>
                      <Badge variant="outline" className="text-[10px]">{p.rule_id}</Badge>
                      {p.verdict && (
                        <Badge
                          variant={p.verdict === "successful" ? "default" : p.verdict === "failed" ? "destructive" : "secondary"}
                          className="text-[10px]"
                        >
                          {p.verdict}
                        </Badge>
                      )}
                      {p.actual_impact_pct != null && (
                        <span className="text-[10px] text-muted-foreground">
                          actual {p.actual_impact_pct > 0 ? "+" : ""}
                          {p.actual_impact_pct.toFixed(1)}%
                        </span>
                      )}
                      {p.rolled_back_at && (
                        <Badge variant="outline" className="text-[10px]">rolled back</Badge>
                      )}
                    </div>
                    <p className="text-sm mt-1">{p.rationale}</p>
                  </div>
                  {!p.rolled_back_at && (
                    <Button size="sm" variant="outline" onClick={() => rollback(p.id)} disabled={saving === `rb:${p.id}`} className="gap-1.5">
                      <RotateCcw className="h-3.5 w-3.5" /> Rollback
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Self-Learning Dashboard */}
        <section>
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground mb-3">
            Self-Learning Dashboard
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniStat label="Auto-applied" value={proposals.filter((p) => p.auto_applied).length} />
            <MiniStat label="Pending" value={pending.length} />
            <MiniStat label="In measurement" value={measuring.length} />
            <MiniStat
              label="Rolled back"
              value={proposals.filter((p) => p.rolled_back_at).length}
              tone="warning"
            />
            <MiniStat
              label="Successful"
              value={proposals.filter((p) => p.verdict === "successful").length}
              tone="success"
            />
            <MiniStat
              label="Failed"
              value={proposals.filter((p) => p.verdict === "failed").length}
              tone="warning"
            />
            <MiniStat label="Neutral" value={proposals.filter((p) => p.verdict === "neutral").length} />
            <MiniStat label="Total proposals" value={proposals.length} />
          </div>
        </section>

        {isAdmin && (
          <section className="border-t pt-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-medium">Allow L6 to enable Autonomous mode</p>
                <p className="text-xs text-muted-foreground">
                  When off, only admins/owners/ops_admins can switch a module to autonomous.
                </p>
              </div>
              <Switch
                checked={l6MayEnable}
                onCheckedChange={async (v) => {
                  setSaving("l6_toggle");
                  const { data: cur } = await supabase
                    .from("self_optimization_settings")
                    .select("id, autonomy_config")
                    .limit(1)
                    .maybeSingle();
                  if (!cur) { setSaving(null); return; }
                  const next = { ...((cur as any).autonomy_config ?? {}), l6_may_enable_autonomous: v };
                  const { error } = await supabase
                    .from("self_optimization_settings")
                    .update({ autonomy_config: next } as any)
                    .eq("id", (cur as any).id);
                  setSaving(null);
                  if (error) { toast.error(error.message); return; }
                  setL6MayEnable(v);
                  toast.success("Saved");
                }}
                disabled={saving === "l6_toggle"}
              />
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "warning";
}) {
  const color =
    tone === "success"
      ? "text-emerald-600"
      : tone === "warning"
      ? "text-rose-600"
      : "";
  return (
    <div className="border rounded-md p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 font-serif text-2xl font-light ${color}`}>{value}</p>
    </div>
  );
}
