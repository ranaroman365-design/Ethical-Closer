import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Plus,
  ShieldAlert,
  Bug,
  Check,
  Database,
} from "lucide-react";
import { toast } from "sonner";

type UtmRow = {
  utm_source: string;
  utm_campaign: string;
  hit_count: number;
  first_seen: string;
  last_seen: string;
  matched_mapping_id: string | null;
  matched_pattern: string | null;
  matched_owner: string | null;
  is_matched: boolean;
  traffic_owner_id: string | null;
  traffic_owner_name: string | null;
  traffic_owner_email: string | null;
  traffic_owner_level: number | null;
  is_eligible: boolean;
};

type MappingRow = {
  mapping_id: string;
  utm_campaign_pattern: string;
  utm_source: string | null;
  owner_user_id: string;
  is_active: boolean;
  match_count: number;
  distinct_campaigns: number;
  last_match_at: string | null;
  traffic_owner_id: string | null;
  traffic_owner_name: string | null;
  traffic_owner_email: string | null;
  traffic_owner_level: number | null;
  is_eligible: boolean;
};

type SuggestionRow = {
  suggested_pattern: string;
  suggested_source: string | null;
  matched_campaigns_count: number;
  total_hits: number;
  example_campaigns: string[];
  first_seen: string;
  last_seen: string;
  conflicts_with_active: boolean;
};

type EligibleOwner = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  current_level: number;
  source: string;
};

type DqSummary = {
  total_attribution_rows: number;
  unassigned_owner_rows: number;
  unassigned_owner_pct: number;
  mappings_total: number;
  mappings_with_ineligible_owner: number;
};

type ConflictRow = {
  id: string;
  utm_campaign: string;
  utm_source: string | null;
  conflict_type: "multi_pattern" | "multi_owner" | "ineligible_owner" | "ambiguous_tiebreak";
  severity: "info" | "warn" | "critical";
  matched_mapping_ids: string[];
  matched_patterns: string[];
  matched_owner_ids: string[];
  chosen_pattern: string | null;
  chosen_owner_id: string | null;
  chosen_owner_name: string | null;
  chosen_owner_email: string | null;
  chosen_owner_level: number | null;
  hit_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  detected_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
};

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "—";

