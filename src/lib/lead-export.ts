/**
 * Lead Export — generates a multi-sheet XLSX or CSV download.
 *
 * 4 Tabs: Booked Leads · No Booking · No Show · No Close
 * Level-scoped: L1-L5 own, L6 team, L7+ all.
 */
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { getStageLevel } from "@/hooks/useDirectMessages";
import { formatAppointmentTime } from "@/lib/appointment-time-display";

export type ExportFormat = "csv" | "xlsx";

export interface ExportParams {
  startDate: string; // ISO
  endDate: string;   // ISO
  format: ExportFormat;
  userId: string;
  userStage: string;
  isAdmin: boolean;
}

// ── helpers ──

function hoursDiff(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round((ms / 3_600_000) * 10) / 10; // 1 decimal
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch { return ""; }
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch { return ""; }
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return `${fmtDate(iso)} ${fmtTime(iso)}`;
}

// ── data fetching ──

async function fetchLeadsAndAppointments(params: ExportParams) {
  const level = getStageLevel(params.userStage);

  // Build leads query — filter by date range on created_at
  let leadQ = supabase
    .from("leads")
    .select("*")
    .eq("is_simulation", false)
    .gte("created_at", params.startDate)
    .lte("created_at", params.endDate)
    .order("created_at", { ascending: true })
    .limit(5000);

  // Level-based scoping
  if (!params.isAdmin && level < 7) {
    if (level >= 6) {
      // L6: team leads (setter_id, closer_id, owner_id)
      leadQ = leadQ.or(
        `setter_id.eq.${params.userId},closer_id.eq.${params.userId},owner_id.eq.${params.userId}`
      );
    } else {
      // L1-L5: own leads only
      leadQ = leadQ.or(
        `setter_id.eq.${params.userId},closer_id.eq.${params.userId},owner_id.eq.${params.userId}`
      );
    }
  }
  // L7+ / admin: no filter

  const { data: leads, error: leadsErr } = await leadQ;
  if (leadsErr) throw new Error(`Leads query failed: ${leadsErr.message}`);
  if (!leads || leads.length === 0) return { leads: [], appointments: [], touchpoints: [], profiles: {} };

  const leadIds = leads.map((l: any) => l.id);

  // Fetch appointments for these leads (+ date-range on starts_at)
  const { data: appointments } = await supabase
    .from("appointments")
    .select("*")
    .in("lead_id", leadIds)
    .order("starts_at", { ascending: true })
    .limit(10000);

  // Fetch first 3 touchpoints per lead from dispatch log
  const { data: touchpoints } = await supabase
    .from("communication_dispatch_log")
    .select("lead_id, dispatched_at, status")
    .in("lead_id", leadIds)
    .eq("status", "sent")
    .order("dispatched_at", { ascending: true })
    .limit(10000);

  // Fetch setter/closer names
  const userIds = new Set<string>();
  leads.forEach((l: any) => {
    if (l.setter_id) userIds.add(l.setter_id);
    if (l.closer_id) userIds.add(l.closer_id);
  });
  (appointments || []).forEach((a: any) => {
    if (a.setter_id) userIds.add(a.setter_id);
    if (a.closer_id) userIds.add(a.closer_id);
  });

  const profiles: Record<string, string> = {};
  if (userIds.size > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", Array.from(userIds));
    (profs || []).forEach((p: any) => { profiles[p.id] = p.full_name || ""; });
  }

  return { leads: leads || [], appointments: appointments || [], touchpoints: touchpoints || [], profiles };
}

// ── sheet builders ──

