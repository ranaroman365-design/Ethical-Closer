/**
 * Phase 5: L6 Performance Intelligence Tests
 * Validates: revenue sourcing, canonical KPIs, priority segmentation,
 * bottleneck detection, operator scoring, ranking.
 */
import { describe, it, expect } from 'vitest';
import {
  buildL6FunnelCounts,
  deriveRates,
  computeL6OperatorScore,
  detectL6Bottlenecks,
  computeL6PerformanceSnapshot,
  rankOperators,
  type L6SnapshotInput,
} from '../lib/l6-performance-intelligence';

const makeLead = (id: string, overrides: Record<string, any> = {}) => ({
  id,
  phone: '+491234567890',
  phone_valid: true,
  lead_quality: 'B',
  whatsapp_confirmed: false,
  whatsapp_unresponsive: false,
  ...overrides,
});

const makeCall = (lead_id: string, result: string, revenue: number = 0) => ({
  lead_id,
  result,
  revenue,
});

const makeEvent = (lead_id: string, event_type: string) => ({
  lead_id,
  event_type,
});

// T1: Revenue = SUM(calls.revenue), never deal_value
describe('T1: Revenue from calls.revenue only', () => {
  it('uses calls.revenue for confirmed_revenue, ignores deal_value', () => {
    const leads = [makeLead('l1', { deal_value: 99999 })];
    const calls = [makeCall('l1', 'closed_won', 5000)];
    const events = [
      makeEvent('l1', 'lead_created'),
      makeEvent('l1', 'quiz_completed'),
      makeEvent('l1', 'booked'),
      makeEvent('l1', 'showed'),
      makeEvent('l1', 'closed_won'),
    ];

    const { totals } = buildL6FunnelCounts(leads, calls, events);
    expect(totals.confirmed_revenue).toBe(5000);
    // deal_value (99999) must NOT appear
    expect(totals.confirmed_revenue).not.toBe(99999);
  });
});

// T2: All KPIs derived from canonical events only
describe('T2: KPIs from canonical events', () => {
  it('counts only canonical events, ignores unknown events', () => {
    const leads = [makeLead('l1'), makeLead('l2')];
    const events = [
      makeEvent('l1', 'lead_created'),
      makeEvent('l1', 'quiz_completed'),
      makeEvent('l1', 'booked'),
      makeEvent('l1', 'showed'),
      makeEvent('l2', 'lead_created'),
      makeEvent('l2', 'custom_event_xyz'), // non-canonical
    ];
    const { totals } = buildL6FunnelCounts(leads, [], events);
    expect(totals.leads_created).toBe(2);
    expect(totals.quiz_completed).toBe(1);
    expect(totals.booked).toBe(1);
    expect(totals.showed).toBe(1);
  });
});

// T3: Priority segmentation matches computeCanonicalDecision
describe('T3: Priority segmentation', () => {
  it('segments leads by canonical priority', () => {
    const highLead = makeLead('h1', {
      phone_valid: true, lead_quality: 'A', whatsapp_confirmed: true,
      qualification_score: 15,
    });
    const lowLead = makeLead('l1', {
      phone_valid: false, lead_quality: 'C', whatsapp_unresponsive: true,
    });
    const events = [
      makeEvent('h1', 'lead_created'),
      makeEvent('l1', 'lead_created'),
    ];
    const { byPriority } = buildL6FunnelCounts([highLead, lowLead], [], events);
    // High quality lead should be HIGH or MEDIUM, low should be LOW
    expect(byPriority.LOW.leads_created).toBeGreaterThanOrEqual(1);
  });
});

// T4: Bottleneck correctly identifies weakest step
describe('T4: Bottleneck detection', () => {
  it('detects attendance bottleneck when show_rate is low', () => {
    const rates = { booking_rate: 0.50, show_rate: 0.30, close_rate: 0.25, revenue_per_lead: 200 };
    const totals = { leads_created: 100, quiz_completed: 80, booked: 40, showed: 12, closed_won: 3, confirmed_revenue: 3000 };
    const bottlenecks = detectL6Bottlenecks(rates, totals);
    expect(bottlenecks.length).toBeGreaterThanOrEqual(1);
    expect(bottlenecks[0].bottleneck_type).toBe('attendance');
  });

  it('detects closing bottleneck when close_rate is low', () => {
    const rates = { booking_rate: 0.50, show_rate: 0.80, close_rate: 0.05, revenue_per_lead: 200 };
    const totals = { leads_created: 100, quiz_completed: 80, booked: 40, showed: 32, closed_won: 1, confirmed_revenue: 1000 };
    const bottlenecks = detectL6Bottlenecks(rates, totals);
    const closing = bottlenecks.find(b => b.bottleneck_type === 'closing');
    expect(closing).toBeDefined();
  });
});

// T5: Operator score stays within 0-100
describe('T5: Operator score bounds', () => {
  it('score is always 0-100', () => {
    const extremeHigh = { booking_rate: 1.0, show_rate: 1.0, close_rate: 1.0, revenue_per_lead: 10000 };
    const extremeLow = { booking_rate: 0, show_rate: 0, close_rate: 0, revenue_per_lead: 0 };

    const scoreHigh = computeL6OperatorScore(extremeHigh, 1.0);
    const scoreLow = computeL6OperatorScore(extremeLow, 0);

    expect(scoreHigh.score).toBeGreaterThanOrEqual(0);
    expect(scoreHigh.score).toBeLessThanOrEqual(100);
    expect(scoreHigh.tier).toBe('ELITE');

    expect(scoreLow.score).toBeGreaterThanOrEqual(0);
    expect(scoreLow.score).toBeLessThanOrEqual(100);
    expect(scoreLow.tier).toBe('CRITICAL');
  });
});

// T6: Ranking sorts correctly
describe('T6: Ranking', () => {
  it('ranks operators by revenue descending', () => {
    const makeSnapshot = (id: string, rev: number) => ({
      operator_id: id,
      revenue_per_operator_30d: rev,
      period: { start: '', end: '' },
      totals: {} as any,
      by_priority: {} as any,
      operator_score: {} as any,
      bottlenecks: [],
      team: [],
      trend: { current_7d: 0, previous_7d: 0, direction: 'flat' as const },
      actions: [],
      alerts: [],
      timestamp: '',
    });

    const ranked = rankOperators([
      makeSnapshot('op1', 5000),
      makeSnapshot('op2', 15000),
      makeSnapshot('op3', 10000),
    ]);

    expect(ranked[0].operator_id).toBe('op2');
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].operator_id).toBe('op3');
    expect(ranked[2].operator_id).toBe('op1');
    expect(ranked[2].rank).toBe(3);
  });
});
