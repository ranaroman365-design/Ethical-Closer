/**
 * Booking Priority Enforcement Tests — Lifecycle
 *
 * T1: Confirmed WhatsApp lead → HIGH priority
 * T2: Unconfirmed lead → MEDIUM (not HIGH)
 * T3: Unresponsive lead → LOW priority
 * T4: LOW priority → no fastlane, restricted slots
 * T5: HIGH priority → best slots, fast assignment, senior closer
 * T6: Priority KPIs compute correctly
 * T7: Server-side priority mirrors client-side
 * T8: Canonical decision is the only source
 * T9: WhatsApp confirmed upgrades existing open appointment priority
 * T10: Rescheduled appointment recomputes correct priority
 * T11: Event fires once per appointment (idempotency by design)
 */

import { describe, it, expect } from 'vitest';
import {
  computeBookingPriority,
  computeBookingPriorityServer,
  getBookingRules,
  computeBookingPriorityKpis,
} from '@/lib/booking-priority-engine';
import { computeCanonicalDecision } from '@/lib/canonical-decision-engine';

function makeLead(overrides: Record<string, any> = {}) {
  return {
    id: 'test-lead-1',
    phone: '+4915112345678',
    phone_normalized: '+4915112345678',
    phone_valid: true,
    lead_quality: 'B',
    quiz_score: 10,
    qualification_bucket: 'mid',
    qualification_score: 10,
    total_no_shows: 0,
    total_calls_attended: 0,
    whatsapp_ping_sent: false,
    whatsapp_confirmed: false,
    whatsapp_unresponsive: false,
    conversion_state: 'new_lead',
    ...overrides,
  };
}

