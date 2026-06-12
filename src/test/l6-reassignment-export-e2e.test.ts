/**
 * E2E Regression Test: L6 Reassignment + Calendar Export
 *
 * Simulates the full lifecycle:
 *   1. Appointment creation with timezone data
 *   2. L6 reassignment (ownership change)
 *   3. .ics / Google / Outlook export generation
 *   4. Verifies start/end times survive reassignment
 *   5. Verifies attribution data is only on permitted fields
 *   6. Verifies RLS scope: non-team appointments are blocked
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  getAppointmentLocalDate,
  formatAppointmentTime,
  computeLocalDateTime,
  type AppointmentTimeInput,
} from "@/lib/appointment-time-display";
import {
  normalizeAppointmentDates,
  buildGoogleExportPreview,
  getEventPreviews,
  type ExportAppointment,
  type ExportMeta,
} from "@/lib/calendar-export";
import { getGoogleCalendarUrl, getOutlookCalendarUrl } from "@/lib/calendar-links";

/** Read Blob text — multiple strategies for jsdom */
async function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.arrayBuffer === "function") {
    try { return new TextDecoder().decode(await blob.arrayBuffer()); } catch {}
  }
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsText(blob);
  });
}
import { generateIcsBlob } from "@/lib/generate-ics";

// ── Fixtures ──

/** A team appointment visible to L6 — booked at 23:30 UTC = 01:30 Berlin (CEST) */
const TEAM_APPOINTMENT = {
  id: "apt-team-001",
  starts_at: "2026-06-20T23:30:00Z",
  ends_at: "2026-06-21T00:00:00Z",
  booking_timezone: "Europe/Berlin",
  original_local_date: "2026-06-21",
  original_local_time: "01:30",
  call_type: "qualification",
  appointment_status: "confirmed",
  call_status: null,
  outcome: null,
  pricing_tier: "standard",
  lead_id: "lead-001",
  setter_id: "user-setter-01",
  closer_id: "user-closer-01",
  current_owner_id: "user-closer-01",
  original_owner_id: "user-closer-01",
  attribution_snapshot: {
    utm_source: "instagram",
    utm_campaign: "summer_2026",
    utm_content: "ad_v3",
    utm_medium: "paid",
    referrer: "https://instagram.com",
  },
};

/** After L6 reassignment — ownership changes, times stay identical */
const REASSIGNED_APPOINTMENT = {
  ...TEAM_APPOINTMENT,
  current_owner_id: "user-l6-director",
  reassigned_at: "2026-06-20T18:00:00Z",
  reassignment_reason: "L6 manual reassignment",
};

/** A foreign appointment NOT in the L6's team */
const FOREIGN_APPOINTMENT = {
  ...TEAM_APPOINTMENT,
  id: "apt-foreign-001",
  setter_id: "user-other-setter",
  closer_id: "user-other-closer",
  current_owner_id: "user-other-closer",
  original_owner_id: "user-other-closer",
};

const L6_USER_ID = "user-l6-director";
const TEAM_MEMBER_IDS = new Set(["user-setter-01", "user-closer-01"]);

const EXPORT_META: ExportMeta = {
  memberName: "Director Test",
  memberEmail: "director@example.com",
  rangeLabel: "KW 25/2026",
};

// ── Helper: simulate RLS check (mirrors DB policy logic) ──
function canL6SeeAppointment(
  apt: typeof TEAM_APPOINTMENT,
  userId: string,
  teamMembers: Set<string>,
): boolean {
  return (
    apt.closer_id === userId ||
    apt.current_owner_id === userId ||
    apt.original_owner_id === userId ||
    teamMembers.has(apt.setter_id) ||
    teamMembers.has(apt.closer_id) ||
    teamMembers.has(apt.current_owner_id)
  );
}

function canL6UpdateAppointment(
  apt: typeof TEAM_APPOINTMENT,
  userId: string,
  teamMembers: Set<string>,
): boolean {
  // Same scope as SELECT — L6 can only update team appointments
  return canL6SeeAppointment(apt, userId, teamMembers);
}

