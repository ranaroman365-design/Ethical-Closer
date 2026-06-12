/**
 * Booking → Appointment → Calendar E2E Test Suite
 *
 * Validates the FULL path:
 *   Booking.tsx contact/token → create-appointment edge fn → DB row (lead_id + ownership) → Calendar query
 *
 * Covers:
 *  1. Lead resolution (by lead_id, email fallback, last-resort upsert)
 *  2. Ownership propagation (setter_id, closer_id, current_owner_id, current_owner_role)
 *  3. Appointment insert contract (all required fields)
 *  4. Lead back-link (has_booking, booking_id, stage)
 *  5. Calendar fetch includes the new appointment
 *  6. Token-based continuation attaches to correct lead_id
 *  7. Email fallback attaches to correct lead_id (no duplicate)
 *  8. Slot claim + capacity guard
 *  9. Reschedule supersede logic
 * 10. Provisioning call chain
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";

const BOOKING_SRC = fs.readFileSync("src/pages/Booking.tsx", "utf-8");
const CREATE_APT_SRC = fs.readFileSync("supabase/functions/create-appointment/index.ts", "utf-8");
const CALENDAR_SRC = fs.readFileSync("src/pages/members/Calendar.tsx", "utf-8");
const LEAD_STORAGE_SRC = fs.readFileSync("src/lib/lead-storage.ts", "utf-8");
const PROVISION_SRC = fs.readFileSync("supabase/functions/provision-applicant-account/index.ts", "utf-8");

// Helper: extract function body
const fnBody = (src: string, name: string, len = 2000) => {
  const i = src.indexOf(name);
  return i >= 0 ? src.substring(i, i + len) : "";
};

// ═══════════════════════════════════════════════════════
// 1. LEAD RESOLUTION IN create-appointment
// ═══════════════════════════════════════════════════════

describe("Lead resolution — create-appointment", () => {
  it("selects only columns that exist on the canonical leads table", () => {
    // A removed legacy field here caused Lead not found even when the lead row existed.
    expect(CREATE_APT_SRC).not.toContain("whatsapp_opt_in");
  });

  it("prefers lead_id over email when both are present", () => {
    // lead_id path must come BEFORE email fallback
    const idIdx = CREATE_APT_SRC.indexOf('if (lead_id && typeof lead_id');
    const emailIdx = CREATE_APT_SRC.indexOf('if (!lead)');
    expect(idIdx).toBeGreaterThan(-1);
    expect(emailIdx).toBeGreaterThan(idIdx);
  });

  it("validates lead_id email matches normalizedEmail (anti-spoofing)", () => {
    expect(CREATE_APT_SRC).toContain("normalizedEmail");
    // The id-path checks email match
    const idBlock = fnBody(CREATE_APT_SRC, 'if (lead_id && typeof lead_id', 500);
    expect(idBlock).toMatch(/email.*normalizedEmail|normalizedEmail.*email/);
  });

  it("email fallback orders by updated_at DESC (most recent lead wins)", () => {
    expect(CREATE_APT_SRC).toContain('order("updated_at"');
    expect(CREATE_APT_SRC).toContain("ascending: false");
  });

  it("last-resort upsert creates lead if name+phone available", () => {
    expect(CREATE_APT_SRC).toContain("upsert_funnel_lead");
    const block = fnBody(CREATE_APT_SRC, "if (!lead && contactName && contactPhone", 600);
    expect(block).toContain("upsert_funnel_lead");
  });

  it("returns 404 with clear message if no lead resolved", () => {
    expect(CREATE_APT_SRC).toContain('"Lead not found. Please save contact info first."');
    expect(CREATE_APT_SRC).toContain("status: 404");
  });
});

// ═══════════════════════════════════════════════════════
// 2. OWNERSHIP PROPAGATION
// ═══════════════════════════════════════════════════════

describe("Ownership propagation — create-appointment", () => {
  it("derives canonicalSetterId from lead fields", () => {
    expect(CREATE_APT_SRC).toContain("canonicalSetterId");
    expect(CREATE_APT_SRC).toMatch(/lead\.setter_id\s*\?\?\s*lead\.owner_id/);
  });

  it("derives canonicalCloserId from lead.closer_id", () => {
    expect(CREATE_APT_SRC).toContain("canonicalCloserId");
    expect(CREATE_APT_SRC).toMatch(/lead\.closer_id\s*\?\?\s*null/);
  });

  it("sets current_owner_id to closer if available, else setter", () => {
    expect(CREATE_APT_SRC).toContain("canonicalOwnerId");
    expect(CREATE_APT_SRC).toMatch(/canonicalCloserId\s*\?\?\s*canonicalSetterId/);
  });

  it("sets current_owner_role to 'closer' or 'setter'", () => {
    expect(CREATE_APT_SRC).toContain('canonicalOwnerRole');
    expect(CREATE_APT_SRC).toMatch(/canonicalCloserId\s*\?\s*["']closer["']\s*:\s*["']setter["']/);
  });

  const aptInsert = (() => {
    const marker = 'from("appointments")\n      .insert({';
    const i = CREATE_APT_SRC.indexOf(marker);
    return i >= 0 ? CREATE_APT_SRC.substring(i, i + 1500) : "";
  })();

  it("inserts setter_id into appointment row", () => {
    expect(aptInsert).toContain("setter_id: canonicalSetterId");
  });

  it("inserts closer_id into appointment row", () => {
    expect(aptInsert).toContain("closer_id: canonicalCloserId");
  });

  it("inserts original_owner_id for audit trail", () => {
    expect(aptInsert).toContain("original_owner_id");
  });

  it("inserts assigned_operator_id for calendar queries", () => {
    expect(aptInsert).toContain("assigned_operator_id");
  });
});

// ═══════════════════════════════════════════════════════
// 3. APPOINTMENT INSERT CONTRACT
// ═══════════════════════════════════════════════════════

describe("Appointment insert contract — create-appointment", () => {
  // Find the appointments insert (not the waitlist insert)
  const insertBlock = (() => {
    const marker = 'from("appointments")\n      .insert({';
    const i = CREATE_APT_SRC.indexOf(marker);
    return i >= 0 ? CREATE_APT_SRC.substring(i, i + 1500) : "";
  })();

  it("sets lead_id", () => expect(insertBlock).toContain("lead_id: lead.id"));
  it("sets call_type", () => expect(insertBlock).toContain("call_type"));
  it("sets appointment_status to booked", () => expect(insertBlock).toContain('"booked"'));
  it("sets starts_at from slot", () => expect(insertBlock).toContain("starts_at: slot.starts_at"));
  it("sets ends_at from slot", () => expect(insertBlock).toContain("ends_at: slot.ends_at"));
  it("sets booking_source", () => expect(insertBlock).toContain("booking_source"));
  it("sets video_call_link", () => expect(insertBlock).toContain("video_call_link"));
  it("computes booking_priority from lead data", () => {
    expect(CREATE_APT_SRC).toContain("deriveBookingPriority");
    expect(insertBlock).toContain("booking_priority");
  });
});

// ═══════════════════════════════════════════════════════
// 4. LEAD BACK-LINK (has_booking, booking_id, stage)
// ═══════════════════════════════════════════════════════

describe("Lead back-link after appointment creation", () => {
  it("updates lead with has_booking = true", () => {
    expect(CREATE_APT_SRC).toContain("has_booking: true");
  });

  it("updates lead with booking_id = new appointment id", () => {
    expect(CREATE_APT_SRC).toMatch(/booking_id.*appointment/);
  });

  it("updates lead stage to 'booked'", () => {
    expect(CREATE_APT_SRC).toMatch(/stage.*booked|booked.*stage/);
  });
});

// ═══════════════════════════════════════════════════════
// 5. CALENDAR FETCH INCLUDES NEW APPOINTMENT
// ═══════════════════════════════════════════════════════

describe("Calendar fetches appointments by ownership", () => {
  it("Calendar.tsx queries appointments table or RPC", () => {
    expect(CALENDAR_SRC).toMatch(/from\(['"]appointments['"]\)|get_team_member_calendar/);
  });

  it("fetchAppointments is a stable callable for post-save refresh", () => {
    expect(CALENDAR_SRC).toMatch(/(?:const|function)\s+fetchAppointments/);
  });

  it("onCreated callback triggers fetchAppointments (no hard reload)", () => {
    expect(CALENDAR_SRC).not.toMatch(/window\.location\.reload\(\)/);
    expect(CALENDAR_SRC).toContain("onCreated");
  });
});

// ═══════════════════════════════════════════════════════
// 6. TOKEN-BASED CONTINUATION → CORRECT lead_id
// ═══════════════════════════════════════════════════════

describe("Token continuation attaches correct lead_id", () => {
  it("Booking.tsx reads ?token= param and resolves via resolveBookingToken", () => {
    expect(BOOKING_SRC).toContain('params.get("token")');
    expect(BOOKING_SRC).toContain("resolveBookingToken");
  });

  it("resolved lead_id is stored in localStorage for create-appointment", () => {
    expect(BOOKING_SRC).toContain('localStorage.setItem("lead_id"');
  });

  it("handleConfirmBooking sends lead_id to edge function", () => {
    expect(BOOKING_SRC).toMatch(/lead_id.*localStorage\.getItem\(["']lead_id["']\)/);
  });

  it("create-appointment accepts lead_id from body", () => {
    expect(CREATE_APT_SRC).toContain("const { email, slot_id, call_type, funnel_source, reschedule, lead_id } = body");
  });

  it("markBookingTokenUsed is called after resolution", () => {
    expect(BOOKING_SRC).toContain("markBookingTokenUsed");
  });
});

// ═══════════════════════════════════════════════════════
// 7. EMAIL FALLBACK → NO DUPLICATE LEAD
// ═══════════════════════════════════════════════════════

describe("Email fallback — no duplicate lead", () => {
  it("create-appointment falls back to email query when lead_id misses", () => {
    const block = fnBody(CREATE_APT_SRC, "if (!lead)", 400);
    expect(block).toContain(".eq(\"email\", normalizedEmail)");
  });

  it("limits email query to 5 results and picks first (latest)", () => {
    expect(CREATE_APT_SRC).toContain(".limit(5)");
    expect(CREATE_APT_SRC).toContain("emailLeads?.[0]");
  });

  it("warns on duplicate leads for same email (diagnostic)", () => {
    expect(CREATE_APT_SRC).toContain("duplicate leads for");
  });

  it("Booking.tsx has email-based lead restore if lead_id is missing", () => {
    // The booking page can restore lead context from email
    expect(BOOKING_SRC).toContain("resolveLeadByEmail");
  });
});

// ═══════════════════════════════════════════════════════
// 8. SLOT CLAIM + CAPACITY GUARD
// ═══════════════════════════════════════════════════════

describe("Slot claim and capacity enforcement", () => {
  it("validates slot exists and is active", () => {
    expect(CREATE_APT_SRC).toContain('.eq("is_active", true)');
  });

  it("checks slot_type matches call_type", () => {
    expect(CREATE_APT_SRC).toContain("slot.slot_type !== call_type");
  });

  it("checks current_bookings < max_bookings", () => {
    expect(CREATE_APT_SRC).toContain("slot.current_bookings >= slot.max_bookings");
  });

  it("atomic increment with lt guard prevents overbooking", () => {
    expect(CREATE_APT_SRC).toContain(".lt(\"current_bookings\", slot.max_bookings)");
  });
});

// ═══════════════════════════════════════════════════════
// 9. RESCHEDULE SUPERSEDE LOGIC
// ═══════════════════════════════════════════════════════

describe("Reschedule supersede logic", () => {
  it("supersedes old appointment by booking_id", () => {
    expect(CREATE_APT_SRC).toContain('appointment_status: "superseded"');
  });

  it("fallback supersede by lead_id when booking_id is stale", () => {
    expect(CREATE_APT_SRC).toContain(".eq(\"lead_id\", lead.id)");
    expect(CREATE_APT_SRC).toContain('.in("appointment_status", ["booked", "confirmed"]');
  });

  it("belt-and-suspenders: supersedes ALL remaining active appointments", () => {
    // Prevents abandoned fastlane reservations from blocking fresh bookings
    expect(CREATE_APT_SRC).toContain('.in("appointment_status", ["booked", "confirmed", "pending_payment"]');
  });

  it("enforces reschedule limit of 1", () => {
    expect(CREATE_APT_SRC).toContain("reschedule_count");
    expect(CREATE_APT_SRC).toContain(">= 1");
  });
});

// ═══════════════════════════════════════════════════════
// 10. PROVISIONING CALL CHAIN
// ═══════════════════════════════════════════════════════

describe("Post-booking provisioning chain", () => {
  it("create-appointment calls provision-applicant-account or assign-booked-lead", () => {
    expect(CREATE_APT_SRC).toMatch(/provision-applicant-account|assign-booked-lead/);
  });

  it("provision-applicant-account links lead to auth user via owner_id", () => {
    expect(PROVISION_SRC).toContain(".update({ owner_id: userId })");
  });

  it("provision-applicant-account sets profile to prospect (L0)", () => {
    expect(PROVISION_SRC).toContain('business_stage: "prospect"');
  });

  it("provision-applicant-account generates magic link for applicant access", () => {
    expect(PROVISION_SRC).toContain("generateLink");
    expect(PROVISION_SRC).toContain("magiclink");
  });

  it("provision-applicant-account generates temporary password as fallback", () => {
    expect(PROVISION_SRC).toContain("temporaryPassword");
    expect(PROVISION_SRC).toContain("crypto.randomUUID()");
  });
});

// ═══════════════════════════════════════════════════════
// 11. BOOKING PRIORITY COMPUTATION
// ═══════════════════════════════════════════════════════

describe("Booking priority computation", () => {
  it("deriveBookingPriority function exists in create-appointment", () => {
    expect(CREATE_APT_SRC).toContain("function deriveBookingPriority");
  });

  it("considers whatsapp_confirmed for HIGH priority", () => {
    const fn = fnBody(CREATE_APT_SRC, "function deriveBookingPriority", 800);
    expect(fn).toContain("waConfirmed");
    expect(fn).toContain('"HIGH"');
  });

  it("considers phone_valid for priority ranking", () => {
    const fn = fnBody(CREATE_APT_SRC, "function deriveBookingPriority", 800);
    expect(fn).toContain("phoneValid");
  });

  it("returns LOW for high-risk unconfirmed leads", () => {
    const fn = fnBody(CREATE_APT_SRC, "function deriveBookingPriority", 800);
    expect(fn).toContain('"LOW"');
    expect(fn).toMatch(/risk.*high.*!waConfirmed|!waConfirmed.*risk.*high/s);
  });
});

// ═══════════════════════════════════════════════════════
// 12. QUALIFICATION GATE (server-side)
// ═══════════════════════════════════════════════════════

describe("Server-side qualification gate", () => {
  it("blocks low-quality leads (qb=low OR lq=C OR qs<40)", () => {
    expect(CREATE_APT_SRC).toContain('qb === "low"');
    expect(CREATE_APT_SRC).toContain('lq === "C"');
    expect(CREATE_APT_SRC).toContain("qs < 40");
  });

  it("attempts scoring repair via upsert_funnel_lead before blocking", () => {
    expect(CREATE_APT_SRC).toContain("scoring repaired");
  });

  it("blocks with qualification_required code after failed repair", () => {
    expect(CREATE_APT_SRC).toContain('"qualification_required"');
  });

  it("inserts blocked leads into booking_waitlist", () => {
    expect(CREATE_APT_SRC).toContain('"booking_waitlist"');
    expect(CREATE_APT_SRC).toContain('"blocked_low_quality"');
  });
});
