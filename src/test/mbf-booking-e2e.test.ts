/**
 * MBF Booking E2E — verifies the Mama-baut-Freiheit → /booking handoff:
 *   1. Query params on /booking are captured into session
 *   2. Contact step is skipped when name/email/phone are all prefilled
 *   3. Resulting lead is tagged source="mbf"
 *   4. Resulting appointment is tagged booking_source="mbf" + origin_source=entry_route
 *   5. Owner assignment is left intact (the bridge never touches current_owner_*)
 *
 * Mocks the Supabase client to capture writes; no network.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase mock: record every .update() payload, return canned reads ──
type AnyRec = Record<string, unknown>;
const updates: Array<{ table: string; payload: AnyRec; id: string }> = [];

const leadRow: AnyRec = { metadata: { existing: true }, source_funnel: null };
const apptRow: AnyRec = {
  metadata: null,
  current_owner_id: "owner-da2c",
  current_owner_role: "operator",
};

vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    let currentId = "";
    const api: AnyRec = {
      select: () => api,
      eq: (_col: string, val: string) => {
        currentId = val;
        return api;
      },
      maybeSingle: async () => ({
        data: table === "leads" ? leadRow : apptRow,
        error: null,
      }),
      update: (payload: AnyRec) => ({
        eq: async (_col: string, val: string) => {
          updates.push({ table, payload, id: val });
          return { data: null, error: null };
        },
      }),
    };
    return api;
  };
  return { supabase: { from: (t: string) => builder(t) } };
});

// Import AFTER mock
import {
  captureMbfPrefill,
  getMbfPrefill,
  isMbfSession,
  applyMbfToLead,
  applyMbfToAppointment,
} from "@/lib/mbf-prefill";

// ── /booking contact-step skip decision (mirrors Booking.tsx lines 60-62) ──
function decideInitialStep(mbf: { name?: string | null; email?: string | null; phone?: string | null } | null): "contact" | "slots" {
  if (mbf?.name && mbf?.email && mbf?.phone) return "slots";
  return "contact";
}

const MBF_URL =
  "/booking?source_system=MBF" +
  "&brand=Mama%20baut%20Freiheit" +
  "&entry_route=%2Fstart-jetzt" +
  "&funnel=mbf_quiz" +
  "&name=Lisa%20Test" +
  "&email=lisa.test%40example.com" +
  "&phone=%2B4915112345678" +
  "&utm_source=meta" +
  "&utm_campaign=mbf_meta_q2" +
  "&session_id=sess-abc-123";

beforeEach(() => {
  updates.length = 0;
  window.sessionStorage.clear();
  // jsdom lets us set window.location via history API for search updates
  window.history.replaceState({}, "", MBF_URL);
});

describe("MBF Booking E2E (handoff /booking)", () => {
  it("captures MBF query params into session storage", () => {
    const mbf = captureMbfPrefill();
    expect(mbf).not.toBeNull();
    expect(mbf!.source_system).toBe("MBF");
    expect(mbf!.brand).toBe("Mama baut Freiheit");
    expect(mbf!.entry_route).toBe("/start-jetzt");
    expect(mbf!.funnel).toBe("mbf_quiz");
    expect(mbf!.name).toBe("Lisa Test");
    expect(mbf!.email).toBe("lisa.test@example.com");
    expect(mbf!.phone).toBe("+4915112345678");
    expect(mbf!.utm_campaign).toBe("mbf_meta_q2");
    expect(mbf!.session_id).toBe("sess-abc-123");
    expect(isMbfSession()).toBe(true);
    // idempotent — second call returns persisted value
    expect(getMbfPrefill()?.session_id).toBe("sess-abc-123");
  });

  it("skips the contact step when name/email/phone are all present", () => {
    const mbf = captureMbfPrefill();
    expect(decideInitialStep(mbf)).toBe("slots");
  });

  it("does NOT skip the contact step if any required field is missing", () => {
    window.history.replaceState({}, "", "/booking?source_system=MBF&name=Lisa&email=l%40e.com");
    window.sessionStorage.clear();
    const mbf = captureMbfPrefill();
    expect(mbf).not.toBeNull();
    expect(decideInitialStep(mbf)).toBe("contact");
  });

  it("ignores non-MBF traffic (no capture, no skip)", () => {
    window.history.replaceState({}, "", "/booking?utm_source=google");
    window.sessionStorage.clear();
    expect(captureMbfPrefill()).toBeNull();
    expect(isMbfSession()).toBe(false);
    expect(decideInitialStep(null)).toBe("contact");
  });

  it("tags lead with source=mbf and preserves existing metadata", async () => {
    captureMbfPrefill();
    await applyMbfToLead("lead-123");

    const leadUpdate = updates.find((u) => u.table === "leads");
    expect(leadUpdate).toBeDefined();
    expect(leadUpdate!.id).toBe("lead-123");
    expect(leadUpdate!.payload.source).toBe("mbf");
    expect(leadUpdate!.payload.source_funnel).toBe("/start-jetzt");
    const meta = leadUpdate!.payload.metadata as AnyRec;
    expect(meta.existing).toBe(true); // preserved
    expect(meta.source_system).toBe("MBF");
    expect((meta.mbf_prefill as AnyRec).brand).toBe("Mama baut Freiheit");
  });

  it("tags appointment with booking_source=mbf + origin_source=entry_route", async () => {
    captureMbfPrefill();
    await applyMbfToAppointment("appt-456");

    const apptUpdate = updates.find((u) => u.table === "appointments");
    expect(apptUpdate).toBeDefined();
    expect(apptUpdate!.id).toBe("appt-456");
    expect(apptUpdate!.payload.booking_source).toBe("mbf");
    expect(apptUpdate!.payload.origin_source).toBe("/start-jetzt");
    const meta = apptUpdate!.payload.metadata as AnyRec;
    expect(meta.source_system).toBe("MBF");
    expect((meta.mbf_prefill as AnyRec).utm_campaign).toBe("mbf_meta_q2");
  });

  it("never overwrites current_owner_* on the appointment (assignment intact)", async () => {
    captureMbfPrefill();
    await applyMbfToAppointment("appt-456");
    const apptUpdate = updates.find((u) => u.table === "appointments");
    expect(apptUpdate).toBeDefined();
    expect(Object.keys(apptUpdate!.payload)).not.toContain("current_owner_id");
    expect(Object.keys(apptUpdate!.payload)).not.toContain("current_owner_role");
  });

  it("is a no-op outside an MBF session", async () => {
    window.history.replaceState({}, "", "/booking");
    window.sessionStorage.clear();
    await applyMbfToLead("lead-x");
    await applyMbfToAppointment("appt-x");
    expect(updates).toHaveLength(0);
  });
});
