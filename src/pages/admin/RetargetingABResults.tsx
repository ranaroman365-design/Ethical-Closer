import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, FlaskConical, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  action: string;
  variant: string;
  sends: number;
  bookings: number;
  booking_rate_pct: number | null;
};

const ACTION_LABEL: Record<string, string> = {
  sms_2h: "2h SMS",
  email_24h: "24h Email",
  sms_48h: "48h SMS",
  email_72h: "72h Email",
};
const ACTION_ORDER = ["sms_2h", "email_24h", "sms_48h", "email_72h"];

/**
 * /members/admin/retargeting-ab — A/B test results for no-booking copy.
 * Reads from public.view_retargeting_ab_results (security_invoker, admin RLS).
 */
export default function RetargetingABResults() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("view_retargeting_ab_results" as any)
      .select("*");
    if (error) setError(error.message);
    setRows(((data as unknown) ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Group by action → { A, B }
  const grouped = ACTION_ORDER.map((action) => {
    const a = rows.find((r) => r.action === action && r.variant === "A");
    const b = rows.find((r) => r.action === action && r.variant === "B");
    const winner =
      a && b && a.sends >= 30 && b.sends >= 30
        ? (a.booking_rate_pct ?? 0) > (b.booking_rate_pct ?? 0)
          ? "A"
          : (b.booking_rate_pct ?? 0) > (a.booking_rate_pct ?? 0)
          ? "B"
          : null
        : null;
    return { action, A: a, B: b, winner };
  });

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <Link
          to="/members/admin/performance"
          className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-3 w-3" /> Performance
        </Link>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl flex items-center gap-3" style={{ fontFamily: "Cormorant Garamond, serif" }}>
              <FlaskConical className="h-6 w-6 text-primary" />
              Retargeting A/B Results
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              No-booking reclaim copy · Variant A (soft/identity) vs. Variant B (direct/scarcity)
            </p>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs hover:bg-muted"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5" /> {error}
          </div>
        )}

        <div className="space-y-4">
          {grouped.map(({ action, A, B, winner }) => (
            <div key={action} className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium">{ACTION_LABEL[action]}</h2>
                {winner && (
                  <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                    Winner: Variant {winner}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {(["A", "B"] as const).map((v) => {
                  const r = v === "A" ? A : B;
                  const isWinner = winner === v;
                  return (
                    <div
                      key={v}
                      className={`rounded-lg border p-4 ${
                        isWinner ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <div className="text-xs text-muted-foreground mb-2">Variant {v}</div>
                      <div className="text-3xl font-medium">
                        {r?.booking_rate_pct != null ? `${r.booking_rate_pct}%` : "—"}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {r ? `${r.bookings} / ${r.sends} sends` : "no sends yet"}
                      </div>
                    </div>
                  );
                })}
              </div>

              {(!A || !B || (A.sends < 30 || B.sends < 30)) && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Need ≥30 sends per variant for a winner call.
                </p>
              )}
            </div>
          ))}
        </div>

        {!loading && rows.length === 0 && !error && (
          <p className="mt-8 text-sm text-muted-foreground text-center">
            No A/B data yet. Variants are assigned automatically as the retargeting cron runs.
          </p>
        )}
      </div>
    </div>
  );
}
