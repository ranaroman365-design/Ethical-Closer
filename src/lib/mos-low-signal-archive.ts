/**
 * Low-signal slot archival — additive, read-only helper (Teil F).
 *
 * Flags a slot as `archived_low_signal` once it has been live for
 * ≥ minAgeDays AND has < maxExposures AND maxLeads <= 0 AND maxBookings <= 0.
 *
 * Pure utility — does NOT mutate `ab_slot_weights`, does NOT touch the
 * Winner Engine, Confidence Engine, attribution or event history. Dashboards
 * call this to hide low-signal experiments from the Experiment Explorer.
 */
import { LOW_SIGNAL_ARCHIVE } from "./mos-cro-slots";

export interface SlotSignal {
  slot: string;
  firstSeenAt: string | Date | null;
  exposures: number;
  leads: number;
  bookings: number;
}

export type SlotArchiveStatus = "active" | "archived_low_signal";

export function isLowSignalSlot(s: SlotSignal, now: Date = new Date()): boolean {
  if (!s.firstSeenAt) return false;
  const first = typeof s.firstSeenAt === "string" ? new Date(s.firstSeenAt) : s.firstSeenAt;
  const ageMs = now.getTime() - first.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return (
    ageDays >= LOW_SIGNAL_ARCHIVE.minAgeDays &&
    s.exposures < LOW_SIGNAL_ARCHIVE.maxExposures &&
    s.leads <= LOW_SIGNAL_ARCHIVE.maxLeads &&
    s.bookings <= LOW_SIGNAL_ARCHIVE.maxBookings
  );
}

export function slotArchiveStatus(s: SlotSignal, now: Date = new Date()): SlotArchiveStatus {
  return isLowSignalSlot(s, now) ? "archived_low_signal" : "active";
}
