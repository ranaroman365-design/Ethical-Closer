/**
 * CloserKarriereWinnerSection — read-only Winner Engine view for /closer-karriere.
 *
 * Reads `ab_slot_weights` (no writes) and filters to the slots used on the
 * Closer-Karriere LP + Salesbook offer/page. Renders a compact funnel summary
 * and a per-slot breakdown that mirrors the WinnerEngineDashboard look.
 *
 * No mutation of weights, no schema changes, no Thompson Sampling impact.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trophy, AlertTriangle, PauseCircle } from "lucide-react";

const CLOSER_KARRIERE_SLOTS = [
  "mos_register_hero_headline",
  "mos_register_cta",
  "mos_register_transformation_angle",
  "mos_register_process_angle",
  "mos_register_form_cta",
  "mos_register_thankyou_cta",
  "mos_salesbook_offer_headline",
  "mos_salesbook_offer_cta",
  "mos_salesbook_page_cta",
  "mos_salesbook_headline",
  "mos_salesbook_value_badge",
] as const;

interface WeightRow {
  slot: string;
  variant: string;
  weight: number;
  paused: boolean;
  is_winner: boolean;
  exposures: number;
  conversions: number;
  conversion_rate: number;
  score: number;
  lead_count: number;
  booking_count: number;
  hql_count: number;
  quiz_completed_count: number;
  quiz_started_count: number;
  confidence: number;
  winner_status: string;
}

function fmt(n: number) {
  return n.toLocaleString("de-DE");
}

export default function CloserKarriereWinnerSection() {
  const [rows, setRows] = useState<WeightRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("ab_slot_weights")
        .select("*")
        .in("slot", CLOSER_KARRIERE_SLOTS as unknown as string[])
        .order("slot");
      if (data) setRows(data as WeightRow[]);
      setLoading(false);
    })();
  }, []);

  const bySlot = useMemo(() => {
    const map = new Map<string, WeightRow[]>();
    for (const s of CLOSER_KARRIERE_SLOTS) map.set(s, []);
    for (const r of rows) {
      const arr = map.get(r.slot) ?? [];
      arr.push(r);
      map.set(r.slot, arr);
    }
    return map;
  }, [rows]);

  const totals = useMemo(() => {
    const exposures = rows.reduce((a, r) => a + (r.exposures || 0), 0);
    const leads = rows.reduce((a, r) => a + (r.lead_count || 0), 0);
    const hql = rows.reduce((a, r) => a + (r.hql_count || 0), 0);
    const bookings = rows.reduce((a, r) => a + (r.booking_count || 0), 0);
    const qs = rows.reduce((a, r) => a + (r.quiz_started_count || 0), 0);
    const qc = rows.reduce((a, r) => a + (r.quiz_completed_count || 0), 0);
    return { exposures, leads, hql, bookings, qs, qc };
  }, [rows]);

  return (
    <section className="space-y-3">
      <header>
        <h2 className="font-serif text-lg font-semibold">Closer Karriere LP</h2>
        <p className="text-xs text-muted-foreground">
          Eigene CRO-Auswertung für <code className="text-[10px]">/closer-karriere</code> ·
          Booking ×12 · HQL ×8 · Lead ×4 · QC ×2 · QS ×1 · CTR niemals alleiniger Winner-Grund
        </p>
      </header>

      {loading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : (
        <>
          {/* Roll-up totals across the listed slots */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
            {[
              { label: "Exposures", v: totals.exposures },
              { label: "Quiz Start", v: totals.qs },
              { label: "Quiz Complete", v: totals.qc },
              { label: "Leads", v: totals.leads },
              { label: "HQL", v: totals.hql },
              { label: "Bookings", v: totals.bookings },
            ].map((m) => (
              <Card key={m.label} className="border-border/40">
                <CardContent className="p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.label}</p>
                  <p className="mt-1 text-xl font-bold tabular-nums">{fmt(m.v)}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Per-slot rows */}
          <div className="space-y-2">
            {CLOSER_KARRIERE_SLOTS.map((slot) => {
              const variants = (bySlot.get(slot) ?? []).slice().sort((a, b) => b.score - a.score);
              const winner = variants.find((v) => v.is_winner);
              const exposures = variants.reduce((a, v) => a + (v.exposures || 0), 0);
              const leads = variants.reduce((a, v) => a + (v.lead_count || 0), 0);
              const bookings = variants.reduce((a, v) => a + (v.booking_count || 0), 0);
              const hql = variants.reduce((a, v) => a + (v.hql_count || 0), 0);
              const noTraffic = variants.length === 0 || exposures === 0;

              return (
                <Card key={slot} className="border-border/40">
                  <CardHeader className="px-3 py-2.5">
                    <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-mono">{slot}</span>
                      <span className="flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
                        {winner && (
                          <Badge className="bg-amber-500 text-[10px]">
                            <Trophy className="mr-1 h-3 w-3" /> {winner.variant}
                          </Badge>
                        )}
                        <span>{fmt(exposures)} exp</span>
                        <span>{fmt(leads)} lead</span>
                        <span>{fmt(hql)} hql</span>
                        <span>{fmt(bookings)} bk</span>
                      </span>
                    </CardTitle>
                    {noTraffic && (
                      <CardDescription className="text-[10px]">waiting for sessions</CardDescription>
                    )}
                  </CardHeader>
                  {variants.length > 0 && (
                    <CardContent className="px-3 pb-3 pt-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                              <th className="py-1 pr-2">Variant</th>
                              <th className="py-1 pr-2 text-right">Exp</th>
                              <th className="py-1 pr-2 text-right">Lead</th>
                              <th className="py-1 pr-2 text-right">HQL</th>
                              <th className="py-1 pr-2 text-right">Book</th>
                              <th className="py-1 pr-2 text-right">Score</th>
                              <th className="py-1 pr-2 text-right">Conf</th>
                              <th className="py-1 pr-2 text-right">Weight</th>
                              <th className="py-1 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {variants.map((v) => (
                              <tr key={v.variant} className={`border-b ${v.paused ? "opacity-40" : ""}`}>
                                <td className="py-1 pr-2 font-mono">{v.variant}</td>
                                <td className="py-1 pr-2 text-right tabular-nums">{fmt(v.exposures || 0)}</td>
                                <td className="py-1 pr-2 text-right tabular-nums">{fmt(v.lead_count || 0)}</td>
                                <td className="py-1 pr-2 text-right tabular-nums">{fmt(v.hql_count || 0)}</td>
                                <td className="py-1 pr-2 text-right font-semibold tabular-nums">{fmt(v.booking_count || 0)}</td>
                                <td className="py-1 pr-2 text-right tabular-nums">{(v.score ?? 0).toFixed(3)}</td>
                                <td className="py-1 pr-2 text-right tabular-nums">
                                  {Math.round((v.confidence || 0) * 100)}%
                                </td>
                                <td className="py-1 pr-2 text-right font-semibold tabular-nums">
                                  {Math.round((v.weight || 0) * 100)}%
                                </td>
                                <td className="py-1 text-right">
                                  {v.is_winner ? (
                                    <Badge className="bg-amber-500 text-[10px]">Winner</Badge>
                                  ) : v.paused ? (
                                    <Badge variant="destructive" className="text-[10px]">
                                      <PauseCircle className="mr-1 h-3 w-3" /> Paused
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px]">Active</Badge>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>

          <p className="text-[10px] text-muted-foreground">
            <AlertTriangle className="mr-1 inline h-3 w-3" />
            Ranking-Priorität: Booking → HQL → Form Submit → WhatsApp → Salesbook Yes → CTA → View.
            CTA-Klick ist Guardrail, nicht Hauptsignal.
          </p>
        </>
      )}
    </section>
  );
}
