/**
 * MBF Prefill bridge (Mama baut Freiheit → ETC /booking).
 *
 * Reads MBF query params on /booking entry, persists them for the session,
 * and provides idempotent helpers to tag the resulting lead + appointment
 * as Source=MBF without overwriting any existing canonical attribution.
 *
 * STRICT: additive only — does NOT touch routing, ownership, commissions,
 * funnel logic, or product recommendation surfaces.
 */
import { supabase } from "@/integrations/supabase/client";

const SS_KEY = "etc_mbf_prefill_v1";

export interface MbfPrefill {
  source_system: string;          // always "MBF" when captured
  brand?: string | null;          // e.g. "Mama baut Freiheit"
  entry_route?: string | null;    // e.g. "/start-jetzt"
  funnel?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  session_id?: string | null;
  captured_at: string;
}

const trim = (v: string | null): string | null => {
  if (v == null) return null;
  const t = v.trim();
  return t ? t : null;
};

/** Read URL once and persist if source_system=MBF. Idempotent per session. */
export function captureMbfPrefill(): MbfPrefill | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.sessionStorage.getItem(SS_KEY);
    if (existing) {
      try { return JSON.parse(existing) as MbfPrefill; } catch { /* fallthrough */ }
    }
    const p = new URLSearchParams(window.location.search);
    const src = trim(p.get("source_system"));
    if (!src || src.toUpperCase() !== "MBF") return null;

    const data: MbfPrefill = {
      source_system: "MBF",
      brand: trim(p.get("brand")),
      entry_route: trim(p.get("entry_route")),
      funnel: trim(p.get("funnel")),
      name: trim(p.get("name")),
      email: trim(p.get("email"))?.toLowerCase() ?? null,
      phone: trim(p.get("phone")),
      utm_source: trim(p.get("utm_source")),
      utm_medium: trim(p.get("utm_medium")),
      utm_campaign: trim(p.get("utm_campaign")),
      utm_content: trim(p.get("utm_content")),
      utm_term: trim(p.get("utm_term")),
      session_id: trim(p.get("session_id")),
      captured_at: new Date().toISOString(),
    };
    window.sessionStorage.setItem(SS_KEY, JSON.stringify(data));
    return data;
  } catch {
    return null;
  }
}

export function getMbfPrefill(): MbfPrefill | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MbfPrefill;
  } catch { return null; }
}

export function isMbfSession(): boolean {
  return !!getMbfPrefill();
}

/** Tag a lead row as MBF (additive; preserves existing metadata). */
export async function applyMbfToLead(leadId: string | null | undefined): Promise<void> {
  if (!leadId) return;
  const mbf = getMbfPrefill();
  if (!mbf) return;
  try {
    const { data: row } = await supabase
      .from("leads")
      .select("metadata, source_funnel")
      .eq("id", leadId)
      .maybeSingle();
    const prevMeta = (row?.metadata as Record<string, unknown> | null) ?? {};
    const update: Record<string, unknown> = {
      source: "mbf",
      metadata: { ...prevMeta, mbf_prefill: mbf, source_system: "MBF" },
    };
    if (!row?.source_funnel && mbf.entry_route) update.source_funnel = mbf.entry_route;
    await supabase.from("leads").update(update as never).eq("id", leadId);
  } catch (err) {
    console.warn("[mbf-prefill] applyMbfToLead failed (non-blocking)", err);
  }
}

/** Tag an appointment row as MBF (additive). */
export async function applyMbfToAppointment(appointmentId: string | null | undefined): Promise<void> {
  if (!appointmentId) return;
  const mbf = getMbfPrefill();
  if (!mbf) return;
  try {
    const { data: row } = await supabase
      .from("appointments")
      .select("metadata")
      .eq("id", appointmentId)
      .maybeSingle();
    const prevMeta = (row?.metadata as Record<string, unknown> | null) ?? {};
    await supabase
      .from("appointments")
      .update({
        booking_source: "mbf",
        origin_source: mbf.entry_route ?? null,
        metadata: { ...prevMeta, mbf_prefill: mbf, source_system: "MBF" },
      } as never)
      .eq("id", appointmentId);
  } catch (err) {
    console.warn("[mbf-prefill] applyMbfToAppointment failed (non-blocking)", err);
  }
}
