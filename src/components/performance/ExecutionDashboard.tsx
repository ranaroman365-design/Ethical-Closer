/**
 * Execution Dashboard — Real-time Operational View
 * -------------------------------------------------
 * Canon: ETC OS Layer 47 · Visualization Layer · Execution spine.
 *
 * Fast, real-time, operational:
 *   · Today's appointments (my + team)
 *   · Show / No-show counts
 *   · Closed / Not closed
 *   · Calls per user
 *   · Revenue from calls.revenue ONLY (not deal_value)
 *
 * NO intelligence logic:
 *   · No scoring, no priority computation, no bottleneck detection
 */
import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOptionalPerformanceFilters } from "@/contexts/PerformanceFiltersContext";
import { getAccessibleUserIds } from "@/lib/team-scope";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  CheckCircle2,
  XCircle,
  Phone,
  DollarSign,
  UserCheck,
  UserX,
  Clock,
} from "lucide-react";

interface AppointmentRow {
  id: string;
  lead_id: string | null;
  appointment_status: string;
  starts_at: string;
  setter_id: string | null;
  outcome: string | null;
}

interface CallRow {
  id: string;
  user_id: string;
  result: string | null;
  revenue: number | null;
  created_at: string;
}

interface UserLabel {
  id: string;
  name: string;
}

