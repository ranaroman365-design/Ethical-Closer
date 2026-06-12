/**
 * Brand Prefill — generalized multi-brand version of mbf-prefill.
 *
 * Reads any partner-brand query params on /booking entry (source_system=*),
 * persists them per session, and tags the resulting lead + appointment with
 * the canonical brand source without overwriting existing attribution.
 *
 * Strictly additive: routing, ownership, commissions, and product
 * recommendation surfaces are untouched. Backed by the brands table
 * (resolved server-side via resolve_brand_from_source during edge
 * function intake, mirrored client-side via lead.source/origin_funnel).
 *
 * Backwards-compatible with mbf-prefill.ts (still used by Booking.tsx).
 */
import { supabase } from "@/integrations/supabase/client";

const SS_KEY = "etc_brand_prefill_v1";

export interface BrandPrefill {
  source_system: string;
  brand?: string | null;
  entry_route?: string | null;
  funnel?: string | null;
  offer?: string | null;
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

/** Capture brand prefill from URL once per session for any partner brand. */
export function captureBrandPrefill(): BrandPrefill | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.sessionStorage.getItem(SS_KEY);
    if (existing) {
      try { return JSON.parse(existing) as BrandPrefill; } catch { /* fall through */ }
    }
    const p = new URLSearchParams(window.location.search);
    const src = trim(p.get("source_system"));
    if (!src) return null;
    const data: BrandPrefill = {
      source_system: src,
      brand: trim(p.get("brand")),
      entry_route: trim(p.get("entry_route")),
      funnel: trim(p.get("funnel")),
      offer: trim(p.get("offer")),
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

export function getBrandPrefill(): BrandPrefill | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BrandPrefill;
  } catch { return null; }
}

export function isBrandSession(): boolean {
  return !!getBrandPrefill();
}

/** Resolve brand_id server-side from source_system. */
export async function resolveBrandId(sourceSystem: string): Promise<string | null> {
  try {
    const { data } = await supabase.rpc(
      "resolve_brand_from_source" as never,
      { _source_system: sourceSystem } as never,
    );
    return (data as string | null) ?? null;
  } catch {
    return null;
  }
}

/** Tag a lead with brand attribution (additive; preserves prior metadata). */
export async function applyBrandToLead(leadId: string | null | undefined): Promise<void> {
  if (!leadId) return;
  const bp = getBrandPrefill();
  if (!bp) return;
  try {
    const brandId = await resolveBrandId(bp.source_system);
    const { data: row } = await supabase
      .from("leads")
      .select("metadata, source_funnel, origin_funnel, origin_brand_id")
      .eq("id", leadId)
      .maybeSingle();
    const prevMeta = (row?.metadata as Record<string, unknown> | null) ?? {};
    const update: Record<string, unknown> = {
      source: bp.source_system.toLowerCase().slice(0, 32),
      metadata: { ...prevMeta, brand_prefill: bp, source_system: bp.source_system },
    };
    if (brandId && !row?.origin_brand_id) update.origin_brand_id = brandId;
    if (!row?.source_funnel && bp.entry_route) update.source_funnel = bp.entry_route;
    if (!row?.origin_funnel && bp.entry_route) update.origin_funnel = bp.entry_route;
    if (bp.offer) update.origin_offer = bp.offer;
    await supabase.from("leads").update(update as never).eq("id", leadId);
  } catch (err) {
    console.warn("[brand-prefill] applyBrandToLead failed (non-blocking)", err);
  }
}

/** Tag an appointment with brand attribution (additive). */
export async function applyBrandToAppointment(appointmentId: string | null | undefined): Promise<void> {
  if (!appointmentId) return;
  const bp = getBrandPrefill();
  if (!bp) return;
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
        booking_source: bp.source_system.toLowerCase().slice(0, 32),
        origin_source: bp.entry_route ?? null,
        metadata: { ...prevMeta, brand_prefill: bp, source_system: bp.source_system },
      } as never)
      .eq("id", appointmentId);
  } catch (err) {
    console.warn("[brand-prefill] applyBrandToAppointment failed (non-blocking)", err);
  }
}
