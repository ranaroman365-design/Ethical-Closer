import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type OperatorRange = 1 | 7 | 30;

/** One row per origin_email returned by RPC `get_performance_dashboard`.
 *  origin_email is the permanent technical identifier; origin_display_name is UI-only. */
export interface OperatorMetrics {
  origin_email: string;
  origin_display_name: string | null;
  /** UI-friendly label: display name → email fallback. */
  origin: string;

  leads: number;
  quiz: number;
  bookings: number;
  shows: number;
  offers: number;
  sales: number;
  losses: number;
  revenue: number;
  spend: number;

  quiz_rate: number | null;
  booking_rate: number | null;
  show_rate: number | null;
  offer_rate: number | null;
  closing_rate: number | null;
  offer_to_close_rate: number | null;
  lead_to_sale_rate: number | null;
  cpl: number | null;
  cpql: number | null;
  cac: number | null;
  roas: number | null;

  /** Server-side bottleneck diagnostics. */
  primary_bottleneck_type: BottleneckType | null;
  primary_bottleneck_metric: string | null;
  primary_bottleneck_value: number | null;
  bottleneck_summary: string | null;
  recommended_focus: string | null;
}

export type BottleneckType =
  | "TRAFFIC_OR_FRONTEND_FUNNEL"
  | "BOOKING_CONVERSION"
  | "SETTER_OR_SHOW_UP_PROCESS"
  | "CLOSER_QUALIFICATION_OR_OFFER_CREATION"
  | "CLOSING_OR_OFFER_CONVERSION"
  | "NO_CLEAR_BOTTLENECK"
  | "NO_DATA";

const REFRESH_MS = 5 * 60 * 1000; // 5-min cache per spec

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Convert range (in days) → [start_date, end_date] (UTC dates as YYYY-MM-DD). */
function rangeFor(days: OperatorRange): { start: string; end: string } {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const startD = new Date(today);
  startD.setDate(today.getDate() - (days - 1));
  return { start: startD.toISOString().slice(0, 10), end };
}

interface RawRow {
  origin_email: string;
  origin_display_name: string | null;
  leads: number; quiz_completed: number; bookings: number; shows: number;
  offers: number; sales: number; losses: number;
  revenue: number; spend: number;
  quiz_rate: number | null; booking_rate: number | null;
  show_rate: number | null; offer_rate: number | null;
  closing_rate: number | null; offer_to_close_rate: number | null;
  lead_to_sale_rate: number | null;
  cpl: number | null; cpql: number | null; cac: number | null; roas: number | null;
  primary_bottleneck_type: string | null;
  primary_bottleneck_metric: string | null;
  primary_bottleneck_value: number | null;
  bottleneck_summary: string | null;
  recommended_focus: string | null;
}

function shape(r: RawRow): OperatorMetrics {
  const display = r.origin_display_name?.trim() || r.origin_email;
  return {
    origin_email: r.origin_email,
    origin_display_name: r.origin_display_name,
    origin: display,
    leads:    num(r.leads),
    quiz:     num(r.quiz_completed),
    bookings: num(r.bookings),
    shows:    num(r.shows),
    offers:   num(r.offers),
    sales:    num(r.sales),
    losses:   num(r.losses),
    revenue:  num(r.revenue),
    spend:    num(r.spend),
    quiz_rate:           numOrNull(r.quiz_rate),
    booking_rate:        numOrNull(r.booking_rate),
    show_rate:           numOrNull(r.show_rate),
    offer_rate:          numOrNull(r.offer_rate),
    closing_rate:        numOrNull(r.closing_rate),
    offer_to_close_rate: numOrNull(r.offer_to_close_rate),
    lead_to_sale_rate:   numOrNull(r.lead_to_sale_rate),
    cpl:  numOrNull(r.cpl),
    cpql: numOrNull(r.cpql),
    cac:  numOrNull(r.cac),
    roas: numOrNull(r.roas),
    primary_bottleneck_type:   (r.primary_bottleneck_type ?? null) as OperatorMetrics["primary_bottleneck_type"],
    primary_bottleneck_metric: r.primary_bottleneck_metric ?? null,
    primary_bottleneck_value:  numOrNull(r.primary_bottleneck_value),
    bottleneck_summary:        r.bottleneck_summary ?? null,
    recommended_focus:         r.recommended_focus ?? null,
  };
}

export function useOperatorComparison(days: OperatorRange = 30) {
  const [rows, setRows]               = useState<OperatorMetrics[]>([]);
  const [loading, setLoading]         = useState(true);
  const [forbidden, setForbidden]     = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const { start, end } = rangeFor(days);
    const { data, error } = await supabase.rpc(
      "get_performance_dashboard" as never,
      { start_date: start, end_date: end } as never
    );
    if (error?.message?.toLowerCase().includes("forbidden")) {
      setForbidden(true); setLoading(false); return;
    }
    if (!error) {
      const raw = (data ?? []) as unknown as RawRow[];
      setRows(raw.map(shape));
      setLastUpdated(new Date());
    }
    setLoading(false);
  }, [days]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  return { rows, loading, forbidden, lastUpdated, refresh: load };
}