export default function ExecutionDashboard() {
  const { user, isAdmin, isOwner, profile } = useAuth();
  const perfFilters = useOptionalPerformanceFilters();

  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [teamUsers, setTeamUsers] = useState<UserLabel[]>([]);
  const [loading, setLoading] = useState(true);

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  const todayEnd = useMemo(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }, []);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Resolve team scope
    const level = (profile as any)?.current_phase ?? 0;
    const scope = await getAccessibleUserIds(user.id, {
      isAdmin: isAdmin || isOwner,
      level,
    });

    const userIds = scope.userIds;
    const userLabels: UserLabel[] = [
      { id: user.id, name: (profile as any)?.full_name || "Ich" },
      ...scope.members.map((m) => ({ id: m.id, name: m.name })),
    ];
    setTeamUsers(userLabels);

    // Fetch today's appointments for team
    const [{ data: apptData }, { data: callData }] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, lead_id, appointment_status, starts_at, setter_id, outcome")
        .gte("starts_at", todayStart)
        .lte("starts_at", todayEnd)
        .in("setter_id", userIds),
      supabase
        .from("calls")
        .select("id, user_id, result, revenue, created_at")
        .gte("created_at", todayStart)
        .lte("created_at", todayEnd)
        .in("user_id", userIds)
        .eq("is_simulation", false),
    ]);

    setAppointments((apptData as AppointmentRow[]) ?? []);
    setCalls((callData as CallRow[]) ?? []);
    setLoading(false);
  }, [user, isAdmin, isOwner, profile, todayStart, todayEnd]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── KPIs ───────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = appointments.length;
    const showed = appointments.filter(
      (a) => a.appointment_status === "completed" || a.outcome === "showed"
    ).length;
    const noShow = appointments.filter(
      (a) => a.appointment_status === "no_show" || a.outcome === "no_show"
    ).length;
    const booked = appointments.filter(
      (a) =>
        a.appointment_status === "booked" ||
        a.appointment_status === "confirmed"
    ).length;

    const closed = calls.filter((c) => c.result === "closed_won").length;
    const notClosed = calls.filter(
      (c) => c.result && c.result !== "closed_won"
    ).length;

    const totalRevenue = calls.reduce(
      (sum, c) => sum + (c.revenue ?? 0),
      0
    );

    const totalCalls = calls.length;

    return {
      total,
      showed,
      noShow,
      booked,
      closed,
      notClosed,
      totalRevenue,
      totalCalls,
    };
  }, [appointments, calls]);

  // ─── Calls per user ─────────────────────────────────────
  const callsPerUser = useMemo(() => {
    const map: Record<string, { calls: number; revenue: number; closed: number }> = {};
    for (const c of calls) {
      if (!map[c.user_id]) map[c.user_id] = { calls: 0, revenue: 0, closed: 0 };
      map[c.user_id].calls++;
      map[c.user_id].revenue += c.revenue ?? 0;
      if (c.result === "closed_won") map[c.user_id].closed++;
    }
    return Object.entries(map)
      .map(([uid, stats]) => ({
        userId: uid,
        name: teamUsers.find((u) => u.id === uid)?.name || uid.slice(0, 8),
        ...stats,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [calls, teamUsers]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 py-10 lg:px-10">
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-10 space-y-8">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Calendar} label="Termine heute" value={kpis.total} />
        <KpiCard icon={UserCheck} label="Showed" value={kpis.showed} accent="emerald" />
        <KpiCard icon={UserX} label="No-Show" value={kpis.noShow} accent="red" />
        <KpiCard icon={Clock} label="Noch offen" value={kpis.booked} accent="amber" />
        <KpiCard icon={CheckCircle2} label="Closed" value={kpis.closed} accent="emerald" />
        <KpiCard icon={XCircle} label="Not Closed" value={kpis.notClosed} accent="red" />
        <KpiCard icon={Phone} label="Calls heute" value={kpis.totalCalls} />
        <KpiCard
          icon={DollarSign}
          label="Revenue (Calls)"
          value={`€${kpis.totalRevenue.toLocaleString("de-DE")}`}
          accent="emerald"
        />
      </div>

      {/* Calls per User */}
      {callsPerUser.length > 0 && (
        <Card className="border-white/10 bg-white/[0.03]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-[color:var(--ci-fg)]">
              Calls pro Mitglied — Heute
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {callsPerUser.map((u) => (
                <div
                  key={u.userId}
                  className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-4 py-2.5"
                >
                  <span className="text-sm font-medium text-[color:var(--ci-fg)]">
                    {u.name}
                  </span>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-[color:var(--ci-fg-muted)]">
                      {u.calls} Call{u.calls !== 1 ? "s" : ""}
                    </span>
                    <span className="text-[color:var(--ci-fg-muted)]">
                      {u.closed} Closed
                    </span>
                    <Badge
                      variant="outline"
                      className="border-emerald-400/30 bg-emerald-400/10 text-emerald-300 text-[11px]"
                    >
                      €{u.revenue.toLocaleString("de-DE")}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's Appointments Table */}
      <Card className="border-white/10 bg-white/[0.03]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-[color:var(--ci-fg)]">
            Termine heute — {appointments.length}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {appointments.length === 0 ? (
            <p className="text-sm text-[color:var(--ci-fg-dim)]">
              Keine Termine für heute.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-left text-[10px] uppercase tracking-wider text-[color:var(--ci-fg-dim)]">
                    <th className="px-3 py-2">Zeit</th>
                    <th className="px-3 py-2">Setter</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Ergebnis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {appointments
                    .sort(
                      (a, b) =>
                        new Date(a.starts_at).getTime() -
                        new Date(b.starts_at).getTime()
                    )
                    .map((appt) => (
                      <tr
                        key={appt.id}
                        className="text-[color:var(--ci-fg)] hover:bg-white/[0.03]"
                      >
                        <td className="px-3 py-2 text-xs">
                          {new Date(appt.starts_at).toLocaleTimeString(
                            "de-DE",
                            { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {appt.setter_id
                            ? teamUsers.find((u) => u.id === appt.setter_id)
                                ?.name || "—"
                            : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge status={appt.appointment_status} />
                        </td>
                        <td className="px-3 py-2 text-xs text-[color:var(--ci-fg-muted)]">
                          {appt.outcome || "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Calendar;
  label: string;
  value: string | number;
  accent?: "emerald" | "red" | "amber";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-400"
      : accent === "red"
      ? "text-red-400"
      : accent === "amber"
      ? "text-amber-400"
      : "text-[color:var(--ci-fg)]";

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-[color:var(--ci-fg-dim)]" />
        <span className="text-[10px] uppercase tracking-wider text-[color:var(--ci-fg-dim)]">
          {label}
        </span>
      </div>
      <p className={`mt-1 text-2xl font-semibold ${accentClass}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    booked: "border-blue-400/30 bg-blue-400/10 text-blue-300",
    confirmed: "border-blue-400/30 bg-blue-400/10 text-blue-300",
    completed: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    no_show: "border-red-400/30 bg-red-400/10 text-red-300",
    cancelled: "border-zinc-400/30 bg-zinc-400/10 text-zinc-400",
  };
  return (
    <Badge
      variant="outline"
      className={`text-[10px] ${styles[status] || "border-white/10 text-[color:var(--ci-fg-muted)]"}`}
    >
      {status}
    </Badge>
  );
}
