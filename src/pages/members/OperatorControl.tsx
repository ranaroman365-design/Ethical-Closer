import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/LanguageContext";
import { getLevelForStage } from "@/lib/kpi-config";
import AccessDenied from "@/components/members/AccessDenied";
import {
  FEATURE_FLAGS,
  COCKPIT_SECTIONS,
  type FeatureFlag,
} from "@/lib/canonical-operator-control";
import { Loader2, AlertTriangle, Activity, Settings2, ListChecks, ShieldOff, ChevronDown, Zap } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LiveChangeFeed } from "@/components/members/cockpit/LiveChangeFeed";
import { PerformanceSnapshot } from "@/components/members/cockpit/PerformanceSnapshot";
import { QuickPanels } from "@/components/members/cockpit/QuickPanels";
import { AutonomousModePanel } from "@/components/members/cockpit/AutonomousModePanel";
import { ConversationalAIPanel } from "@/components/members/cockpit/ConversationalAIPanel";
import { PsychStatePanel } from "@/components/members/cockpit/PsychStatePanel";
import { PersonalityPanel } from "@/components/members/cockpit/PersonalityPanel";
import { SalesBrainPanel } from "@/components/members/cockpit/SalesBrainPanel";
import { EmailDocumentationPanel } from "@/components/members/cockpit/EmailDocumentationPanel";
import { PushChannelPanel } from "@/components/members/cockpit/PushChannelPanel";
import { SystemArchitectureView } from "@/components/members/cockpit/SystemArchitectureView";
import { MobileOperatorControl } from "@/components/members/cockpit/MobileOperatorControl";

interface ControlView {
  funnels: string[];
  flags: any[];
  next_actions: any[];
  escalations: any[];
  active_locks_count: number;
  is_admin: boolean;
  generated_at: string;
}