// ══════════════════════════════════════════════════════════════
// 1. REASSIGNMENT: Ownership changes, times preserved
// ══════════════════════════════════════════════════════════════
describe("L6 Reassignment — time invariance", () => {
  it("start/end times are identical before and after reassignment", () => {
    expect(REASSIGNED_APPOINTMENT.starts_at).toBe(TEAM_APPOINTMENT.starts_at);
    expect(REASSIGNED_APPOINTMENT.ends_at).toBe(TEAM_APPOINTMENT.ends_at);
    expect(REASSIGNED_APPOINTMENT.booking_timezone).toBe(TEAM_APPOINTMENT.booking_timezone);
    expect(REASSIGNED_APPOINTMENT.original_local_date).toBe(TEAM_APPOINTMENT.original_local_date);
    expect(REASSIGNED_APPOINTMENT.original_local_time).toBe(TEAM_APPOINTMENT.original_local_time);
  });

  it("current_owner_id changes to L6 after reassignment", () => {
    expect(TEAM_APPOINTMENT.current_owner_id).toBe("user-closer-01");
    expect(REASSIGNED_APPOINTMENT.current_owner_id).toBe(L6_USER_ID);
  });

  it("original_owner_id is preserved (audit trail)", () => {
    expect(REASSIGNED_APPOINTMENT.original_owner_id).toBe(TEAM_APPOINTMENT.original_owner_id);
  });

  it("local date grouping is identical before and after", () => {
    const before = getAppointmentLocalDate(TEAM_APPOINTMENT);
    const after = getAppointmentLocalDate(REASSIGNED_APPOINTMENT);
    expect(before).toBe(after);
    expect(before).toBe("2026-06-21"); // Berlin local date, not UTC
  });

  it("modal display is identical before and after", () => {
    const before = formatAppointmentTime(TEAM_APPOINTMENT);
    const after = formatAppointmentTime(REASSIGNED_APPOINTMENT);
    expect(before.dateTime).toBe(after.dateTime);
    expect(before.startTime).toBe(after.startTime);
    expect(before.endTime).toBe(after.endTime);
    expect(before.date).toBe(after.date);
  });
});

