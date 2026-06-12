/**
 * Rollback Preflight Panel — verifies that backups + CSV manifest are present
 * and audit is fresh BEFORE any future hard-delete cleanup is allowed.
 *
 * Pure read. Calls RPC `preflight_cleanup_check` (admin-only, SECURITY DEFINER).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, ShieldAlert, RefreshCw, Clock, Database } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

type TableCheck = {
  table: string;
  backup_table: string;
  backup_exists: boolean;
  backup_rows: number | null;
  live_rows: number | null;
  backup_covers_live: boolean;
  csv_path: string;
  csv_exists: boolean;
  csv_size: number;
  status: "pass" | "fail";
  issues: string[];
};

type Preflight = {
  ok: boolean;
  error?: string;
  checked_at: string;
  audit: {
    ran_at: string;
    cutoff: string;
    age_hours: number;
    max_age_hours: number;
    fresh: boolean;
  } | null;
  tables: TableCheck[];
  summary: { total: number; passing: number; failing: number };
};

const ISSUE_LABELS: Record<string, string> = {
  backup_table_missing: "Backup-Tabelle fehlt",
  csv_missing: "CSV nicht in Storage",
  csv_empty: "CSV ist 0 Bytes",
};

export function CleanupPreflightPanel() {
  const [data, setData] = useState<Preflight | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    const { data: res, error } = await supabase.rpc("preflight_cleanup_check" as any, {});
    if (error) {
      setData({
        ok: false,
        error: error.message,
        checked_at: new Date().toISOString(),
        audit: null,
        tables: [],
        summary: { total: 0, passing: 0, failing: 0 },
      });
    } else {
      setData(res as Preflight);
    }
    setLoading(false);
  };

  useEffect(() => {
    run();
  }, []);

  return (
    <Card className="border-2">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="font-serif text-xl flex items-center gap-2">
          {data?.ok ? (
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
          ) : (
            <ShieldAlert className="h-5 w-5 text-destructive" />
          )}
          Rollback-Check
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={run} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
          Erneut prüfen
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {!data && loading && <Skeleton className="h-20 w-full" />}

        {data?.error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {data.error === "forbidden_admin_only"
              ? "Nur Administratoren können den Rollback-Check ausführen."
              : data.error}
          </div>
        )}

        {data && !data.error && (
          <>
            {/* Verdict banner */}
            <div
              className={`rounded-xl border p-4 flex items-start gap-3 ${
                data.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-destructive/30 bg-destructive/5 text-destructive"
              }`}
            >
              {data.ok ? (
                <ShieldCheck className="h-5 w-5 mt-0.5 shrink-0" />
              ) : (
                <ShieldAlert className="h-5 w-5 mt-0.5 shrink-0" />
              )}
              <div>
                <div className="font-medium">
                  {data.ok
                    ? "Hard-Delete sicher: Backups + CSV vollständig, Audit frisch."
                    : "Hard-Delete BLOCKIERT: Rollback-Voraussetzungen nicht erfüllt."}
                </div>
                <div className="text-xs opacity-80 mt-0.5">
                  {data.summary.passing} / {data.summary.total} Tabellen OK ·{" "}
                  geprüft{" "}
                  {formatDistanceToNow(new Date(data.checked_at), { addSuffix: true, locale: de })}
                </div>
              </div>
            </div>

            {/* Audit row */}
            {data.audit && (
              <div className="rounded-lg border bg-muted/30 p-3 flex items-center gap-3 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <span className="text-muted-foreground">Letzter Cleanup:</span>{" "}
                  <span className="font-medium">
                    {format(new Date(data.audit.ran_at), "d. MMM yyyy · HH:mm", { locale: de })}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    (Cutoff {data.audit.cutoff} · {Math.round(data.audit.age_hours)}h alt /{" "}
                    max {data.audit.max_age_hours}h)
                  </span>
                </div>
                <Badge variant={data.audit.fresh ? "secondary" : "destructive"}>
                  {data.audit.fresh ? "frisch" : "veraltet"}
                </Badge>
              </div>
            )}

            {/* Per-table */}
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Tabelle</th>
                    <th className="px-3 py-2 font-medium text-right">Backup-Rows</th>
                    <th className="px-3 py-2 font-medium text-right">Live</th>
                    <th className="px-3 py-2 font-medium text-right">CSV</th>
                    <th className="px-3 py-2 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tables.map((t) => (
                    <tr key={t.table} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <div className="font-mono text-xs flex items-center gap-1.5">
                          <Database className="h-3 w-3 text-muted-foreground" />
                          {t.table}
                        </div>
                        {t.issues.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {t.issues.map((iss) => (
                              <Badge key={iss} variant="destructive" className="text-[10px] font-normal">
                                {ISSUE_LABELS[iss] ?? iss}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">
                        {t.backup_rows?.toLocaleString("de-DE") ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">
                        {t.live_rows?.toLocaleString("de-DE") ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">
                        {t.csv_exists ? `${(t.csv_size / 1024).toFixed(1)} KB` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Badge
                          variant={t.status === "pass" ? "secondary" : "destructive"}
                          className="text-[10px]"
                        >
                          {t.status.toUpperCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Dieser Check muss vor jedem zukünftigen Hard-Delete <strong>grün</strong> sein.
              Geprüft: Backup-Tabelle existiert, Backup ≥ Live-Zeilen (kein stiller Verlust),
              CSV in Storage vorhanden &amp; nicht leer, Audit-Eintrag innerhalb des Frische-Fensters.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
