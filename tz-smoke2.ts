import { parseAppointmentTime, formatAppointmentTimeForDisplay, formatAppointmentTimeForICS, formatAppointmentTimeForGoogle, formatAppointmentTimeForOutlook } from "./src/lib/appointment-time-contract";

const apt = {
  starts_at: "2026-05-08T11:00:00+00:00",
  ends_at:   "2026-05-08T12:00:00+00:00",
  booking_timezone: "Europe/Berlin",
  original_local_date: "2026-05-08",
  original_local_time: "13:00",
};

const parsed = parseAppointmentTime(apt as any);
console.log("=== PARSED ===");
console.log(JSON.stringify(parsed, null, 2));

const display = formatAppointmentTimeForDisplay(apt as any);
console.log("\n=== DISPLAY (all UI surfaces) ===");
console.log(JSON.stringify(display, null, 2));

const ics = formatAppointmentTimeForICS(apt as any);
console.log("\n=== ICS (Apple/iCal) ===");
console.log(JSON.stringify(ics, null, 2));

const google = formatAppointmentTimeForGoogle(apt as any);
console.log("\n=== GOOGLE EXPORT ===");
console.log(JSON.stringify(google, null, 2));

const outlook = formatAppointmentTimeForOutlook(apt as any);
console.log("\n=== OUTLOOK EXPORT ===");
console.log(JSON.stringify(outlook, null, 2));

// Acceptance
const checks: [string, boolean][] = [
  ["Display time includes 13:00", display.time?.includes("13:00") ?? false],
  ["Display time includes 14:00", display.time?.includes("14:00") ?? false],
  ["Display date includes 08.05.2026", display.date?.includes("08.05.2026") || display.date?.includes("2026-05-08") || (display.date?.includes("08") && display.date?.includes("2026")) as boolean],
  ["ICS DTSTART has TZID", ics.dtstart?.includes("TZID=Europe/Berlin") ?? false],
  ["ICS DTSTART has 130000", ics.dtstart?.includes("130000") ?? false],
  ["ICS no Z suffix", !(ics.dtstart?.endsWith("Z") ?? true)],
  ["ICS DTEND has 140000", ics.dtend?.includes("140000") ?? false],
  ["Google dates include 130000", JSON.stringify(google).includes("130000")],
  ["Outlook includes 13:00", JSON.stringify(outlook).includes("13:00") || JSON.stringify(outlook).includes("130000")],
];

console.log("\n=== ACCEPTANCE ===");
let allPass = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? "✅" : "❌"} ${name}`);
  if (!pass) allPass = false;
}
console.log(allPass ? "\n🟢 ALL PASS — PUBLISH SAFE" : "\n🔴 FAIL — DO NOT PUBLISH");
