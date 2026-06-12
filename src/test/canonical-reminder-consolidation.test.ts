import { describe, it, expect } from 'vitest';
import {
  CANONICAL_REMINDER_SCHEDULES,
  computeAttendanceRisk,
  findDueReminder,
  getReminderSchedule,
  REMINDER_SYSTEM_OWNERSHIP,
  MIGRATION_PLAN,
  auditReminderConsolidation,
} from '@/lib/canonical-reminder-consolidation';

describe('Canonical Reminder Consolidation (Layer 53)', () => {
  it('all risk tiers have schedules', () => {
    expect(CANONICAL_REMINDER_SCHEDULES.low.length).toBeGreaterThanOrEqual(3);
    expect(CANONICAL_REMINDER_SCHEDULES.mid.length).toBeGreaterThanOrEqual(4);
    expect(CANONICAL_REMINDER_SCHEDULES.high.length).toBeGreaterThanOrEqual(6);
  });

  it('high risk has more slots than low', () => {
    expect(CANONICAL_REMINDER_SCHEDULES.high.length).toBeGreaterThan(CANONICAL_REMINDER_SCHEDULES.low.length);
  });

  it('all tiers include 24h and 10min reminders', () => {
    for (const tier of ['low', 'mid', 'high'] as const) {
      const keys = CANONICAL_REMINDER_SCHEDULES[tier].map(s => s.key);
      expect(keys).toContain('reminder_24h');
      expect(keys).toContain('reminder_10m');
    }
  });

  it('computeAttendanceRisk: unresponsive = high', () => {
    expect(computeAttendanceRisk({
      totalNoShows: 0, totalCallsAttended: 0,
      whatsappUnresponsive: true, whatsappConfirmed: false,
      phoneValid: true, preCallUnconfirmed: false,
    })).toBe('high');
  });

  it('computeAttendanceRisk: clean lead = low', () => {
    expect(computeAttendanceRisk({
      totalNoShows: 0, totalCallsAttended: 1,
      whatsappUnresponsive: false, whatsappConfirmed: true,
      phoneValid: true, preCallUnconfirmed: false,
    })).toBe('low');
  });

  it('computeAttendanceRisk: 1 no-show + unconfirmed = high', () => {
    expect(computeAttendanceRisk({
      totalNoShows: 1, totalCallsAttended: 0,
      whatsappUnresponsive: false, whatsappConfirmed: false,
      phoneValid: true, preCallUnconfirmed: false,
    })).toBe('high');
  });

  it('computeAttendanceRisk: 1 no-show + confirmed = mid', () => {
    expect(computeAttendanceRisk({
      totalNoShows: 1, totalCallsAttended: 0,
      whatsappUnresponsive: false, whatsappConfirmed: true,
      phoneValid: true, preCallUnconfirmed: false,
    })).toBe('mid');
  });

  it('findDueReminder returns correct slot', () => {
    const slot = findDueReminder('low', 1440, new Set());
    expect(slot).not.toBeNull();
    expect(slot!.key).toBe('reminder_24h');
  });

  it('findDueReminder skips already sent', () => {
    const slot = findDueReminder('low', 1440, new Set(['reminder_24h']));
    expect(slot).toBeNull();
  });

  it('findDueReminder respects tolerance window', () => {
    const slot = findDueReminder('low', 1445, new Set());
    expect(slot).not.toBeNull();
    expect(slot!.key).toBe('reminder_24h');
  });

  it('only dispatch-appointment-reminders is canonical', () => {
    expect(REMINDER_SYSTEM_OWNERSHIP['dispatch-appointment-reminders'].status).toBe('canonical');
    expect(REMINDER_SYSTEM_OWNERSHIP['smart-attendance-reminders'].status).toBe('deprecated');
    expect(REMINDER_SYSTEM_OWNERSHIP['process-attendance-jobs'].status).toBe('dormant');
    expect(REMINDER_SYSTEM_OWNERSHIP['no-show-recovery'].status).toBe('deprecated');
  });

  it('migration plan has 3 phases', () => {
    const phases = new Set(MIGRATION_PLAN.map(s => s.phase));
    expect(phases.size).toBe(3);
  });

  it('Phase 1 contains P0 items', () => {
    const p1 = MIGRATION_PLAN.filter(s => s.phase === 1);
    expect(p1.some(s => s.priority === 'P0')).toBe(true);
  });

  it('audit passes with zero violations', () => {
    const result = auditReminderConsolidation();
    expect(result.violations).toEqual([]);
    expect(result.canonicalSystem).toBe('dispatch-appointment-reminders');
    expect(result.deprecatedSystems).toContain('smart-attendance-reminders');
    expect(result.dormantSystems).toContain('process-attendance-jobs');
  });
});
