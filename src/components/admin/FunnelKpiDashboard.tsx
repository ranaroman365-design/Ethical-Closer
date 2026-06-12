import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users, TrendingUp, Target, BarChart3, Calendar, CheckCircle2,
  XCircle, Eye, ArrowUpRight, ArrowDownRight, RefreshCw, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import FunnelPipelineMirror from "@/components/admin/FunnelPipelineMirror";

/**
 * Sprint 8 — Funnel KPI Dashboard
 * Real-time metrics: LP → Quiz → Booking → Show → Close
 */

interface FunnelKpis {
  lpViews: number;
  quizStarted: number;
  quizCompleted: number;
  emailsCaptured: number;
  bookings: number;
  shows: number;
  closes: number;
  revenue: number;
}

const EMPTY: FunnelKpis = {
  lpViews: 0, quizStarted: 0, quizCompleted: 0, emailsCaptured: 0,
  bookings: 0, shows: 0, closes: 0, revenue: 0,
};

function pct(a: number, b: number): string {
  if (b === 0) return "0%";
  return `${((a / b) * 100).toFixed(1)}%`;
}

function StatCard({ label, value, sub, icon: Icon }: { label: string; value: string | number; sub?: string; icon: any }) {
  return (
    <Card className="p-4 border-border/40 bg-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
    </Card>
  );
}

export default function FunnelKpiDashboard() {
  const [kpis, setKpis] = useState<FunnelKpis>(EMPTY);
  const [funnelFilter, setFunnelFilter] = useState("high-income-skill");
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState("30d");

  const fetchKpis = async () => {
    setLoading(true);
    const daysAgo = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
    const since = new Date(Date.now() - daysAgo * 86400000).toISOString();

    // Fetch event counts
    const [eventsRes, leadsRes, appointmentsRes, callsRes] = await Promise.all([
      supabase
        .from("event_logs")
        .select("event_name, id")
        .gte("created_at", since)
        .in("event_name", [
          "LP_VIEW", "QUIZ_STARTED", "QUIZ_COMPLETED", "EMAIL_CAPTURED",
          "BOOKING_CONFIRMED", "BOOKING_SUCCESS",
        ]),
      supabase
        .from("leads")
        .select("id, stage, lead_quality, deal_value, source_funnel")
        .eq("source_funnel", funnelFilter)
        .gte("created_at", since),
      supabase
        .from("appointments")
        .select("id, appointment_status, attendance_flag, lead_id")
        .gte("created_at", since),
      // Confirmed Revenue from calls table (source of truth)
      supabase
        .from("calls" as any)
        .select("revenue, result")
        .eq("result", "closed_won")
        .gte("created_at", since),
    ]);

    const events = eventsRes.data || [];
    const leads = leadsRes.data || [];
    const appointments = appointmentsRes.data || [];

    const count = (name: string) => events.filter((e) => e.event_name === name).length;

    const shows = appointments.filter((a) => a.attendance_flag === true).length;
    const closes = leads.filter((l) => l.stage === "closed_won").length;
    const revenue = ((callsRes.data ?? []) as any[])
      .reduce((sum, c) => sum + (Number(c.revenue) || 0), 0); // Confirmed Revenue

    setKpis({
      lpViews: count("LP_VIEW"),
      quizStarted: count("QUIZ_STARTED"),
      quizCompleted: count("QUIZ_COMPLETED"),
      emailsCaptured: count("EMAIL_CAPTURED"),
      bookings: count("BOOKING_CONFIRMED") + count("BOOKING_SUCCESS"),
      shows,
      closes,
      revenue,
    });
    setLoading(false);
  };

  useEffect(() => { fetchKpis(); }, [funnelFilter, dateRange]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="font-display text-xl font-bold flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Funnel Analytics
        </h1>
        <div className="flex items-center gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[100px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 Tage</SelectItem>
              <SelectItem value="30d">30 Tage</SelectItem>
              <SelectItem value="90d">90 Tage</SelectItem>
            </SelectContent>
          </Select>
          <Select value={funnelFilter} onValueChange={setFunnelFilter}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high-income-skill">High Income Skill</SelectItem>
              <SelectItem value="bewerbung">Bewerbung</SelectItem>
              <SelectItem value="all">Alle Funnels</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchKpis} className="h-8">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="LP Views" value={kpis.lpViews} icon={Eye} />
        <StatCard
          label="Quiz Completion"
          value={pct(kpis.quizCompleted, kpis.quizStarted)}
          sub={`${kpis.quizCompleted} / ${kpis.quizStarted}`}
          icon={Target}
        />
        <StatCard
          label="Booking Rate"
          value={pct(kpis.bookings, kpis.emailsCaptured)}
          sub={`${kpis.bookings} Buchungen`}
          icon={Calendar}
        />
        <StatCard
          label="Show Rate"
          value={pct(kpis.shows, kpis.bookings)}
          sub={`${kpis.shows} Shows`}
          icon={CheckCircle2}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Close Rate"
          value={pct(kpis.closes, kpis.shows)}
          sub={`${kpis.closes} Deals`}
          icon={TrendingUp}
        />
        <StatCard
          label="Revenue"
          value={kpis.revenue >= 1000 ? `€${(kpis.revenue / 1000).toFixed(1)}k` : `€${kpis.revenue}`}
          icon={TrendingUp}
        />
        <StatCard
          label="Funnel Conversion"
          value={pct(kpis.closes, kpis.lpViews)}
          sub="LP → Close"
          icon={BarChart3}
        />
        <StatCard
          label="Leads erfasst"
          value={kpis.emailsCaptured}
          sub="E-Mails"
          icon={Users}
        />
      </div>

      {/* Funnel Visualization */}
      <Card className="p-5 border-border/40">
        <h3 className="font-display text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">
          Funnel Flow
        </h3>
        <div className="space-y-2">
          {[
            { label: "Landing Page Views", value: kpis.lpViews, max: kpis.lpViews },
            { label: "Quiz gestartet", value: kpis.quizStarted, max: kpis.lpViews },
            { label: "Quiz abgeschlossen", value: kpis.quizCompleted, max: kpis.lpViews },
            { label: "E-Mail erfasst", value: kpis.emailsCaptured, max: kpis.lpViews },
            { label: "Gebucht", value: kpis.bookings, max: kpis.lpViews },
            { label: "Erschienen", value: kpis.shows, max: kpis.lpViews },
            { label: "Closed Won", value: kpis.closes, max: kpis.lpViews },
          ].map((step) => {
            const width = step.max > 0 ? Math.max((step.value / step.max) * 100, 2) : 0;
            return (
              <div key={step.label} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-[140px] shrink-0 text-right">
                  {step.label}
                </span>
                <div className="flex-1 h-6 bg-muted rounded overflow-hidden relative">
                  <div
                    className="h-full bg-primary/70 rounded transition-all duration-500"
                    style={{ width: `${width}%` }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-foreground">
                    {step.value}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Pipeline Mirror (Sprint 7) */}
      <FunnelPipelineMirror funnelFilter={funnelFilter === "all" ? undefined : funnelFilter} />
    </div>
  );
}
