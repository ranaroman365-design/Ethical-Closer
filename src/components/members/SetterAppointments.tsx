import { useEffect, useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, Check, XCircle, RotateCcw, AlertTriangle, Phone, ChevronRight } from "lucide-react";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { markCallAttended, markCallNoShow } from "@/lib/attendance";
import { AppointmentTrigger } from "@/components/calendar/AppointmentTrigger";
import { formatAppointmentTime } from "@/lib/appointment-time-display";

interface Appointment {
  id: string;
  lead_id: string;
  call_type: string;
  appointment_status: string;
  starts_at: string;
  ends_at: string;
  acknowledged_at: string | null;
  outcome: string | null;
  qualification_result: string | null;
  setter_notes: string | null;
  booking_source: string | null;
  created_at: string;
  booking_timezone: string | null;
  original_local_date: string | null;
  original_local_time: string | null;
  lead?: {
    name: string;
    email: string | null;
    phone: string | null;
    source_funnel: string | null;
    quiz_result: string | null;
    lead_quality: string | null;
  };
}

const STATUS_LABELS: Record<string, string> = {
  booked: "Gebucht",
  confirmed: "Bestätigt",
  completed: "Abgeschlossen",
  no_show: "No-Show",
  cancelled: "Abgesagt",
  rescheduled: "Verschoben",
  superseded: "Ersetzt",
};

const OUTCOME_OPTIONS = [
  { value: "attended", label: "Teilgenommen", icon: Check },
  { value: "no_show", label: "No-Show", icon: XCircle },
  { value: "rescheduled", label: "Verschoben", icon: RotateCcw },
  { value: "cancelled", label: "Abgesagt", icon: XCircle },
];

const QUAL_OPTIONS = [
  { value: "qualified", label: "Qualifiziert" },
  { value: "not_qualified", label: "Nicht qualifiziert" },
  { value: "follow_up_needed", label: "Follow-up nötig" },
];

