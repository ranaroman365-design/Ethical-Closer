import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  SELF_OPT_RULES,
  DEFAULT_THRESHOLDS,
  type SelfOptThresholds,
  type SelfOptMode,
} from "@/lib/canonical-self-optimization";

interface Settings {
  id: string;
  enabled: boolean;
  mode: SelfOptMode;
  thresholds: SelfOptThresholds;
  rules_enabled: Record<string, boolean>;
}

interface Proposal {
  id: string;
  rule_id: string;
  funnel_key: string | null;
  rationale: string;
  before_state: any;
  after_state: any;
  expected_lift_pct: number | null;
  sample_size: number | null;
  confidence: number | null;
  status: string;
  created_at: string;
  expires_at: string;
}

interface LogEntry {
  id: string;
  rule_id: string;
  event: string;
  funnel_key: string | null;
  what_changed: string;
  why: string | null;
  created_at: string;
}

export default function SelfOptimization() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = "Self-Optimization Engine — Phase 1";
    void loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [s, p, l] = await Promise.all([
      supabase.from("self_optimization_settings").select("*").limit(1).maybeSingle(),
      supabase
        .from("self_optimization_proposals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("self_optimization_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (s.data) setSettings(s.data as any);
    if (p.data) setProposals(p.data as any);
    if (l.data) setLogs(l.data as any);
    setLoading(false);
  }

  async function saveSettings(patch: Partial<Settings>) {
    if (!settings) return;
    setSaving(true);
    const merged = { ...settings, ...patch } as Settings;
    const { error } = await supabase
      .from("self_optimization_settings")
      .update({
        enabled: merged.enabled,
        mode: merged.mode,
        thresholds: merged.thresholds as any,
        rules_enabled: merged.rules_enabled as any,
      })
      .eq("id", settings.id);
    setSaving(false);
    if (error) {
      toast.error("Save failed: " + error.message);
      return;
    }
    setSettings(merged);
    toast.success("Saved");
  }

  async function reviewProposal(id: string, decision: "approved" | "rejected") {
    const p = proposals.find((x) => x.id === id);
    if (!p) return;
    const { error } = await supabase
      .from("self_optimization_proposals")
      .update({
        status: decision,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.from("self_optimization_logs").insert({
      proposal_id: id,
      rule_id: p.rule_id,
      event: decision,
      funnel_key: p.funnel_key,
      what_changed: p.rationale,
      why: `Operator ${decision} via review queue`,
      before_metric: p.before_state,
      after_metric: p.after_state,
    } as any);
    toast.success(`Proposal ${decision}`);
    void loadAll();
  }

  const pending = useMemo(() => proposals.filter((p) => p.status === "pending"), [proposals]);

  if (loading) {
    return (
      <div className="p-8 text-muted-foreground">Loading Self-Optimization Engine…</div>
    );
  }

  if (!settings) {
    return <div className="p-8 text-destructive">Settings not initialized.</div>;
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Self-Optimization Engine</h1>
          <p className="text-muted-foreground mt-1">
            Phase 1 — Assisted Mode. System proposes; L6 / Admin approves.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={settings.enabled ? "default" : "secondary"}>
            {settings.enabled ? "ENABLED" : "DISABLED"}
          </Badge>
          <Badge variant="outline" className="uppercase tracking-wider">
            Mode: {settings.mode}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="control" className="w-full">
        <TabsList>
          <TabsTrigger value="control">Master Control</TabsTrigger>
          <TabsTrigger value="rules">Rules ({SELF_OPT_RULES.length})</TabsTrigger>
          <TabsTrigger value="thresholds">Thresholds</TabsTrigger>
          <TabsTrigger value="queue">
            Proposal Queue {pending.length > 0 && <Badge className="ml-2">{pending.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="logs">Audit Log</TabsTrigger>
        </TabsList>

        {/* MASTER CONTROL */}
        <TabsContent value="control" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Engine Status</CardTitle>
              <CardDescription>
                Default OFF. Enabling activates evaluators in <strong>assisted mode</strong> only —
                proposals go to the review queue, never auto-applied (except hard safety rules R7-R10).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between border border-border rounded-md p-4">
                <div>
                  <Label className="text-base">Engine Enabled</Label>
                  <p className="text-sm text-muted-foreground">Master switch for all 10 rules.</p>
                </div>
                <Switch
                  checked={settings.enabled}
                  disabled={saving}
                  onCheckedChange={(v) => saveSettings({ enabled: v })}
                />
              </div>

              <div className="border border-border rounded-md p-4 space-y-3">
                <Label className="text-base">Mode</Label>
                <div className="flex gap-2">
                  <Button
                    variant={settings.mode === "assisted" ? "default" : "outline"}
                    onClick={() => saveSettings({ mode: "assisted" })}
                    disabled={saving}
                  >
                    Assisted (Phase 1)
                  </Button>
                  <Button
                    variant="outline"
                    disabled
                    title="Phase 2 — not yet available"
                  >
                    Autonomous (Phase 2 — locked)
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  In assisted mode, optimization rules R1–R6 propose changes for review. Safety rules
                  R7–R10 enforce hard limits without approval.
                </p>
              </div>

              <div className="rounded-md bg-muted/50 p-4 text-sm text-muted-foreground">
                <strong className="text-foreground">Forbidden in Phase 1:</strong> full AI closing,
                aggressive timing changes, AI-generated messages, full funnel rewriting.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* RULES */}
        <TabsContent value="rules" className="space-y-3">
          {SELF_OPT_RULES.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
                    <span className="font-medium">{r.name}</span>
                    <Badge variant="outline" className="text-xs">{r.category}</Badge>
                    <Badge variant="outline" className="text-xs">risk: {r.risk}</Badge>
                    <Badge variant="outline" className="text-xs">impact: {r.impact}</Badge>
                    {r.requires_approval && (
                      <Badge variant="secondary" className="text-xs">requires approval</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{r.description}</p>
                </div>
                <Switch
                  checked={settings.rules_enabled[r.id] !== false}
                  disabled={saving}
                  onCheckedChange={(v) =>
                    saveSettings({
                      rules_enabled: { ...settings.rules_enabled, [r.id]: v },
                    })
                  }
                />
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* THRESHOLDS */}
        <TabsContent value="thresholds">
          <Card>
            <CardHeader>
              <CardTitle>Thresholds</CardTitle>
              <CardDescription>
                Defaults match Phase 1 spec. Tighten for safer rollout, loosen for faster learning.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(Object.keys(DEFAULT_THRESHOLDS) as Array<keyof SelfOptThresholds>).map((k) => (
                  <div key={k} className="space-y-1">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      {k}
                    </Label>
                    <Input
                      type="number"
                      step="any"
                      value={settings.thresholds[k]}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v)) {
                          setSettings({
                            ...settings,
                            thresholds: { ...settings.thresholds, [k]: v },
                          });
                        }
                      }}
                    />
                  </div>
                ))}
              </div>
              <Separator className="my-4" />
              <div className="flex gap-2">
                <Button onClick={() => saveSettings({ thresholds: settings.thresholds })} disabled={saving}>
                  Save Thresholds
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    saveSettings({ thresholds: { ...DEFAULT_THRESHOLDS } as SelfOptThresholds })
                  }
                  disabled={saving}
                >
                  Reset to Defaults
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* QUEUE */}
        <TabsContent value="queue" className="space-y-3">
          {proposals.length === 0 && (
            <div className="text-muted-foreground p-6 text-center border border-dashed rounded-md">
              No proposals yet. Once enabled, evaluators will surface suggestions here.
            </div>
          )}
          {proposals.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={p.status === "pending" ? "default" : "outline"}>
                        {p.status}
                      </Badge>
                      <span className="font-mono text-xs text-muted-foreground">{p.rule_id}</span>
                      {p.funnel_key && <Badge variant="outline">{p.funnel_key}</Badge>}
                      {p.expected_lift_pct != null && (
                        <Badge variant="secondary">+{p.expected_lift_pct}% expected</Badge>
                      )}
                      {p.sample_size != null && (
                        <span className="text-xs text-muted-foreground">n={p.sample_size}</span>
                      )}
                    </div>
                    <p className="text-sm mt-2">{p.rationale}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Created {new Date(p.created_at).toLocaleString()} · expires{" "}
                      {new Date(p.expires_at).toLocaleString()}
                    </p>
                  </div>
                  {p.status === "pending" && (
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" onClick={() => reviewProposal(p.id, "approved")}>
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => reviewProposal(p.id, "rejected")}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* LOGS */}
        <TabsContent value="logs" className="space-y-2">
          {logs.length === 0 && (
            <div className="text-muted-foreground p-6 text-center border border-dashed rounded-md">
              No log entries yet.
            </div>
          )}
          {logs.map((l) => (
            <div
              key={l.id}
              className="border border-border rounded-md p-3 text-sm flex items-start justify-between gap-3"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">{l.event}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">{l.rule_id}</span>
                  {l.funnel_key && <Badge variant="outline" className="text-xs">{l.funnel_key}</Badge>}
                </div>
                <p className="mt-1">{l.what_changed}</p>
                {l.why && <p className="text-xs text-muted-foreground mt-1">{l.why}</p>}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(l.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