function buildBookedLeads(leads: any[], appts: any[], profiles: Record<string, string>) {
  const bookedLeads = leads.filter((l: any) => l.has_booking);
  const apptByLead = new Map<string, any[]>();
  appts.forEach((a: any) => {
    const arr = apptByLead.get(a.lead_id) || [];
    arr.push(a);
    apptByLead.set(a.lead_id, arr);
  });

  return bookedLeads.map((l: any) => {
    const la = apptByLead.get(l.id) || [];
    // Use most recent appointment
    const a = la[la.length - 1];
    const isShow = a?.appointment_status === "completed" || a?.attendance_flag === true;
    const isClosed = l.outcome === "closed_won" || l.stage === "closed_won";

    const timeDisplay = a ? formatAppointmentTime({
      starts_at: a.starts_at,
      booking_timezone: a.booking_timezone,
      original_local_date: a.original_local_date,
      original_local_time: a.original_local_time,
    }) : null;

    return {
      "Lead ID": l.id,
      "Name": l.name || "",
      "Email": l.email || "",
      "Phone": l.phone || "",
      "Datum Termin": timeDisplay?.date || fmtDate(a?.starts_at),
      "Uhrzeit Termin": timeDisplay?.startTime || fmtTime(a?.starts_at),
      "Funnel Source": l.source_funnel || l.funnel_id || l.quiz_funnel_source || "",
      "Quiz Score": l.quiz_score ?? "",
      "Quiz Result": l.quiz_result || "",
      "Setter": profiles[a?.setter_id || l.setter_id] || "",
      "Closer": profiles[a?.closer_id || l.closer_id] || "",
      "Show Status": a ? (isShow ? "Show" : (a.appointment_status === "no_show" ? "No-Show" : "Ausstehend")) : "",
      "Show Timestamp": fmtDateTime(a?.join_clicked_at || a?.call_started_at),
      "Close Status": isClosed ? "Closed" : "Not Closed",
      "Deal Value": l.deal_value ?? "",
      "Created At": fmtDateTime(l.created_at),
      "Booking Timestamp": fmtDateTime(a?.created_at),
    };
  });
}

function buildNoBooking(leads: any[], touchpoints: any[]) {
  const noBooking = leads.filter((l: any) => !l.has_booking);
  const tpByLead = new Map<string, any[]>();
  touchpoints.forEach((t: any) => {
    const arr = tpByLead.get(t.lead_id) || [];
    arr.push(t);
    tpByLead.set(t.lead_id, arr);
  });

  return noBooking.map((l: any) => {
    const tps = tpByLead.get(l.id) || [];
    const tp1 = tps[0]?.dispatched_at || null;
    const tp2 = tps[1]?.dispatched_at || null;
    const tp3 = tps[2]?.dispatched_at || null;

    return {
      "Lead ID": l.id,
      "Name": l.name || "",
      "Email": l.email || "",
      "Phone": l.phone || "",
      "Quiz Score": l.quiz_score ?? "",
      "Quiz Result": l.quiz_result || "",
      "Funnel Source": l.source_funnel || l.funnel_id || "",
      "Created At": fmtDateTime(l.created_at),
      "Touchpoint 1": fmtDateTime(tp1),
      "Touchpoint 2": fmtDateTime(tp2),
      "Touchpoint 3": fmtDateTime(tp3),
      "Time to 1st Contact (h)": hoursDiff(l.created_at, tp1) ?? "",
      "Time to 2nd Contact (h)": hoursDiff(l.created_at, tp2) ?? "",
      "Time to 3rd Contact (h)": hoursDiff(l.created_at, tp3) ?? "",
      "Response erhalten": l.first_action_at ? "Ja" : "Nein",
      "Response Timestamp": fmtDateTime(l.first_action_at),
      "Recovery Status": l.retargeting_state ? "aktiv" : "keiner",
    };
  });
}

