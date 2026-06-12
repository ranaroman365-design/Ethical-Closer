import { Card } from "@/components/ui/card";
import type { OperatorMetrics } from "@/hooks/useOperatorComparison";

interface Props { rows: OperatorMetrics[]; }

const fmtNum  = (n: number)              => n.toLocaleString();
const fmtMon  = (n: number)              => n >= 1000 ? `€${(n / 1000).toFixed(1)}k` : `€${Math.round(n)}`;
const fmtMonN = (n: number | null)       => (n == null ? "—" : fmtMon(n));
const fmtPct  = (n: number | null)       => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);
const fmtX    = (n: number | null)       => (n == null ? "—" : !isFinite(n) ? "∞" : `${n.toFixed(2)}x`);

/** Find the winning origin_email for a given metric. */
function winnerOf(rows: OperatorMetrics[], pick: (r: OperatorMetrics) => number | null): string | null {
  let best: OperatorMetrics | null = null;
  let bestScore = -Infinity;
  for (const r of rows) {
    const s = pick(r);
    if (s == null) continue;
    if (s > bestScore) { bestScore = s; best = r; }
  }
  return best?.origin_email ?? null;
}

export default function PerformanceComparisonTable({ rows }: Props) {
  const wRoas    = winnerOf(rows, (r) => r.roas);
  const wRevenue = winnerOf(rows, (r) => r.revenue);
  const wL2S     = winnerOf(rows, (r) => r.lead_to_sale_rate);

  return (
    <Card className="p-5 border-border/40">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Performance Comparison · Equal Budget
        </h3>
        <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
          distinct lead_id · per stage
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
              <th className="text-left  py-2 pr-3 font-medium">Origin</th>
              <th className="text-right py-2 px-2 font-medium">Leads</th>
              <th className="text-right py-2 px-2 font-medium">Quiz</th>
              <th className="text-right py-2 px-2 font-medium">Bookings</th>
              <th className="text-right py-2 px-2 font-medium">Shows</th>
              <th className="text-right py-2 px-2 font-medium">Offers</th>
              <th className="text-right py-2 px-2 font-medium">Sales</th>
              <th className="text-right py-2 px-2 font-medium">Revenue</th>
              <th className="text-right py-2 px-2 font-medium">Spend</th>
              <th className="text-right py-2 px-2 font-medium">CPL</th>
              <th className="text-right py-2 px-2 font-medium">CAC</th>
              <th className="text-right py-2 pl-2 font-medium">ROAS</th>
            </tr>
          </thead>
          <tbody style={{ fontFamily: "DM Mono, monospace" }}>
            {rows.map((r) => {
              const isRoasWin    = r.origin_email === wRoas    && r.roas != null;
              const isRevWin     = r.origin_email === wRevenue && r.revenue > 0;
              const isL2SWin     = r.origin_email === wL2S     && r.lead_to_sale_rate != null;
              const weakBooking  = r.booking_rate != null && r.booking_rate < 0.15;
              const weakShow     = r.show_rate    != null && r.show_rate    < 0.60;
              const weakOffer    = r.offer_rate   != null && r.offer_rate   < 0.60;
              const weakClosing  = r.closing_rate != null && r.closing_rate < 0.20;
              const weakQuiz     = r.quiz_rate    != null && r.quiz_rate    < 0.50;

              return (
                <>
                  <tr key={r.origin_email} className="border-b border-border/10 hover:bg-muted/20 transition-colors">
                    <td className="py-3 pr-3 text-foreground font-semibold align-top" style={{ fontFamily: "Inter, sans-serif" }}>
                      <div className="leading-tight">{r.origin}</div>
                      {r.origin_display_name && (
                        <div className="text-[10px] text-muted-foreground font-normal mt-0.5" style={{ fontFamily: "DM Mono, monospace" }}>
                          {r.origin_email}
                        </div>
                      )}
                      {isL2SWin && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-primary" title="Best Lead-to-Sale" />}
                    </td>
                    <td className="py-3 px-2 text-right">{fmtNum(r.leads)}</td>
                    <td className="py-3 px-2 text-right">{fmtNum(r.quiz)}</td>
                    <td className="py-3 px-2 text-right">{fmtNum(r.bookings)}</td>
                    <td className="py-3 px-2 text-right">{fmtNum(r.shows)}</td>
                    <td className="py-3 px-2 text-right">{fmtNum(r.offers)}</td>
                    <td className="py-3 px-2 text-right">{fmtNum(r.sales)}</td>
                    <td className={`py-3 px-2 text-right font-semibold ${isRevWin ? "text-amber-600 dark:text-amber-400" : ""}`}>
                      {fmtMon(r.revenue)}
                    </td>
                    <td className="py-3 px-2 text-right text-muted-foreground">{fmtMon(r.spend)}</td>
                    <td className="py-3 px-2 text-right text-muted-foreground">{fmtMonN(r.cpl)}</td>
                    <td className="py-3 px-2 text-right text-muted-foreground">{fmtMonN(r.cac)}</td>
                    <td className={`py-3 pl-2 text-right font-semibold ${isRoasWin ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                      {fmtX(r.roas)}
                    </td>
                  </tr>
                  <tr key={`${r.origin_email}-rates`} className="border-b border-border/40 bg-muted/10">
                    <td className="py-2 pr-3 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontFamily: "Inter, sans-serif" }}>
                      Rates
                    </td>
                    <td colSpan={11} className="py-2 px-2">
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
                        <span className={weakQuiz ? "text-destructive" : ""}>Quiz: {fmtPct(r.quiz_rate)}</span>
                        <span className={weakBooking ? "text-destructive" : ""}>Booking: {fmtPct(r.booking_rate)}</span>
                        <span className={weakShow ? "text-destructive" : ""}>Show: {fmtPct(r.show_rate)}</span>
                        <span className={weakOffer ? "text-destructive" : ""}>Offer: {fmtPct(r.offer_rate)}</span>
                        <span className={weakClosing ? "text-destructive" : ""}>Closing: {fmtPct(r.closing_rate)}</span>
                        <span>Offer→Close: {fmtPct(r.offer_to_close_rate)}</span>
                        <span className={isL2SWin ? "text-primary font-semibold" : ""}>Lead→Sale: {fmtPct(r.lead_to_sale_rate)}</span>
                      </div>
                    </td>
                  </tr>
                </>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={12} className="py-6 text-center text-xs text-muted-foreground">No performance data for this period yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
