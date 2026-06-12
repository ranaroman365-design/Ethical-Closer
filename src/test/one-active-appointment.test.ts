/**
 * One Active Appointment per Lead — Integrity Tests
 *
 * Validates the booking system enforces:
 * 1. Server-side active appointment check in create-appointment edge fn
 * 2. Server-side check in create_manual_appointment RPC
 * 3. Reschedule is not blocked
 * 4. Client-side min lead time filter (2h)
 * 5. Proper error response structure
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";

// Read edge function source
const createAppointmentSrc = fs.readFileSync(
  "supabase/functions/create-appointment/index.ts",
  "utf-8"
);

// Read frontend booking sources
const bookingSrc = fs.readFileSync("src/pages/Booking.tsx", "utf-8");
const publicBookingSrc = fs.readFileSync("src/pages/PublicBooking.tsx", "utf-8");
const curatedSlotPickerSrc = fs.readFileSync(
  "src/components/booking/CuratedSlotPicker.tsx",
  "utf-8"
);
const slotPickerSrc = fs.readFileSync(
  "src/components/booking/SlotPicker.tsx",
  "utf-8"
);

// Read latest create_manual_appointment RPC
const migrationsDir = "supabase/migrations";
const migrationFiles = fs.readdirSync(migrationsDir).sort().reverse();
const manualRpcMigration = migrationFiles
  .map((f) => fs.readFileSync(`${migrationsDir}/${f}`, "utf-8"))
  .find((c) => c.includes("create_manual_appointment") && c.includes("lead_has_active_appointment"));

describe("One Active Appointment — Server-Side Enforcement", () => {
  it("create-appointment checks for active appointments before booking", () => {
    expect(createAppointmentSrc).toContain("ACTIVE_APPOINTMENT_EXISTS");
    expect(createAppointmentSrc).toContain("existing_appointment_id");
    expect(createAppointmentSrc).toContain("existing_starts_at");
    expect(createAppointmentSrc).toContain("can_reschedule");
  });

  it("blocks non-reschedule bookings when active appointment exists", () => {
    // When reschedule is NOT true and there's an active appointment, it must block
    expect(createAppointmentSrc).toContain("if (!reschedule)");
    expect(createAppointmentSrc).toContain("BLOCKED: lead");
  });

  it("allows reschedule when active appointment exists (supersede)", () => {
    // When reschedule IS true, old appointment is superseded
    expect(createAppointmentSrc).toContain("IS a reschedule");
    expect(createAppointmentSrc).toContain("superseded");
  });

  it("checks by lead_id AND email for active appointments", () => {
    // Must check both lead_id and email to catch duplicate leads
    expect(createAppointmentSrc).toContain("lead_id");
    expect(createAppointmentSrc).toContain("Email-match");
  });

  it("includes pending_confirmation in active status check", () => {
    expect(createAppointmentSrc).toContain("pending_confirmation");
  });

  it("create_manual_appointment RPC has active appointment check", () => {
    expect(manualRpcMigration).toBeDefined();
    expect(manualRpcMigration).toContain("lead_has_active_appointment");
  });
});

describe("One Active Appointment — Frontend UX", () => {
  it("Booking.tsx handles ACTIVE_APPOINTMENT_EXISTS error", () => {
    expect(bookingSrc).toContain("ACTIVE_APPOINTMENT_EXISTS");
    expect(bookingSrc).toContain("activeAppointmentConflict");
    expect(bookingSrc).toContain("ActiveAppointmentConflict");
  });

  it("PublicBooking.tsx handles ACTIVE_APPOINTMENT_EXISTS error", () => {
    expect(publicBookingSrc).toContain("ACTIVE_APPOINTMENT_EXISTS");
    expect(publicBookingSrc).toContain("activeConflict");
    expect(publicBookingSrc).toContain("ActiveAppointmentConflict");
  });

  it("Booking.tsx shows reschedule CTA, not generic error", () => {
    expect(bookingSrc).toContain("onReschedule");
    expect(bookingSrc).toContain("onKeepExisting");
    expect(bookingSrc).toContain("reschedule=true");
  });

  it("PublicBooking.tsx shows reschedule CTA, not generic error", () => {
    expect(publicBookingSrc).toContain("onReschedule");
    expect(publicBookingSrc).toContain("onKeepExisting");
  });
});

describe("One Active Appointment — Min Lead Time (2h)", () => {
  it("server uses 2h minimum lead time", () => {
    expect(createAppointmentSrc).toContain("2 * 60 * 60 * 1000");
    expect(createAppointmentSrc).toContain("mindestens 2 Stunden");
  });

  it("CuratedSlotPicker filters slots within 2h client-side", () => {
    expect(curatedSlotPickerSrc).toContain("MIN_LEAD_TIME_MS");
    expect(curatedSlotPickerSrc).toContain("filterMinLeadTime");
    expect(curatedSlotPickerSrc).toContain("2 * 60 * 60 * 1000");
  });

  it("SlotPicker filters slots within 2h client-side", () => {
    expect(slotPickerSrc).toContain("minLeadCutoff");
    expect(slotPickerSrc).toContain("2 * 60 * 60 * 1000");
  });
});

describe("One Active Appointment — Reschedule Coherence", () => {
  it("reschedule flag passes through to edge function", () => {
    expect(bookingSrc).toContain("reschedule: isReschedule");
  });

  it("supersede uses proper statuses including pending_confirmation", () => {
    expect(createAppointmentSrc).toMatch(
      /superseded.*pending_confirmation|pending_confirmation.*superseded/s
    );
  });

  it("reschedule_count is incremented on reschedule", () => {
    expect(createAppointmentSrc).toContain("reschedule_count");
  });
});
