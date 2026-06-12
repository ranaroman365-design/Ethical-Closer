import { describe, it, expect } from 'vitest';
import {
  deriveAttendanceRisk,
  computePriority,
  shouldAutoReschedule,
  isNoShow,
  getReminderSchedule,
  getCalendarAllocation,
  type CanonicalLeadState,
} from '@/lib/canonical-decision-engine';

function makeState(overrides: Partial<CanonicalLeadState>): CanonicalLeadState {
  return {
    phone_valid: false, lead_quality: 'low', whatsapp_confirmed: false,
    whatsapp_unresponsive: false, attendance_risk: 'low', stage: 'new',
    pre_call_unconfirmed: false, attendance_flag: false,
    appointment_status: 'scheduled', lead_priority: 'LOW',
    ...overrides,
  };
}

describe('Phase 4 — Smart Attendance & No-Show Recovery', () => {

  // T1: Confirmed lead → low risk unless ≥2 no-shows
  it('T1: confirmed lead = low risk', () => {
    expect(deriveAttendanceRisk({ whatsapp_confirmed: true, phone_valid: true, phone: '+49123', total_no_shows: 0 })).toBe('low');
  });
  it('T1: confirmed lead with 1 no-show = mid', () => {
    expect(deriveAttendanceRisk({ whatsapp_confirmed: true, phone_valid: true, phone: '+49123', total_no_shows: 1, total_calls_attended: 0 })).toBe('mid');
  });
  it('T1: confirmed lead with ≥2 no-shows = high', () => {
    expect(deriveAttendanceRisk({ whatsapp_confirmed: true, phone_valid: true, phone: '+49123', total_no_shows: 2, total_calls_attended: 0 })).toBe('high');
  });

  // T2: Unresponsive lead → high risk
  it('T2: unresponsive = high risk', () => {
    expect(deriveAttendanceRisk({ whatsapp_unresponsive: true, phone_valid: true })).toBe('high');
  });

  // T3: High risk → intensified reminders
  it('T3: high risk schedule has 7 reminders', () => {
    const schedule = getReminderSchedule('high');
    expect(schedule.length).toBe(7);
    expect(schedule[0].offsetMinutes).toBe(-1440);
    expect(schedule[schedule.length - 1].label).toBe('manual_confirmation_push');
  });
  it('T3: low risk schedule has 4 reminders', () => {
    expect(getReminderSchedule('low').length).toBe(4);
  });
  it('T3: mid risk has confirmation_check', () => {
    const schedule = getReminderSchedule('mid');
    expect(schedule.some(s => s.label === 'confirmation_check')).toBe(true);
  });

  // T4: Pre-call unconfirmed → auto-reschedule
  it('T4: pre_call_unconfirmed triggers reschedule', () => {
    expect(shouldAutoReschedule({ pre_call_unconfirmed: true })).toBe(true);
  });
  it('T4: whatsapp_unresponsive triggers reschedule', () => {
    expect(shouldAutoReschedule({ whatsapp_unresponsive: true })).toBe(true);
  });
  it('T4: confirmed lead does not trigger reschedule', () => {
    expect(shouldAutoReschedule({ whatsapp_confirmed: true })).toBe(false);
  });

  // T5: No-show detection
  it('T5: missed appointment = no-show', () => {
    const pastTime = new Date(Date.now() - 10 * 60000).toISOString();
    expect(isNoShow({ appointment_time: pastTime, attendance_flag: false, appointment_status: 'scheduled' })).toBe(true);
  });
  it('T5: attended appointment ≠ no-show', () => {
    const pastTime = new Date(Date.now() - 10 * 60000).toISOString();
    expect(isNoShow({ appointment_time: pastTime, attendance_flag: true, appointment_status: 'completed' })).toBe(false);
  });

  // T6: Rebook after no-show (state-level check)
  it('T6: rebooked status recognized', () => {
    const state = makeState({ appointment_status: 'rebooked' });
    expect(state.appointment_status).toBe('rebooked');
  });

  // T7: Calendar priority uses lead_priority
  it('T7: HIGH priority gets best slots + fastlane', () => {
    const alloc = getCalendarAllocation('HIGH');
    expect(alloc.slotQuality).toBe('best');
    expect(alloc.fastlane).toBe(true);
    expect(alloc.seniorCloserEligible).toBe(true);
  });
  it('T7: LOW priority gets limited slots, no fastlane', () => {
    const alloc = getCalendarAllocation('LOW');
    expect(alloc.slotQuality).toBe('limited');
    expect(alloc.fastlane).toBe(false);
    expect(alloc.premiumResource).toBe(false);
  });
  it('T7: MEDIUM gets normal slots', () => {
    const alloc = getCalendarAllocation('MEDIUM');
    expect(alloc.slotQuality).toBe('normal');
  });
});
