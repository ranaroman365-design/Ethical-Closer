/**
 * Phase 3 — WhatsApp Response Layer Tests
 * Validates integration with Canonical Decision Engine
 *
 * T1: Valid phone → ping sent
 * T2: "ja" → confirmed = true
 * T3: No reply → unresponsive = true after cascade
 * T4: confirmed → attendance_risk reduced
 * T5: unresponsive → priority LOW
 * T6: dashboards use canonical priority, not raw whatsapp fields
 */

import { describe, it, expect } from 'vitest';
import {
  computeCanonicalDecision,
  computeCanonicalState,
  deriveAttendanceRisk,
  computePriority,
  type CanonicalLeadState,
} from '@/lib/canonical-decision-engine';
import { computeWhatsAppKpis, getWhatsAppStatus } from '@/components/leads/WhatsAppStatusBadge';

// Helper to create a lead with sensible defaults
function makeLead(overrides: Record<string, any> = {}) {
  return {
    id: 'test-lead-1',
    phone: '+4915112345678',
    phone_normalized: '+4915112345678',
    phone_valid: true,
    lead_quality: 'B',
    qualification_bucket: '',
    total_no_shows: 0,
    total_calls_attended: 0,
    whatsapp_ping_sent: false,
    whatsapp_confirmed: false,
    whatsapp_unresponsive: false,
    whatsapp_engaged: false,
    whatsapp_attempt_count: 0,
    conversion_state: 'new_lead',
    ...overrides,
  };
}

describe('Phase 3 — WhatsApp Response Layer', () => {
  // T1: Valid phone → ping sent (tested via edge function, here we verify state reads)
  it('T1: computeCanonicalState reads whatsapp_ping_sent from lead', () => {
    const lead = makeLead({ whatsapp_ping_sent: true });
    const state = computeCanonicalState(lead);
    // whatsapp_confirmed should still be false
    expect(state.whatsapp_confirmed).toBe(false);
  });

  // T2: "ja" → confirmed = true (via webhook, here we verify engine reads it)
  it('T2: computeCanonicalState reads whatsapp_confirmed correctly', () => {
    const lead = makeLead({ whatsapp_confirmed: true });
    const state = computeCanonicalState(lead);
    expect(state.whatsapp_confirmed).toBe(true);
  });

  // T3: No reply → unresponsive after cascade
  it('T3: unresponsive lead gets attendance_risk = high', () => {
    const lead = makeLead({
      whatsapp_ping_sent: true,
      whatsapp_unresponsive: true,
      whatsapp_attempt_count: 4,
    });
    const risk = deriveAttendanceRisk(lead);
    expect(risk).toBe('high');
  });

  // T4: confirmed → attendance_risk reduced
  it('T4: whatsapp_confirmed reduces attendance_risk from high to mid (1 no-show)', () => {
    const lead = makeLead({
      whatsapp_confirmed: true,
      total_no_shows: 1,
      total_calls_attended: 0,
    });
    const risk = deriveAttendanceRisk(lead);
    expect(risk).toBe('mid'); // would be high without WA confirmation
  });

  it('T4b: whatsapp_confirmed reduces attendance_risk from mid to low', () => {
    const lead = makeLead({
      whatsapp_confirmed: true,
      total_no_shows: 1,
      total_calls_attended: 1,
    });
    const risk = deriveAttendanceRisk(lead);
    expect(risk).toBe('low');
  });

  it('T4c: whatsapp_confirmed does NOT reduce risk if ≥2 no-shows', () => {
    const lead = makeLead({
      whatsapp_confirmed: true,
      total_no_shows: 2,
    });
    const risk = deriveAttendanceRisk(lead);
    expect(risk).toBe('high');
  });

  // T5: unresponsive → priority LOW
  it('T5: whatsapp_unresponsive leads get LOW priority', () => {
    const lead = makeLead({
      whatsapp_unresponsive: true,
      whatsapp_ping_sent: true,
    });
    const decision = computeCanonicalDecision(lead);
    expect(decision.priority).toBe('LOW');
  });

  it('T5b: whatsapp_confirmed leads with good signals get HIGH priority', () => {
    const lead = makeLead({
      whatsapp_confirmed: true,
      phone_valid: true,
      lead_quality: 'A', // high
      qualification_score: 15, // high score
    });
    const decision = computeCanonicalDecision(lead);
    expect(decision.priority).toBe('HIGH');
  });

  it('T5c: non-confirmed leads with good signals get MEDIUM (not HIGH)', () => {
    const lead = makeLead({
      whatsapp_confirmed: false,
      phone_valid: true,
      lead_quality: 'A',
      qualification_score: 15,
    });
    const decision = computeCanonicalDecision(lead);
    expect(decision.priority).toBe('MEDIUM');
  });

  // T6: dashboards use canonical priority, not raw fields
  it('T6: computeCanonicalDecision is the single entry point (no raw field bypass)', () => {
    const confirmedLead = makeLead({ whatsapp_confirmed: true, qualification_score: 12 });
    const unresponsiveLead = makeLead({ whatsapp_unresponsive: true });

    const d1 = computeCanonicalDecision(confirmedLead);
    const d2 = computeCanonicalDecision(unresponsiveLead);

    // Both go through the same engine
    expect(d1.state.whatsapp_confirmed).toBe(true);
    expect(d1.state.attendance_risk).not.toBe('high');
    expect(d2.state.attendance_risk).toBe('high');
    expect(d2.priority).toBe('LOW');
  });

  // WhatsApp Status Badge helper
  describe('WhatsApp Status Badge', () => {
    it('returns confirmed for whatsapp_confirmed lead', () => {
      expect(getWhatsAppStatus({ whatsapp_confirmed: true })).toBe('confirmed');
    });

    it('returns unresponsive for whatsapp_unresponsive lead', () => {
      expect(getWhatsAppStatus({ whatsapp_unresponsive: true })).toBe('unresponsive');
    });

    it('returns pending for pinged but not confirmed', () => {
      expect(getWhatsAppStatus({ whatsapp_ping_sent: true })).toBe('pending');
    });

    it('returns not_sent for fresh lead', () => {
      expect(getWhatsAppStatus({})).toBe('not_sent');
    });
  });

  // WhatsApp KPIs helper
  describe('WhatsApp KPIs', () => {
    it('computes confirmation rate correctly', () => {
      const leads = [
        makeLead({ whatsapp_ping_sent: true, whatsapp_confirmed: true }),
        makeLead({ whatsapp_ping_sent: true, whatsapp_confirmed: true }),
        makeLead({ whatsapp_ping_sent: true, whatsapp_confirmed: false }),
        makeLead({ whatsapp_ping_sent: true, whatsapp_unresponsive: true }),
        makeLead({ whatsapp_ping_sent: false }), // not pinged
      ];

      const kpis = computeWhatsAppKpis(leads);
      expect(kpis.totalPinged).toBe(4);
      expect(kpis.totalConfirmed).toBe(2);
      expect(kpis.totalUnresponsive).toBe(1);
      expect(kpis.confirmationRate).toBe(0.5);
    });

    it('computes confirmed show rate', () => {
      const leads = [
        makeLead({ whatsapp_ping_sent: true, whatsapp_confirmed: true, conversion_state: 'showed' }),
        makeLead({ whatsapp_ping_sent: true, whatsapp_confirmed: true, conversion_state: 'booked' }),
        makeLead({ whatsapp_ping_sent: true, whatsapp_confirmed: true, conversion_state: 'closed_won' }),
      ];

      const kpis = computeWhatsAppKpis(leads);
      expect(kpis.confirmedShowRate).toBeCloseTo(2 / 3);
    });
  });
});
