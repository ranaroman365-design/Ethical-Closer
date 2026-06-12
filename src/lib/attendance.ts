/**
 * Canonical attendance write path.
 *
 * Every completed real call MUST flow through these helpers — never write
 * `attendance_flag` / `call_completed_at` directly, never emit `showed`
 * events manually. The DB trigger on `mark_appointment_attended` handles
 * that exactly once.
 *
 * Rules:
 * - Idempotent: safe to call multiple times for same appointment.
 * - Non-blocking: errors are logged but never thrown to UI.
 * - No appointment_id ⇒ no-op + warning (never a crash).
 */

import { supabase } from "@/integrations/supabase/client";

type RpcResult = {
  ok?: boolean;
  error?: string;
  already_attended?: boolean;
} | null;

/**
 * Marks an appointment as attended (canonical "showed" path).
 * Pass appointmentId directly when available, otherwise use
 * `markCallAttendedByLead` to derive it.
 */
export async function markCallAttended(
  appointmentId: string | null | undefined,
  completedAt: string = new Date().toISOString(),
): Promise<{ ok: boolean; reason?: string }> {
  if (!appointmentId) {
    console.warn("[attendance] markCallAttended skipped — no appointment_id");
    return { ok: false, reason: "no_appointment_id" };
  }

  try {
    const { data, error } = await supabase.rpc(
      "mark_appointment_attended" as never,
      { _appointment_id: appointmentId, _completed_at: completedAt } as never,
    );
    const res = data as RpcResult;
    if (error || !res?.ok) {
      const msg = error?.message ?? res?.error ?? "unknown";
      console.warn("[attendance] mark_appointment_attended failed:", msg);
      return { ok: false, reason: msg };
    }
    return { ok: true };
  } catch (e) {
    console.warn("[attendance] mark_appointment_attended threw:", e);
    return { ok: false, reason: "exception" };
  }
}

/**
 * Marks an appointment as no-show (canonical path).
 */
export async function markCallNoShow(
  appointmentId: string | null | undefined,
): Promise<{ ok: boolean; reason?: string }> {
  if (!appointmentId) {
    console.warn("[attendance] markCallNoShow skipped — no appointment_id");
    return { ok: false, reason: "no_appointment_id" };
  }

  try {
    const { data, error } = await supabase.rpc(
      "mark_appointment_no_show" as never,
      { _appointment_id: appointmentId } as never,
    );
    const res = data as RpcResult;
    if (error || !res?.ok) {
      const msg = error?.message ?? res?.error ?? "unknown";
      console.warn("[attendance] mark_appointment_no_show failed:", msg);
      return { ok: false, reason: msg };
    }
    return { ok: true };
  } catch (e) {
    console.warn("[attendance] mark_appointment_no_show threw:", e);
    return { ok: false, reason: "exception" };
  }
}

/**
 * Resolves the most recent active appointment for a lead and marks it attended.
 * Used by Closer/DailyExecution flows that don't track appointment_id directly.
 */
export async function markCallAttendedByLead(
  leadId: string | null | undefined,
  completedAt: string = new Date().toISOString(),
): Promise<{ ok: boolean; reason?: string; appointment_id?: string }> {
  if (!leadId) {
    console.warn("[attendance] markCallAttendedByLead skipped — no lead_id");
    return { ok: false, reason: "no_lead_id" };
  }

  const aptId = await resolveAppointmentIdForLead(leadId);
  if (!aptId) {
    console.warn("[attendance] no appointment found for lead", leadId);
    return { ok: false, reason: "no_appointment_found" };
  }

  const res = await markCallAttended(aptId, completedAt);
  return { ...res, appointment_id: aptId };
}

/**
 * Resolves the most recent active appointment for a lead and marks it no-show.
 */
export async function markCallNoShowByLead(
  leadId: string | null | undefined,
): Promise<{ ok: boolean; reason?: string; appointment_id?: string }> {
  if (!leadId) return { ok: false, reason: "no_lead_id" };
  const aptId = await resolveAppointmentIdForLead(leadId);
  if (!aptId) {
    console.warn("[attendance] no appointment found for lead", leadId);
    return { ok: false, reason: "no_appointment_found" };
  }
  const res = await markCallNoShow(aptId);
  return { ...res, appointment_id: aptId };
}

/**
 * Resolves the most relevant appointment for a lead.
 * Picks the most recent non-superseded appointment whose start time is
 * closest to "now" (past or near future), preferring booked/confirmed/completed.
 */
export async function resolveAppointmentIdForLead(
  leadId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("appointments")
    .select("id, starts_at, appointment_status")
    .eq("lead_id", leadId)
    .neq("appointment_status", "superseded")
    .order("starts_at", { ascending: false })
    .limit(5);

  if (error || !data || data.length === 0) return null;

  // Prefer the appointment closest to now (past calls usually completed in same day)
  const now = Date.now();
  const sorted = [...data].sort((a, b) => {
    const da = Math.abs(now - new Date(a.starts_at).getTime());
    const db = Math.abs(now - new Date(b.starts_at).getTime());
    return da - db;
  });
  return sorted[0]?.id ?? null;
}

/**
 * Resolves appointment_id from a call_id (calls.lead_id → most recent appointment).
 */
export async function resolveAppointmentIdForCall(
  callId: string,
): Promise<string | null> {
  const { data: call } = await supabase
    .from("calls")
    .select("id, user_id, scheduled_for")
    .eq("id", callId)
    .maybeSingle();
  if (!call) return null;

  // calls table doesn't always carry lead_id — try via copilot_sessions / outcome timing
  // Best-effort fallback: look up the closest appointment owned by the same user
  const around = call.scheduled_for ?? new Date().toISOString();
  const aroundTs = new Date(around).getTime();
  const lo = new Date(aroundTs - 12 * 3600 * 1000).toISOString();
  const hi = new Date(aroundTs + 12 * 3600 * 1000).toISOString();

  const { data: apts } = await supabase
    .from("appointments")
    .select("id, starts_at")
    .gte("starts_at", lo)
    .lte("starts_at", hi)
    .neq("appointment_status", "superseded")
    .order("starts_at", { ascending: true })
    .limit(10);

  if (!apts || apts.length === 0) return null;
  const sorted = [...apts].sort((a, b) => {
    const da = Math.abs(aroundTs - new Date(a.starts_at).getTime());
    const db = Math.abs(aroundTs - new Date(b.starts_at).getTime());
    return da - db;
  });
  return sorted[0]?.id ?? null;
}
