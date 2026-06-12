/**
 * ═══════════════════════════════════════════════════════════════════════
 * PHASE 1 CANONICALIZATION — QA ENFORCEMENT TESTS
 * ═══════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import {
  REMINDER_SYSTEMS,
  DEDUP_CHANNEL_STATUS,
  GHL_GUARD_STATUS,
  KPI_SOURCE_MAP,
  LEGACY_REGISTRY,
  CANONICAL_REMINDER_FLOW,
  DEPRECATED_KPI_TABLES,
  auditPhase1,
} from '@/lib/phase1-canonicalization';
import {
  CONVERSION_STATES,
  CONVERSION_EVENTS,
  STATE_TRANSITIONS,
  resolveTransition,
  assertValidState,
  assertValidEvent,
} from '@/lib/conversion-state-machine';
import {
  assertNoDirectStateUpdate,
  canTransition,
} from '@/lib/lead-state-guard';

// ─── PART 1: REMINDER QA ───────────────────────────────────────────────────

describe('Phase 1 — Reminder System Canonicalization', () => {
  it('has exactly 1 canonical reminder system', () => {
    const canonical = REMINDER_SYSTEMS.filter(r => r.status === 'canonical');
    expect(canonical).toHaveLength(1);
    expect(canonical[0].name).toBe('dispatch-appointment-reminders');
  });

  it('canonical system has dedup enabled', () => {
    const canonical = REMINDER_SYSTEMS.find(r => r.status === 'canonical')!;
    expect(canonical.hasDedup).toBe(true);
  });

  it('canonical system respects timezone', () => {
    const canonical = REMINDER_SYSTEMS.find(r => r.status === 'canonical')!;
    expect(canonical.respectsTimezone).toBe(true);
  });

  it('canonical system handles reschedule/cancel', () => {
    const canonical = REMINDER_SYSTEMS.find(r => r.status === 'canonical')!;
    expect(canonical.cancelsOnReschedule).toBe(true);
  });

  it('canonical system routes through dispatch-communication', () => {
    const canonical = REMINDER_SYSTEMS.find(r => r.status === 'canonical')!;
    expect(canonical.notes).toContain('dispatch-communication');
  });

  it('all non-canonical systems have a replacement', () => {
    const nonCanonical = REMINDER_SYSTEMS.filter(r => r.status !== 'canonical');
    for (const sys of nonCanonical) {
      expect(sys.canonicalReplacement).toBeTruthy();
    }
  });

  it('canonical reminder flow has 10 steps', () => {
    expect(CANONICAL_REMINDER_FLOW.steps).toHaveLength(10);
  });

  it('canonical flow includes dedup step', () => {
    const dedupStep = CANONICAL_REMINDER_FLOW.steps.find(s => s.name === 'Dedup');
    expect(dedupStep).toBeDefined();
    expect(dedupStep!.detail).toContain('communication_dedup');
  });
});

// ─── PART 2: COMMUNICATION DEDUP QA ────────────────────────────────────────

describe('Phase 1 — Communication Dedup Enforcement', () => {
  it('enforces dedup on 4+ channels', () => {
    const enforced = DEDUP_CHANNEL_STATUS.filter(d => d.enforced);
    expect(enforced.length).toBeGreaterThanOrEqual(4);
  });

  it('WhatsApp dedup is enforced', () => {
    const wa = DEDUP_CHANNEL_STATUS.find(d => d.channel === 'whatsapp')!;
    expect(wa.enforced).toBe(true);
  });

  it('SMS dedup is enforced', () => {
    const sms = DEDUP_CHANNEL_STATUS.find(d => d.channel === 'sms')!;
    expect(sms.enforced).toBe(true);
  });

  it('Email dedup is enforced', () => {
    const email = DEDUP_CHANNEL_STATUS.find(d => d.channel === 'email')!;
    expect(email.enforced).toBe(true);
  });

  it('Push dedup is enforced', () => {
    const push = DEDUP_CHANNEL_STATUS.find(d => d.channel === 'push')!;
    expect(push.enforced).toBe(true);
  });

  it('all enforced channels have a dedup key pattern', () => {
    for (const ch of DEDUP_CHANNEL_STATUS.filter(d => d.enforced)) {
      expect(ch.dedupKeyPattern).not.toBe('n/a');
      expect(ch.enforcer).toContain('dispatch-communication');
    }
  });
});

// ─── PART 3: GHL BYPASS GUARD QA ───────────────────────────────────────────

describe('Phase 1 — GHL Bypass Guard', () => {
  it('DB trigger protects leads.conversion_state', () => {
    const dbTrigger = GHL_GUARD_STATUS.find(g => g.guardType === 'db_trigger')!;
    expect(dbTrigger.protectedColumns).toContain('leads.conversion_state');
  });

  it('receive-ghl-webhook uses canonical normalization', () => {
    const webhook = GHL_GUARD_STATUS.find(g => g.function === 'receive-ghl-webhook')!;
    expect(webhook.guardType).toBe('webhook_normalization');
    expect(webhook.protectedColumns).toContain('leads.conversion_state');
    expect(webhook.protectedColumns).toContain('leads.stage');
  });

  it('assertNoDirectStateUpdate blocks GHL-style mutations', () => {
    expect(() => assertNoDirectStateUpdate({ conversion_state: 'closed_won' }, 'GHL')).toThrow('GHL_BYPASS_BLOCKED');
    expect(() => assertNoDirectStateUpdate({ name: 'test' }, 'safe')).not.toThrow();
  });

  // GHL bypass scenarios
  const GHL_BYPASS_SCENARIOS = [
    { from: 'new_lead', event: 'call_closed_won', desc: 'GHL deal_won on fresh lead' },
    { from: 'contacted', event: 'call_closed_won', desc: 'GHL deal_won skipping funnel' },
    { from: 'booked', event: 'call_closed_won', desc: 'GHL deal_won before show' },
    { from: 'exit', event: 'rebooked', desc: 'GHL resurrect exited lead' },
    { from: 'closed_won', event: 'call_closed_lost', desc: 'GHL reverse outcome' },
  ];

  for (const { from, event, desc } of GHL_BYPASS_SCENARIOS) {
    it(`BLOCKS: ${desc}`, () => {
      const result = resolveTransition(from as any, event as any);
      expect(result).toBeNull();
    });
  }

  // Valid GHL scenarios
  it('ALLOWS: deal_won when lead is in showed state', () => {
    expect(resolveTransition('showed', 'call_closed_won')).toBe('closed_won');
  });

  it('ALLOWS: no_show when lead is in pre_call states', () => {
    expect(resolveTransition('pre_call_pending', 'call_no_show')).toBe('no_show');
    expect(resolveTransition('pre_call_completed', 'call_no_show')).toBe('no_show');
  });

  it('all GHL guard entries have enforcement description', () => {
    for (const guard of GHL_GUARD_STATUS) {
      expect(guard.enforcement.length).toBeGreaterThan(10);
    }
  });
});

// ─── PART 4: KPI SOURCE TRUTH QA ──────────────────────────────────────────

describe('Phase 1 — KPI Source Truth Hierarchy', () => {
  it('maps all major dashboards', () => {
    expect(KPI_SOURCE_MAP.length).toBeGreaterThanOrEqual(5);
  });

  it('Talent OS uses canonical member_kpis', () => {
    const talent = KPI_SOURCE_MAP.find(k => k.dashboard.includes('Talent'))!;
    expect(talent.risk).toBe('none');
    expect(talent.canonicalSource).toContain('member_kpis');
  });

  it('Intelligence Control uses canonical source', () => {
    const intel = KPI_SOURCE_MAP.find(k => k.dashboard.includes('Intelligence'))!;
    expect(intel.risk).toBe('none');
  });

  it('deprecated KPI tables are documented', () => {
    expect(DEPRECATED_KPI_TABLES).toHaveLength(2);
    expect(DEPRECATED_KPI_TABLES.map(t => t.table)).toContain('users_kpi_snapshot');
    expect(DEPRECATED_KPI_TABLES.map(t => t.table)).toContain('dashboard_daily_aggregates');
  });

  it('at-risk dashboards are identified for migration', () => {
    const atRisk = KPI_SOURCE_MAP.filter(k => k.risk === 'medium' || k.risk === 'high');
    expect(atRisk.length).toBeGreaterThanOrEqual(1);
    for (const k of atRisk) {
      expect(k.canonicalSource).toBeTruthy();
    }
  });
});

// ─── PART 5: LEGACY REGISTRY QA ───────────────────────────────────────────

describe('Phase 1 — Legacy Registry', () => {
  it('registers all non-canonical systems', () => {
    expect(LEGACY_REGISTRY.length).toBeGreaterThanOrEqual(5);
  });

  it('every entry has a canonical replacement', () => {
    for (const entry of LEGACY_REGISTRY) {
      expect(entry.canonicalReplacement).toBeTruthy();
    }
  });

  it('safe-to-disable entries are marked', () => {
    const safe = LEGACY_REGISTRY.filter(l => l.safeToDisable);
    expect(safe.length).toBeGreaterThanOrEqual(3);
  });

  it('no entry is missing risk assessment', () => {
    for (const entry of LEGACY_REGISTRY) {
      expect(['low', 'medium', 'high']).toContain(entry.risk);
    }
  });
});

// ─── PART 6: AUDIT SUMMARY QA ─────────────────────────────────────────────

describe('Phase 1 — Audit Summary', () => {
  it('auditPhase1() returns complete summary', () => {
    const audit = auditPhase1();
    expect(audit.reminders.canonical).toBe(1);
    expect(audit.reminders.legacy).toBeGreaterThanOrEqual(1);
    expect(audit.dedup.enforced).toBeGreaterThanOrEqual(4);
    expect(audit.ghlGuards.protected).toBeGreaterThanOrEqual(2);
    expect(audit.kpi.canonical).toBeGreaterThanOrEqual(2);
    expect(audit.legacy.total).toBeGreaterThanOrEqual(5);
  });
});

// ─── PART 7: STATE MACHINE INTEGRITY ──────────────────────────────────────

describe('Phase 1 — State Machine Integrity (cross-check)', () => {
  it('21 valid transitions (unchanged from Layer 47)', () => {
    let count = 0;
    for (const events of Object.values(STATE_TRANSITIONS)) {
      count += Object.keys(events).length;
    }
    expect(count).toBe(21);
  });

  it('15 states, 14 events', () => {
    expect(Object.values(CONVERSION_STATES)).toHaveLength(15);
    expect(Object.values(CONVERSION_EVENTS)).toHaveLength(14);
  });

  it('terminal states have no outgoing transitions', () => {
    expect(Object.keys(STATE_TRANSITIONS.closed_won)).toHaveLength(0);
    expect(Object.keys(STATE_TRANSITIONS.exit)).toHaveLength(0);
  });
});
