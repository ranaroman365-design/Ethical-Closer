/**
 * Snapshot tests for calendar export strings at DST boundaries.
 * Any change to ICS content or link parameters will fail the snapshot,
 * making regressions immediately visible.
 */

import { describe, it, expect } from "vitest";
import { getGoogleCalendarUrl, getOutlookCalendarUrl } from "@/lib/calendar-links";
import { generateIcsBlob } from "@/lib/generate-ics";

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

/** Extract stable VEVENT block (without UID/DTSTAMP which change per run) */
function extractStableVevent(ics: string): string {
  const vevent = ics.match(/BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/);
  if (!vevent) return "";
  return vevent[1]
    .split(/\r?\n/)
    .filter((l) => !l.startsWith("UID:") && !l.startsWith("DTSTAMP:"))
    .join("\n")
    .trim();
}

/** Extract Google link query params as sorted stable string */
function googleParams(url: string): Record<string, string> {
  const u = new URL(url);
  const out: Record<string, string> = {};
  u.searchParams.forEach((v, k) => { out[k] = v; });
  return out;
}

/** Extract Outlook link query params */
function outlookParams(url: string): Record<string, string> {
  const u = new URL(url);
  const out: Record<string, string> = {};
  u.searchParams.forEach((v, k) => { out[k] = v; });
  return out;
}

// ── DST Edge-Case Slots ──
const DST_SLOTS = [
  {
    name: "CEST→CET 1min before (Oct 25 00:59 UTC)",
    startsAt: "2026-10-25T00:59:00Z",
    dur: 1,
  },
  {
    name: "CEST→CET exact switch (Oct 25 01:00 UTC)",
    startsAt: "2026-10-25T01:00:00Z",
    dur: 5,
  },
  {
    name: "CEST→CET 1min after (Oct 25 01:01 UTC)",
    startsAt: "2026-10-25T01:01:00Z",
    dur: 5,
  },
  {
    name: "CEST→CET spanning 30min (Oct 25 00:55 UTC)",
    startsAt: "2026-10-25T00:55:00Z",
    dur: 30,
  },
  {
    name: "CET→CEST 1min before (Mar 29 00:59 UTC)",
    startsAt: "2026-03-29T00:59:00Z",
    dur: 1,
  },
  {
    name: "CET→CEST exact switch (Mar 29 01:00 UTC)",
    startsAt: "2026-03-29T01:00:00Z",
    dur: 5,
  },
  {
    name: "CET→CEST 1min after (Mar 29 01:01 UTC)",
    startsAt: "2026-03-29T01:01:00Z",
    dur: 5,
  },
  {
    name: "CET→CEST spanning 30min (Mar 29 00:55 UTC)",
    startsAt: "2026-03-29T00:55:00Z",
    dur: 30,
  },
  {
    name: "Midnight boundary CEST (Jun 20 23:30 UTC)",
    startsAt: "2026-06-20T23:30:00Z",
    dur: 30,
  },
  {
    name: "New Year midnight (Dec 31 23:00 UTC)",
    startsAt: "2026-12-31T23:00:00Z",
    dur: 60,
  },
] as const;

const TITLE = "Ethical Closer Qualifikationsgespräch";

describe("DST snapshot: ICS VEVENT content", () => {
  for (const slot of DST_SLOTS) {
    it(`${slot.name}`, async () => {
      const blob = generateIcsBlob({
        startsAt: slot.startsAt,
        durationMinutes: slot.dur,
        timezone: "Europe/Berlin",
        title: TITLE,
      });
      const ics = await readBlobText(blob);
      const stable = extractStableVevent(ics);
      expect(stable).toMatchSnapshot();
    });
  }
});

describe("DST snapshot: Google Calendar link params", () => {
  for (const slot of DST_SLOTS) {
    it(`${slot.name}`, () => {
      const url = getGoogleCalendarUrl({
        startsAt: slot.startsAt,
        durationMinutes: slot.dur,
        title: TITLE,
      });
      expect(googleParams(url)).toMatchSnapshot();
    });
  }
});

describe("DST snapshot: Outlook link params", () => {
  for (const slot of DST_SLOTS) {
    it(`${slot.name}`, () => {
      const url = getOutlookCalendarUrl({
        startsAt: slot.startsAt,
        durationMinutes: slot.dur,
        title: TITLE,
      });
      expect(outlookParams(url)).toMatchSnapshot();
    });
  }
});
