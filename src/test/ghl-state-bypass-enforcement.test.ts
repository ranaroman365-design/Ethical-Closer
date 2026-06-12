/**
 * ═══════════════════════════════════════════════════════════════════════
 * GHL STATE BYPASS ENFORCEMENT TESTS — Layer 47
 * ═══════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import {
  CONVERSION_STATES,
  CONVERSION_EVENTS,
  STATE_TRANSITIONS,
  resolveTransition,
  assertValidState,
  assertValidEvent,
} from '@/lib/conversion-state-machine';
import {
  canTransition,
  getAvailableEvents,
  assertNoDirectStateUpdate,
} from '@/lib/lead-state-guard';

describe('GHL State Bypass Protection — Layer 47', () => {
  // ─── COMPLETENESS ─────────────────────────────────────────────────
  it('has exactly 15 canonical states', () => {
    expect(Object.values(CONVERSION_STATES)).toHaveLength(15);
  });

  it('has exactly 14 canonical events', () => {
    expect(Object.values(CONVERSION_EVENTS)).toHaveLength(14);
  });

  it('transition map covers all 15 states', () => {
    const states = Object.values(CONVERSION_STATES);
    for (const state of states) {
      expect(STATE_TRANSITIONS).toHaveProperty(state);
    }
  });

  // ─── DETERMINISM ──────────────────────────────────────────────────
  it('every transition is deterministic (1 state + 1 event = exactly 1 result)', () => {
    for (const [state, events] of Object.entries(STATE_TRANSITIONS)) {
      for (const [event, target] of Object.entries(events)) {
        expect(typeof target).toBe('string');
        // Same inputs always produce same output
        expect(resolveTransition(state as any, event as any)).toBe(target);
      }
    }
  });

  // ─── TERMINAL STATES ──────────────────────────────────────────────
  it('closed_won and exit are terminal (no outgoing transitions)', () => {
    expect(Object.keys(STATE_TRANSITIONS.closed_won)).toHaveLength(0);
    expect(Object.keys(STATE_TRANSITIONS.exit)).toHaveLength(0);
  });

  // ─── INVALID TRANSITIONS BLOCKED ──────────────────────────────────
  it('blocks transition from new_lead to closed_won (GHL bypass attempt)', () => {
    const result = resolveTransition('new_lead', 'call_closed_won');
    expect(result).toBeNull();
  });

  it('blocks transition from contacted to showed (skipping booking)', () => {
    const result = resolveTransition('contacted', 'call_showed');
    expect(result).toBeNull();
  });

  it('blocks transition from closed_won to any state (terminal)', () => {
    for (const event of Object.values(CONVERSION_EVENTS)) {
      expect(resolveTransition('closed_won', event)).toBeNull();
    }
  });

  it('blocks transition from exit to any state (terminal)', () => {
    for (const event of Object.values(CONVERSION_EVENTS)) {
      expect(resolveTransition('exit', event)).toBeNull();
    }
  });

  // ─── VALID TRANSITIONS ALLOWED ────────────────────────────────────
  it('allows new_lead → contacted via first_contact_sent', () => {
    expect(resolveTransition('new_lead', 'first_contact_sent')).toBe('contacted');
  });

  it('allows no_show → recovery_active via recovery_started', () => {
    expect(resolveTransition('no_show', 'recovery_started')).toBe('recovery_active');
  });

  it('allows rebooked → showed via call_showed', () => {
    expect(resolveTransition('rebooked', 'call_showed')).toBe('showed');
  });

  // ─── GUARD: assertValidState ──────────────────────────────────────
  it('assertValidState throws for GHL-invented states', () => {
    expect(() => assertValidState('opportunity')).toThrow();
    expect(() => assertValidState('won_deal')).toThrow();
    expect(() => assertValidState('ghl_qualified')).toThrow();
    expect(() => assertValidState('')).toThrow();
  });

  it('assertValidState passes for canonical states', () => {
    for (const state of Object.values(CONVERSION_STATES)) {
      expect(() => assertValidState(state)).not.toThrow();
    }
  });

  // ─── GUARD: assertValidEvent ──────────────────────────────────────
  it('assertValidEvent throws for GHL-invented events', () => {
    expect(() => assertValidEvent('deal_won')).toThrow();
    expect(() => assertValidEvent('stage_changed')).toThrow();
    expect(() => assertValidEvent('pipeline_moved')).toThrow();
  });

  // ─── GUARD: assertNoDirectStateUpdate ─────────────────────────────
  it('assertNoDirectStateUpdate blocks direct conversion_state in payload', () => {
    expect(() =>
      assertNoDirectStateUpdate({ conversion_state: 'closed_won' }, 'GHL webhook')
    ).toThrow('GHL_BYPASS_BLOCKED');
  });

  it('assertNoDirectStateUpdate allows payloads without conversion_state', () => {
    expect(() =>
      assertNoDirectStateUpdate({ name: 'Test', email: 'test@test.com' }, 'form')
    ).not.toThrow();
  });

  // ─── canTransition helper ─────────────────────────────────────────
  it('canTransition returns correct result for valid transitions', () => {
    const result = canTransition('new_lead', 'first_contact_sent');
    expect(result.allowed).toBe(true);
    expect(result.nextState).toBe('contacted');
  });

  it('canTransition returns false for invalid transitions', () => {
    const result = canTransition('new_lead', 'call_closed_won');
    expect(result.allowed).toBe(false);
    expect(result.nextState).toBeNull();
  });

  // ─── getAvailableEvents ───────────────────────────────────────────
  it('getAvailableEvents returns correct events for each state', () => {
    const events = getAvailableEvents('new_lead');
    expect(events).toContain('first_contact_sent');
    expect(events).not.toContain('call_closed_won');
  });

  it('getAvailableEvents returns empty array for terminal states', () => {
    expect(getAvailableEvents('closed_won')).toHaveLength(0);
    expect(getAvailableEvents('exit')).toHaveLength(0);
  });

  // ─── GHL BYPASS SCENARIOS ─────────────────────────────────────────
  describe('GHL Bypass Scenarios', () => {
    const GHL_BYPASS_ATTEMPTS = [
      { from: 'new_lead', to: 'closed_won', desc: 'Skip entire funnel' },
      { from: 'new_lead', to: 'showed', desc: 'Skip booking + pre-call' },
      { from: 'contacted', to: 'closed_won', desc: 'Skip qualification' },
      { from: 'booked', to: 'closed_won', desc: 'Skip show + call' },
      { from: 'no_show', to: 'closed_won', desc: 'Skip recovery' },
      { from: 'closed_lost', to: 'closed_won', desc: 'Reverse outcome' },
      { from: 'exit', to: 'new_lead', desc: 'Resurrect exited lead' },
      { from: 'second_no_show', to: 'showed', desc: 'Skip operator escalation' },
    ];

    for (const { from, to, desc } of GHL_BYPASS_ATTEMPTS) {
      it(`BLOCKS: ${desc} (${from} → ${to})`, () => {
        // Find any event that would produce this target
        const events = Object.values(CONVERSION_EVENTS);
        for (const event of events) {
          const result = resolveTransition(from as any, event);
          if (result === to) {
            throw new Error(
              `BYPASS FOUND: ${from} + ${event} → ${to}. This must not be possible!`
            );
          }
        }
        // If we get here, no bypass was found — test passes
        expect(true).toBe(true);
      });
    }
  });

  // ─── TOTAL TRANSITION COUNT ───────────────────────────────────────
  it('has exactly 21 valid transitions (no more, no less)', () => {
    let count = 0;
    for (const events of Object.values(STATE_TRANSITIONS)) {
      count += Object.keys(events).length;
    }
    expect(count).toBe(21);
  });
});