export default function OperatorControl() {
  const { user, profile, isAdmin, isOwner } = useAuth();
  const { lang } = useLanguage();
  const stage = (profile as any)?.business_stage ?? "opener";
  const level = isAdmin || isOwner ? 6 : getLevelForStage(stage);

  const [view, setView] = useState<ControlView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [funnelKey, setFunnelKey] = useState<string>("__all");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("operator_control_view", {
      _funnel_key: null,
    } as any);
    if (!error && data) setView(data as unknown as ControlView);
    setLoading(false);
  };

  useEffect(() => {
    if (level >= 6 && user?.id) load();
  }, [level, user?.id]);

  if (level < 6) return <AccessDenied />;

  const toggleFlag = async (funnel_key: string, flag: FeatureFlag, value: boolean) => {
    setSaving(`${funnel_key}:${flag}`);
    await supabase
      .from("per_funnel_feature_flags")
      .update({ [flag]: value, updated_by: user?.id, updated_at: new Date().toISOString() } as any)
      .eq("funnel_key", funnel_key);
    await supabase.from("operator_control_audit").insert({
      actor_id: user?.id,
      funnel_key,
      action_kind: "flag_toggle",
      target_table: "per_funnel_feature_flags",
      after_value: { [flag]: value },
    } as any);
    setSaving(null);
    load();
  };

  const decideNba = async (id: string, decision: "approved" | "skipped") => {
    setSaving(`nba:${id}`);
    await supabase
      .from("lead_next_best_action")
      .update({
        status: decision,
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
      } as any)
      .eq("id", id);
    await supabase.from("operator_control_audit").insert({
      actor_id: user?.id,
      action_kind: decision === "approved" ? "nba_approve" : "nba_skip",
      target_table: "lead_next_best_action",
      target_id: id,
    } as any);
    setSaving(null);
    load();
  };

  const ackEscalation = async (id: string) => {
    setSaving(`esc:${id}`);
    await supabase
      .from("operator_escalations")
      .update({
        status: "acknowledged",
        resolved_by: user?.id,
        resolved_at: new Date().toISOString(),
      } as any)
      .eq("id", id);
    setSaving(null);
    load();
  };

  const runEmergencyPause = async () => {
    setSaving("emergency_pause");
    const targets = funnelKey === "__all" ? view!.funnels : [funnelKey];
    const off = Object.fromEntries(FEATURE_FLAGS.map((f) => [f, false]));
    for (const fk of targets) {
      await supabase
        .from("per_funnel_feature_flags")
        .update({ ...off, updated_by: user?.id, updated_at: new Date().toISOString() } as any)
        .eq("funnel_key", fk);
      await supabase.from("change_audit_log").insert({
        changed_by_kind: "operator",
        changed_by: user?.id,
        change_type: "disable",
        scope_type: "funnel",
        scope_id: fk,
        module: "operator_control",
        previous_state: {},
        new_state: off,
        reason: "Emergency Pause triggered by operator",
        reversible: true,
        risk_level: "high",
      } as any);
    }
    setSaving(null);
    toast.success(lang === "de" ? "Automatisierungen pausiert" : "Automations paused");
    load();
  };

  if (loading || !view) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {/* ─── MOBILE (< md) ───────────────────────────────────────── */}
      <div className="md:hidden">
        <MobileOperatorControl
          view={view}
          funnelKey={funnelKey}
          saving={saving}
          onDecideNba={decideNba}
          onAckEscalation={ackEscalation}
          onEmergencyPause={runEmergencyPause}
          userId={user?.id}
        />
      </div>

      {/* ─── DESKTOP (≥ md) ──────────────────────────────────────── */}
      <div className="hidden space-y-8 p-6 md:block lg:p-10">
      {/* Header */}
      <header className="space-y-3 border-b pb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {lang === "de" ? "Cockpit · Layer 33" : "Cockpit · Layer 33"}
        </p>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-serif text-3xl font-light tracking-tight">
              {lang === "de" ? "Operator Control" : "Operator Control"}
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground mt-1">
              {lang === "de"
                ? "Was passiert · Was braucht Aufmerksamkeit · Was ist automatisiert · Was ist als Nächstes zu tun."
                : "What is happening · What needs attention · What is automated · What to do next."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {lang === "de" ? "Funnel" : "Funnel"}
            </span>
            <Select value={funnelKey} onValueChange={setFunnelKey}>
              <SelectTrigger className="h-9 w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">{lang === "de" ? "Alle Funnels" : "All funnels"}</SelectItem>
                {view.funnels.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
            <Badge variant="outline" className="gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
            </Badge>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 border-rose-300 text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                  <ShieldOff className="h-3.5 w-3.5" />
                  {lang === "de" ? "Notfall-Pause" : "Emergency Pause"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {lang === "de" ? "Alle Automatisierungen pausieren?" : "Pause all automations?"}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {lang === "de"
                      ? "Schaltet Smart Attendance, AI Setter, Lead Lifecycle, Level Messaging und Touchpoint-Sequenzen für alle deine Funnels sofort aus. Audit-Eintrag wird erstellt. Reversibel über Audit Center."
                      : "Immediately disables Smart Attendance, AI Setter, Lead Lifecycle, Level Messaging and Touchpoint Sequences for all your funnels. An audit entry is created. Reversible via Audit Center."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{lang === "de" ? "Abbrechen" : "Cancel"}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      setSaving("emergency_pause");
                      const targets = funnelKey === "__all" ? view.funnels : [funnelKey];
                      const off = Object.fromEntries(FEATURE_FLAGS.map((f) => [f, false]));
                      for (const fk of targets) {
                        await supabase
                          .from("per_funnel_feature_flags")
                          .update({ ...off, updated_by: user?.id, updated_at: new Date().toISOString() } as any)
                          .eq("funnel_key", fk);
                        await supabase.from("change_audit_log").insert({
                          changed_by_kind: "operator",
                          changed_by: user?.id,
                          change_type: "disable",
                          scope_type: "funnel",
                          scope_id: fk,
                          module: "operator_control",
                          previous_state: {},
                          new_state: off,
                          reason: "Emergency Pause triggered by operator",
                          reversible: true,
                          risk_level: "high",
                        } as any);
                      }
                      setSaving(null);
                      toast.success(lang === "de" ? "Automatisierungen pausiert" : "Automations paused");
                      load();
                    }}
                    className="bg-rose-600 hover:bg-rose-700"
                  >
                    {lang === "de" ? "Pausieren" : "Pause now"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════════
          GOLDSTANDARD ORDER (Operator Command Center)
          1. System Architecture · 2. Performance Snapshot
          3. Next Best Actions  · 4. Escalations
          5. Automation Control · 6. Live Change Feed
          ════════════════════════════════════════════════════════════ */}

      {/* 1 — System Architecture View (Layer 45) */}
      <SystemArchitectureView />

      {/* 2 — Performance Snapshot */}
      <section>
        <SectionTitle icon={<Activity className="h-4 w-4" />} label={lang === "de" ? "Performance Snapshot" : "Performance Snapshot"} />
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
          <Stat label={lang === "de" ? "Funnels" : "Funnels"} value={view.funnels.length} />
          <Stat label={lang === "de" ? "Aktive Sequenzen" : "Active sequences"} value={view.active_locks_count} />
          <Stat label={lang === "de" ? "Offene NBAs" : "Open NBAs"} value={view.next_actions.length} />
          <Stat
            label={lang === "de" ? "Eskalationen" : "Escalations"}
            value={view.escalations.length}
            tone={view.escalations.length > 0 ? "warning" : "neutral"}
          />
          <Stat label={lang === "de" ? "Status" : "Status"} value={1} />
        </div>
        <div className="mt-4">
          <PerformanceSnapshot funnelKey={funnelKey === "__all" ? null : funnelKey} />
        </div>
      </section>

      {/* 3 — Next Best Actions (CORE) */}
      <section>
        <SectionTitle
          icon={<ListChecks className="h-4 w-4" />}
          label={lang === "de" ? "Next Best Actions" : "Next Best Actions"}
          count={view.next_actions.length}
        />
        <div className="mt-4 space-y-2">
          {view.next_actions.length === 0 && (
            <Card className="p-4 text-sm text-muted-foreground">
              {lang === "de" ? "Keine offenen Aktionen. Das System ist im Gleichgewicht." : "No pending actions. System is balanced."}
            </Card>
          )}
          {view.next_actions.map((n: any) => (
            <Card key={n.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge>{n.action.replace(/_/g, " ")}</Badge>
                  <span className="text-xs text-muted-foreground">· {n.funnel_key}</span>
                  <span className="text-xs text-muted-foreground">
                    · {new Date(n.run_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm">{n.reason}</p>
                <p className="text-xs text-muted-foreground">
                  {lang === "de" ? "Lead" : "Lead"} {n.lead_id.slice(0, 8)} · conf {Math.round(n.confidence * 100)}%
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => decideNba(n.id, "skipped")}
                  disabled={saving === `nba:${n.id}`}
                >
                  {lang === "de" ? "Überspringen" : "Skip"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => decideNba(n.id, "approved")}
                  disabled={saving === `nba:${n.id}`}
                >
                  {lang === "de" ? "Bestätigen" : "Execute"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* 4 — Escalations */}
      <section>
        <SectionTitle
          icon={<AlertTriangle className="h-4 w-4" />}
          label={lang === "de" ? "Eskalationen" : "Escalations"}
          count={view.escalations.length}
        />
        <div className="mt-4 space-y-2">
          {view.escalations.length === 0 && (
            <Card className="p-4 text-sm text-muted-foreground">
              {lang === "de" ? "Keine offenen Eskalationen." : "No open escalations."}
            </Card>
          )}
          {view.escalations.slice(0, 10).map((e: any) => (
            <Card key={e.id} className="flex items-center justify-between gap-4 p-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={e.severity === "critical" ? "destructive" : "secondary"}>{e.severity}</Badge>
                  <span className="text-sm font-medium">{e.kind}</span>
                  <span className="text-xs text-muted-foreground">· {e.funnel_key}</span>
                </div>
                {e.detail && <p className="text-xs text-muted-foreground">{e.detail}</p>}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => ackEscalation(e.id)}
                disabled={saving === `esc:${e.id}`}
              >
                {lang === "de" ? "Bestätigen" : "Resolve"}
              </Button>
            </Card>
          ))}
        </div>
      </section>

      {/* 5 — Automation Control */}
      <section>
        <SectionTitle
          icon={<Settings2 className="h-4 w-4" />}
          label={lang === "de" ? "Automation Control" : "Automation Control"}
        />
        <div className="mt-4 space-y-3">
          {view.flags.length === 0 && (
            <Card className="p-4 text-sm text-muted-foreground">
              {lang === "de"
                ? "Noch keine Funnel-Flags konfiguriert. Admin muss erste Funnels anlegen."
                : "No funnel flags configured yet. Admin must seed first funnels."}
            </Card>
          )}
          {view.flags.map((f: any) => (
            <Card key={f.funnel_key} className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm font-medium">{f.funnel_key}</p>
                  {f.test_mode && (
                    <Badge variant="outline" className="mt-1">
                      TEST MODE
                    </Badge>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {FEATURE_FLAGS.map((flag) => (
                  <div key={flag} className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
                    <span className="text-xs">{flag.replace(/_/g, " ")}</span>
                    <Switch
                      checked={!!f[flag]}
                      disabled={saving === `${f.funnel_key}:${flag}`}
                      onCheckedChange={(v) => toggleFlag(f.funnel_key, flag, v)}
                    />
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* 6 — Live Change Feed */}
      <LiveChangeFeed funnelKey={funnelKey === "__all" ? null : funnelKey} />

      {/* ════════════════════════════════════════════════════════════
          ADVANCED ENGINES (collapsed by default — keeps top-fold clean)
          ════════════════════════════════════════════════════════════ */}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between border-b pb-2 text-left transition hover:opacity-70">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-xs font-bold uppercase tracking-[0.14em]">
                {lang === "de" ? "Erweiterte Engines" : "Advanced Engines"}
              </h2>
              <span className="text-[10px] text-muted-foreground">
                {lang === "de" ? "AI Setter · Conversational · Psych · Personality · Sales Brain · Email · Push" : "AI Setter · Conversational · Psych · Personality · Sales Brain · Email · Push"}
              </span>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-8">
          <QuickPanels />
          <AutonomousModePanel
            funnelKey={funnelKey === "__all" ? null : funnelKey}
            funnels={view.funnels}
            isAdmin={isAdmin || isOwner}
          />
          <ConversationalAIPanel
            funnelKey={funnelKey === "__all" ? null : funnelKey}
            isAdmin={isAdmin || isOwner}
          />
          <PsychStatePanel funnelKey={funnelKey} isAdmin={isAdmin || isOwner} />
          <PersonalityPanel funnelKey={funnelKey} isAdmin={isAdmin || isOwner} />
          <SalesBrainPanel />
          {(isAdmin || isOwner) && <EmailDocumentationPanel />}
          {(isAdmin || isOwner) && <PushChannelPanel />}
        </CollapsibleContent>
      </Collapsible>

      <footer className="border-t pt-4 text-[10px] uppercase tracking-wider text-muted-foreground">
        {COCKPIT_SECTIONS.join(" · ")} · generated {new Date(view.generated_at).toLocaleTimeString()}
      </footer>
      </div>
    </>
  );
}

function SectionTitle({
  icon,
  label,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2 border-b pb-2">
      <span className="text-muted-foreground">{icon}</span>
      <h2 className="text-xs font-bold uppercase tracking-[0.14em]">{label}</h2>
      {count !== undefined && count > 0 && (
        <Badge variant="secondary" className="ml-1">
          {count}
        </Badge>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "warning";
}) {
  return (
    <Card className="p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={`mt-1 font-serif text-2xl font-light ${
          tone === "warning" ? "text-destructive" : ""
        }`}
      >
        {value}
      </p>
    </Card>
  );
}
