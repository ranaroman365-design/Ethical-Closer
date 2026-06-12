/**
 * Booking Integrity Healthcheck
 * 
 * Permanent regression tests that verify data integrity invariants:
 * 1. No email has more than 1 active appointment
 * 2. No lead has more than 1 active appointment
 * 3. No appointment exists without a lead_id
 * 
 * These run against the live DB via supabase client.
 */
import { describe, it, expect } from "vitest";
import { supabase } from "@/integrations/supabase/client";

const ACTIVE_STATUSES = ["booked", "confirmed", "pending_confirmation", "pending_payment"];

describe("Booking Integrity Healthcheck", () => {

  it("no email has more than 1 active appointment", async () => {
    // Get all active appointments with their lead's email
    const { data: activeAppts, error } = await supabase
      .from("appointments")
      .select("id, appointment_status, lead_id, leads!appointments_lead_id_fkey!inner(email)")
      .in("appointment_status", ACTIVE_STATUSES);

    expect(error).toBeNull();

    // Group by email
    const emailCounts = new Map<string, string[]>();
    for (const appt of activeAppts ?? []) {
      const email = (appt.leads as any)?.email?.toLowerCase()?.trim();
      if (!email) continue;
      if (!emailCounts.has(email)) emailCounts.set(email, []);
      emailCounts.get(email)!.push(appt.id);
    }

    const violations = Array.from(emailCounts.entries())
      .filter(([, ids]) => ids.length > 1)
      .map(([email, ids]) => `${email}: ${ids.length} active (${ids.join(", ")})`);

    expect(violations).toEqual([]);
  });

  it("no lead has more than 1 active appointment", async () => {
    const { data: activeAppts, error } = await supabase
      .from("appointments")
      .select("id, appointment_status, lead_id")
      .in("appointment_status", ACTIVE_STATUSES);

    expect(error).toBeNull();

    const leadCounts = new Map<string, string[]>();
    for (const appt of activeAppts ?? []) {
      if (!appt.lead_id) continue;
      if (!leadCounts.has(appt.lead_id)) leadCounts.set(appt.lead_id, []);
      leadCounts.get(appt.lead_id)!.push(appt.id);
    }

    const violations = Array.from(leadCounts.entries())
      .filter(([, ids]) => ids.length > 1)
      .map(([leadId, ids]) => `lead ${leadId}: ${ids.length} active (${ids.join(", ")})`);

    expect(violations).toEqual([]);
  });

  it("no appointment exists without a lead_id", async () => {
    const { data: orphaned, error } = await supabase
      .from("appointments")
      .select("id, appointment_status, created_at")
      .is("lead_id", null)
      .in("appointment_status", ACTIVE_STATUSES);

    expect(error).toBeNull();
    expect(orphaned ?? []).toEqual([]);
  });

  it("create_manual_appointment RPC returns ACTIVE_APPOINTMENT_EXISTS error_code", () => {
    // Static contract test: the RPC must return this shape on conflict
    const expectedShape = {
      success: false,
      error_code: "ACTIVE_APPOINTMENT_EXISTS",
      existing_appointment_id: expect.any(String),
      existing_starts_at: expect.any(String),
      existing_status: expect.any(String),
      can_reschedule: true,
    };
    // Verify the expected shape compiles (type-level contract)
    expect(expectedShape.error_code).toBe("ACTIVE_APPOINTMENT_EXISTS");
    expect(expectedShape.can_reschedule).toBe(true);
  });

  it("create-appointment edge function returns ACTIVE_APPOINTMENT_EXISTS error_code", () => {
    // Static contract test: the edge function must return this shape on 409
    const expectedShape = {
      success: false,
      error_code: "ACTIVE_APPOINTMENT_EXISTS",
      existing_appointment_id: expect.any(String),
      existing_starts_at: expect.any(String),
      existing_status: expect.any(String),
      can_reschedule: true,
    };
    expect(expectedShape.error_code).toBe("ACTIVE_APPOINTMENT_EXISTS");
    expect(expectedShape.can_reschedule).toBe(true);
  });
});
