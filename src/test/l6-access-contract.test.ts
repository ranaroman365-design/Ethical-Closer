/**
 * L6 Access Contract Tests
 * ────────────────────────
 * Verifies that an L6 (Senior Closer / Operator) user:
 *   ✓ Can access Calendar (operator variant)
 *   ✓ Can access Revenue Flow, Talent Flow, Intelligence Control
 *   ✗ Cannot access foreign appointments (outside own team subtree)
 *
 * These are pure unit tests against the access-contract functions —
 * no Supabase calls, no React rendering.
 */
import { describe, it, expect } from "vitest";
import { normalizeBusinessStage } from "@/lib/stage-utils";
import { getLevelForStage } from "@/lib/kpi-config";

// ─── Inline mirror of useStageGuard ROUTE_ACCESS for contract testing ────────
const STAGE_ORDER = [
  "prospect", "opener", "setter", "associate_setter", "senior_associate",
  "junior_manager", "manager", "senior_manager",
  "director", "partner",
];

const ROUTE_ACCESS: Record<string, string[]> = {
  "/members/operator-calendar": ["senior_manager", "director", "partner"],
  "/members/intelligence": ["manager", "senior_manager", "director", "partner"],
  "/members/deal-intelligence": ["manager", "senior_manager", "director", "partner"],
  "/members/closing-os": ["junior_manager", "manager", "senior_manager", "director", "partner"],
  "/members/payment-links": ["junior_manager", "manager", "senior_manager", "director", "partner"],
  "/members/pool": ["director", "partner"],
  "/members/inner-circle": ["partner"],
};

// ─── Performance Shell access contract ───────────────────────────────────────
const PERFORMANCE_TABS = [
  { key: "revenue", minLevel: 6 },
  { key: "talent", minLevel: 6 },
  { key: "intelligence", minLevel: 6 },
] as const;

function isPerformanceTabAllowed(level: number, isAdmin: boolean, tabMinLevel: number): boolean {
  return level >= tabMinLevel || isAdmin;
}

// ─── Calendar router contract ────────────────────────────────────────────────
function resolveCalendarVariant(level: number): "operator" | "member" {
  return level >= 6 ? "operator" : "member";
}

// ─── Appointment access contract ─────────────────────────────────────────────
// Mirrors the SECURITY DEFINER logic in get_appointment_full_context
interface AppointmentAccessInput {
  callerId: string;
  callerTeamMemberIds: string[]; // IDs in caller's operator unit/subtree
  callerUnitIds: string[];       // unit IDs the caller belongs to
  appointmentSetterId: string | null;
  appointmentCloserId: string | null;
  appointmentUnitId: string | null;
}

function canAccessAppointment(input: AppointmentAccessInput): boolean {
  const { callerId, callerTeamMemberIds, callerUnitIds, appointmentSetterId, appointmentCloserId, appointmentUnitId } = input;
  // Own appointment
  if (appointmentSetterId === callerId || appointmentCloserId === callerId) return true;
  // Team subtree
  if (appointmentSetterId && callerTeamMemberIds.includes(appointmentSetterId)) return true;
  if (appointmentCloserId && callerTeamMemberIds.includes(appointmentCloserId)) return true;
  // Unit match
  if (appointmentUnitId && callerUnitIds.includes(appointmentUnitId)) return true;
  return false;
}

// ─── L6 identity ─────────────────────────────────────────────────────────────
const L6_STAGE = "senior_manager";
const L6_LEVEL = 6;
const DANIEL_ID = "daniel-l6-uuid";
const DANIEL_TEAM = ["member-a", "member-b", "member-c"];
const DANIEL_UNITS = ["unit-alpha"];

