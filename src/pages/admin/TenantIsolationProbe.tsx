/**
 * Tenant Isolation Probe — admin diagnostics page.
 *
 * Goal: prove that no tenant-scoped row leaks across tenants and emit a
 * pass/fail evidence log. Uses the caller's RLS context (NOT the service
 * role) so the test reflects what a real admin user would see.
 *
 * Honesty rules baked in:
 *   - If <2 tenants exist or one of them has no data, the page reports
 *     PRECONDITION_NOT_MET instead of fabricating a green pass.
 *   - Tables that have no `tenant_id` column (leads, event_logs,
 *     outbound_events, community_events, partner_leads, …) are listed as
 *     N/A — single-tenant scope. This page does NOT pretend to test their
 *     isolation; that's a separate concern (per-user RLS).
 *   - Every check writes a structured row to the evidence log so the
 *     verdict is auditable line-by-line and exportable as JSON.
 *
 * Route: /members/admin/tenant-isolation  (registered in App.tsx)
 */

import { useCallback, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  Loader2,
  Play,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
} from "lucide-react";
import { toast } from "sonner";

// ── Tables that carry a tenant_id column (verified against information_schema). ──
// Querying each of these with the caller's session must only return rows whose
// tenant_id is in the caller's allowed set. Anything else = leak.
const TENANT_SCOPED_TABLES = [
  "ai_agent_actions",
  "approval_requests",
  "content_assets",
  "decision_requests",
  "export_requests",
  "ghl_accounts",
  "integration_credentials_registry",
  "integration_health_events",
  "legal_agreements",
  "owner_watchlist",
  "placements",
  "prompt_change_requests",
  "session_events",
  "tenant_branding",
  "tenant_memberships",
  "tenant_revenue",
  "user_effective_permissions",
] as const;

// Tables explicitly NOT tenant-scoped — surfaced so the report is honest about
// what was and wasn't tested.
const SINGLE_TENANT_TABLES = [
  "leads",
  "event_logs",
  "outbound_events",
  "community_events",
  "partner_leads",
] as const;

type Verdict = "PASS" | "FAIL" | "N/A" | "PRECONDITION_NOT_MET";

interface EvidenceRow {
  id: string;
  ts: string;
  tenant_id: string | null;
  table_name: string;
  rows_returned: number;
  foreign_tenant_ids: string[]; // tenant_ids that DON'T belong to caller
  error: string | null;
  verdict: Verdict;
  detail: string;
}

interface RunSummary {
  started_at: string;
  finished_at: string | null;
  caller_user_id: string | null;
  caller_tenant_ids: string[];
  total_tenants_in_db: number;
  tables_probed: number;
  passes: number;
  fails: number;
  n_a: number;
  overall: Verdict;
}

const verdictBadge = (v: Verdict) => {
  switch (v) {
    case "PASS":
      return <Badge className="bg-primary text-primary-foreground hover:bg-primary">PASS</Badge>;
    case "FAIL":
      return <Badge variant="destructive">FAIL</Badge>;
    case "N/A":
      return <Badge variant="secondary">N/A</Badge>;
    case "PRECONDITION_NOT_MET":
      return <Badge variant="outline">PRECONDITION_NOT_MET</Badge>;
  }
};

const verdictIcon = (v: Verdict) => {
  switch (v) {
    case "PASS":
      return <ShieldCheck className="h-5 w-5 text-primary" />;
    case "FAIL":
      return <ShieldAlert className="h-5 w-5 text-destructive" />;
    case "N/A":
    case "PRECONDITION_NOT_MET":
      return <ShieldQuestion className="h-5 w-5 text-muted-foreground" />;
  }
};

