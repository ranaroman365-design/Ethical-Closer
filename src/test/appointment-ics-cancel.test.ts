/**
 * Verifies the ICS payload produced by `supabase/functions/appointment-ics`
 * forces Google Calendar / Outlook / Apple Calendar to REMOVE the event
 * for every state we treat as "cancelled" (rescheduled, deleted, expired,
 * no-show, etc.) and that the description carries a rebooking link + reason.
 *
 * Calendar clients honour an event's removal only when ALL of the following
 * are true on a re-import that shares the same UID:
 *   - METHOD:CANCEL
 *   - STATUS:CANCELLED
 *   - SEQUENCE strictly greater than the previously delivered SEQUENCE
 *
 * Re-implements the exact logic from the edge function so it can run under
 * Node/Vitest. If the edge function changes, this test must change too.
 */

import { describe, it, expect } from "vitest";

type Apt = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  video_call_link: string | null;
  call_type: string | null;
  appointment_status: string | null;
  call_status: string | null;
  outcome: string | null;
  updated_at: string | null;
  created_at: string | null;
};

const fmtIcs = (d: Date) =>
  d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

const escapeIcsText = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

const REBOOK_URL = "https://ethical-closing.lovable.app/booking?src=reschedule";
const MEMBERS_URL = "https://ethical-closing.lovable.app/members/login";

const CANCELLED_STATES = new Set([
  "cancelled", "canceled", "expired", "rescheduled", "deleted",
  "removed", "no_show", "no-show", "noshow", "abandoned",
]);

function reasonFor(s: string, cs: string, oc: string): string {
  if (s === "rescheduled" || cs === "rescheduled" || oc === "rescheduled") return "Termin wurde verschoben.";
  if (s === "deleted" || s === "removed" || cs === "deleted" || cs === "removed") return "Termin wurde gelöscht.";
  if (s === "expired" || cs === "expired") return "Reservierung ist abgelaufen.";
  if (s.includes("no") && s.includes("show")) return "Als No-Show markiert.";
  if (cs.includes("no") && cs.includes("show")) return "Als No-Show markiert.";
  if (oc.includes("no") && oc.includes("show")) return "Als No-Show markiert.";
  if (s === "abandoned" || cs === "abandoned") return "Termin wurde nicht bestätigt.";
  return "Termin wurde abgesagt.";
}

