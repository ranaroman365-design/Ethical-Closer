/**
 * Smart Alert → Resolve Workflow Tests
 * Verifies each alert type maps to a concrete resolve section
 * and that data-resolve-id targets exist in AppointmentDetailModal.
 *
 * Layer: Visualization · Block: Conversion · Canon: Calendar UX
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SMART_ALERTS = fs.readFileSync(
  path.resolve("src/components/calendar/SmartAlerts.tsx"),
  "utf-8",
);
const DETAIL_MODAL = fs.readFileSync(
  path.resolve("src/components/calendar/AppointmentDetailModal.tsx"),
  "utf-8",
);
const CALENDAR_PAGE = fs.readFileSync(
  path.resolve("src/pages/members/Calendar.tsx"),
  "utf-8",
);

// ═══════════════════════════════════════════════════════════
// SECTION 1: ALERT_RESOLVE_MAP completeness
// ═══════════════════════════════════════════════════════════

describe("ALERT_RESOLVE_MAP completeness", () => {
  it("exports ALERT_RESOLVE_MAP with all alert types", () => {
    expect(SMART_ALERTS).toContain("export const ALERT_RESOLVE_MAP");
    const alertTypes = [
      "no_owner",
      "no_setter",
      "no_closer",
      "pending_confirmation",
      "upcoming_unconfirmed",
      "no_show_no_recovery",
      "no_show_risk",
      "ready_to_close",
      "blocker_no_lead",
      "high_value_no_appt",
    ];
    for (const t of alertTypes) {
      expect(SMART_ALERTS).toContain(`${t}:`);
    }
  });

  it("maps ownership alerts to reassignment", () => {
    expect(SMART_ALERTS).toMatch(/no_owner:\s*['"]reassignment['"]/);
    expect(SMART_ALERTS).toMatch(/no_setter:\s*['"]reassignment['"]/);
    expect(SMART_ALERTS).toMatch(/no_closer:\s*['"]reassignment['"]/);
  });

  it("maps confirmation alerts to quick-actions", () => {
    expect(SMART_ALERTS).toMatch(/pending_confirmation:\s*['"]quick-actions['"]/);
    expect(SMART_ALERTS).toMatch(/upcoming_unconfirmed:\s*['"]quick-actions['"]/);
  });

  it("maps no-show recovery alert to no-show-recovery", () => {
    expect(SMART_ALERTS).toMatch(/no_show_no_recovery:\s*['"]no-show-recovery['"]/);
  });

  it("maps no-show risk to call-readiness", () => {
    expect(SMART_ALERTS).toMatch(/no_show_risk:\s*['"]call-readiness['"]/);
  });

  it("maps ready_to_close to qualification", () => {
    expect(SMART_ALERTS).toMatch(/ready_to_close:\s*['"]qualification['"]/);
  });

  it("non-actionable alerts map to null", () => {
    expect(SMART_ALERTS).toMatch(/blocker_no_lead:\s*null/);
    expect(SMART_ALERTS).toMatch(/high_value_no_appt:\s*null/);
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 2: resolveTarget attached to alerts
// ═══════════════════════════════════════════════════════════

describe("resolveTarget propagation", () => {
  it("SmartAlert type includes resolveTarget field", () => {
    expect(SMART_ALERTS).toContain("resolveTarget?: ResolveTarget");
  });

  it("alerts get resolveTarget assigned before setState", () => {
    expect(SMART_ALERTS).toContain("alert.resolveTarget = ALERT_RESOLVE_MAP[alert.type]");
  });

  it("ResolveTarget type is exported", () => {
    expect(SMART_ALERTS).toContain("export type ResolveTarget");
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 3: data-resolve-id targets in AppointmentDetailModal
// ═══════════════════════════════════════════════════════════

describe("data-resolve-id targets in AppointmentDetailModal", () => {
  const requiredTargets = [
    "call-readiness",
    "qualification",
    "quick-actions",
    "reassignment",
    "no-show-recovery",
    "reschedule",
  ];

  for (const target of requiredTargets) {
    it(`has resolve target "${target}" in source`, () => {
      // PanelSection uses resolveId prop, direct divs use data-resolve-id
      const hasResolveId = DETAIL_MODAL.includes(`resolveId="${target}"`) ||
                           DETAIL_MODAL.includes(`data-resolve-id="${target}"`);
      expect(hasResolveId).toBe(true);
    });
  }
});

// ═══════════════════════════════════════════════════════════
// SECTION 4: Auto-scroll logic
// ═══════════════════════════════════════════════════════════

describe("Auto-scroll to resolve target", () => {
  it("AppointmentDetailModal accepts resolveTarget prop", () => {
    expect(DETAIL_MODAL).toContain("resolveTarget?: ResolveTarget");
  });

  it("scrolls to matching data-resolve-id element", () => {
    expect(DETAIL_MODAL).toContain('querySelector(`[data-resolve-id="${resolveTarget}"]`)');
  });

  it("uses smooth scrollIntoView", () => {
    expect(DETAIL_MODAL).toContain("scrollIntoView({ behavior: 'smooth'");
  });

  it("applies highlight ring for visual feedback", () => {
    expect(DETAIL_MODAL).toContain("ring-2");
    expect(DETAIL_MODAL).toContain("ring-primary/50");
  });

  it("removes highlight after timeout", () => {
    expect(DETAIL_MODAL).toContain("classList.remove");
  });

  it("has scrollContainerRef on scrollable containers", () => {
    expect(DETAIL_MODAL).toContain("ref={scrollContainerRef}");
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 5: Calendar page wiring
// ═══════════════════════════════════════════════════════════

describe("Calendar page passes resolveTarget", () => {
  it("stores deepLinkResolveTarget state", () => {
    expect(CALENDAR_PAGE).toContain("deepLinkResolveTarget");
    expect(CALENDAR_PAGE).toContain("setDeepLinkResolveTarget");
  });

  it("passes alert.resolveTarget from onAlertClick", () => {
    expect(CALENDAR_PAGE).toContain("alert.resolveTarget");
  });

  it("passes resolveTarget prop to AppointmentDetailModal", () => {
    expect(CALENDAR_PAGE).toContain("resolveTarget={deepLinkResolveTarget}");
  });

  it("clears resolveTarget on modal close", () => {
    expect(CALENDAR_PAGE).toContain("setDeepLinkResolveTarget(null)");
  });
});
