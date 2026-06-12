import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, AlertTriangle, Info, ArrowRight } from "lucide-react";

type ReliabilityLabel =
  | "ok"
  | "insufficient_data"
  | "suspicious_pattern"
  | "incomplete_funnel"
  | "insufficient_and_suspicious";

export interface OperatorDetailRow {
  operator_email: string;
  leads: number; booked: number; showed: number; won: number;
  eligible: boolean;
  reasons: string[];
  booking_rate: number | null;
  show_rate: number | null;
  close_rate: number | null;
  suspicious_flags: string[];
  suspicious: boolean;
  reliability_label: ReliabilityLabel;
}

interface ScanContext {
  days: number;
  thresholds: { min_leads: number; min_booked: number; min_showed: number };
  medians: { booking_rate: number; show_rate: number; close_rate: number; leads: number };
}

const LABELS: Record<ReliabilityLabel, { text: string; tone: string; Icon: typeof Info }> = {
  ok:                          { text: "OK",                        tone: "text-emerald-600 dark:text-emerald-400 border-emerald-500/30", Icon: ShieldCheck },
  insufficient_data:           { text: "Insufficient data",         tone: "text-muted-foreground border-border/40",                       Icon: Info },
  incomplete_funnel:           { text: "Incomplete funnel data",    tone: "text-amber-600 dark:text-amber-400 border-amber-500/30",       Icon: AlertTriangle },
  suspicious_pattern:          { text: "Suspicious pattern",        tone: "text-destructive border-destructive/40",                       Icon: ShieldAlert },
  insufficient_and_suspicious: { text: "Insufficient + suspicious", tone: "text-destructive border-destructive/40",                       Icon: ShieldAlert },
};

const FLAG_LABEL: Record<string, string> = {
  book_high_show_low: "Booking-Rate weit über Median, Show-Rate weit unter Median",
  close_high_low_volume: "Close-Rate sehr hoch bei sehr niedrigem Volumen",
  high_volume_low_conversion: "Lead-Volumen sehr hoch, Conversion sehr niedrig",
};

const REASON_LABEL: Record<string, string> = {
  insufficient_leads: "Leads unter Mindestschwelle",
  insufficient_booked: "Buchungen unter Mindestschwelle",
  insufficient_showed: "Shows unter Mindestschwelle",
  no_funnel_events: "Keine kanonischen Funnel-Events",
};

interface Props {
  row: OperatorDetailRow | null;
  context: ScanContext | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const fmtPct = (v: number | null) =>
  v === null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(1)}%`;

const fmtMedianPct = (v: number) =>
  !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(1)}%`;

function deltaTone(value: number | null, median: number) {
  if (value === null || !Number.isFinite(value) || !Number.isFinite(median) || median === 0) {
    return "text-muted-foreground";
  }
  const ratio = value / median;
  if (ratio >= 1.1) return "text-emerald-600 dark:text-emerald-400";
  if (ratio <= 0.9) return "text-destructive";
  return "text-foreground";
}

export default function OperatorDetailSheet({ row, context, open, onOpenChange }: Props) {
  if (!row || !context) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl" />
      </Sheet>
    );
  }

  const meta = LABELS[row.reliability_label];
  const Icon = meta.Icon;
  const { thresholds, medians, days } = context;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0" />
            <SheetTitle className="text-base font-semibold truncate">{row.operator_email}</SheetTitle>
          </div>
          <SheetDescription className="flex items-center gap-2">
            <Badge variant="outline" className={`text-[10px] ${meta.tone}`}>{meta.text}</Badge>
            <span className="text-[11px] text-muted-foreground">Letzte {days} Tage · Quelle: funnel_events_v2</span>
          </SheetDescription>
        </SheetHeader>

        {/* Raw counts */}
        <section className="mt-6">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Rohe Funnel-Events
          </h4>
          <div className="grid grid-cols-4 gap-2 rounded-lg border border-border/40 bg-card p-3">
            <RawStat label="leads" value={row.leads} threshold={thresholds.min_leads} />
            <RawStat label="booked" value={row.booked} threshold={thresholds.min_booked} />
            <RawStat label="showed" value={row.showed} threshold={thresholds.min_showed} />
            <RawStat label="won" value={row.won} />
          </div>
        </section>

        {/* Computed rates with formulas + median comparison */}
        <section className="mt-6">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Berechnete Raten · vs. Cohort-Median
          </h4>
          <div className="rounded-lg border border-border/40 bg-card divide-y divide-border/40">
            <RateRow
              label="Booking-Rate"
              formula="booked / leads"
              numerator={row.booked}
              denominator={row.leads}
              value={row.booking_rate}
              median={medians.booking_rate}
            />
            <RateRow
              label="Show-Rate"
              formula="showed / booked"
              numerator={row.showed}
              denominator={row.booked}
              value={row.show_rate}
              median={medians.show_rate}
            />
            <RateRow
              label="Close-Rate"
              formula="won / showed"
              numerator={row.won}
              denominator={row.showed}
              value={row.close_rate}
              median={medians.close_rate}
            />
          </div>
        </section>

        {/* Integrity verdict */}
        <section className="mt-6">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Integritäts-Begründung
          </h4>
          <div className={`rounded-lg border p-3 ${meta.tone}`}>
            <div className="flex items-center gap-2 mb-2">
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="text-xs font-medium text-foreground">{meta.text}</span>
            </div>
            {row.reasons.length === 0 && row.suspicious_flags.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Keine Auffälligkeiten. Volumen erfüllt alle Mindestschwellen, Raten innerhalb der Cohort-Toleranz.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {row.reasons.map(r => (
                  <li key={r} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <ArrowRight className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>{REASON_LABEL[r] ?? r}</span>
                  </li>
                ))}
                {row.suspicious_flags.map(f => (
                  <li key={f} className="flex items-start gap-1.5 text-[11px] text-foreground">
                    <ArrowRight className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>{FLAG_LABEL[f] ?? f}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Cohort context */}
        <section className="mt-6 mb-2">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Cohort-Kontext
          </h4>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
            <div>Median Booking-Rate: <span className="text-foreground tabular-nums">{fmtMedianPct(medians.booking_rate)}</span></div>
            <div>Median Show-Rate: <span className="text-foreground tabular-nums">{fmtMedianPct(medians.show_rate)}</span></div>
            <div>Median Close-Rate: <span className="text-foreground tabular-nums">{fmtMedianPct(medians.close_rate)}</span></div>
            <div>Median Leads: <span className="text-foreground tabular-nums">{medians.leads}</span></div>
          </div>
        </section>
      </SheetContent>
    </Sheet>
  );
}

function RawStat({ label, value, threshold }: { label: string; value: number; threshold?: number }) {
  const below = threshold !== undefined && value < threshold;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${below ? "text-destructive" : "text-foreground"}`}>
        {value}
      </div>
      {threshold !== undefined && (
        <div className="text-[10px] text-muted-foreground tabular-nums">≥ {threshold}</div>
      )}
    </div>
  );
}

function RateRow({
  label, formula, numerator, denominator, value, median,
}: {
  label: string;
  formula: string;
  numerator: number;
  denominator: number;
  value: number | null;
  median: number;
}) {
  const tone = deltaTone(value, median);
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-foreground">{label}</div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          {formula} = {numerator}/{denominator}
        </div>
      </div>
      <div className="text-right">
        <div className={`text-sm font-semibold tabular-nums ${tone}`}>{fmtPct(value)}</div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          Median {fmtMedianPct(median)}
        </div>
      </div>
    </div>
  );
}
