import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DistRow {
  event_key: string;
  template_key: string;
  variant_key: string;
  sent_count: number;
  closed_count: number;
  showed_count: number;
  booked_count: number;
  rescheduled_count: number;
  replied_count: number;
  clicked_count: number;
  no_response_count: number;
  no_show_count: number;
  pending_count: number;
  last_sent_at: string | null;
}

const OUTCOME_COLORS: Record<string, string> = {
  closed: "bg-emerald-100 text-emerald-900",
  showed: "bg-green-100 text-green-900",
  booked: "bg-teal-100 text-teal-900",
  rescheduled: "bg-amber-100 text-amber-900",
  replied: "bg-blue-100 text-blue-900",
  clicked: "bg-indigo-100 text-indigo-900",
  no_response: "bg-stone-200 text-stone-800",
  no_show: "bg-red-100 text-red-900",
  pending: "bg-yellow-50 text-yellow-800",
};

const OUTCOMES = [
  "closed",
  "showed",
  "booked",
  "rescheduled",
  "replied",
  "clicked",
  "no_response",
  "no_show",
  "pending",
] as const;

export default function OutcomeTagPanel() {
  const [rows, setRows] = useState<DistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sweeping, setSweeping] = useState(false);
  const [sweepResult, setSweepResult] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("v_communication_outcome_distribution" as any)
      .select("*")
      .order("sent_count", { ascending: false })
      .limit(100);
    if (!error && data) setRows(data as unknown as DistRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const runSweep = async () => {
    setSweeping(true);
    setSweepResult(null);
    const { data, error } = await supabase.rpc("sweep_dispatch_outcomes" as any, {
      _limit: 500,
    });
    if (error) setSweepResult(`Error: ${error.message}`);
    else setSweepResult(`Tagged ${data} dispatch(es).`);
    setSweeping(false);
    await load();
  };

  const totals = useMemo(() => {
    const acc: Record<string, number> = Object.fromEntries(
      OUTCOMES.map((o) => [o, 0]),
    );
    let sent = 0;
    for (const r of rows) {
      sent += r.sent_count;
      for (const o of OUTCOMES) acc[o] += (r as any)[`${o}_count`] ?? 0;
    }
    return { sent, ...acc };
  }, [rows]);

  return (
    <Card className="border-stone-200">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="font-serif text-2xl text-ink">
            Outcome Tagging — Layer 48.5
          </CardTitle>
          <p className="text-sm text-stone-600 mt-1 max-w-2xl">
            Every WhatsApp dispatch is auto-tagged with its real-world outcome
            (booked, rescheduled, no response, no-show, …) inside its 72h
            attribution window. Used by the optimizer to learn which messages
            actually convert — not just which get clicks.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={runSweep}
            disabled={sweeping}
          >
            {sweeping ? "Sweeping…" : "Sweep stale → tag now"}
          </Button>
          {sweepResult && (
            <span className="text-xs text-stone-600">{sweepResult}</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Totals */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="bg-stone-50">
            Sent: {totals.sent}
          </Badge>
          {OUTCOMES.map((o) => (
            <Badge key={o} className={OUTCOME_COLORS[o]}>
              {o}: {(totals as any)[o]}
            </Badge>
          ))}
        </div>

        {/* Per-template breakdown */}
        <div className="border border-stone-200 rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-stone-50">
                <TableHead>Event</TableHead>
                <TableHead>Template / Variant</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Closed</TableHead>
                <TableHead className="text-right">Showed</TableHead>
                <TableHead className="text-right">Booked</TableHead>
                <TableHead className="text-right">Resched.</TableHead>
                <TableHead className="text-right">Replied</TableHead>
                <TableHead className="text-right">No resp.</TableHead>
                <TableHead className="text-right">No-show</TableHead>
                <TableHead className="text-right">Pending</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-stone-500">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-stone-500">
                    No tagged dispatches yet.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => {
                const hardConvRate =
                  r.sent_count > 0
                    ? ((r.closed_count + r.showed_count + r.booked_count) /
                        r.sent_count) *
                      100
                    : 0;
                return (
                  <TableRow key={`${r.template_key}:${r.variant_key}`}>
                    <TableCell className="text-xs font-mono text-stone-700">
                      {r.event_key}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium text-ink">
                        {r.template_key}
                      </div>
                      <div className="text-xs text-stone-500">
                        {r.variant_key} ·{" "}
                        <span className="text-emerald-700 font-medium">
                          {hardConvRate.toFixed(1)}% hard conv.
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{r.sent_count}</TableCell>
                    <TableCell className="text-right">
                      {r.closed_count}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.showed_count}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.booked_count}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.rescheduled_count}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.replied_count}
                    </TableCell>
                    <TableCell className="text-right text-stone-500">
                      {r.no_response_count}
                    </TableCell>
                    <TableCell className="text-right text-red-700">
                      {r.no_show_count}
                    </TableCell>
                    <TableCell className="text-right text-stone-400">
                      {r.pending_count}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-stone-500">
          Outcomes are derived in priority order:{" "}
          <span className="font-medium">
            close → show → reschedule → booking → reply → click → no_show /
            no_response
          </span>
          . The trigger re-tags automatically when conversion events arrive;
          the sweep finalizes any dispatch whose 72h window has expired.
        </p>
      </CardContent>
    </Card>
  );
}
