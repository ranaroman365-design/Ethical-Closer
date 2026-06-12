import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AUDIT_MODULES, REPORT_TYPES, type ReportType } from "@/lib/canonical-audit-versioning";
import { ChangeCard, type ChangeCardData } from "@/components/members/audit/ChangeCard";
import { Timeline } from "@/components/members/audit/Timeline";
import { VersionTree, type VersionNode } from "@/components/members/audit/VersionTree";
import { AuditFilters, DEFAULT_FILTERS, type AuditFilterState } from "@/components/members/audit/AuditFilters";
import { Download, FileText } from "lucide-react";

interface ReportRow {
  id: string;
  report_type: string;
  module: string | null;
  scope_type: string;
  scope_id: string | null;
  status: string;
  storage_path: string | null;
  file_url: string | null;
  created_at: string;
}

function metricDelta(c: ChangeCardData): number | null {
  const pickNum = (m: Record<string, unknown> | null | undefined) => {
    if (!m) return null;
    for (const k of Object.keys(m)) if (typeof m[k] === "number") return m[k] as number;
    return null;
  };
  const a = pickNum(c.before_metric);
  const b = pickNum(c.after_metric);
  if (a === null || b === null) return null;
  return b - a;
}

export default function AuditCenter({ operatorScopeOnly = false }: { operatorScopeOnly?: boolean }) {
  const [audit, setAudit] = useState<ChangeCardData[]>([]);
  const [versions, setVersions] = useState<VersionNode[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [filters, setFilters] = useState<AuditFilterState>(DEFAULT_FILTERS);
  const [busy, setBusy] = useState(false);

  // Report generator
  const [reportType, setReportType] = useState<ReportType>("daily");
  const [reportModule, setReportModule] = useState<string>("");
  const [reportScopeId, setReportScopeId] = useState<string>("");

  useEffect(() => {
    document.title = operatorScopeOnly
      ? "My Funnel · Audit"
      : "Living Audit · Versioning";
    void loadAll();
  }, []);

  async function loadAll() {
    const audQ = supabase
      .from("change_audit_log")
      .select("change_id,changed_by_kind,changed_by,change_type,scope_type,scope_id,module,reason,reversible,risk_level,rollback_reference_id,created_at,previous_state,new_state,before_metric,after_metric,expected_impact,rule_triggered,sample_size")
      .order("created_at", { ascending: false })
      .limit(300);
    const verQ = supabase
      .from("config_versions")
      .select("version_id,parent_version_id,module,scope_type,scope_id,active,reason,created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    const repQ = supabase
      .from("optimization_reports")
      .select("id,report_type,module,scope_type,scope_id,status,storage_path,file_url,created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    const [a, v, r] = await Promise.all([audQ, verQ, repQ]);
    if (a.data) setAudit(a.data as any);
    if (v.data) setVersions(v.data as any);
    if (r.data) setReports(r.data as any);
  }

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return audit.filter((c) => {
      if (filters.module !== "all" && c.module !== filters.module) return false;
      if (filters.changeType !== "all" && c.change_type !== filters.changeType) return false;
      if (filters.actorKind !== "all" && c.changed_by_kind !== filters.actorKind) return false;
      if (filters.risk !== "all" && c.risk_level !== filters.risk) return false;
      if (filters.scopeId.trim() && !(c.scope_id ?? "").includes(filters.scopeId.trim())) return false;
      if (filters.impact !== "all") {
        const d = metricDelta(c);
        if (d === null) return false;
        if (filters.impact === "positive" && d <= 0) return false;
        if (filters.impact === "negative" && d >= 0) return false;
      }
      if (q) {
        const blob = `${c.reason} ${c.rule_triggered ?? ""} ${c.change_id} ${c.module}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [audit, filters]);

  // Headline impact stats
  const stats = useMemo(() => {
    let pos = 0, neg = 0, neutral = 0;
    for (const c of filtered) {
      const d = metricDelta(c);
      if (d === null) neutral++;
      else if (d > 0) pos++;
      else if (d < 0) neg++;
      else neutral++;
    }
    return { total: filtered.length, pos, neg, neutral };
  }, [filtered]);

  async function rollbackChange(changeId: string, reason: string) {
    setBusy(true);
    // Roll back via the change's source version if available — fallback: log a manual rollback audit row.
    // Since rollback granularity is at version-level, we surface an instruction toast if no version is found.
    const change = audit.find((c) => c.change_id === changeId);
    if (!change) { setBusy(false); return; }
    // Find the most recent active version for this module+scope and an older one to restore.
    const matching = versions
      .filter((v) => v.module === change.module && v.scope_type === change.scope_type && v.scope_id === change.scope_id)
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    const previous = matching.find((v) => !v.active && new Date(v.created_at) < new Date(change.created_at));
    if (!previous) {
      toast.error("No earlier version snapshot available to roll back to. Use Version History.");
      setBusy(false);
      return;
    }
    const { error } = await supabase.rpc("restore_config_version", {
      _version_id: previous.version_id,
      _reason: reason,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Rolled back — new version created");
    void loadAll();
  }

  async function restoreVersion(version_id: string, reason: string) {
    setBusy(true);
    const { error } = await supabase.rpc("restore_config_version", {
      _version_id: version_id,
      _reason: reason,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Version restored — new version created");
    void loadAll();
  }

  async function generateReport() {
    setBusy(true);
    const payload: Record<string, unknown> = {
      report_type: reportType,
      scope_type: operatorScopeOnly ? "funnel" : (reportScopeId ? "funnel" : "global"),
      scope_id: reportScopeId || null,
      module: reportModule || null,
    };
    const { data, error } = await supabase.functions.invoke("optimization-report-generate", { body: payload });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("PDF generated");
    if ((data as any)?.file_url) window.open((data as any).file_url, "_blank");
    void loadAll();
  }

  async function openReport(r: ReportRow) {
    if (r.file_url) { window.open(r.file_url, "_blank"); return; }
    if (r.storage_path) {
      const { data } = await supabase.storage
        .from("optimization-reports")
        .createSignedUrl(r.storage_path, 60 * 60);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif text-foreground">
            {operatorScopeOnly ? "My Funnel · Living Audit" : "Living Audit · Versioning"}
          </h1>
          <p className="text-muted-foreground mt-1">
            Every change — what, why, impact, and how to revert. Reports remain available as exports.
          </p>
        </div>
        <div className="flex gap-3">
          <StatPill label="Changes" value={stats.total} />
          <StatPill label="Positive" value={stats.pos} tone="positive" />
          <StatPill label="Negative" value={stats.neg} tone="negative" />
        </div>
      </div>

      <AuditFilters value={filters} onChange={setFilters} resultCount={filtered.length} />

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="changes">Changes ({filtered.length})</TabsTrigger>
          <TabsTrigger value="versions">Version Control ({versions.length})</TabsTrigger>
          <TabsTrigger value="exports">Exports (PDF)</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="pt-4">
          <Timeline
            changes={filtered}
            onRollback={rollbackChange}
            canRollback={true}
            busy={busy}
          />
        </TabsContent>

        <TabsContent value="changes" className="pt-4 space-y-3">
          {filtered.length === 0 ? (
            <div className="text-muted-foreground p-10 text-center border border-dashed border-border rounded-2xl">
              No changes match your filters.
            </div>
          ) : (
            filtered.map((c) => (
              <ChangeCard
                key={c.change_id}
                change={c}
                onRollback={rollbackChange}
                canRollback={true}
                busy={busy}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="versions" className="pt-4">
          <VersionTree versions={versions} onRestore={restoreVersion} busy={busy} />
        </TabsContent>

        <TabsContent value="exports" className="pt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-4 w-4" /> Export as PDF
              </CardTitle>
              <CardDescription>
                For compliance, investors, or external reporting only. The Timeline above is the source of truth for daily work.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-xl">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Report type</Label>
                  <Select value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REPORT_TYPES.filter((r) => r !== "rollback").map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Module</Label>
                  <Select value={reportModule || "_none"} onValueChange={(v) => setReportModule(v === "_none" ? "" : v)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— all —</SelectItem>
                      {AUDIT_MODULES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  Scope ID {operatorScopeOnly && "(your funnel)"}
                </Label>
                <Input
                  value={reportScopeId}
                  onChange={(e) => setReportScopeId(e.target.value)}
                  placeholder="leave empty for global"
                  className="h-9"
                />
              </div>
              <Button onClick={generateReport} disabled={busy} className="gap-2">
                <Download className="h-4 w-4" />
                {busy ? "Generating…" : "Generate PDF"}
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Recent exports
            </h3>
            {reports.length === 0 ? (
              <div className="text-muted-foreground p-6 text-center border border-dashed rounded-2xl text-sm">
                No exports yet.
              </div>
            ) : (
              reports.map((r) => (
                <div key={r.id} className="border border-border rounded-xl p-3 flex items-center gap-3">
                  <Badge variant="outline">{r.report_type}</Badge>
                  {r.module && <Badge variant="outline">{r.module}</Badge>}
                  <Badge variant="outline">{r.scope_type}{r.scope_id ? `:${r.scope_id.slice(0, 8)}` : ""}</Badge>
                  <Badge variant={r.status === "ready" ? "default" : "secondary"}>{r.status}</Badge>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                  <Button size="sm" variant="outline" disabled={r.status !== "ready"} onClick={() => openReport(r)}>
                    <Download className="h-3.5 w-3.5 mr-1" /> PDF
                  </Button>
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatPill({ label, value, tone }: { label: string; value: number; tone?: "positive" | "negative" }) {
  const toneClass =
    tone === "positive" ? "text-emerald-600 dark:text-emerald-400" :
    tone === "negative" ? "text-rose-600 dark:text-rose-400" :
    "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-2 text-right">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xl font-medium ${toneClass}`}>{value}</div>
    </div>
  );
}