// ══════════════════════════════════════════════════════════════
// 2. RLS SCOPE: Team vs foreign appointments
// ══════════════════════════════════════════════════════════════
describe("RLS scope simulation", () => {
  it("L6 CAN see team appointment", () => {
    expect(canL6SeeAppointment(TEAM_APPOINTMENT, L6_USER_ID, TEAM_MEMBER_IDS)).toBe(true);
  });

  it("L6 CAN see reassigned appointment (now owns it)", () => {
    expect(canL6SeeAppointment(REASSIGNED_APPOINTMENT, L6_USER_ID, TEAM_MEMBER_IDS)).toBe(true);
  });

  it("L6 CANNOT see foreign appointment", () => {
    expect(canL6SeeAppointment(FOREIGN_APPOINTMENT, L6_USER_ID, TEAM_MEMBER_IDS)).toBe(false);
  });

  it("L6 CAN update team appointment", () => {
    expect(canL6UpdateAppointment(TEAM_APPOINTMENT, L6_USER_ID, TEAM_MEMBER_IDS)).toBe(true);
  });

  it("L6 CANNOT update foreign appointment", () => {
    expect(canL6UpdateAppointment(FOREIGN_APPOINTMENT, L6_USER_ID, TEAM_MEMBER_IDS)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// 3. ATTRIBUTION: Only accessible on permitted appointments
// ══════════════════════════════════════════════════════════════
describe("Attribution access", () => {
  it("team appointment has full attribution snapshot", () => {
    const attr = TEAM_APPOINTMENT.attribution_snapshot;
    expect(attr.utm_source).toBe("instagram");
    expect(attr.utm_campaign).toBe("summer_2026");
    expect(attr.utm_content).toBe("ad_v3");
    expect(attr.utm_medium).toBe("paid");
    expect(attr.referrer).toBeTruthy();
  });

  it("attribution survives reassignment", () => {
    expect(REASSIGNED_APPOINTMENT.attribution_snapshot).toEqual(
      TEAM_APPOINTMENT.attribution_snapshot
    );
  });

  it("foreign appointment attribution is inaccessible (simulated RLS block)", () => {
    // In production, RLS would prevent SELECT entirely.
    // We simulate: if canL6See is false, treat attribution as null.
    const canSee = canL6SeeAppointment(FOREIGN_APPOINTMENT, L6_USER_ID, TEAM_MEMBER_IDS);
    const attribution = canSee ? FOREIGN_APPOINTMENT.attribution_snapshot : null;
    expect(attribution).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// 4. ICS EXPORT: Correct times after reassignment
// ══════════════════════════════════════════════════════════════
describe("ICS export after reassignment", () => {
  let icsText: string;

  beforeAll(async () => {
    const blob = generateIcsBlob({
      startsAt: REASSIGNED_APPOINTMENT.starts_at,
      durationMinutes: 30,
      timezone: REASSIGNED_APPOINTMENT.booking_timezone,
      title: "Ethical Closer Qualifikationsgespräch",
    });
    icsText = await readBlobText(blob);
  });

  function icsField(field: string): string | null {
    const vevent = icsText.match(/BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/);
    if (!vevent) return null;
    const re = new RegExp(`^${field}[;:](.+)$`, "m");
    const m = vevent[1].match(re);
    return m ? m[1].trim() : null;
  }

  it("DTSTART matches original UTC start", () => {
    expect(icsField("DTSTART")).toBe("20260620T233000Z");
  });

  it("DTEND is start + 30 min", () => {
    expect(icsField("DTEND")).toBe("20260621T000000Z");
  });

  it("X-BOOKING-TIMEZONE is Europe/Berlin", () => {
    expect(icsText).toContain("X-BOOKING-TIMEZONE:Europe/Berlin");
  });
});

// ══════════════════════════════════════════════════════════════
// 5. GOOGLE CALENDAR LINK: Correct times after reassignment
// ══════════════════════════════════════════════════════════════
describe("Google Calendar link after reassignment", () => {
  let url: URL;

  beforeAll(() => {
    url = new URL(
      getGoogleCalendarUrl({
        startsAt: REASSIGNED_APPOINTMENT.starts_at,
        durationMinutes: 30,
        title: "Qualifikationsgespräch",
      })
    );
  });

  it("dates param has correct UTC start/end", () => {
    const dates = url.searchParams.get("dates")!;
    expect(dates).toBe("20260620T233000Z/20260621T000000Z");
  });

  it("duration is 30 min", () => {
    const [s, e] = url.searchParams.get("dates")!.split("/");
    const startMs = Date.parse(s.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, "$1-$2-$3T$4:$5:$6Z"));
    const endMs = Date.parse(e.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, "$1-$2-$3T$4:$5:$6Z"));
    expect(endMs - startMs).toBe(30 * 60_000);
  });
});

// ══════════════════════════════════════════════════════════════
// 6. OUTLOOK LINK: Correct times after reassignment
// ══════════════════════════════════════════════════════════════
describe("Outlook link after reassignment", () => {
  let url: URL;

  beforeAll(() => {
    url = new URL(
      getOutlookCalendarUrl({
        startsAt: REASSIGNED_APPOINTMENT.starts_at,
        durationMinutes: 30,
        title: "Qualifikationsgespräch",
      })
    );
  });

  it("startdt matches UTC start", () => {
    const d = new Date(url.searchParams.get("startdt")!);
    expect(d.toISOString()).toBe("2026-06-20T23:30:00.000Z");
  });

  it("enddt is start + 30 min", () => {
    const d = new Date(url.searchParams.get("enddt")!);
    expect(d.toISOString()).toBe("2026-06-21T00:00:00.000Z");
  });
});

// ══════════════════════════════════════════════════════════════
// 7. BULK EXPORT: normalizeAppointmentDates + event previews
// ══════════════════════════════════════════════════════════════
describe("Bulk export pipeline", () => {
  const exportAppt: ExportAppointment = {
    id: REASSIGNED_APPOINTMENT.id,
    starts_at: REASSIGNED_APPOINTMENT.starts_at,
    ends_at: REASSIGNED_APPOINTMENT.ends_at,
    call_type: REASSIGNED_APPOINTMENT.call_type,
    appointment_status: REASSIGNED_APPOINTMENT.appointment_status,
    call_status: REASSIGNED_APPOINTMENT.call_status,
    outcome: REASSIGNED_APPOINTMENT.outcome,
    pricing_tier: REASSIGNED_APPOINTMENT.pricing_tier,
    lead_id: REASSIGNED_APPOINTMENT.lead_id,
  };

  it("normalizeAppointmentDates returns valid start/end", () => {
    const norm = normalizeAppointmentDates(exportAppt);
    expect(norm).not.toBeNull();
    expect(norm!.startIso).toBe("2026-06-20T23:30:00.000Z");
    expect(norm!.endIso).toBe("2026-06-21T00:00:00.000Z");
    expect(norm!.durationMs).toBe(30 * 60_000);
    expect(norm!.repaired).toBe(false);
  });

  it("getEventPreviews generates valid events", () => {
    const result = getEventPreviews([exportAppt], EXPORT_META);
    expect(result.previews.length).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.previews[0].durationMin).toBe(30);
  });

  it("buildGoogleExportPreview returns single-event URL", () => {
    const preview = buildGoogleExportPreview([exportAppt], EXPORT_META);
    expect(preview.kind).toBe("single");
    if (preview.kind === "single") {
      expect(preview.url).toContain("calendar.google.com");
    }
  });
});

// ══════════════════════════════════════════════════════════════
// 8. CROSS-FORMAT CONSISTENCY after reassignment
// ══════════════════════════════════════════════════════════════
describe("Cross-format consistency post-reassignment", () => {
  it("all formats encode the same UTC start time", async () => {
    const startsAt = REASSIGNED_APPOINTMENT.starts_at;

    // ICS
    const blob = generateIcsBlob({
      startsAt,
      durationMinutes: 30,
      timezone: "Europe/Berlin",
      title: "Test",
    });
    const ics = await readBlobText(blob);
    const vevent = ics.match(/BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/)![1];
    const icsStart = vevent.match(/^DTSTART[;:](.+)$/m)![1].trim();

    // Google
    const gUrl = new URL(getGoogleCalendarUrl({ startsAt, title: "T" }));
    const gStart = gUrl.searchParams.get("dates")!.split("/")[0];

    // Outlook
    const oUrl = new URL(getOutlookCalendarUrl({ startsAt, title: "T" }));
    const oStart = new Date(oUrl.searchParams.get("startdt")!);

    // All should represent 2026-06-20T23:30:00Z
    expect(icsStart).toBe("20260620T233000Z");
    expect(gStart).toBe("20260620T233000Z");
    expect(oStart.toISOString()).toBe("2026-06-20T23:30:00.000Z");
  });
});

// ══════════════════════════════════════════════════════════════
// 9. EDGE CASE: Midnight boundary after reassignment
// ══════════════════════════════════════════════════════════════
describe("Midnight boundary — grouping correct after reassignment", () => {
  it("UTC date is June 20, but Berlin local is June 21", () => {
    const utcDate = REASSIGNED_APPOINTMENT.starts_at.slice(0, 10);
    const localDate = getAppointmentLocalDate(REASSIGNED_APPOINTMENT);

    expect(utcDate).toBe("2026-06-20");
    expect(localDate).toBe("2026-06-21");
    expect(utcDate).not.toBe(localDate); // The +1 day bug would make these equal
  });

  it("computeLocalDateTime confirms Berlin time is 01:30 on June 21", () => {
    const { date, time } = computeLocalDateTime(
      REASSIGNED_APPOINTMENT.starts_at,
      REASSIGNED_APPOINTMENT.booking_timezone
    );
    expect(date).toBe("2026-06-21");
    expect(time).toBe("01:30");
  });
});

// ══════════════════════════════════════════════════════════════
// 10. BULK EXPORT — Mixed team + foreign appointments
// ══════════════════════════════════════════════════════════════
describe("Bulk export with mixed team and foreign appointments", () => {
  /** Additional team appointments at various times */
  const TEAM_APT_MORNING = {
    ...TEAM_APPOINTMENT,
    id: "apt-team-002",
    starts_at: "2026-06-21T08:00:00Z",
    ends_at: "2026-06-21T08:30:00Z",
    original_local_date: "2026-06-21",
    original_local_time: "10:00",
  };

  const TEAM_APT_LATE = {
    ...TEAM_APPOINTMENT,
    id: "apt-team-003",
    starts_at: "2026-06-21T22:00:00Z",
    ends_at: "2026-06-21T22:30:00Z",
    original_local_date: "2026-06-22",
    original_local_time: "00:00",
  };

  const FOREIGN_APT_2 = {
    ...FOREIGN_APPOINTMENT,
    id: "apt-foreign-002",
    starts_at: "2026-06-21T10:00:00Z",
    ends_at: "2026-06-21T10:30:00Z",
  };

  const FOREIGN_APT_3 = {
    ...FOREIGN_APPOINTMENT,
    id: "apt-foreign-003",
    starts_at: "2026-06-21T15:00:00Z",
    ends_at: "2026-06-21T15:30:00Z",
  };

  const ALL_APPOINTMENTS = [
    TEAM_APPOINTMENT,       // team — midnight boundary
    TEAM_APT_MORNING,       // team — normal morning
    TEAM_APT_LATE,          // team — late night boundary
    REASSIGNED_APPOINTMENT, // team — reassigned to L6
    FOREIGN_APPOINTMENT,    // foreign
    FOREIGN_APT_2,          // foreign
    FOREIGN_APT_3,          // foreign
  ];

  /** Simulate RLS filter: only return appointments L6 can see */
  function rlsFilteredAppointments(
    all: typeof ALL_APPOINTMENTS,
    userId: string,
    teamMembers: Set<string>,
  ) {
    return all.filter((a) => canL6SeeAppointment(a, userId, teamMembers));
  }

  it("RLS filters out all foreign appointments", () => {
    const permitted = rlsFilteredAppointments(ALL_APPOINTMENTS, L6_USER_ID, TEAM_MEMBER_IDS);
    const permittedIds = permitted.map((a) => a.id);

    // Team appointments pass
    expect(permittedIds).toContain("apt-team-001");
    expect(permittedIds).toContain("apt-team-002");
    expect(permittedIds).toContain("apt-team-003");
    expect(permittedIds).toContain(REASSIGNED_APPOINTMENT.id); // same id as team-001, reassigned

    // Foreign appointments blocked
    expect(permittedIds).not.toContain("apt-foreign-001");
    expect(permittedIds).not.toContain("apt-foreign-002");
    expect(permittedIds).not.toContain("apt-foreign-003");
  });

  it("bulk export pipeline only processes permitted appointments", () => {
    const permitted = rlsFilteredAppointments(ALL_APPOINTMENTS, L6_USER_ID, TEAM_MEMBER_IDS);
    const exportAppts: ExportAppointment[] = permitted.map((a) => ({
      id: a.id,
      starts_at: a.starts_at,
      ends_at: a.ends_at,
      call_type: a.call_type,
      appointment_status: a.appointment_status,
      call_status: a.call_status,
      outcome: a.outcome,
      pricing_tier: a.pricing_tier,
      lead_id: a.lead_id,
    }));

    const result = getEventPreviews(exportAppts, EXPORT_META);
    expect(result.skipped).toBe(0);
    expect(result.previews.length).toBe(permitted.length);

    // Every preview must have valid start/end and 30-min duration
    for (const p of result.previews) {
      expect(p.durationMin).toBe(30);
      expect(p.startLabel).toBeTruthy();
      expect(p.endLabel).toBeTruthy();
    }
  });

  it("attribution is only available for permitted appointments", () => {
    for (const apt of ALL_APPOINTMENTS) {
      const canSee = canL6SeeAppointment(apt, L6_USER_ID, TEAM_MEMBER_IDS);
      const attribution = canSee ? apt.attribution_snapshot : null;

      if (apt.id.includes("foreign")) {
        expect(attribution).toBeNull();
      } else {
        expect(attribution).not.toBeNull();
        expect(attribution!.utm_source).toBe("instagram");
      }
    }
  });

  it("start/end times in exports match source data for each permitted appointment", async () => {
    const permitted = rlsFilteredAppointments(ALL_APPOINTMENTS, L6_USER_ID, TEAM_MEMBER_IDS);

    for (const apt of permitted) {
      // ICS
      const blob = generateIcsBlob({
        startsAt: apt.starts_at,
        durationMinutes: 30,
        timezone: apt.booking_timezone,
        title: "Bulk Export Test",
      });
      const ics = await readBlobText(blob);
      const expectedStart = apt.starts_at.replace(/[-:]/g, "").replace(".000", "").slice(0, 15) + "Z";
      expect(ics).toContain(`DTSTART:${expectedStart}`);

      // Google
      const gUrl = new URL(getGoogleCalendarUrl({ startsAt: apt.starts_at, title: "T" }));
      const gDates = gUrl.searchParams.get("dates")!;
      expect(gDates.startsWith(expectedStart)).toBe(true);

      // Outlook
      const oUrl = new URL(getOutlookCalendarUrl({ startsAt: apt.starts_at, title: "T" }));
      const oStart = new Date(oUrl.searchParams.get("startdt")!);
      expect(oStart.toISOString()).toBe(new Date(apt.starts_at).toISOString());
    }
  });

  it("foreign appointments cannot generate exports (RLS would block data)", () => {
    const foreignOnes = ALL_APPOINTMENTS.filter(
      (a) => !canL6SeeAppointment(a, L6_USER_ID, TEAM_MEMBER_IDS)
    );
    expect(foreignOnes.length).toBe(3);

    // Simulating: if RLS blocks SELECT, the client never receives these rows,
    // so no export can be generated. Verify that filtering truly excluded them.
    const permitted = rlsFilteredAppointments(ALL_APPOINTMENTS, L6_USER_ID, TEAM_MEMBER_IDS);
    for (const f of foreignOnes) {
      expect(permitted.find((p) => p.id === f.id)).toBeUndefined();
    }
  });

  it("midnight-boundary appointments group to correct local date in bulk", () => {
    const permitted = rlsFilteredAppointments(ALL_APPOINTMENTS, L6_USER_ID, TEAM_MEMBER_IDS);

    for (const apt of permitted) {
      const localDate = getAppointmentLocalDate(apt);
      const utcDate = apt.starts_at.slice(0, 10);

      // Midnight-boundary appointments: local date differs from UTC date
      if (apt.id === "apt-team-001" || apt.id === "apt-team-003") {
        expect(localDate).not.toBe(utcDate);
      }

      // All should match original_local_date when set
      if (apt.original_local_date) {
        expect(localDate).toBe(apt.original_local_date);
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════
// 11. GOOGLE vs OUTLOOK UTC CONSISTENCY — Multi-slot + DST
// ══════════════════════════════════════════════════════════════
describe("Google & Outlook links match UTC after L6 reassignment — multi-slot + DST", () => {
  /**
   * Slots covering:
   *  - normal daytime (CEST)
   *  - midnight boundary (23:30 UTC → 01:30 Berlin CEST)
   *  - DST transition day (Oct 25 2026, CEST→CET switch at 03:00 Berlin)
   *  - pre-DST late night (Oct 24 23:30 UTC → Oct 25 01:30 Berlin, still CEST)
   *  - post-DST slot (Nov 2 2026, CET)
   *  - New Year midnight boundary
   */
  const SLOTS = [
    // ── Normal slots ──
    { label: "normal daytime CEST",       startsAt: "2026-06-21T10:00:00Z", dur: 30 },
    { label: "midnight boundary CEST",    startsAt: "2026-06-20T23:30:00Z", dur: 30 },
    { label: "late night CEST",           startsAt: "2026-07-15T21:45:00Z", dur: 45 },

    // ── CEST→CET transition: Oct 25 2026, clocks back at 03:00 Berlin (01:00 UTC) ──
    { label: "DST day pre-switch",        startsAt: "2026-10-24T23:30:00Z", dur: 30 },
    { label: "DST day during switch",     startsAt: "2026-10-25T01:00:00Z", dur: 60 },
    // Fine-grained: 1min before the switch hour
    { label: "DST 1min before switch",    startsAt: "2026-10-25T00:59:00Z", dur: 1 },
    // Fine-grained: exactly at the switch second
    { label: "DST exact switch moment",   startsAt: "2026-10-25T01:00:00Z", dur: 5 },
    // Fine-grained: 1min after
    { label: "DST 1min after switch",     startsAt: "2026-10-25T01:01:00Z", dur: 5 },
    // Fine-grained: 5min after
    { label: "DST 5min after switch",     startsAt: "2026-10-25T01:05:00Z", dur: 5 },
    // Spanning the switch: starts 5min before, ends 25min after
    { label: "DST spanning switch 30min", startsAt: "2026-10-25T00:55:00Z", dur: 30 },

    // ── CET→CEST transition: Mar 29 2026, clocks forward at 02:00 Berlin (01:00 UTC) ──
    { label: "spring DST 1min before",    startsAt: "2026-03-29T00:59:00Z", dur: 1 },
    { label: "spring DST exact moment",   startsAt: "2026-03-29T01:00:00Z", dur: 5 },
    { label: "spring DST 1min after",     startsAt: "2026-03-29T01:01:00Z", dur: 5 },
    { label: "spring DST 5min after",     startsAt: "2026-03-29T01:05:00Z", dur: 5 },
    { label: "spring DST spanning 30min", startsAt: "2026-03-29T00:55:00Z", dur: 30 },

    // ── Post-DST & boundaries ──
    { label: "post-DST CET daytime",      startsAt: "2026-11-02T09:00:00Z", dur: 30 },
    { label: "post-DST CET evening",      startsAt: "2026-11-02T22:00:00Z", dur: 30 },
    { label: "New Year midnight",         startsAt: "2026-12-31T23:00:00Z", dur: 60 },
    { label: "early morning CET",         startsAt: "2027-01-05T05:30:00Z", dur: 30 },
  ];

  /** Helper: parse compact Google Calendar date string → Date */
  function parseGoogleDate(compact: string): Date {
    // "20260621T100000Z" → "2026-06-21T10:00:00Z"
    const iso = compact.replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
      "$1-$2-$3T$4:$5:$6Z"
    );
    return new Date(iso);
  }

  for (const slot of SLOTS) {
    describe(`Slot: ${slot.label} (${slot.startsAt}, ${slot.dur}min)`, () => {
      // Simulate reassigned appointment for this slot
      const reassigned = {
        ...TEAM_APPOINTMENT,
        id: `apt-slot-${slot.label.replace(/\s+/g, "-")}`,
        starts_at: slot.startsAt,
        ends_at: new Date(new Date(slot.startsAt).getTime() + slot.dur * 60_000).toISOString(),
        current_owner_id: L6_USER_ID, // reassigned
      };

      const expectedStartMs = new Date(slot.startsAt).getTime();
      const expectedEndMs = expectedStartMs + slot.dur * 60_000;

      it("Google and Outlook encode identical UTC start", () => {
        const gUrl = new URL(getGoogleCalendarUrl({ startsAt: reassigned.starts_at, durationMinutes: slot.dur, title: "T" }));
        const oUrl = new URL(getOutlookCalendarUrl({ startsAt: reassigned.starts_at, durationMinutes: slot.dur, title: "T" }));

        const [gStartStr] = gUrl.searchParams.get("dates")!.split("/");
        const gStart = parseGoogleDate(gStartStr);
        const oStart = new Date(oUrl.searchParams.get("startdt")!);

        expect(gStart.getTime()).toBe(expectedStartMs);
        expect(oStart.getTime()).toBe(expectedStartMs);
        // Cross-check: Google === Outlook
        expect(gStart.toISOString()).toBe(oStart.toISOString());
      });

      it("Google and Outlook encode identical UTC end", () => {
        const gUrl = new URL(getGoogleCalendarUrl({ startsAt: reassigned.starts_at, durationMinutes: slot.dur, title: "T" }));
        const oUrl = new URL(getOutlookCalendarUrl({ startsAt: reassigned.starts_at, durationMinutes: slot.dur, title: "T" }));

        const [, gEndStr] = gUrl.searchParams.get("dates")!.split("/");
        const gEnd = parseGoogleDate(gEndStr);
        const oEnd = new Date(oUrl.searchParams.get("enddt")!);

        expect(gEnd.getTime()).toBe(expectedEndMs);
        expect(oEnd.getTime()).toBe(expectedEndMs);
        expect(gEnd.toISOString()).toBe(oEnd.toISOString());
      });

      it("duration matches slot spec", () => {
        const gUrl = new URL(getGoogleCalendarUrl({ startsAt: reassigned.starts_at, durationMinutes: slot.dur, title: "T" }));
        const [gStartStr, gEndStr] = gUrl.searchParams.get("dates")!.split("/");
        const durMs = parseGoogleDate(gEndStr).getTime() - parseGoogleDate(gStartStr).getTime();
        expect(durMs).toBe(slot.dur * 60_000);
      });

      it("ICS matches Google/Outlook UTC start", async () => {
        const blob = generateIcsBlob({
          startsAt: reassigned.starts_at,
          durationMinutes: slot.dur,
          timezone: "Europe/Berlin",
          title: "Consistency Test",
        });
        const ics = await readBlobText(blob);
        const vevent = ics.match(/BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/)![1];
        const icsStart = vevent.match(/^DTSTART[;:](.+)$/m)![1].trim();

        // Build expected compact UTC string
        const d = new Date(slot.startsAt);
        const pad = (n: number) => String(n).padStart(2, "0");
        const expected =
          `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
          `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

        expect(icsStart).toBe(expected);
      });
    });
  }
});