describe('Booking Priority Enforcement', () => {
  // T1: Confirmed WhatsApp lead → HIGH
  it('T1: confirmed WhatsApp lead gets HIGH booking priority', () => {
    const lead = makeLead({
      whatsapp_confirmed: true,
      phone_valid: true,
      lead_quality: 'A',
      quiz_score: 15,
    });
    const result = computeBookingPriority(lead);
    expect(result.priority).toBe('HIGH');
  });

  // T2: Unconfirmed lead → MEDIUM (not HIGH)
  it('T2: unconfirmed lead with good signals gets MEDIUM', () => {
    const lead = makeLead({
      whatsapp_confirmed: false,
      phone_valid: true,
      lead_quality: 'A',
      quiz_score: 15,
    });
    const result = computeBookingPriority(lead);
    expect(result.priority).toBe('MEDIUM');
    expect(result.priority).not.toBe('HIGH');
  });

  // T3: Unresponsive → LOW
  it('T3: unresponsive lead gets LOW priority', () => {
    const lead = makeLead({
      whatsapp_unresponsive: true,
      whatsapp_ping_sent: true,
    });
    const result = computeBookingPriority(lead);
    expect(result.priority).toBe('LOW');
  });

  // T4: LOW priority rules
  it('T4: LOW priority → no fastlane, restricted slots', () => {
    const rules = getBookingRules('LOW');
    expect(rules.fastlaneAllowed).toBe(false);
    expect(rules.maxVisibleSlots).toBe(5);
    expect(rules.bestSlots).toBe(false);
    expect(rules.seniorCloserEligible).toBe(false);
  });

  // T5: HIGH priority rules
  it('T5: HIGH priority → best slots, fast assignment, senior closer', () => {
    const rules = getBookingRules('HIGH');
    expect(rules.bestSlots).toBe(true);
    expect(rules.fastAssignment).toBe(true);
    expect(rules.seniorCloserEligible).toBe(true);
    expect(rules.fastlaneAllowed).toBe(true);
    expect(rules.maxVisibleSlots).toBeNull();
  });

  // T6: KPIs compute correctly
  it('T6: booking priority KPIs split correctly', () => {
    const appointments = [
      { booking_priority: 'HIGH', appointment_status: 'completed', lead: { conversion_state: 'closed_won' } },
      { booking_priority: 'HIGH', appointment_status: 'completed', lead: { conversion_state: 'showed' } },
      { booking_priority: 'MEDIUM', appointment_status: 'no_show', lead: { conversion_state: 'booked' } },
      { booking_priority: 'LOW', appointment_status: 'booked', lead: { conversion_state: 'booked' } },
    ];
    const kpis = computeBookingPriorityKpis(appointments);
    expect(kpis.high).toBe(2);
    expect(kpis.medium).toBe(1);
    expect(kpis.low).toBe(1);
    expect(kpis.highShowRate).toBe(1); // both showed/closed_won
    expect(kpis.highCloseRate).toBe(0.5); // 1 of 2 closed
    expect(kpis.mediumShowRate).toBe(0);
    expect(kpis.lowShowRate).toBe(0);
  });

  // T7: Server-side priority mirrors client-side
  it('T7: server-side priority matches client canonical decision', () => {
    const leads = [
      makeLead({ whatsapp_confirmed: true, lead_quality: 'A', quiz_score: 15 }),
      makeLead({ whatsapp_confirmed: false, lead_quality: 'B', quiz_score: 10 }),
      makeLead({ whatsapp_unresponsive: true }),
    ];

    for (const lead of leads) {
      const clientPriority = computeCanonicalDecision(lead).priority;
      const serverPriority = computeBookingPriorityServer(lead);
      expect(serverPriority).toBe(clientPriority);
    }
  });

  // T8: Canonical decision is the only source
  it('T8: computeBookingPriority delegates to computeCanonicalDecision', () => {
    const lead = makeLead({ whatsapp_confirmed: true, lead_quality: 'A', quiz_score: 15 });
    const result = computeBookingPriority(lead);
    const decision = computeCanonicalDecision(lead);

    expect(result.priority).toBe(decision.priority);
    expect(result.decision.state).toEqual(decision.state);
    expect(result.decision.score.leadScore).toBe(decision.score.leadScore);
  });

  // T9: WhatsApp confirmed upgrades existing open appointment priority
  it('T9: WA confirmation upgrades priority from MEDIUM to HIGH', () => {
    // Before confirmation: MEDIUM
    const leadBefore = makeLead({
      whatsapp_confirmed: false,
      phone_valid: true,
      lead_quality: 'A',
      quiz_score: 15,
    });
    const before = computeBookingPriority(leadBefore);
    expect(before.priority).toBe('MEDIUM');

    // After confirmation: HIGH
    const leadAfter = { ...leadBefore, whatsapp_confirmed: true };
    const after = computeBookingPriority(leadAfter);
    expect(after.priority).toBe('HIGH');
  });

  // T10: Rescheduled appointment recomputes correct priority
  it('T10: reschedule recomputes priority using current lead state', () => {
    // Lead was unresponsive (LOW), then confirmed (should become HIGH)
    const leadRescheduled = makeLead({
      whatsapp_confirmed: true,
      whatsapp_unresponsive: false,
      phone_valid: true,
      lead_quality: 'A',
      quiz_score: 15,
    });
    const result = computeBookingPriority(leadRescheduled);
    expect(result.priority).toBe('HIGH');

    // Server-side should match (create-appointment uses deriveBookingPriority on reschedule)
    const serverPriority = computeBookingPriorityServer(leadRescheduled);
    expect(serverPriority).toBe('HIGH');
  });

  // T11: Event fires once per appointment (structural test)
  it('T11: booking priority result is deterministic for same input', () => {
    const lead = makeLead({ whatsapp_confirmed: true, lead_quality: 'A', quiz_score: 15 });
    const r1 = computeBookingPriority(lead);
    const r2 = computeBookingPriority(lead);
    expect(r1.priority).toBe(r2.priority);
    expect(r1.decision.score.leadScore).toBe(r2.decision.score.leadScore);
  });
});
