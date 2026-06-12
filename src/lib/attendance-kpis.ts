/**
 * Phase 4: Smart Attendance KPIs
 * All computed through canonical decision output — no raw field access.
 */

import {
  computeCanonicalDecision,
  type AttendanceRisk,
  type LeadPriority,
} from './canonical-decision-engine';

export interface AttendanceKpis {
  showRateByRisk: Record<AttendanceRisk, { total: number; showed: number; rate: number }>;
  showRateByWhatsapp: { confirmed: { total: number; showed: number; rate: number }; unconfirmed: { total: number; showed: number; rate: number } };
  noShowRateByPriority: Record<LeadPriority, { total: number; noShows: number; rate: number }>;
  recoveryRate: { totalNoShows: number; rebooked: number; rate: number };
  revenueRecovered: number;
}

export function computeAttendanceKpis(leads: Record<string, any>[]): AttendanceKpis {
  const showByRisk: Record<AttendanceRisk, { total: number; showed: number }> = {
    low: { total: 0, showed: 0 },
    mid: { total: 0, showed: 0 },
    high: { total: 0, showed: 0 },
  };

  const showByWa = {
    confirmed: { total: 0, showed: 0 },
    unconfirmed: { total: 0, showed: 0 },
  };

  const noShowByPriority: Record<LeadPriority, { total: number; noShows: number }> = {
    HIGH: { total: 0, noShows: 0 },
    MEDIUM: { total: 0, noShows: 0 },
    LOW: { total: 0, noShows: 0 },
  };

  let totalNoShows = 0;
  let rebooked = 0;
  let revenueRecovered = 0;

  for (const lead of leads) {
    const { state, priority } = computeCanonicalDecision(lead);
    const hasAppointment = !!lead.appointment_time;
    if (!hasAppointment) continue;

    const showed = state.attendance_flag;
    const isNoShow = lead.appointment_status === 'no_show';
    const isRebooked = lead.appointment_status === 'rebooked';

    // Show rate by risk
    showByRisk[state.attendance_risk].total++;
    if (showed) showByRisk[state.attendance_risk].showed++;

    // Show rate by WA
    const waKey = state.whatsapp_confirmed ? 'confirmed' : 'unconfirmed';
    showByWa[waKey].total++;
    if (showed) showByWa[waKey].showed++;

    // No-show by priority
    noShowByPriority[priority].total++;
    if (isNoShow) noShowByPriority[priority].noShows++;

    // Recovery
    if (isNoShow || isRebooked) totalNoShows++;
    if (isRebooked) {
      rebooked++;
      revenueRecovered += parseFloat(lead.deal_value ?? '0') || 0;
    }
  }

  const rate = (n: number, d: number) => d > 0 ? Math.round((n / d) * 1000) / 10 : 0;

  return {
    showRateByRisk: {
      low: { ...showByRisk.low, rate: rate(showByRisk.low.showed, showByRisk.low.total) },
      mid: { ...showByRisk.mid, rate: rate(showByRisk.mid.showed, showByRisk.mid.total) },
      high: { ...showByRisk.high, rate: rate(showByRisk.high.showed, showByRisk.high.total) },
    },
    showRateByWhatsapp: {
      confirmed: { ...showByWa.confirmed, rate: rate(showByWa.confirmed.showed, showByWa.confirmed.total) },
      unconfirmed: { ...showByWa.unconfirmed, rate: rate(showByWa.unconfirmed.showed, showByWa.unconfirmed.total) },
    },
    noShowRateByPriority: {
      HIGH: { ...noShowByPriority.HIGH, rate: rate(noShowByPriority.HIGH.noShows, noShowByPriority.HIGH.total) },
      MEDIUM: { ...noShowByPriority.MEDIUM, rate: rate(noShowByPriority.MEDIUM.noShows, noShowByPriority.MEDIUM.total) },
      LOW: { ...noShowByPriority.LOW, rate: rate(noShowByPriority.LOW.noShows, noShowByPriority.LOW.total) },
    },
    recoveryRate: { totalNoShows, rebooked, rate: rate(rebooked, totalNoShows) },
    revenueRecovered,
  };
}
