/**
 * Cleanup Report — Hard Reset 2026-04-29 (Cutoff 2026-04-26)
 * Admin-only. Pure read over `*_backup_20260429` snapshot tables.
 * Lists before/after row counts per table + downloadable CSV exports.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Download, AlertCircle, Database } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { CleanupPreflightPanel } from "@/components/admin/CleanupPreflightPanel";

type Row = { tbl: string; before_cnt: number; after_cnt: number; deleted: number; csv: string };

const TABLES = [
  "leads",
  "appointments",
  "calls",
  "call_analysis",
  "call_outcomes",
  "quiz_submissions",
  "quiz_attempts",
  "lead_assignments",
  "lead_events",
  "lead_transitions",
  "wa_messages",
  "wa_conversations",
  "twilio_message_logs",
  "community_messages",
  "direct_messages",
];

export default function CleanupReport() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [audit, setAudit] = useState<{ ran_at: string; cutoff: string; notes: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: a } = await supabase
          .from("cleanup_audit" as any)
          .select("ran_at, cutoff, notes")
          .order("ran_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (a) setAudit(a as any);

        // Build per-table counts via parallel head-only queries
        const results = await Promise.all(
          TABLES.map(async (tbl) => {
            const before = await supabase
              .from(`${tbl}_backup_20260429` as any)
              .select("*", { count: "exact", head: true });
            const after = await supabase
              .from(tbl as any)
              .select("*", { count: "exact", head: true });
            const b = before.count ?? 0;
            const af = after.count ?? 0;
            return {
              tbl,
              before_cnt: b,
              after_cnt: af,
              deleted: b - af,
              csv: `${tbl}_pre_cleanup.csv`,
            } as Row;
          })
        );
        results.sort((x, y) => y.deleted - x.deleted);
        setRows(results);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    })();
  }, []);

  const totalDeleted = rows?.reduce((s, r) => s + Math.max(0, r.deleted), 0) ?? 0;
  const totalBefore = rows?.reduce((s, r) => s + r.before_cnt, 0) ?? 0;
  const totalAfter = rows?.reduce((s, r) => s + r.after_cnt, 0) ?? 0;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
      <div>
        <h1 className="font-serif text-3xl tracking-tight">Cleanup-Report</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Hard Reset · Cutoff{" "}
          {audit?.cutoff ? format(new Date(audit.cutoff), "d. MMMM yyyy", { locale: de }) : "—"} ·
          ausgeführt{" "}
          {audit?.ran_at
            ? format(new Date(audit.ran_at), "d. MMMM yyyy 'um' HH:mm", { locale: de })
            : "—"}
        </p>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 flex gap-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            {error}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Zeilen vorher" value={totalBefore} />
        <Stat label="Zeilen nachher" value={totalAfter} />
        <Stat label="Gelöscht" value={totalDeleted} accent />
      </div>

      <CleanupPreflightPanel />

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl flex items-center gap-2">
            <Database className="h-4 w-4" /> Tabellen-Übersicht & CSV-Backups
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!rows ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Tabelle</th>
                    <th className="px-4 py-3 font-medium text-right">Vorher</th>
                    <th className="px-4 py-3 font-medium text-right">Nachher</th>
                    <th className="px-4 py-3 font-medium text-right">Δ</th>
                    <th className="px-4 py-3 font-medium text-right">CSV-Backup</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const diff = r.deleted;
                    const tone =
                      diff > 0 ? "text-foreground" : diff < 0 ? "text-amber-600" : "text-muted-foreground";
                    return (
                      <tr key={r.tbl} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-3 font-mono text-xs">{r.tbl}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{r.before_cnt.toLocaleString("de-DE")}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{r.after_cnt.toLocaleString("de-DE")}</td>
                        <td className={`px-4 py-3 text-right tabular-nums font-medium ${tone}`}>
                          {diff > 0 ? `−${diff.toLocaleString("de-DE")}` : diff < 0 ? `+${Math.abs(diff).toLocaleString("de-DE")}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2"
                            onClick={async () => {
                              const { data, error } = await supabase
                                .storage
                                .from("cleanup-backups")
                                .createSignedUrl(`2026-04-29/${r.csv}`, 60 * 5);
                              if (error || !data?.signedUrl) {
                                alert(`Download fehlgeschlagen: ${error?.message ?? "no url"}`);
                                return;
                              }
                              window.open(data.signedUrl, "_blank");
                            }}
                          >
                            <Download className="h-3.5 w-3.5 mr-1" />
                            <span className="text-xs font-mono">{r.csv}</span>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {audit?.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Audit-Notiz</CardTitle>
          </CardHeader>
          <CardContent>
            <code className="text-xs text-muted-foreground">{audit.notes}</code>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Backup-Tabellen <code className="font-mono">*_backup_20260429</code> bleiben für Rollback verfügbar.
        Negative Δ-Werte (gelb) entstehen durch neu erfasste Daten nach dem Cleanup.
      </p>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 font-serif text-3xl ${accent ? "text-primary" : ""}`}>
          {value.toLocaleString("de-DE")}
        </div>
      </CardContent>
    </Card>
  );
}
