/**
 * Regression test — Termin-Zuweisung duplicate removal.
 *
 * Guarantees:
 * 1. The deprecated <ReassignmentPanel/> ("Termin-Zuweisung") surface is no
 *    longer rendered or defined inside AppointmentDetailModal.
 * 2. The canonical surfaces remain wired:
 *      - <InlineAssignmentPanel/>  — Setter/Closer card click (ownership)
 *      - <ReschedulePanel/>        — Reschedule (time change)
 * 3. Ownership mutations inside the modal go through the canonical
 *    `reassign_appointment` RPC only — no rogue ownership writers.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const modalPath = path.resolve(__dirname, "../components/calendar/AppointmentDetailModal.tsx");
const src = fs.readFileSync(modalPath, "utf-8");

describe("Termin-Zuweisung duplicate removal (regression)", () => {
  it("does NOT render <ReassignmentPanel .../> anywhere", () => {
    expect(src).not.toMatch(/<ReassignmentPanel[\s/>]/);
  });

  it("does NOT define a ReassignmentPanel component", () => {
    expect(src).not.toMatch(/function\s+ReassignmentPanel\s*\(/);
    expect(src).not.toMatch(/const\s+ReassignmentPanel\s*[:=]/);
  });

  it("does NOT render the 'Termin-Zuweisung' heading as UI", () => {
    // The string may remain in explanatory comments about the removal,
    // but must not be rendered as user-visible UI.
    expect(src).not.toMatch(/>\s*Termin-Zuweisung\s*</);
    
  });

  it("does NOT write to the broken from_user_id/to_user_id audit columns", () => {
    // Comments may still reference these names to explain why the panel was
    // removed; the regression we care about is no code path inserting them.
    expect(src).not.toMatch(/from_user_id\s*:/);
    expect(src).not.toMatch(/to_user_id\s*:/);
  });
});

describe("Canonical surfaces remain wired", () => {
  it("renders and defines <InlineAssignmentPanel/> (Setter/Closer ownership)", () => {
    expect(src).toMatch(/<InlineAssignmentPanel/);
    expect(src).toMatch(/function\s+InlineAssignmentPanel\s*\(/);
  });

  it("renders and defines <ReschedulePanel/> (time reschedule)", () => {
    expect(src).toMatch(/<ReschedulePanel/);
    expect(src).toMatch(/function\s+ReschedulePanel\s*\(/);
  });
});

describe("Ownership mutations go through the canonical RPC only", () => {
  it("calls reassign_appointment RPC for ownership changes", () => {
    expect(src).toMatch(/rpc\(\s*['"]reassign_appointment['"]/);
  });

  it("ReschedulePanel uses the canonical reschedule_appointment RPC", () => {
    // ReschedulePanel handles time changes via reschedule_appointment.
    expect(src).toMatch(/rpc\(\s*['"]reschedule_appointment['"]/);
  });

  it("does NOT call any rogue ownership-writing RPC from this modal", () => {
    const forbidden = [
      "update_appointment_owner",
      "set_appointment_owner",
      "transfer_appointment",
      "change_appointment_assignee",
      "assign_appointment_owner",
    ];
    for (const name of forbidden) {
      expect(src).not.toContain(name);
    }
  });

  it("does NOT perform direct UPDATE on appointments ownership columns", () => {
    // Ownership columns must be written via RPC, never via a direct
    // `.from('appointments').update({ assigned_to_user_id: ... })` call.
    const directOwnershipUpdate =
      /from\(\s*['"]appointments['"]\s*\)[\s\S]{0,200}\.update\([\s\S]{0,200}(assigned_to_user_id|setter_user_id|closer_user_id|owner_user_id)/;
    expect(src).not.toMatch(directOwnershipUpdate);
  });
});
