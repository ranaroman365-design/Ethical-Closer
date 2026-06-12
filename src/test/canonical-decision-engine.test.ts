import { describe, it, expect } from 'vitest';
import {
  computeCanonicalState,
  computePriority,
  computeCanonicalDecision,
  deriveLeadQuality,
  deriveAttendanceRisk,
  toCanonicalStage,
  getCanonicalEventType,
  isCanonicalEvent,
  computeBatchDecisions,
  type CanonicalLeadState,
} from '@/lib/canonical-decision-engine';
import { calculateLeadScore } from '@/lib/lead-scoring-engine';

// Helper to build a full CanonicalLeadState with defaults
function makeState(overrides: Partial<CanonicalLeadState>): CanonicalLeadState {
  return {
    phone_valid: false,
    lead_quality: 'low',
    whatsapp_confirmed: false,
    whatsapp_unresponsive: false,
    attendance_risk: 'low',
    stage: 'new',
    pre_call_unconfirmed: false,
    attendance_flag: false,
    appointment_status: 'scheduled',
    lead_priority: 'LOW',
    ...overrides,
  };
}

// ── deriveLeadQuality ──

describe('deriveLeadQuality', () => {
  it('returns high for qualification_bucket=high', () => {
    expect(deriveLeadQuality({ qualification_bucket: 'high' })).toBe('high');
  });

  it('returns mid for lead_quality=B', () => {
    expect(deriveLeadQuality({ lead_quality: 'B' })).toBe('mid');
  });

  it('returns high for lead_quality=hot', () => {
    expect(deriveLeadQuality({ lead_quality: 'hot' })).toBe('high');
  });

  it('falls back to quiz_score thresholds', () => {
    expect(deriveLeadQuality({ quiz_score: 12 })).toBe('high');
    expect(deriveLeadQuality({ quiz_score: 7 })).toBe('mid');
    expect(deriveLeadQuality({ quiz_score: 2 })).toBe('low');
  });

  it('returns low for no data', () => {
    expect(deriveLeadQuality({})).toBe('low');
  });
});

// ── deriveAttendanceRisk ──

describe('deriveAttendanceRisk', () => {
  it('returns high for 2+ no-shows', () => {
    expect(deriveAttendanceRisk({ total_no_shows: 2 })).toBe('high');
  });

  it('returns high for 1 no-show 0 attended', () => {
    expect(deriveAttendanceRisk({ total_no_shows: 1, total_calls_attended: 0 })).toBe('high');
  });

  it('returns mid for 1 no-show + attended', () => {
    expect(deriveAttendanceRisk({ total_no_shows: 1, total_calls_attended: 1 })).toBe('mid');
  });

  it('returns mid for missing phone', () => {
    expect(deriveAttendanceRisk({ total_no_shows: 0 })).toBe('mid');
  });

  it('returns low for valid phone + clean history', () => {
    expect(deriveAttendanceRisk({ total_no_shows: 0, phone: '+491234567890', phone_valid: true })).toBe('low');
  });
});

// ── toCanonicalStage ──

describe('toCanonicalStage', () => {
  it('maps conversion states correctly', () => {
    expect(toCanonicalStage('new_lead')).toBe('new');
    expect(toCanonicalStage('booked')).toBe('booked');
    expect(toCanonicalStage('showed')).toBe('showed');
    expect(toCanonicalStage('closed_won')).toBe('closed');
    expect(toCanonicalStage('no_show')).toBe('booked');
    expect(toCanonicalStage('exit')).toBe('closed');
  });

  it('defaults to new for null/unknown', () => {
    expect(toCanonicalStage(null)).toBe('new');
    expect(toCanonicalStage('unknown_state')).toBe('new');
  });
});

// ── computeCanonicalState ──

describe('computeCanonicalState', () => {
  it('computes full state from lead data', () => {
    const state = computeCanonicalState({
      phone_valid: true,
      qualification_bucket: 'high',
      whatsapp_confirmed: true,
      total_no_shows: 0,
      phone: '+491234567890',
      conversion_state: 'booked',
    });
    expect(state).toEqual({
      phone_valid: true,
      lead_quality: 'high',
      whatsapp_confirmed: true,
      attendance_risk: 'low',
      stage: 'booked',
    });
  });
});

// ── computePriority ──

describe('computePriority', () => {
  const highScore = { leadScore: 75 } as any;
  const midScore = { leadScore: 45 } as any;
  const lowScore = { leadScore: 20 } as any;

  it('returns HIGH for strong score + valid phone + good quality + low risk', () => {
    expect(computePriority(
      makeState({ phone_valid: true, lead_quality: 'high', whatsapp_confirmed: true, attendance_risk: 'low', stage: 'booked' }),
      highScore,
    )).toBe('HIGH');
  });

  it('returns MEDIUM for moderate score', () => {
    expect(computePriority(
      makeState({ phone_valid: false, lead_quality: 'low', whatsapp_confirmed: false, attendance_risk: 'high', stage: 'new' }),
      midScore,
    )).toBe('MEDIUM');
  });

  it('returns LOW for weak score + no phone + low quality', () => {
    expect(computePriority(
      makeState({ phone_valid: false, lead_quality: 'low', whatsapp_confirmed: false, attendance_risk: 'high', stage: 'new' }),
      lowScore,
    )).toBe('LOW');
  });

  it('returns MEDIUM when phone valid + quality mid but low score', () => {
    expect(computePriority(
      makeState({ phone_valid: true, lead_quality: 'mid', whatsapp_confirmed: false, attendance_risk: 'mid', stage: 'new' }),
      lowScore,
    )).toBe('MEDIUM');
  });
});

// ── computeCanonicalDecision ──

describe('computeCanonicalDecision', () => {
  it('returns state + score + priority', () => {
    const decision = computeCanonicalDecision({
      phone_valid: true,
      qualification_bucket: 'high',
      conversion_state: 'booked',
      total_no_shows: 0,
      phone: '+491234567890',
      name: 'Test',
      email: 'test@test.com',
    });
    expect(decision.state.lead_quality).toBe('high');
    expect(decision.state.stage).toBe('booked');
    expect(typeof decision.score.leadScore).toBe('number');
    expect(['HIGH', 'MEDIUM', 'LOW']).toContain(decision.priority);
  });
});

// ── computeBatchDecisions ──

describe('computeBatchDecisions', () => {
  it('processes array of leads', () => {
    const results = computeBatchDecisions([
      { id: '1', phone_valid: true, qualification_bucket: 'high', phone: '+49123' },
      { id: '2', phone_valid: false },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].leadId).toBe('1');
    expect(results[1].leadId).toBe('2');
  });
});

// ── Canonical Event Map ──

describe('getCanonicalEventType', () => {
  it('maps known events', () => {
    expect(getCanonicalEventType('lead_submitted')).toBe('lead_created');
    expect(getCanonicalEventType('quiz_completed')).toBe('quiz_completed');
    expect(getCanonicalEventType('booking_completed')).toBe('booked');
    expect(getCanonicalEventType('call_showed')).toBe('showed');
    expect(getCanonicalEventType('deal_won')).toBe('closed_won');
  });

  it('returns null for unmapped events', () => {
    expect(getCanonicalEventType('deal_lost')).toBeNull();
    expect(getCanonicalEventType('random_event')).toBeNull();
  });
});

describe('isCanonicalEvent', () => {
  it('checks correctly', () => {
    expect(isCanonicalEvent('lead_submitted', 'lead_created')).toBe(true);
    expect(isCanonicalEvent('lead_submitted', 'booked')).toBe(false);
  });
});
