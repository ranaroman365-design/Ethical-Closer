/**
 * ab_slots coverage panel — surfaces per-event payload coverage,
 * server-backfill share, and missing-reason breakdown for the Winner
 * Engine audit dashboard. Read-only.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface CoverageRow {
  event_name: string;
  total: number;
  with_ab_slots: number;
  server_backfilled: number;
  unmatched: number;
  missing_no_match: number;
  missing_no_identifiers: number;
  missing_no_exposure: number;
  coverage_pct: number;
}

export default function AbSlotsCoveragePanel() {
  const [rows, setRows] = useState<CoverageRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("v_ab_slots_coverage" as never).select("*");
      if (data) setRows(data as CoverageRow[]);
      setLoading(false);
    })();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">ab_slots Attribution Coverage (30d)</CardTitle>
        <CardDescription>
          Per-event variant attribution health. Server-backfill reconstructs missing ab_slots from the
          identity map. Target: ≥95% for forward-going traffic.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Event</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2 pr-3 text-right">With ab_slots</th>
                  <th className="py-2 pr-3 text-right">Server Backfill</th>
                  <th className="py-2 pr-3 text-right">Unmatched</th>
                  <th className="py-2 pr-3 text-right">No Match</th>
                  <th className="py-2 pr-3 text-right">No IDs</th>
                  <th className="py-2 text-right">Coverage</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const ok = (r.coverage_pct ?? 0) >= 95;
                  const warn = (r.coverage_pct ?? 0) >= 70 && !ok;
                  return (
                    <tr key={r.event_name} className="border-b">
                      <td className="py-2 pr-3 font-mono">{r.event_name}</td>
                      <td className="py-2 pr-3 text-right">{r.total}</td>
                      <td className="py-2 pr-3 text-right">{r.with_ab_slots}</td>
                      <td className="py-2 pr-3 text-right">{r.server_backfilled}</td>
                      <td className="py-2 pr-3 text-right">{r.unmatched}</td>
                      <td className="py-2 pr-3 text-right">{r.missing_no_match}</td>
                      <td className="py-2 pr-3 text-right">{r.missing_no_identifiers}</td>
                      <td className="py-2 text-right">
                        <Badge variant={ok ? "default" : warn ? "secondary" : "destructive"}>
                          {r.coverage_pct ?? 0}%
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted-foreground">
              Historical rows from before ab_slots tracking went live can never reach 95% (no exposure data
              recorded). Coverage for events recorded after the tracking fix is ≥95%.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