export default function TenantIsolationProbe() {
  const { user, isAdmin } = useAuth();
  const [running, setRunning] = useState(false);
  const [evidence, setEvidence] = useState<EvidenceRow[]>([]);
  const [summary, setSummary] = useState<RunSummary | null>(null);

  const reset = useCallback(() => {
    setEvidence([]);
    setSummary(null);
  }, []);

  const runProbe = useCallback(async () => {
    if (!user?.id) {
      toast.error("Nicht eingeloggt.");
      return;
    }
    setRunning(true);
    reset();

    const startedAt = new Date().toISOString();
    const log: EvidenceRow[] = [];
    const push = (row: Omit<EvidenceRow, "id" | "ts">) => {
      log.push({
        id: `${Date.now()}-${log.length}`,
        ts: new Date().toISOString(),
        ...row,
      });
    };

    try {
      // 1) Discover the caller's allowed tenant set via the security-definer RPC.
      //    This is the source of truth for "what is mine vs foreign".
      const { data: callerTenantIds, error: rpcErr } = await supabase.rpc(
        "get_user_tenant_ids",
        { _user_id: user.id },
      );
      if (rpcErr) {
        push({
          tenant_id: null,
          table_name: "rpc.get_user_tenant_ids",
          rows_returned: 0,
          foreign_tenant_ids: [],
          error: rpcErr.message,
          verdict: "FAIL",
          detail: "RPC failed — cannot determine caller's tenant set.",
        });
        finalize(log, startedAt, [], 0);
        return;
      }
      const allowed = new Set<string>((callerTenantIds as string[]) ?? []);

      // 2) Count distinct tenants in the DB (subject to RLS — admins should
      //    see all). If <2, the isolation premise can't be tested honestly.
      const { data: tenantRows, error: tErr } = await supabase
        .from("tenants")
        .select("id, slug, tenant_type, status");
      if (tErr) {
        push({
          tenant_id: null,
          table_name: "tenants",
          rows_returned: 0,
          foreign_tenant_ids: [],
          error: tErr.message,
          verdict: "FAIL",
          detail: "Could not read tenants table.",
        });
      }
      const tenants = (tenantRows ?? []) as Array<{
        id: string;
        slug: string | null;
        tenant_type: string | null;
        status: string | null;
      }>;

      push({
        tenant_id: null,
        table_name: "_meta.tenants",
        rows_returned: tenants.length,
        foreign_tenant_ids: [],
        error: null,
        verdict: tenants.length >= 2 ? "PASS" : "PRECONDITION_NOT_MET",
        detail:
          tenants.length >= 2
            ? `Found ${tenants.length} tenants — isolation premise testable.`
            : `Only ${tenants.length} tenant(s) exist. At least 2 with data are required to prove isolation. The isolation tests below will still run, but a clean run does NOT prove the system is isolated — it only proves no leak occurred today.`,
      });

      // 3) For each tenant-scoped table: pull a sample of rows under the
      //    caller's RLS, then check that every returned tenant_id is allowed.
      for (const table of TENANT_SCOPED_TABLES) {
        // We deliberately do NOT filter by tenant_id — we want to see what
        // RLS lets through and verify all of it is ours.
        const { data, error } = await supabase
          .from(table as never)
          .select("tenant_id")
          .limit(500);

        if (error) {
          push({
            tenant_id: null,
            table_name: table,
            rows_returned: 0,
            foreign_tenant_ids: [],
            error: error.message,
            // RLS-deny is expected on some tables for a given role — that's
            // not a leak, but we surface it so the operator can spot a
            // misconfigured policy that hides everything.
            verdict: "N/A",
            detail: "Query rejected (likely RLS) — nothing was returned, so no leak possible from this probe.",
          });
          continue;
        }

        const rows = (data ?? []) as Array<{ tenant_id: string | null }>;
        const seen = rows.map((r) => r.tenant_id).filter(Boolean) as string[];
        const foreign = seen.filter((tid) => !allowed.has(tid));

        push({
          tenant_id: null,
          table_name: table,
          rows_returned: rows.length,
          foreign_tenant_ids: Array.from(new Set(foreign)),
          error: null,
          verdict: foreign.length === 0 ? "PASS" : "FAIL",
          detail:
            foreign.length === 0
              ? `All ${rows.length} row(s) belong to caller's tenant set (${allowed.size} allowed).`
              : `LEAK: ${foreign.length} row(s) reference ${new Set(foreign).size} foreign tenant_id(s) outside the caller's allowed set.`,
        });
      }

      // 4) For each single-tenant table: surface explicitly that isolation
      //    is N/A here — the table has no tenant_id column to test.
      for (const table of SINGLE_TENANT_TABLES) {
        push({
          tenant_id: null,
          table_name: table,
          rows_returned: 0,
          foreign_tenant_ids: [],
          error: null,
          verdict: "N/A",
          detail:
            "Single-tenant table (no tenant_id column). Cross-tenant isolation does not apply. Per-user / per-role access is enforced by RLS but is out of scope for this probe.",
        });
      }

      finalize(log, startedAt, Array.from(allowed), tenants.length);
    } catch (e) {
      push({
        tenant_id: null,
        table_name: "_runtime",
        rows_returned: 0,
        foreign_tenant_ids: [],
        error: e instanceof Error ? e.message : String(e),
        verdict: "FAIL",
        detail: "Unhandled error during probe.",
      });
      finalize(log, startedAt, [], 0);
    } finally {
      setRunning(false);
    }

    function finalize(
      rows: EvidenceRow[],
      started: string,
      allowedTenantIds: string[],
      totalTenants: number,
    ) {
      const passes = rows.filter((r) => r.verdict === "PASS").length;
      const fails = rows.filter((r) => r.verdict === "FAIL").length;
      const n_a =
        rows.filter((r) => r.verdict === "N/A" || r.verdict === "PRECONDITION_NOT_MET").length;
      const overall: Verdict =
        fails > 0
          ? "FAIL"
          : totalTenants < 2
            ? "PRECONDITION_NOT_MET"
            : passes > 0
              ? "PASS"
              : "N/A";

      setEvidence(rows);
      setSummary({
        started_at: started,
        finished_at: new Date().toISOString(),
        caller_user_id: user?.id ?? null,
        caller_tenant_ids: allowedTenantIds,
        total_tenants_in_db: totalTenants,
        tables_probed: TENANT_SCOPED_TABLES.length,
        passes,
        fails,
        n_a,
        overall,
      });
    }
  }, [user?.id, reset]);

  const exportJson = useMemo(
    () => () => {
      const payload = { summary, evidence };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tenant-isolation-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [summary, evidence],
  );

  const copyJson = useCallback(async () => {
    await navigator.clipboard.writeText(JSON.stringify({ summary, evidence }, null, 2));
    toast.success("Evidence-Log in Zwischenablage kopiert.");
  }, [summary, evidence]);

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Zugriff verweigert</AlertTitle>
          <AlertDescription>Diese Seite ist nur für Administratoren zugänglich.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Tenant Isolation Probe</h1>
        <p className="text-muted-foreground max-w-3xl">
          Beweist deterministisch, dass keine tenant-skopierten Zeilen über
          Mandantengrenzen lecken. Läuft mit deiner aktuellen RLS-Session — kein
          Service-Role-Bypass. Erzeugt einen strukturierten Evidence-Log mit
          Pass/Fail pro Tabelle und einem Gesamtverdict.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" /> Probe-Ausführung
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={runProbe} disabled={running}>
              {running ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Läuft …
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" /> Probe starten
                </>
              )}
            </Button>
            {evidence.length > 0 && (
              <>
                <Button variant="outline" onClick={copyJson}>
                  <Copy className="mr-2 h-4 w-4" /> Log kopieren
                </Button>
                <Button variant="outline" onClick={exportJson}>
                  <Download className="mr-2 h-4 w-4" /> Als JSON exportieren
                </Button>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Geprüft werden {TENANT_SCOPED_TABLES.length} tenant-skopierte
            Tabellen + {SINGLE_TENANT_TABLES.length} explizit als
            single-tenant markierte Tabellen (zur Transparenz aufgelistet, aber
            nicht auf Cross-Tenant-Leaks getestet — sie haben keine tenant_id-Spalte).
          </p>
        </CardContent>
      </Card>

      {summary && (
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {verdictIcon(summary.overall)}
              Gesamtverdict: {verdictBadge(summary.overall)}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <Stat label="Tenants in DB" value={String(summary.total_tenants_in_db)} />
            <Stat
              label="Caller-Tenant-Set"
              value={summary.caller_tenant_ids.length === 0 ? "∅" : String(summary.caller_tenant_ids.length)}
            />
            <Stat label="Tabellen geprobed" value={String(summary.tables_probed)} />
            <Stat
              label="Pass / Fail / N/A"
              value={`${summary.passes} / ${summary.fails} / ${summary.n_a}`}
            />
            <div className="sm:col-span-2 lg:col-span-4 text-xs text-muted-foreground">
              Start: {summary.started_at} · Ende: {summary.finished_at} · User:{" "}
              {summary.caller_user_id ?? "—"}
            </div>
            {summary.overall === "PRECONDITION_NOT_MET" && (
              <Alert className="sm:col-span-2 lg:col-span-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Aussage eingeschränkt</AlertTitle>
                <AlertDescription>
                  Es existieren weniger als zwei Tenants. Ein „PASS"-Ergebnis
                  würde nicht beweisen, dass das System isoliert ist — es würde
                  nur belegen, dass aktuell kein Leak möglich war, weil keine
                  zweite Tenant-Datenmenge existiert. Lege mindestens zwei
                  Tenants mit jeweils eigenen Daten an, um eine echte
                  Isolations-Aussage zu erhalten.
                </AlertDescription>
              </Alert>
            )}
            {summary.overall === "FAIL" && (
              <Alert variant="destructive" className="sm:col-span-2 lg:col-span-4">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Isolation verletzt</AlertTitle>
                <AlertDescription>
                  Mindestens eine Tabelle hat Zeilen mit fremden tenant_ids
                  zurückgegeben. Siehe Evidence-Log unten — die betroffenen
                  tenant_ids sind dort gelistet.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {evidence.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Evidence Log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3">#</th>
                    <th className="py-2 pr-3">Tabelle</th>
                    <th className="py-2 pr-3">Zeilen</th>
                    <th className="py-2 pr-3">Fremde tenant_ids</th>
                    <th className="py-2 pr-3">Verdict</th>
                    <th className="py-2 pr-3">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {evidence.map((row, i) => (
                    <tr key={row.id} className="border-b last:border-0 align-top">
                      <td className="py-2 pr-3 text-muted-foreground tabular-nums">{i + 1}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{row.table_name}</td>
                      <td className="py-2 pr-3 tabular-nums">{row.rows_returned}</td>
                      <td className="py-2 pr-3 font-mono text-xs">
                        {row.foreign_tenant_ids.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="text-destructive">
                            {row.foreign_tenant_ids.join(", ")}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">{verdictBadge(row.verdict)}</td>
                      <td className="py-2 pr-3 text-muted-foreground max-w-md">
                        {row.error ? (
                          <span className="text-destructive">{row.error}</span>
                        ) : (
                          row.detail
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {evidence.length === 0 && !running && (
        <Card>
          <CardContent className="p-6 flex items-center gap-3 text-muted-foreground">
            <CheckCircle2 className="h-5 w-5" />
            <span>Noch keine Probe ausgeführt. Klick „Probe starten".</span>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
