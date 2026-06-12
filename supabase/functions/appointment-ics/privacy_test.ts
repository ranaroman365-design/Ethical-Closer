// ICS Privacy Regression — appointment-ics edge function
//
// Contract: the public .ics export must NEVER leak PII (phone, email, full
// names, lead notes, qualification scores, revenue) and MUST honour the
// canonical Appointment Time Contract (DTSTART;TZID=Europe/Berlin:local, no
// trailing "Z" on local times).
//
// These checks operate on the function's source code so they catch
// regressions at PR time, before deploy.

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SRC = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("ICS query selects only non-PII columns", () => {
  // Whitelist of allowed columns from the .select() call.
  const ALLOWED = [
    "id",
    "starts_at",
    "ends_at",
    "video_call_link",
    "call_type",
    "appointment_status",
    "call_status",
    "outcome",
    "updated_at",
    "created_at",
  ];
  const FORBIDDEN = [
    "phone",
    "email",
    "full_name",
    "lead_name",
    "lead_notes",
    "setter_notes",
    "closer_notes",
    "qualification_score",
    "deal_value",
    "revenue",
    "quiz_answers",
  ];

  const selectMatch = SRC.match(/\.select\(\s*"([^"]+)"\s*\)/);
  assert(selectMatch, "appointment-ics must use a typed .select() with explicit columns");
  const selected = selectMatch[1].split(",").map((s) => s.trim());

  for (const col of selected) {
    assert(
      ALLOWED.includes(col),
      `ICS select includes unexpected column "${col}" — privacy contract requires explicit whitelist`,
    );
  }
  for (const f of FORBIDDEN) {
    assert(
      !selected.includes(f),
      `ICS must NEVER select "${f}" — PII leak`,
    );
  }
});

Deno.test("ICS description contains no PII placeholders", () => {
  // Check that the description body composition does not reference forbidden lead fields.
  const FORBIDDEN_REFS = [
    "lead.phone",
    "lead.email",
    "lead.name",
    "apt.phone",
    "apt.email",
    "apt.lead_name",
    "qualification",
    "deal_value",
    "revenue",
  ];
  for (const ref of FORBIDDEN_REFS) {
    assert(
      !SRC.includes(ref),
      `ICS source must not reference "${ref}" in description payload`,
    );
  }
});

Deno.test("ICS title uses no first/last name interpolation", () => {
  // The title must be a constant — no `${...name}` interpolation.
  const titleAssignMatch = SRC.match(/const\s+title\s*=\s*([\s\S]*?);\n/);
  assert(titleAssignMatch, "title constant must be defined");
  const titleBody = titleAssignMatch[1];
  assert(
    !/\$\{[^}]*name[^}]*\}/i.test(titleBody),
    "ICS title must not interpolate any *name* field",
  );
});

Deno.test("ICS time contract: DTSTART/DTEND use TZID=Europe/Berlin local time (no Z)", () => {
  // The DTSTART/DTEND must use TZID; the helper fmtIcsLocal must NOT emit a trailing Z.
  assertStringIncludes(SRC, "DTSTART;TZID=${BUSINESS_TIMEZONE}:${fmtIcsLocal(startsAt)}");
  assertStringIncludes(SRC, "DTEND;TZID=${BUSINESS_TIMEZONE}:${fmtIcsLocal(endsAt)}");
  assertEquals(
    BUSINESS_TIMEZONE_FROM_SRC(SRC),
    "Europe/Berlin",
    "BUSINESS_TIMEZONE constant must equal Europe/Berlin",
  );

  // fmtIcsLocal must not append a trailing Z (which would mean UTC, not local).
  const fmtBody = SRC.match(/function fmtIcsLocal[\s\S]*?return\s+`([^`]+)`/);
  assert(fmtBody, "fmtIcsLocal must exist and return a template string");
  assert(!fmtBody[1].endsWith("Z"), "fmtIcsLocal must NOT end with Z (local time only)");
});

Deno.test("ICS contract: METHOD:CANCEL only paired with STATUS:CANCELLED", () => {
  // Ensure cancellation states map both to METHOD:CANCEL AND STATUS:CANCELLED.
  assertStringIncludes(SRC, "METHOD:\" + (cancelled ? \"CANCEL\" : \"PUBLISH\")");
  assertStringIncludes(SRC, "cancelled ? \"STATUS:CANCELLED\" : \"STATUS:CONFIRMED\"");
});

Deno.test("ICS contract: SEQUENCE present and monotonic on update", () => {
  // SEQUENCE must be derived from updated_at and bumped for cancellations.
  assertStringIncludes(SRC, "SEQUENCE:${cancelled ? sequence + 1 : sequence}");
  assert(
    SRC.includes("updatedAt.getTime() - createdAt.getTime()"),
    "SEQUENCE must be derived from updated_at - created_at",
  );
});

// ── helpers ──
function BUSINESS_TIMEZONE_FROM_SRC(src: string): string {
  const m = src.match(/BUSINESS_TIMEZONE\s*=\s*"([^"]+)"/);
  return m ? m[1] : "";
}