function OwnerCell({
  id,
  name,
  email,
  level,
  eligible,
}: {
  id: string | null;
  name: string | null;
  email: string | null;
  level: number | null;
  eligible: boolean;
}) {
  if (!id) {
    return (
      <Badge variant="destructive" className="gap-1 text-[10px]">
        <ShieldAlert className="h-3 w-3" /> unassigned_owner
      </Badge>
    );
  }
  const display = name || email || "(no profile)";
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2">
            <div className="flex flex-col leading-tight">
              <span className="text-xs font-medium">{display}</span>
              <span className="text-[10px] text-muted-foreground">
                {email ?? "—"} · L{level ?? 0}
              </span>
            </div>
            {!eligible && (
              <Badge variant="destructive" className="text-[10px]">
                ineligible
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <span className="font-mono text-[11px]">{id}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function UtmValidation() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [utms, setUtms] = useState<UtmRow[]>([]);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [eligibleOwners, setEligibleOwners] = useState<EligibleOwner[]>([]);
  const [dq, setDq] = useState<DqSummary | null>(null);
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [conflictsOnlyOpen, setConflictsOnlyOpen] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [defaultOwner, setDefaultOwner] = useState<string>("");
  const [applyingKey, setApplyingKey] = useState<string | null>(null);
  const [bfPreview, setBfPreview] = useState<any[]>([]);
  const [bfSample, setBfSample] = useState<any[]>([]);
  const [bfOnlyUnset, setBfOnlyUnset] = useState(true);
  const [bfBusy, setBfBusy] = useState<"preview" | "dry" | "apply" | null>(null);
  const [bfResult, setBfResult] = useState<any | null>(null);
  const [bfBatchSize, setBfBatchSize] = useState<number>(500);
  const [bfJob, setBfJob] = useState<any | null>(null);
  const [bfJobs, setBfJobs] = useState<any[]>([]);
  const [bfJobBusy, setBfJobBusy] = useState<"start" | "step" | "cancel" | null>(null);

  const loadJobs = async () => {
    const [cur, list] = await Promise.all([
      (supabase.rpc as any)("traffic_owner_backfill_job_status", {}),
      (supabase.rpc as any)("traffic_owner_backfill_job_list", { _limit: 10 }),
    ]);
    if (!cur.error) setBfJob(cur.data ?? null);
    if (!list.error) setBfJobs((list.data as any[]) ?? []);
  };

  const startBatchJob = async () => {
    setBfJobBusy("start");
    try {
      const { data, error } = await (supabase.rpc as any)("traffic_owner_backfill_job_start", {
        _only_unset: bfOnlyUnset,
        _dry_run: false,
        _batch_size: bfBatchSize,
      });
      if (error) throw error;
      toast.success(`Job gestartet (${data})`);
      await loadJobs();
    } catch (e: any) {
      toast.error(e?.message ?? "Job-Start fehlgeschlagen");
    } finally {
      setBfJobBusy(null);
    }
  };

  const stepBatchJob = async (jobId?: string) => {
    setBfJobBusy("step");
    try {
      const { data, error } = await (supabase.rpc as any)("traffic_owner_backfill_job_step", {
        _job_id: jobId ?? null,
      });
      if (error) throw error;
      setBfJob(data);
      toast.success(`Batch verarbeitet (${data?.processed ?? 0}/${data?.total_planned ?? 0})`);
      await loadJobs();
    } catch (e: any) {
      toast.error(e?.message ?? "Batch fehlgeschlagen");
    } finally {
      setBfJobBusy(null);
    }
  };

  const cancelBatchJob = async (jobId: string) => {
    setBfJobBusy("cancel");
    try {
      const { error } = await (supabase.rpc as any)("traffic_owner_backfill_job_cancel", { _job_id: jobId });
      if (error) throw error;
      toast.success("Job abgebrochen");
      await loadJobs();
    } catch (e: any) {
      toast.error(e?.message ?? "Abbruch fehlgeschlagen");
    } finally {
      setBfJobBusy(null);
    }
  };

  const runBackfillPreview = async () => {
    setBfBusy("preview");
    try {
      const [p, s] = await Promise.all([
        (supabase.rpc as any)("traffic_owner_backfill_preview", { _only_unset: bfOnlyUnset }),
        (supabase.rpc as any)("traffic_owner_backfill_sample", { _only_unset: bfOnlyUnset, _limit: 25 }),
      ]);
      if (p.error) throw p.error;
      if (s.error) throw s.error;
      setBfPreview((p.data as any[]) ?? []);
      setBfSample((s.data as any[]) ?? []);
      toast.success("Preview geladen");
    } catch (e: any) {
      toast.error(e?.message ?? "Preview fehlgeschlagen");
    } finally {
      setBfBusy(null);
    }
  };

  const runBackfill = async (dryRun: boolean) => {
    setBfBusy(dryRun ? "dry" : "apply");
    try {
      const { data, error } = await (supabase.rpc as any)("traffic_owner_backfill_apply", {
        _only_unset: bfOnlyUnset,
        _dry_run: dryRun,
        _sample_limit: 10,
      });
      if (error) throw error;
      setBfResult(data);
      toast.success(
        dryRun
          ? `Dry-Run: würde ${data?.planned_updates ?? 0} Lead(s) zuordnen`
          : `Backfill: ${data?.updated_rows ?? 0} Lead(s) aktualisiert`,
      );
      if (!dryRun) await runBackfillPreview();
    } catch (e: any) {
      toast.error(e?.message ?? "Backfill fehlgeschlagen");
    } finally {
      setBfBusy(null);
    }
  };


  const loadConflicts = async (onlyOpen = conflictsOnlyOpen) => {
    const { data, error } = await (supabase.rpc as any)("utm_mapping_conflict_list", {
      _only_open: onlyOpen,
      _limit: 200,
    });
    if (!error) setConflicts((data as ConflictRow[]) ?? []);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [a, b, c, d, e] = await Promise.all([
        (supabase.rpc as any)("utm_validation_stats", { _days: days }),
        (supabase.rpc as any)("utm_mapping_match_counts", { _days: days }),
        (supabase.rpc as any)("utm_mapping_suggestions", { _days: days, _min_hits: 2 }),
        (supabase.rpc as any)("traffic_owner_eligible_list"),
        (supabase.rpc as any)("utm_data_quality_summary", { _days: days }),
      ]);
      if (!a.error) setUtms((a.data as UtmRow[]) ?? []);
      if (!b.error) setMappings((b.data as MappingRow[]) ?? []);
      if (!c.error) setSuggestions((c.data as SuggestionRow[]) ?? []);
      if (!d.error) setEligibleOwners((d.data as EligibleOwner[]) ?? []);
      if (!e.error) setDq(((e.data as DqSummary[]) ?? [])[0] ?? null);
      await loadConflicts();
    } finally {
      setLoading(false);
    }
  };

  const runConflictScan = async () => {
    setScanning(true);
    try {
      const { data, error } = await (supabase.rpc as any)("utm_detect_mapping_conflicts", { _days: days });
      if (error) throw error;
      const r = (data as any[])?.[0];
      toast.success(`Scan: ${r?.conflicts_total ?? 0} Konflikte (${r?.inserted ?? 0} neu, ${r?.refreshed ?? 0} aktualisiert)`);
      await loadConflicts();
    } catch (e: any) {
      toast.error(e?.message ?? "Scan fehlgeschlagen");
    } finally {
      setScanning(false);
    }
  };

  const resolveConflict = async (id: string) => {
    setResolvingId(id);
    try {
      const { error } = await (supabase.rpc as any)("utm_mapping_conflict_resolve", { _id: id, _note: null });
      if (error) throw error;
      toast.success("Konflikt als bereinigt markiert");
      await loadConflicts();
    } catch (e: any) {
      toast.error(e?.message ?? "Konnte nicht auflösen");
    } finally {
      setResolvingId(null);
    }
  };

  const applySuggestion = async (s: SuggestionRow) => {
    if (!defaultOwner) {
      toast.error("Bitte zuerst einen Eligible Owner oben auswählen.");
      return;
    }
    const key = `${s.suggested_pattern}|${s.suggested_source ?? ""}`;
    setApplyingKey(key);
    try {
      const { data, error } = await (supabase.rpc as any)("utm_mapping_apply_suggestion", {
        _pattern: s.suggested_pattern,
        _owner: defaultOwner,
        _source: s.suggested_source,
        _notes: `Auto-suggested · ${s.matched_campaigns_count} campaigns · ${s.total_hits} hits (${days}d)`,
      });
      if (error) throw error;
      toast.success(`Mapping angelegt (${data})`);
      // Self-Check direkt nach dem Anlegen
      try {
        const sc = await (supabase.rpc as any)("mapping_self_check", {
          _mapping_id: data,
          _pattern: null,
          _source: null,
          _days: days,
        });
        const row = (sc.data as any[])?.[0];
        if (row) {
          if (!row.has_match) {
            toast.warning(`Self-Check: 0 Leads getroffen — Pattern »${row.pattern}« matcht keine bestehenden Kampagnen.`);
          } else if (row.is_overbroad) {
            toast.warning(`Self-Check: ${row.matched_campaigns} Kampagnen / ${row.matched_hits} Leads — Pattern evtl. zu generisch.`);
          } else {
            toast.success(`Self-Check OK: ${row.matched_campaigns} Kampagne(n), ${row.matched_hits} Lead(s) zugeordnet.`);
          }
          (row.warnings ?? []).forEach((w: string) => toast.message(w));
        }
      } catch { /* self-check ist informativ */ }
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Konnte Mapping nicht anlegen");
    } finally {
      setApplyingKey(null);
    }
  };

  useEffect(() => {
    load();
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  // Live-Polling während ein Job läuft
  useEffect(() => {
    if (!bfJob || (bfJob.status !== "running" && bfJob.status !== "queued")) return;
    const t = setInterval(() => {
      loadJobs();
    }, 3000);
    return () => clearInterval(t);
  }, [bfJob?.status, bfJob?.id]);

  const totals = useMemo(() => {
    const totalHits = utms.reduce((s, r) => s + Number(r.hit_count), 0);
    const matchedHits = utms
      .filter((r) => r.is_matched && r.is_eligible)
      .reduce((s, r) => s + Number(r.hit_count), 0);
    return {
      totalCombos: utms.length,
      matchedCombos: utms.filter((r) => r.is_matched && r.is_eligible).length,
      totalHits,
      matchedHits,
      matchRate: totalHits ? (matchedHits / totalHits) * 100 : 0,
    };
  }, [utms]);

  const filteredUtms = utms.filter((r) => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (
      r.utm_campaign.toLowerCase().includes(f) ||
      r.utm_source.toLowerCase().includes(f) ||
      (r.matched_pattern ?? "").toLowerCase().includes(f) ||
      (r.traffic_owner_name ?? "").toLowerCase().includes(f) ||
      (r.traffic_owner_email ?? "").toLowerCase().includes(f)
    );
  });

  return (
    <div className="container max-w-7xl py-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">UTM Validation</h1>
          <p className="text-muted-foreground text-sm">
            Eingehender Traffic pro <code>utm_campaign</code> / <code>utm_source</code> · Owner = realer L6+ / Partner / Owner Operator.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={defaultOwner} onValueChange={setDefaultOwner}>
            <SelectTrigger className="w-[320px]">
              <SelectValue placeholder="Eligible Owner für 1-Klick-Apply…" />
            </SelectTrigger>
            <SelectContent>
              {eligibleOwners.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">
                  Keine eligiblen Owner gefunden.<br />
                  Promote auf L6+ oder vergebe partner_admin / owner Rolle.
                </div>
              ) : (
                eligibleOwners.map((o) => (
                  <SelectItem key={o.user_id} value={o.user_id}>
                    <span className="font-medium">{o.full_name || o.email || o.user_id.slice(0, 8)}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {o.email ?? ""} · L{o.current_level} · {o.source}
                    </span>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 30)))}
            className="w-24"
          />
          <span className="text-sm text-muted-foreground">Tage</span>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {dq && (dq.unassigned_owner_pct > 0 || dq.mappings_with_ineligible_owner > 0) && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-destructive shrink-0" />
            <div className="text-sm">
              <span className="font-medium text-destructive">Owner Data-Quality:</span>{" "}
              {dq.unassigned_owner_pct.toFixed(1)}% der Hits ({dq.unassigned_owner_rows.toLocaleString("de-DE")} / {dq.total_attribution_rows.toLocaleString("de-DE")}) haben keinen eligiblen Traffic-Owner ·{" "}
              <span className="font-medium">{dq.mappings_with_ineligible_owner}</span> bestehende Mapping(s) zeigen auf nicht (mehr) eligible Operator.
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">UTM-Kombinationen</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{totals.totalCombos}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Owner-Eligible Kombinationen</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {totals.matchedCombos}
              <span className="text-sm text-muted-foreground ml-2">/ {totals.totalCombos}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Hits gesamt</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{totals.totalHits.toLocaleString("de-DE")}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Owner-Match-Rate</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{totals.matchRate.toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground">{totals.matchedHits.toLocaleString("de-DE")} owner-resolved hits</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="suggestions">
        <TabsList>
          <TabsTrigger value="suggestions" className="gap-1">
            <Sparkles className="h-3.5 w-3.5" /> Vorschläge
            {suggestions.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{suggestions.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="utms">Eingehende UTMs</TabsTrigger>
          <TabsTrigger value="mappings">Mapping-Regeln</TabsTrigger>
          <TabsTrigger value="conflicts" className="gap-1">
            <Bug className="h-3.5 w-3.5" /> Konflikte
            {conflicts.filter((c) => !c.resolved_at).length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">
                {conflicts.filter((c) => !c.resolved_at).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="backfill" className="gap-1">
            <Database className="h-3.5 w-3.5" /> Backfill
          </TabsTrigger>
        </TabsList>

        <TabsContent value="suggestions" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[280px]">Vorgeschlagenes Pattern</TableHead>
                    <TableHead>utm_source</TableHead>
                    <TableHead className="text-right">Hits</TableHead>
                    <TableHead className="text-right">Campaigns</TableHead>
                    <TableHead>Beispiele</TableHead>
                    <TableHead>Zuletzt</TableHead>
                    <TableHead className="text-right">Aktion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suggestions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        {loading ? "Lädt…" : "Keine offenen Vorschläge — alle eingehenden Kampagnen sind gemappt 🎉"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    suggestions.map((s) => {
                      const key = `${s.suggested_pattern}|${s.suggested_source ?? ""}`;
                      const isApplying = applyingKey === key;
                      return (
                        <TableRow key={key}>
                          <TableCell className="font-mono text-xs font-medium">{s.suggested_pattern}</TableCell>
                          <TableCell className="font-mono text-xs">{s.suggested_source ?? "—"}</TableCell>
                          <TableCell className="text-right font-medium">{Number(s.total_hits).toLocaleString("de-DE")}</TableCell>
                          <TableCell className="text-right">{Number(s.matched_campaigns_count)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                            {(s.example_campaigns ?? []).join(", ")}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{fmtDate(s.last_seen)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="default"
                              disabled={isApplying || !defaultOwner}
                              onClick={() => applySuggestion(s)}
                              className="gap-1"
                            >
                              {isApplying ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Plus className="h-3.5 w-3.5" />
                              )}
                              Übernehmen
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            Owner muss ein realer Plattform-User sein (L6+ ODER partner_admin / owner Rolle). Admin-IDs sind ohne eigene Operator-Eligibility ausgeschlossen.
          </p>
        </TabsContent>

        <TabsContent value="utms" className="space-y-4">
          <div className="flex items-center justify-between">
            <Input
              placeholder="Filter campaign / source / pattern / owner…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="max-w-sm"
            />
            <div className="text-xs text-muted-foreground">{filteredUtms.length} Zeilen</div>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>utm_campaign</TableHead>
                    <TableHead>utm_source</TableHead>
                    <TableHead className="text-right">Hits</TableHead>
                    <TableHead>Traffic Owner</TableHead>
                    <TableHead>Matched Pattern</TableHead>
                    <TableHead>Zuletzt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUtms.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        {loading ? "Lädt…" : "Keine Daten im Zeitraum."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUtms.map((r) => (
                      <TableRow key={`${r.utm_source}|${r.utm_campaign}`}>
                        <TableCell>
                          {r.is_matched && r.is_eligible ? (
                            <Badge variant="default" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" /> matched
                            </Badge>
                          ) : r.is_matched && !r.is_eligible ? (
                            <Badge variant="destructive" className="gap-1">
                              <ShieldAlert className="h-3 w-3" /> ineligible_owner
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" /> unmapped
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.utm_campaign}</TableCell>
                        <TableCell className="font-mono text-xs">{r.utm_source}</TableCell>
                        <TableCell className="text-right font-medium">{Number(r.hit_count).toLocaleString("de-DE")}</TableCell>
                        <TableCell>
                          <OwnerCell
                            id={r.traffic_owner_id}
                            name={r.traffic_owner_name}
                            email={r.traffic_owner_email}
                            level={r.traffic_owner_level}
                            eligible={r.is_eligible}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.matched_pattern ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(r.last_seen)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mappings">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Aktiv</TableHead>
                    <TableHead>Pattern</TableHead>
                    <TableHead>utm_source</TableHead>
                    <TableHead>Traffic Owner</TableHead>
                    <TableHead className="text-right">Matches</TableHead>
                    <TableHead className="text-right">Distinct Campaigns</TableHead>
                    <TableHead>Letzter Match</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mappings.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        {loading ? "Lädt…" : "Keine Mapping-Regeln vorhanden."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    mappings.map((r) => (
                      <TableRow key={r.mapping_id}>
                        <TableCell>
                          <Badge variant={r.is_active ? "default" : "secondary"}>
                            {r.is_active ? "an" : "aus"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.utm_campaign_pattern}</TableCell>
                        <TableCell className="font-mono text-xs">{r.utm_source || "—"}</TableCell>
                        <TableCell>
                          <OwnerCell
                            id={r.traffic_owner_id}
                            name={r.traffic_owner_name}
                            email={r.traffic_owner_email}
                            level={r.traffic_owner_level}
                            eligible={r.is_eligible}
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {Number(r.match_count).toLocaleString("de-DE")}
                          {Number(r.match_count) === 0 && (
                            <Badge variant="outline" className="ml-2 text-xs">stale</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{Number(r.distinct_campaigns)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(r.last_match_at)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conflicts" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="default" onClick={runConflictScan} disabled={scanning} className="gap-1">
                {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bug className="h-3.5 w-3.5" />}
                Konflikte jetzt scannen ({days}d)
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const next = !conflictsOnlyOpen;
                  setConflictsOnlyOpen(next);
                  loadConflicts(next);
                }}
              >
                {conflictsOnlyOpen ? "Auch bereinigte zeigen" : "Nur offene zeigen"}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">{conflicts.length} Einträge</div>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Severity</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>utm_campaign</TableHead>
                    <TableHead>utm_source</TableHead>
                    <TableHead>Konkurrierende Patterns</TableHead>
                    <TableHead>Gewählter Owner</TableHead>
                    <TableHead className="text-right">Hits</TableHead>
                    <TableHead>Erkannt</TableHead>
                    <TableHead className="text-right">Aktion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conflicts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        {loading ? "Lädt…" : "Keine Konflikte. Klicke auf »Konflikte jetzt scannen«, um den aktuellen Zeitraum zu prüfen."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    conflicts.map((c) => {
                      const sevVariant: "default" | "destructive" | "secondary" =
                        c.severity === "critical" ? "destructive" : c.severity === "warn" ? "default" : "secondary";
                      return (
                        <TableRow key={c.id} className={c.resolved_at ? "opacity-60" : ""}>
                          <TableCell>
                            <Badge variant={sevVariant} className="uppercase text-[10px]">{c.severity}</Badge>
                          </TableCell>
                          <TableCell className="text-xs font-mono">{c.conflict_type}</TableCell>
                          <TableCell className="font-mono text-xs">{c.utm_campaign}</TableCell>
                          <TableCell className="font-mono text-xs">{c.utm_source ?? "—"}</TableCell>
                          <TableCell className="text-xs space-y-0.5">
                            {(c.matched_patterns ?? []).map((p, i) => (
                              <div key={`${c.id}-p-${i}`} className="font-mono">
                                {i === 0 && <Badge variant="outline" className="mr-1 text-[10px]">chosen</Badge>}
                                {p}
                              </div>
                            ))}
                          </TableCell>
                          <TableCell>
                            <OwnerCell
                              id={c.chosen_owner_id}
                              name={c.chosen_owner_name}
                              email={c.chosen_owner_email}
                              level={c.chosen_owner_level}
                              eligible={c.conflict_type !== "ineligible_owner"}
                            />
                            {(c.matched_owner_ids ?? []).length > 1 && (
                              <div className="text-[10px] text-muted-foreground mt-1">
                                + {c.matched_owner_ids.length - 1} weitere Owner im Konflikt
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium">{Number(c.hit_count).toLocaleString("de-DE")}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{fmtDate(c.detected_at)}</TableCell>
                          <TableCell className="text-right">
                            {c.resolved_at ? (
                              <Badge variant="secondary" className="gap-1 text-[10px]">
                                <Check className="h-3 w-3" /> resolved
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={resolvingId === c.id}
                                onClick={() => resolveConflict(c.id)}
                                className="gap-1"
                              >
                                {resolvingId === c.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                                Bereinigt
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            <strong>multi_owner</strong> = mehrere Patterns matchen mit unterschiedlichen Ownern (höchste Priorität). <strong>ambiguous_tiebreak</strong> = mehrere gleich lange Patterns (Tie-Break-Lotterie). <strong>multi_pattern</strong> = mehrere aktive Patterns, gleiche Owner-Konsens. <strong>ineligible_owner</strong> = gewählter Owner ist nicht (mehr) L6+/Partner/Owner. Tagesidempotent — wiederholte Scans aktualisieren bestehende offene Einträge.
          </p>
        </TabsContent>

        <TabsContent value="backfill" className="space-y-4">
          <Card>
            <CardContent className="py-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBfOnlyUnset((v) => !v)}
                >
                  {bfOnlyUnset ? "Scope: nur Leads ohne Owner" : "Scope: ALLE Leads (Re-Assignment)"}
                </Button>
                <Button size="sm" onClick={runBackfillPreview} disabled={!!bfBusy}>
                  {bfBusy === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Preview laden
                </Button>
                <Button size="sm" variant="secondary" onClick={() => runBackfill(true)} disabled={!!bfBusy}>
                  {bfBusy === "dry" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Dry-Run
                </Button>
                <Button size="sm" variant="default" onClick={() => runBackfill(false)} disabled={!!bfBusy}>
                  {bfBusy === "apply" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Backfill anwenden
                </Button>
              </div>
              {bfResult && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2 text-sm">
                  <div className="rounded border p-2">
                    <div className="text-xs text-muted-foreground">unset davor</div>
                    <div className="text-lg font-semibold">{Number(bfResult.leads_unset_before).toLocaleString("de-DE")}</div>
                  </div>
                  <div className="rounded border p-2">
                    <div className="text-xs text-muted-foreground">unset danach</div>
                    <div className="text-lg font-semibold">{Number(bfResult.leads_unset_after).toLocaleString("de-DE")}</div>
                  </div>
                  <div className="rounded border p-2">
                    <div className="text-xs text-muted-foreground">geplant</div>
                    <div className="text-lg font-semibold">{Number(bfResult.planned_updates).toLocaleString("de-DE")}</div>
                  </div>
                  <div className="rounded border p-2">
                    <div className="text-xs text-muted-foreground">aktualisiert</div>
                    <div className="text-lg font-semibold">{Number(bfResult.updated_rows).toLocaleString("de-DE")}</div>
                    {bfResult.dry_run && <Badge variant="secondary" className="text-[10px]">dry-run</Badge>}
                  </div>
                  <div className="rounded border p-2">
                    <div className="text-xs text-muted-foreground">übersprungen (ineligible)</div>
                    <div className="text-lg font-semibold">{Number(bfResult.skipped_ineligible_owner).toLocaleString("de-DE")}</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Batch-Job mit Fortschrittsstatus */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Batch-Job (timeout-sicher, mit Fortschritt)</CardTitle>
              <Button size="sm" variant="ghost" onClick={loadJobs} disabled={!!bfJobBusy}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end gap-2 flex-wrap">
                <div className="flex flex-col">
                  <label className="text-[11px] text-muted-foreground">Batch-Größe</label>
                  <Input
                    type="number"
                    min={50}
                    max={5000}
                    step={50}
                    value={bfBatchSize}
                    onChange={(e) => setBfBatchSize(Math.max(50, Math.min(5000, Number(e.target.value) || 500)))}
                    className="w-28 h-8"
                  />
                </div>
                <Button
                  size="sm"
                  variant="default"
                  onClick={startBatchJob}
                  disabled={!!bfJobBusy || (bfJob && ["queued","running","paused"].includes(bfJob.status))}
                >
                  {bfJobBusy === "start" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Batch-Job starten
                </Button>
                {bfJob && bfJob.status === "running" && (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => stepBatchJob(bfJob.id)} disabled={!!bfJobBusy}>
                      {bfJobBusy === "step" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                      Nächsten Batch jetzt
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => cancelBatchJob(bfJob.id)} disabled={!!bfJobBusy}>
                      Abbrechen
                    </Button>
                  </>
                )}
                <span className="text-[11px] text-muted-foreground">
                  Worker läuft im Hintergrund alle ~60 s und verarbeitet je einen Batch.
                </span>
              </div>

              {bfJob && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <Badge variant={
                      bfJob.status === "running" ? "default" :
                      bfJob.status === "done" ? "secondary" :
                      bfJob.status === "failed" ? "destructive" :
                      bfJob.status === "cancelled" ? "outline" : "outline"
                    }>
                      {bfJob.status}
                    </Badge>
                    <span className="font-mono text-[10px] text-muted-foreground">{bfJob.id}</span>
                    {bfJob.dry_run && <Badge variant="outline" className="text-[10px]">dry-run</Badge>}
                    <span className="text-muted-foreground">
                      Scope: {bfJob.only_unset ? "nur unset" : "alle Leads"} · Batch: {bfJob.batch_size}
                    </span>
                  </div>

                  {/* Progress bar */}
                  {(() => {
                    const total = Math.max(1, Number(bfJob.total_planned) || 0);
                    const done = Math.min(total, Number(bfJob.processed) || 0);
                    const pct = Math.round((done / total) * 100);
                    return (
                      <div>
                        <div className="h-2 w-full rounded bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          {Number(bfJob.processed).toLocaleString("de-DE")} / {Number(bfJob.total_planned).toLocaleString("de-DE")} ({pct}%)
                        </div>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <div className="rounded border p-2">
                      <div className="text-xs text-muted-foreground">aktualisiert</div>
                      <div className="font-semibold">{Number(bfJob.updated).toLocaleString("de-DE")}</div>
                    </div>
                    <div className="rounded border p-2">
                      <div className="text-xs text-muted-foreground">übersprungen (ineligible)</div>
                      <div className="font-semibold">{Number(bfJob.skipped_ineligible).toLocaleString("de-DE")}</div>
                    </div>
                    <div className="rounded border p-2">
                      <div className="text-xs text-muted-foreground">letzter Fortschritt</div>
                      <div className="text-xs">{bfJob.last_progress_at ? new Date(bfJob.last_progress_at).toLocaleString("de-DE") : "—"}</div>
                    </div>
                    <div className="rounded border p-2">
                      <div className="text-xs text-muted-foreground">Cursor (last_lead_id)</div>
                      <div className="font-mono text-[10px] truncate">{bfJob.last_lead_id ?? "—"}</div>
                    </div>
                  </div>

                  {bfJob.error_message && (
                    <div className="text-xs text-destructive border border-destructive/30 rounded p-2">
                      {bfJob.error_message}
                    </div>
                  )}
                </div>
              )}

              {bfJobs.length > 1 && (
                <div className="pt-2">
                  <div className="text-xs text-muted-foreground mb-1">Letzte Jobs</div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Scope</TableHead>
                        <TableHead className="text-right">processed</TableHead>
                        <TableHead className="text-right">updated</TableHead>
                        <TableHead className="text-right">planned</TableHead>
                        <TableHead>gestartet</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bfJobs.map((j) => (
                        <TableRow key={j.id}>
                          <TableCell>
                            <Badge variant={
                              j.status === "running" ? "default" :
                              j.status === "done" ? "secondary" :
                              j.status === "failed" ? "destructive" : "outline"
                            } className="text-[10px]">{j.status}</Badge>
                            {j.dry_run && <Badge variant="outline" className="text-[10px] ml-1">dry</Badge>}
                          </TableCell>
                          <TableCell className="text-xs">{j.only_unset ? "unset" : "all"}</TableCell>
                          <TableCell className="text-right text-xs">{Number(j.processed).toLocaleString("de-DE")}</TableCell>
                          <TableCell className="text-right text-xs">{Number(j.updated).toLocaleString("de-DE")}</TableCell>
                          <TableCell className="text-right text-xs">{Number(j.total_planned).toLocaleString("de-DE")}</TableCell>
                          <TableCell className="text-xs">{j.started_at ? new Date(j.started_at).toLocaleString("de-DE") : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Preview pro Owner ({bfOnlyUnset ? "nur unset" : "alle Leads"})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Resolved Owner</TableHead>
                    <TableHead className="text-right">Würde zugeordnet</TableHead>
                    <TableHead className="text-right">Bereits korrekt</TableHead>
                    <TableHead className="text-right">Ohne Match</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bfPreview.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        Klicke »Preview laden«.
                      </TableCell>
                    </TableRow>
                  ) : (
                    bfPreview.map((r, i) => (
                      <TableRow key={`${r.resolved_owner ?? "null"}-${i}`}>
                        <TableCell>
                          <OwnerCell
                            id={r.resolved_owner}
                            name={r.owner_name}
                            email={r.owner_email}
                            level={r.owner_level}
                            eligible={!!r.is_eligible}
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium">{Number(r.leads_to_update).toLocaleString("de-DE")}</TableCell>
                        <TableCell className="text-right">{Number(r.leads_already_correct).toLocaleString("de-DE")}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{Number(r.leads_unmatched).toLocaleString("de-DE")}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Stichprobe lead_id → resolved owner (max 25)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>lead_id</TableHead>
                    <TableHead>utm_campaign</TableHead>
                    <TableHead>matched pattern</TableHead>
                    <TableHead>resolved owner</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bfSample.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">—</TableCell>
                    </TableRow>
                  ) : (
                    bfSample.map((r) => (
                      <TableRow key={r.lead_id}>
                        <TableCell className="font-mono text-[11px]">{r.lead_id}</TableCell>
                        <TableCell className="font-mono text-xs">{r.utm_campaign}</TableCell>
                        <TableCell className="font-mono text-xs">{r.matched_pattern}</TableCell>
                        <TableCell>
                          <OwnerCell
                            id={r.resolved_owner}
                            name={r.resolved_owner_name}
                            email={r.resolved_owner_email}
                            level={r.resolved_owner_level}
                            eligible={true}
                          />
                        </TableCell>
                        <TableCell>
                          {r.needs_change ? (
                            <Badge variant="default" className="text-[10px]">would_update</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">already_correct</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {bfResult?.sample_after && Array.isArray(bfResult.sample_after) && bfResult.sample_after.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Stichprobe nach Backfill (zuletzt zugeordnete Leads)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>lead_id</TableHead>
                      <TableHead>traffic_owner</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bfResult.sample_after.map((r: any) => (
                      <TableRow key={r.lead_id}>
                        <TableCell className="font-mono text-[11px]">{r.lead_id}</TableCell>
                        <TableCell>
                          <OwnerCell
                            id={r.traffic_owner}
                            name={r.owner_name}
                            email={r.owner_email}
                            level={r.owner_level}
                            eligible={true}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <p className="text-xs text-muted-foreground">
            Backfill ordnet ausschließlich auf <strong>eligible</strong> Owner (L6+ / Partner / Owner) zu. Ineligible Mappings werden übersprungen und im Counter ausgewiesen — Admin-IDs werden niemals als Fallback gesetzt.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