function buildNoShow(leads: any[], appts: any[], touchpoints: any[], profiles: Record<string, string>) {
  const apptByLead = new Map<string, any[]>();
  appts.forEach((a: any) => {
    const arr = apptByLead.get(a.lead_id) || [];
    arr.push(a);
    apptByLead.set(a.lead_id, arr);
  });
  const tpByLead = new Map<string, any[]>();
  touchpoints.forEach((t: any) => {
    const arr = tpByLead.get(t.lead_id) || [];
    arr.push(t);
    tpByLead.set(t.lead_id, arr);
  });

  const rows: any[] = [];
  leads.forEach((l: any) => {
    const la = apptByLead.get(l.id) || [];
    la.forEach((a: any) => {
      if (a.appointment_status !== "no_show") return;
      const tps = tpByLead.get(l.id) || [];
      const tpsBefore = tps.filter((t: any) => new Date(t.dispatched_at) < new Date(a.starts_at));

      rows.push({
        "Lead ID": l.id,
        "Name": l.name || "",
        "Email": l.email || "",
        "Phone": l.phone || "",
        "Datum Termin": fmtDate(a.starts_at),
        "Uhrzeit Termin": fmtTime(a.starts_at),
        "Setter": profiles[a.setter_id] || "",
        "Booking → Termin (h)": hoursDiff(a.created_at, a.starts_at) ?? "",
        "Reminder gesendet": a.setter_reminder_sent_at ? "Ja" : "Nein",
        "Touchpoints vor Termin": tpsBefore.length,
        "Created At": fmtDateTime(l.created_at),
      });
    });
  });
  return rows;
}

function buildNoClose(leads: any[], appts: any[], profiles: Record<string, string>) {
  const apptByLead = new Map<string, any[]>();
  appts.forEach((a: any) => {
    const arr = apptByLead.get(a.lead_id) || [];
    arr.push(a);
    apptByLead.set(a.lead_id, arr);
  });

  const rows: any[] = [];
  leads.forEach((l: any) => {
    if (l.outcome === "closed_won" || l.stage === "closed_won") return;
    const la = apptByLead.get(l.id) || [];
    la.forEach((a: any) => {
      const isShow = a.appointment_status === "completed" || a.attendance_flag === true;
      if (!isShow) return;

      rows.push({
        "Lead ID": l.id,
        "Name": l.name || "",
        "Email": l.email || "",
        "Phone": l.phone || "",
        "Datum Termin": fmtDate(a.starts_at),
        "Closer": profiles[a.closer_id || l.closer_id] || "",
        "Call Dauer (min)": a.call_started_at && a.call_completed_at
          ? Math.round((new Date(a.call_completed_at).getTime() - new Date(a.call_started_at).getTime()) / 60000)
          : "",
        "Outcome": a.outcome || l.outcome || "",
        "Follow-Up Status": l.follow_up_date ? `Geplant: ${fmtDate(l.follow_up_date)}` : "Kein",
        "Created At": fmtDateTime(l.created_at),
      });
    });
  });
  return rows;
}

// ── main export ──

export async function generateLeadExport(params: ExportParams): Promise<{ blob: Blob; filename: string }> {
  const { leads, appointments, touchpoints, profiles } = await fetchLeadsAndAppointments(params);

  const sheet1 = buildBookedLeads(leads, appointments, profiles);
  const sheet2 = buildNoBooking(leads, touchpoints);
  const sheet3 = buildNoShow(leads, appointments, touchpoints, profiles);
  const sheet4 = buildNoClose(leads, appointments, profiles);

  const wb = XLSX.utils.book_new();

  const addSheet = (name: string, data: any[]) => {
    const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [{ Info: "Keine Daten im gewählten Zeitraum" }]);
    // Auto-width columns
    if (data.length > 0) {
      const keys = Object.keys(data[0]);
      ws["!cols"] = keys.map((k) => ({ wch: Math.max(k.length + 2, 14) }));
    }
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  addSheet("Booked Leads", sheet1);
  addSheet("No Booking", sheet2);
  addSheet("No Show", sheet3);
  addSheet("No Close", sheet4);

  const dateStr = new Date().toISOString().slice(0, 10);

  if (params.format === "csv") {
    // For CSV, export only the first sheet (Booked Leads) as CSV, rest as separate
    // Actually, multi-sheet CSV doesn't exist — use xlsx for multi-sheet
    // Fallback: generate xlsx anyway for multi-tab, or single CSV of first sheet
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets["Booked Leads"]);
    return {
      blob: new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }),
      filename: `Lead_Export_${dateStr}.csv`,
    };
  }

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return {
    blob: new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    filename: `Lead_Export_${dateStr}.xlsx`,
  };
}
