import { useEffect, useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, Clock, AlertTriangle, Users, TrendingUp, CheckCircle2, XCircle, Video, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface AdminAppointment {
  id: string;
  lead_id: string;
  call_type: string;
  appointment_status: string;
  starts_at: string;
  setter_id: string | null;
  acknowledged_at: string | null;
  outcome: string | null;
  qualification_result: string | null;
  attendance_flag: boolean | null;
  call_completed_at: string | null;
  created_at: string;
  video_call_link: string | null;
  lead_name?: string;
  setter_name?: string;
}

function detectProvider(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("zoom.us")) return "zoom";
  if (u.includes("meet.google.com")) return "google_meet";
  if (u.includes("teams.microsoft.com") || u.includes("teams.live.com")) return "teams";
  return "custom";
}

const TRACKED_EVENTS = [
  "booking_created", "setter_assigned", "setter_acknowledged", "sla_breach",
  "setter_reassigned", "appointment_reminder_sent", "call_completed",
  "lead_qualified", "appointment_rescheduled", "appointment_cancelled",
  "setter_assignment_failed", "quiz_re_submitted",
];

function EventLogPanel() {
  const [events, setEvents] = useState<{ id: string; event_type: string; notes: string; created_at: string; lead_id: string }[]>([]);

  useEffect(() => {
    supabase
      .from("lead_events")
      .select("id, event_type, notes, created_at, lead_id")
      .in("event_type", TRACKED_EVENTS)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => { if (data) setEvents(data); });
  }, []);

  if (events.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Event Log (letzte 30)</h3>
      <div className="rounded-lg border bg-card max-h-64 overflow-y-auto divide-y divide-border/50">
        {events.map(e => (
          <div key={e.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={cn(
                "text-[8px] px-1.5",
                e.event_type.includes("breach") || e.event_type.includes("failed") ? "border-destructive/40 text-destructive" : ""
              )}>
                {e.event_type}
              </Badge>
              <span className="text-muted-foreground truncate max-w-[300px]">{e.notes}</span>
            </div>
            <span className="text-muted-foreground/60 whitespace-nowrap">
              {format(parseISO(e.created_at), "d.MM. HH:mm", { locale: de })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminAppointmentMonitor() {
  const [appointments, setAppointments] = useState<AdminAppointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    const { data } = await (supabase as any)
      .from("appointments")
      .select(`
        id, lead_id, call_type, appointment_status, starts_at,
        setter_id, acknowledged_at, outcome, qualification_result,
        attendance_flag, call_completed_at, created_at, video_call_link,
        leads!appointments_lead_id_fkey (name),
        profiles!appointments_setter_id_fkey (full_name)
      `)
      .not("appointment_status", "eq", "superseded")
      .order("starts_at", { ascending: true })
      .limit(200);

    if (data) {
      setAppointments(data.map((a: any) => ({
        ...a,
        lead_name: a.leads?.name,
        setter_name: a.profiles?.full_name,
      })));
    }
    setLoading(false);
  };

  const [editingLink, setEditingLink] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState<string>("");

  async function saveVideoLink(appointmentId: string, raw: string) {
    const trimmed = raw.trim();
    const url = trimmed === "" ? null : trimmed;
    if (url) {
      try { new URL(url); } catch { toast.error("Ungültige URL"); return; }
    }
    const { error } = await supabase
      .from("appointments")
      .update({ video_call_link: url })
      .eq("id", appointmentId);
    if (error) { toast.error(`Fehler: ${error.message}`); return; }
    toast.success(url ? `Videolink gespeichert (${detectProvider(url)})` : "Videolink entfernt");
    setEditingLink(null);
    loadData();
  }

  const stats = useMemo(() => {
    const total = appointments.length;
    const unacked = appointments.filter(a => !a.acknowledged_at && ["booked"].includes(a.appointment_status)).length;
    const atRisk = appointments.filter(a => {
      if (a.acknowledged_at || !["booked"].includes(a.appointment_status)) return false;
      const created = new Date(a.created_at);
      const slaMin = a.call_type === "priority" ? 15 : 60;
      return new Date() > new Date(created.getTime() + slaMin * 60000);
    }).length;
    const attended = appointments.filter(a => a.attendance_flag === true || a.call_completed_at !== null).length;
    const noShows = appointments.filter(a => a.outcome === "no_show" || a.attendance_flag === false).length;
    const showRate = attended + noShows > 0 ? Math.round((attended / (attended + noShows)) * 100) : 0;
    const priority = appointments.filter(a => a.call_type === "priority").length;

    return { total, unacked, atRisk, completed: attended, noShows, showRate, priority };
  }, [appointments]);

  async function handleMarkAttended(appointmentId: string) {
    const { data, error } = await supabase.rpc(
      "mark_appointment_attended" as never,
      { _appointment_id: appointmentId } as never,
    );
    const res = data as { ok?: boolean; error?: string; already_attended?: boolean } | null;
    if (error || !res?.ok) {
      toast.error(`Konnte nicht markiert werden: ${error?.message ?? res?.error ?? "unknown"}`);
      return;
    }
    toast.success(res.already_attended ? "Bereits als erschienen markiert" : "Als erschienen markiert");
    loadData();
  }

  async function handleMarkNoShow(appointmentId: string) {
    const { data, error } = await supabase.rpc(
      "mark_appointment_no_show" as never,
      { _appointment_id: appointmentId } as never,
    );
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || !res?.ok) {
      toast.error(`Konnte nicht markiert werden: ${error?.message ?? res?.error ?? "unknown"}`);
      return;
    }
    toast.success("Als No-Show markiert");
    loadData();
  }

  // Per-setter load
  const setterLoad = useMemo(() => {
    const map: Record<string, { name: string; total: number; unacked: number; priority: number }> = {};
    for (const a of appointments) {
      if (!a.setter_id) continue;
      if (!map[a.setter_id]) map[a.setter_id] = { name: a.setter_name || a.setter_id, total: 0, unacked: 0, priority: 0 };
      if (["booked", "confirmed"].includes(a.appointment_status)) {
        map[a.setter_id].total++;
        if (!a.acknowledged_at) map[a.setter_id].unacked++;
        if (a.call_type === "priority") map[a.setter_id].priority++;
      }
    }
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [appointments]);

  if (loading) return <div className="py-4 text-sm text-muted-foreground">Lade…</div>;

  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: "Gesamt", value: stats.total, icon: Calendar },
          { label: "Unbestätigt", value: stats.unacked, icon: Clock, warn: stats.unacked > 0 },
          { label: "At Risk", value: stats.atRisk, icon: AlertTriangle, warn: stats.atRisk > 0 },
          { label: "Abgeschlossen", value: stats.completed, icon: TrendingUp },
          { label: "No-Shows", value: stats.noShows, icon: AlertTriangle },
          { label: "Show-Rate", value: `${stats.showRate}%`, icon: TrendingUp },
          { label: "Priority", value: stats.priority, icon: Users },
        ].map(s => (
          <div key={s.label} className={cn("rounded-lg border bg-card px-3 py-2", s.warn && "border-destructive/30 bg-destructive/5")}>
            <p className={cn("text-xl font-semibold", s.warn ? "text-destructive" : "text-foreground")}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Setter Load */}
      {setterLoad.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Setter-Auslastung</h3>
          <div className="rounded-lg border bg-card divide-y divide-border/50">
            {setterLoad.map(([id, s]) => (
              <div key={id} className="flex items-center justify-between px-4 py-2">
                <p className="text-sm font-medium">{s.name}</p>
                <div className="flex items-center gap-3 text-xs">
                  <span>{s.total} aktiv</span>
                  {s.unacked > 0 && <Badge variant="destructive" className="text-[9px]">{s.unacked} offen</Badge>}
                  {s.priority > 0 && <Badge className="bg-amber-100 text-amber-800 text-[9px]">{s.priority} priority</Badge>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* At-Risk appointments */}
      {stats.atRisk > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-destructive mb-2">⚠ At-Risk Termine</h3>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 divide-y divide-destructive/10">
            {appointments
              .filter(a => {
                if (a.acknowledged_at || a.appointment_status !== "booked") return false;
                const slaMin = a.call_type === "priority" ? 15 : 60;
                return new Date() > new Date(new Date(a.created_at).getTime() + slaMin * 60000);
              })
              .map(a => (
                <div key={a.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{a.lead_name || "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(a.starts_at), "d. MMM HH:mm", { locale: de })} · Setter: {a.setter_name || "—"}
                    </p>
                  </div>
                  <Badge variant="destructive" className="text-[9px]">
                    SLA überschritten
                  </Badge>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Event Log */}
      <EventLogPanel />

      {/* Recent appointments table */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Alle Termine</h3>
        <div className="rounded-lg border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground">Lead</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground">Termin</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground">Typ</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground">Setter</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground">Ergebnis</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground">Videolink</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-muted-foreground">Anwesenheit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {appointments.slice(0, 50).map(a => {
                const attended = a.attendance_flag === true || a.call_completed_at !== null;
                const isNoShow = a.attendance_flag === false || a.outcome === "no_show";
                const startInPast = new Date(a.starts_at) < new Date();
                const canAct = !["superseded", "cancelled"].includes(a.appointment_status);
                return (
                  <tr key={a.id} className="hover:bg-muted/10">
                    <td className="px-3 py-2 font-medium">{a.lead_name || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {format(parseISO(a.starts_at), "d.MM. HH:mm", { locale: de })}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={cn("text-[9px]", a.call_type === "priority" && "border-amber-500/40 text-amber-600 dark:text-amber-400")}>
                        {a.call_type}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{a.setter_name || "—"}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-[9px]">{a.appointment_status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{a.outcome || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {editingLink === a.id ? (
                        <div className="inline-flex items-center gap-1">
                          <Input
                            autoFocus
                            value={linkDraft}
                            onChange={(e) => setLinkDraft(e.target.value)}
                            placeholder="https://zoom.us/..."
                            className="h-6 w-48 text-[11px]"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveVideoLink(a.id, linkDraft);
                              if (e.key === "Escape") setEditingLink(null);
                            }}
                          />
                          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => saveVideoLink(a.id, linkDraft)}>
                            OK
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setEditingLink(null)}>
                            ✕
                          </Button>
                        </div>
                      ) : a.video_call_link ? (
                        <div className="inline-flex items-center gap-1.5">
                          <a href={a.video_call_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline text-[11px]">
                            <Video className="h-3 w-3" /> {detectProvider(a.video_call_link)}
                          </a>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 w-5 p-0"
                            onClick={() => { setEditingLink(a.id); setLinkDraft(a.video_call_link ?? ""); }}
                            title="Bearbeiten"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => { setEditingLink(a.id); setLinkDraft(""); }}
                        >
                          <Video className="h-3 w-3 mr-1" /> hinzufügen
                        </Button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {attended ? (
                        <Badge variant="outline" className="text-[9px] border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> erschienen
                        </Badge>
                      ) : isNoShow ? (
                        <Badge variant="outline" className="text-[9px] border-destructive/40 text-destructive">
                          <XCircle className="h-3 w-3 mr-1" /> No-Show
                        </Badge>
                      ) : canAct ? (
                        <div className="inline-flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => handleMarkAttended(a.id)}
                            title="Termin als erschienen markieren"
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" /> erschienen
                          </Button>
                          {startInPast && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive"
                              onClick={() => handleMarkNoShow(a.id)}
                              title="Termin als No-Show markieren"
                            >
                              No-Show
                            </Button>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[10px]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