export default function SetterAppointments() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!user) return;
    loadAppointments();
  }, [user]);

  const loadAppointments = async () => {
    const { data, error } = await supabase
      .from("appointments")
      .select(`
        id, lead_id, call_type, appointment_status, starts_at, ends_at,
        acknowledged_at, outcome, qualification_result, setter_notes,
        booking_source, created_at, booking_timezone, original_local_date, original_local_time,
        leads!appointments_lead_id_fkey (name, email, phone, source_funnel)
      `)
      .eq("setter_id", user!.id)
      .not("appointment_status", "eq", "superseded")
      .order("starts_at", { ascending: true });

    if (!error && data) {
      setAppointments(data.map((a: any) => ({ ...a, lead: a.leads })));
    }
    setLoading(false);
  };

  const upcoming = useMemo(() =>
    appointments.filter(a => ["booked", "confirmed"].includes(a.appointment_status) && new Date(a.starts_at) > new Date()),
    [appointments]
  );

  const past = useMemo(() =>
    appointments.filter(a => !["booked", "confirmed"].includes(a.appointment_status) || new Date(a.starts_at) <= new Date()),
    [appointments]
  );

  const acknowledge = async (apt: Appointment) => {
    const now = new Date().toISOString();
    await supabase
      .from("appointments")
      .update({ acknowledged_at: now, appointment_status: "confirmed", updated_at: now })
      .eq("id", apt.id);

    await supabase.from("lead_events").insert({
      lead_id: apt.lead_id,
      event_type: "setter_acknowledged",
      actor_user_id: user!.id,
      notes: "Setter acknowledged appointment",
      metadata: { appointment_id: apt.id },
    });

    toast({ title: "Termin bestätigt ✓" });
    loadAppointments();
  };

  const setOutcome = async (apt: Appointment, outcome: string) => {
    const now = new Date().toISOString();
    const newStatus = outcome === "attended" ? "completed" : outcome;

    // Canonical attendance write path — fires `showed` trigger
    if (outcome === "attended") {
      await markCallAttended(apt.id, now);
    } else if (outcome === "no_show") {
      await markCallNoShow(apt.id);
    }

    // Outcome-specific fields not handled by the RPC (e.g. follow_up, qualified)
    await supabase
      .from("appointments")
      .update({
        outcome,
        appointment_status: newStatus,
        completed_at: now,
        updated_at: now,
      })
      .eq("id", apt.id);

    await supabase.from("lead_events").insert({
      lead_id: apt.lead_id,
      event_type: "call_completed",
      actor_user_id: user!.id,
      notes: `Call outcome: ${outcome}`,
      metadata: { appointment_id: apt.id, outcome },
    });

    toast({ title: `Ergebnis: ${OUTCOME_OPTIONS.find(o => o.value === outcome)?.label}` });
    loadAppointments();
  };

  const setQualification = async (apt: Appointment, result: string) => {
    const now = new Date().toISOString();
    await supabase
      .from("appointments")
      .update({ qualification_result: result, updated_at: now })
      .eq("id", apt.id);

    // Update lead stage based on qualification
    const newStage = result === "qualified" ? "setter_qualified" : result === "follow_up_needed" ? "follow_up" : "setter_disqualified";

    // For follow_up_needed: set follow_up_date 48h from now
    const leadUpdate: any = { stage: newStage, updated_at: now };
    if (result === "follow_up_needed") {
      const followUpDate = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      leadUpdate.next_action_type = "follow_up_call";
      leadUpdate.next_action_at = followUpDate;
    }

    await supabase
      .from("leads")
      .update(leadUpdate)
      .eq("id", apt.lead_id);

    await supabase.from("lead_transitions").insert({
      lead_id: apt.lead_id,
      previous_stage: "assigned_setter",
      new_stage: newStage,
      changed_by: user!.id,
      reason: `Qualification: ${result}`,
    });

    // Log qualification event
    await supabase.from("lead_events").insert({
      lead_id: apt.lead_id,
      event_type: "lead_qualified",
      actor_user_id: user!.id,
      notes: `Qualification result: ${result}`,
      metadata: { appointment_id: apt.id, qualification_result: result },
    });

    toast({ title: `Qualifizierung: ${QUAL_OPTIONS.find(o => o.value === result)?.label}` });
    loadAppointments();
  };

  const saveNotes = async (apt: Appointment) => {
    await supabase
      .from("appointments")
      .update({ setter_notes: notes })
      .eq("id", apt.id);
    toast({ title: "Notizen gespeichert" });
  };

  const selectedApt = appointments.find(a => a.id === selectedId);

  if (loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Lade Termine…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Upcoming appointments */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Kommende Termine ({upcoming.length})
        </h3>
        {upcoming.length === 0 ? (
          <div className="rounded-lg border border-border bg-card py-8 text-center">
            <Calendar className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Keine kommenden Termine.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card divide-y divide-border/50">
            {upcoming.map(apt => {
              const start = parseISO(apt.starts_at);
              const minutesUntil = differenceInMinutes(start, new Date());
              const isUrgent = minutesUntil < 60;
              const needsAck = !apt.acknowledged_at;

              return (
                <div
                  key={apt.id}
                  className={cn(
                    "flex items-center justify-between px-4 py-3 cursor-pointer transition-colors hover:bg-muted/20",
                    needsAck && "bg-destructive/5"
                  )}
                  onClick={() => { setSelectedId(apt.id); setNotes(apt.setter_notes || ""); }}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg",
                      apt.call_type === "priority" ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"
                    )}>
                      <Phone className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{apt.lead?.name || "—"}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatAppointmentTime(apt).dateTime}
                        {apt.lead?.source_funnel && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                            {apt.lead.source_funnel}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {apt.call_type === "priority" && (
                      <Badge className="bg-amber-100 text-amber-800 text-[9px]">Priority</Badge>
                    )}
                    {needsAck && (
                      <Button size="sm" variant="destructive" onClick={(e) => { e.stopPropagation(); acknowledge(apt); }}>
                        Bestätigen
                      </Button>
                    )}
                    {isUrgent && !needsAck && (
                      <Badge variant="outline" className="text-destructive border-destructive/30 text-[9px]">
                        In {minutesUntil}min
                      </Badge>
                    )}
                    <AppointmentTrigger appointmentId={apt.id} className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
                      Kontext
                    </AppointmentTrigger>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected appointment detail */}
      {selectedApt && (
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">{selectedApt.lead?.name || "—"}</h3>
              <p className="text-xs text-muted-foreground">
                {selectedApt.lead?.email} · {selectedApt.lead?.phone}
              </p>
            </div>
            <Badge variant="outline">{STATUS_LABELS[selectedApt.appointment_status]}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Termin</p>
              <p className="font-medium">{formatAppointmentTime(selectedApt).dateTime}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Typ</p>
              <p className="font-medium capitalize">{selectedApt.call_type}</p>
            </div>
            {/* Quiz-Segment / lead quality intentionally hidden to prevent
                cherry-picking. Backend tracking unchanged. */}
            {selectedApt.lead?.source_funnel && (
              <div>
                <p className="text-xs text-muted-foreground">Funnel</p>
                <p className="font-medium">{selectedApt.lead.source_funnel}</p>
              </div>
            )}
          </div>

          {/* Outcome buttons */}
          {["booked", "confirmed"].includes(selectedApt.appointment_status) && new Date(selectedApt.starts_at) <= new Date() && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Call-Ergebnis markieren:</p>
              <div className="flex flex-wrap gap-2">
                {OUTCOME_OPTIONS.map(opt => (
                  <Button
                    key={opt.value}
                    size="sm"
                    variant={selectedApt.outcome === opt.value ? "default" : "outline"}
                    onClick={() => setOutcome(selectedApt, opt.value)}
                  >
                    <opt.icon className="h-3.5 w-3.5 mr-1" />
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Qualification */}
          {selectedApt.outcome === "attended" && !selectedApt.qualification_result && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Qualifizierung:</p>
              <div className="flex flex-wrap gap-2">
                {QUAL_OPTIONS.map(opt => (
                  <Button key={opt.value} size="sm" variant="outline" onClick={() => setQualification(selectedApt, opt.value)}>
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Notizen</p>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notizen zum Gespräch…"
              rows={3}
            />
            <Button size="sm" className="mt-2" onClick={() => saveNotes(selectedApt)}>Speichern</Button>
          </div>
        </div>
      )}

      {/* Past appointments */}
      {past.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Vergangene Termine ({past.length})
          </h3>
          <div className="rounded-lg border border-border bg-card divide-y divide-border/50">
            {past.slice(0, 10).map(apt => (
              <div key={apt.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{apt.lead?.name || "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatAppointmentTime(apt).dateTime}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {apt.outcome && <Badge variant="outline" className="text-[9px]">{apt.outcome}</Badge>}
                  {apt.qualification_result && <Badge className="text-[9px]">{apt.qualification_result}</Badge>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
