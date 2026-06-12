import { Card } from "@/components/ui/card";
import { Crosshair, TrendingUp, AlertTriangle } from "lucide-react";
import type { OperatorMetrics } from "@/hooks/useOperatorComparison";

interface Props { rows: OperatorMetrics[]; }

/** Strongest origin: highest ROAS → revenue → lead_to_sale_rate. */
function pickStrongest(rows: OperatorMetrics[]): OperatorMetrics | null {
  const candidates = rows.filter((r) => r.leads > 0);
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const ar = a.roas ?? -Infinity, br = b.roas ?? -Infinity;
    if (br !== ar) return br - ar;
    if (b.revenue !== a.revenue) return b.revenue - a.revenue;
    return (b.lead_to_sale_rate ?? -Infinity) - (a.lead_to_sale_rate ?? -Infinity);
  })[0];
}

/** Weakest origin: lowest ROAS → weakest lead_to_sale_rate → lowest revenue. */
function pickWeakest(rows: OperatorMetrics[]): OperatorMetrics | null {
  const candidates = rows.filter((r) => r.leads > 0);
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const ar = a.roas ?? Infinity, br = b.roas ?? Infinity;
    if (ar !== br) return ar - br;
    const al = a.lead_to_sale_rate ?? Infinity, bl = b.lead_to_sale_rate ?? Infinity;
    if (al !== bl) return al - bl;
    return a.revenue - b.revenue;
  })[0];
}

const LEVER_LABEL: Record<string, string> = {
  TRAFFIC_OR_FRONTEND_FUNNEL:             "front-end traffic & funnel quality",
  BOOKING_CONVERSION:                     "landing & booking-flow optimization",
  SETTER_OR_SHOW_UP_PROCESS:              "setter, reminder & attendance process",
  CLOSER_QUALIFICATION_OR_OFFER_CREATION: "call quality, qualification & offer creation",
  CLOSING_OR_OFFER_CONVERSION:            "closer performance & offer conversion",
  NO_CLEAR_BOTTLENECK:                    "scale carefully — no dominant bottleneck",
  NO_DATA:                                "no event data in this period",
};

const STAGE_LABEL: Record<string, string> = {
  quiz_rate: "quiz completion",
  booking_rate: "booking conversion",
  show_rate: "show-up rate",
  offer_rate: "offer creation",
  closing_rate: "closing rate",
};

export default function BiggestLeverBox({ rows }: Props) {
  const strongest = pickStrongest(rows);
  const weakest   = pickWeakest(rows);

  if (!strongest && !weakest) {
    return (
      <Card className="p-5 border-border/40">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Biggest Lever
        </h3>
        <p className="text-xs text-muted-foreground">No performance data for this period yet.</p>
      </Card>
    );
  }

  const sameOrigin = strongest && weakest && strongest.origin_email === weakest.origin_email;

  return (
    <Card className="p-5 border-border/40">
      <div className="flex items-center gap-2 mb-4">
        <Crosshair className="h-4 w-4 text-foreground" />
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Biggest Lever
        </h3>
      </div>

      <ul className="space-y-3 text-sm leading-relaxed">
        {strongest && (
          <li className="flex gap-2.5 items-start">
            <TrendingUp className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="text-foreground">
              Best performer on equal budget:{" "}
              <span className="font-semibold">{strongest.origin}</span>
              {strongest.roas != null && Number.isFinite(strongest.roas) && (
                <span className="text-muted-foreground"> · {strongest.roas.toFixed(2)}x ROAS</span>
              )}
            </span>
          </li>
        )}

        {weakest && !sameOrigin && (
          <>
            <li className="flex gap-2.5 items-start">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-destructive" />
              <span className="text-foreground">
                Weakest point for{" "}
                <span className="font-semibold">{weakest.origin}</span>:{" "}
                <span className="text-muted-foreground">
                  {weakest.primary_bottleneck_metric
                    ? STAGE_LABEL[weakest.primary_bottleneck_metric] ?? weakest.primary_bottleneck_metric
                    : "no clear weak stage"}
                </span>
              </span>
            </li>
            <li className="flex gap-2.5 items-start">
              <span className="h-3.5 w-3.5 mt-0.5 shrink-0 rounded-full bg-foreground/70" />
              <span className="text-foreground">
                Primary lever:{" "}
                <span className="text-muted-foreground">
                  {weakest.primary_bottleneck_type
                    ? LEVER_LABEL[weakest.primary_bottleneck_type] ?? weakest.recommended_focus
                    : weakest.recommended_focus ?? "monitor and reassess"}
                </span>
              </span>
            </li>
          </>
        )}

        {strongest && (
          <li className="flex gap-2.5 items-start">
            <span className="h-3.5 w-3.5 mt-0.5 shrink-0 rounded-full bg-primary/70" />
            <span className="text-foreground">
              Highest scale priority:{" "}
              <span className="font-semibold">{strongest.origin}</span>
            </span>
          </li>
        )}
      </ul>
    </Card>
  );
}