describe("L6 Access Contract", () => {
  // ── Stage normalisation sanity ──
  it("senior_manager normalises correctly", () => {
    expect(normalizeBusinessStage("senior_manager")).toBe("senior_manager");
  });

  it("L6 stage maps to level 6", () => {
    expect(getLevelForStage(L6_STAGE)).toBe(L6_LEVEL);
  });

  // ── Calendar ──
  describe("Calendar", () => {
    it("L6 gets OperatorCalendar variant", () => {
      expect(resolveCalendarVariant(L6_LEVEL)).toBe("operator");
    });

    it("L5 gets member calendar", () => {
      expect(resolveCalendarVariant(5)).toBe("member");
    });

    it("L6 stage is in operator-calendar allowed stages", () => {
      const allowed = ROUTE_ACCESS["/members/operator-calendar"];
      expect(allowed.map(normalizeBusinessStage)).toContain(normalizeBusinessStage(L6_STAGE));
    });
  });

  // ── Performance Shell tabs ──
  describe("Performance Shell — Revenue / Talent / Intelligence", () => {
    for (const tab of PERFORMANCE_TABS) {
      it(`L6 can access ${tab.key} (minLevel=${tab.minLevel})`, () => {
        expect(isPerformanceTabAllowed(L6_LEVEL, false, tab.minLevel)).toBe(true);
      });
    }

    it("L5 is denied all performance tabs", () => {
      for (const tab of PERFORMANCE_TABS) {
        expect(isPerformanceTabAllowed(5, false, tab.minLevel)).toBe(false);
      }
    });

    it("Admin always allowed regardless of level", () => {
      expect(isPerformanceTabAllowed(1, true, 6)).toBe(true);
    });
  });

  // ── Appointment access (team boundary) ──
  describe("Appointment access boundary", () => {
    it("L6 can access own appointment (as setter)", () => {
      expect(canAccessAppointment({
        callerId: DANIEL_ID,
        callerTeamMemberIds: DANIEL_TEAM,
        callerUnitIds: DANIEL_UNITS,
        appointmentSetterId: DANIEL_ID,
        appointmentCloserId: null,
        appointmentUnitId: null,
      })).toBe(true);
    });

    it("L6 can access own appointment (as closer)", () => {
      expect(canAccessAppointment({
        callerId: DANIEL_ID,
        callerTeamMemberIds: DANIEL_TEAM,
        callerUnitIds: DANIEL_UNITS,
        appointmentSetterId: null,
        appointmentCloserId: DANIEL_ID,
        appointmentUnitId: null,
      })).toBe(true);
    });

    it("L6 can access team member appointment", () => {
      expect(canAccessAppointment({
        callerId: DANIEL_ID,
        callerTeamMemberIds: DANIEL_TEAM,
        callerUnitIds: DANIEL_UNITS,
        appointmentSetterId: "member-a",
        appointmentCloserId: null,
        appointmentUnitId: null,
      })).toBe(true);
    });

    it("L6 can access appointment in own unit", () => {
      expect(canAccessAppointment({
        callerId: DANIEL_ID,
        callerTeamMemberIds: DANIEL_TEAM,
        callerUnitIds: DANIEL_UNITS,
        appointmentSetterId: "unknown-setter",
        appointmentCloserId: null,
        appointmentUnitId: "unit-alpha",
      })).toBe(true);
    });

    it("L6 CANNOT access foreign appointment (different unit, not in team)", () => {
      expect(canAccessAppointment({
        callerId: DANIEL_ID,
        callerTeamMemberIds: DANIEL_TEAM,
        callerUnitIds: DANIEL_UNITS,
        appointmentSetterId: "foreign-setter",
        appointmentCloserId: "foreign-closer",
        appointmentUnitId: "unit-foreign",
      })).toBe(false);
    });

    it("L6 CANNOT access appointment with null setter/closer in foreign unit", () => {
      expect(canAccessAppointment({
        callerId: DANIEL_ID,
        callerTeamMemberIds: DANIEL_TEAM,
        callerUnitIds: DANIEL_UNITS,
        appointmentSetterId: null,
        appointmentCloserId: null,
        appointmentUnitId: "unit-foreign",
      })).toBe(false);
    });

    it("L6 CANNOT access appointment with no identifiers at all", () => {
      expect(canAccessAppointment({
        callerId: DANIEL_ID,
        callerTeamMemberIds: DANIEL_TEAM,
        callerUnitIds: DANIEL_UNITS,
        appointmentSetterId: null,
        appointmentCloserId: null,
        appointmentUnitId: null,
      })).toBe(false);
    });
  });
});