function buildIcs(apt: Apt): string {
  const status = String(apt.appointment_status ?? "").toLowerCase();
  const callStatus = String(apt.call_status ?? "").toLowerCase();
  const outcome = String(apt.outcome ?? "").toLowerCase();
  const cancelled =
    CANCELLED_STATES.has(status) ||
    CANCELLED_STATES.has(callStatus) ||
    CANCELLED_STATES.has(outcome);

  const startsAt = new Date(apt.starts_at);
  const endsAt = apt.ends_at ? new Date(apt.ends_at) : new Date(startsAt.getTime() + 45 * 60_000);
  const meetingLink = apt.video_call_link ?? "";

  const title = cancelled
    ? "ABGESAGT — Ethical Closer Qualifikationsgespräch"
    : "Ethical Closer Qualifikationsgespräch";

  const description = cancelled
    ? [
        reasonFor(status, callStatus, outcome),
        "",
        `Neuen Termin buchen: ${REBOOK_URL}`,
        `Bewerberbereich: ${MEMBERS_URL}`,
      ].join("\n")
    : [
        meetingLink ? `Meeting-Link: ${meetingLink}` : "",
        `Bewerberbereich: ${MEMBERS_URL}`,
      ].filter(Boolean).join("\n");

  const updatedAt = apt.updated_at ? new Date(apt.updated_at) : null;
  const createdAt = apt.created_at ? new Date(apt.created_at) : null;
  const sequence = updatedAt && createdAt
    ? Math.max(0, Math.floor((updatedAt.getTime() - createdAt.getTime()) / 60_000))
    : 0;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EthicalCloser//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:" + (cancelled ? "CANCEL" : "PUBLISH"),
    "BEGIN:VEVENT",
    `UID:${apt.id}@ethical-closing`,
    `DTSTAMP:${fmtIcs(new Date())}`,
    `DTSTART:${fmtIcs(startsAt)}`,
    `DTEND:${fmtIcs(endsAt)}`,
    `SEQUENCE:${cancelled ? sequence + 1 : sequence}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    !cancelled && meetingLink ? `URL:${meetingLink}` : "",
    cancelled ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    cancelled ? "TRANSP:TRANSPARENT" : "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

const baseApt = (overrides: Partial<Apt> = {}): Apt => ({
  id: "11111111-2222-3333-4444-555555555555",
  starts_at: "2030-01-15T10:00:00.000Z",
  ends_at: "2030-01-15T10:45:00.000Z",
  video_call_link: "https://meet.example.com/abc",
  call_type: "qualification",
  appointment_status: "confirmed",
  call_status: null,
  outcome: null,
  // 30 minutes between created and updated → SEQUENCE = 30
  created_at: "2030-01-10T12:00:00.000Z",
  updated_at: "2030-01-10T12:30:00.000Z",
  ...overrides,
});

describe("appointment-ics — cancellation removal contract", () => {
  describe("Confirmed event (control)", () => {
    it("emits METHOD:PUBLISH + STATUS:CONFIRMED + meeting link", () => {
      const ics = buildIcs(baseApt());
      expect(ics).toMatch(/METHOD:PUBLISH/);
      expect(ics).toMatch(/STATUS:CONFIRMED/);
      expect(ics).toMatch(/TRANSP:OPAQUE/);
      expect(ics).toMatch(/URL:https:\/\/meet\.example\.com\/abc/);
      expect(ics).not.toMatch(/ABGESAGT/);
      expect(ics).toMatch(/SEQUENCE:30/);
    });
  });

  // Each cancellation-equivalent state MUST produce a payload that calendar
  // clients (Google, Outlook, Apple) treat as a removal request.
  const cancelStates: Array<[keyof Apt, string, string]> = [
    ["appointment_status", "rescheduled", "Termin wurde verschoben."],
    ["appointment_status", "deleted", "Termin wurde gelöscht."],
    ["appointment_status", "removed", "Termin wurde gelöscht."],
    ["appointment_status", "cancelled", "Termin wurde abgesagt."],
    ["appointment_status", "canceled", "Termin wurde abgesagt."],
    ["appointment_status", "expired", "Reservierung ist abgelaufen."],
    ["appointment_status", "no_show", "Als No-Show markiert."],
    ["appointment_status", "no-show", "Als No-Show markiert."],
    ["appointment_status", "noshow", "Als No-Show markiert."],
    ["appointment_status", "abandoned", "Termin wurde nicht bestätigt."],
    ["call_status", "rescheduled", "Termin wurde verschoben."],
    ["call_status", "deleted", "Termin wurde gelöscht."],
    ["outcome", "rescheduled", "Termin wurde verschoben."],
    ["outcome", "no_show", "Als No-Show markiert."],
  ];

  describe.each(cancelStates)(
    "Cancelled via %s = %s",
    (field, value, expectedReason) => {
      const apt = baseApt({ [field]: value } as Partial<Apt>);
      const ics = buildIcs(apt);

      it("uses METHOD:CANCEL", () => {
        expect(ics).toMatch(/METHOD:CANCEL/);
        expect(ics).not.toMatch(/METHOD:PUBLISH/);
      });

      it("sets STATUS:CANCELLED + TRANSP:TRANSPARENT", () => {
        expect(ics).toMatch(/STATUS:CANCELLED/);
        expect(ics).toMatch(/TRANSP:TRANSPARENT/);
      });

      it("preserves the same UID so clients match the original event", () => {
        expect(ics).toMatch(/UID:11111111-2222-3333-4444-555555555555@ethical-closing/);
      });

      it("bumps SEQUENCE strictly above the confirmed payload", () => {
        const confirmedSeq = 30;
        expect(ics).toMatch(new RegExp(`SEQUENCE:${confirmedSeq + 1}`));
      });

      it("omits the meeting URL line", () => {
        // URL: line is suppressed for cancelled events to avoid stale links
        // remaining clickable in the original calendar entry.
        expect(ics).not.toMatch(/^URL:https:\/\/meet\.example\.com/m);
      });

      it("includes the cancellation reason in DESCRIPTION", () => {
        // ICS escapes commas, but our reasons use periods only.
        expect(ics).toMatch(new RegExp(`DESCRIPTION:${expectedReason.replace(".", "\\.")}`));
      });

      it("includes the rebooking link in DESCRIPTION", () => {
        // Only , ; \ and newlines get ICS-escaped — `?` stays literal.
        expect(ics).toContain("Neuen Termin buchen: https://ethical-closing.lovable.app/booking?src=reschedule");
      });

      it("flags the title as ABGESAGT", () => {
        expect(ics).toMatch(/SUMMARY:ABGESAGT/);
      });
    }
  );

  describe("Sequence monotonicity (re-import contract)", () => {
    it("a later cancellation always has SEQUENCE > prior confirmation", () => {
      const confirmed = buildIcs(baseApt());
      const cancelled = buildIcs(
        baseApt({
          appointment_status: "rescheduled",
          // Simulate that updated_at advanced when the cancellation was written.
          updated_at: "2030-01-10T12:45:00.000Z",
        }),
      );
      const seqOf = (ics: string) => Number(ics.match(/SEQUENCE:(\d+)/)![1]);
      expect(seqOf(cancelled)).toBeGreaterThan(seqOf(confirmed));
    });

    it("two consecutive cancellations still increase SEQUENCE", () => {
      const first = buildIcs(
        baseApt({
          appointment_status: "rescheduled",
          updated_at: "2030-01-10T12:30:00.000Z",
        }),
      );
      const second = buildIcs(
        baseApt({
          appointment_status: "deleted",
          updated_at: "2030-01-10T13:00:00.000Z",
        }),
      );
      const seqOf = (ics: string) => Number(ics.match(/SEQUENCE:(\d+)/)![1]);
      expect(seqOf(second)).toBeGreaterThan(seqOf(first));
    });
  });

  describe("UID stability (reschedule = overwrite, not duplicate)", () => {
    // Calendar clients only overwrite an existing event when the re-imported
    // payload shares the SAME UID. Any drift in UID derivation would cause
    // reschedules to spawn duplicate events instead of replacing the original.
    const APT_ID = "11111111-2222-3333-4444-555555555555";
    const expectedUid = `UID:${APT_ID}@ethical-closing`;

    it("derives UID purely from appointment.id for confirmed payloads", () => {
      const ics = buildIcs(baseApt({ id: APT_ID }));
      expect(ics).toContain(expectedUid);
    });

    it("keeps the same UID across every cancelled state", () => {
      const states: Array<Partial<Apt>> = [
        { appointment_status: "rescheduled" },
        { appointment_status: "deleted" },
        { appointment_status: "cancelled" },
        { appointment_status: "expired" },
        { appointment_status: "no_show" },
        { call_status: "rescheduled" },
        { outcome: "rescheduled" },
      ];
      for (const override of states) {
        const ics = buildIcs(baseApt({ id: APT_ID, ...override }));
        expect(ics).toContain(expectedUid);
      }
    });

    it("UID is independent of starts_at / ends_at / video_call_link / timestamps", () => {
      // Reschedules typically change starts_at, ends_at, video_call_link, and
      // updated_at — none of those may leak into the UID.
      const original = buildIcs(baseApt({ id: APT_ID }));
      const rescheduled = buildIcs(
        baseApt({
          id: APT_ID,
          starts_at: "2030-02-20T15:30:00.000Z",
          ends_at: "2030-02-20T16:15:00.000Z",
          video_call_link: "https://meet.example.com/different-room",
          updated_at: "2030-01-12T09:00:00.000Z",
          appointment_status: "rescheduled",
        }),
      );
      const uidOf = (ics: string) => ics.match(/^UID:.+$/m)![0];
      expect(uidOf(original)).toBe(expectedUid);
      expect(uidOf(rescheduled)).toBe(expectedUid);
      expect(uidOf(original)).toBe(uidOf(rescheduled));
    });

    it("different appointment ids produce different UIDs", () => {
      const a = buildIcs(baseApt({ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }));
      const b = buildIcs(baseApt({ id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" }));
      expect(a).toContain("UID:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa@ethical-closing");
      expect(b).toContain("UID:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb@ethical-closing");
    });

    it("emits exactly one UID line", () => {
      const ics = buildIcs(baseApt({ appointment_status: "rescheduled" }));
      const matches = ics.match(/^UID:/gm) ?? [];
      expect(matches.length).toBe(1);
    });
  });

  describe("ICS structural invariants", () => {
    it("uses CRLF line endings (RFC 5545 requirement)", () => {
      const ics = buildIcs(baseApt({ appointment_status: "deleted" }));
      // At least one CRLF must exist; calendar clients reject LF-only payloads.
      expect(ics.includes("\r\n")).toBe(true);
    });

    it("ends with END:VCALENDAR", () => {
      const ics = buildIcs(baseApt({ appointment_status: "deleted" }));
      expect(ics.endsWith("END:VCALENDAR")).toBe(true);
    });
  });
});
