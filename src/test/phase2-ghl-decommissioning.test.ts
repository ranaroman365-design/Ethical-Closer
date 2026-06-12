import { describe, it, expect } from 'vitest';
import {
  REMOVED_FUNCTIONS,
  REROUTED_FUNCTIONS,
  GHL_ENTRY_POINTS,
  DROPPED_TABLES,
  REMAINING_GHL_DEPENDENCIES,
  DECOMMISSIONED_CRONS,
  CANONICALIZED_EVENT_SKIPS,
  DELIVERY_VERIFICATION_SNAPSHOT,
  MONITORING_CHECKS,
  QA_REGRESSION_TESTS,
  auditPhase2,
} from '@/lib/phase2-ghl-decommissioning';

describe('Phase 2 GHL Decommissioning (Layer 53)', () => {
  // ─── REMOVED FUNCTIONS ────────────────────────────────────────────
  it('removed exactly 5 edge functions', () => {
    expect(REMOVED_FUNCTIONS).toHaveLength(5);
  });

  it('all removed functions have phase 2 marker', () => {
    for (const fn of REMOVED_FUNCTIONS) {
      expect(fn.removedInPhase).toBe(2);
    }
  });

  it('smart-attendance-reminders is removed', () => {
    expect(REMOVED_FUNCTIONS.find(f => f.name === 'smart-attendance-reminders')).toBeDefined();
  });

  it('process-attendance-jobs is removed', () => {
    expect(REMOVED_FUNCTIONS.find(f => f.name === 'process-attendance-jobs')).toBeDefined();
  });

  it('attendance-send-twilio is removed', () => {
    expect(REMOVED_FUNCTIONS.find(f => f.name === 'attendance-send-twilio')).toBeDefined();
  });

  it('no-show-recovery is removed', () => {
    expect(REMOVED_FUNCTIONS.find(f => f.name === 'no-show-recovery')).toBeDefined();
  });

  it('ghl-event-webhook is removed (merged into receive-ghl-webhook)', () => {
    const fn = REMOVED_FUNCTIONS.find(f => f.name === 'ghl-event-webhook');
    expect(fn).toBeDefined();
    expect(fn!.canonicalReplacement).toContain('receive-ghl-webhook');
  });

  it('none of the removed functions had active cron jobs', () => {
    for (const fn of REMOVED_FUNCTIONS) {
      expect(fn.hadCronJob).toBe(false);
    }
  });

  // ─── REROUTED FUNCTIONS ───────────────────────────────────────────
  it('rerouted exactly 2 functions from GHL to dispatch-communication', () => {
    expect(REROUTED_FUNCTIONS).toHaveLength(2);
  });

  it('retargeting-no-booking is rerouted', () => {
    const fn = REROUTED_FUNCTIONS.find(f => f.name === 'retargeting-no-booking');
    expect(fn).toBeDefined();
    expect(fn!.newPath).toContain('dispatch-communication');
    expect(fn!.previousPath).toContain('outbound_events');
  });

  it('sync-retargeting-audiences is rerouted', () => {
    const fn = REROUTED_FUNCTIONS.find(f => f.name === 'sync-retargeting-audiences');
    expect(fn).toBeDefined();
    expect(fn!.newPath).toContain('dispatch-communication');
    expect(fn!.previousPath).toContain('outbound_events');
  });

  // ─── GHL ENTRY POINT CONSOLIDATION ────────────────────────────────
  it('consolidated GHL inbound from 2 to 1 entry point', () => {
    expect(GHL_ENTRY_POINTS.before.inbound).toHaveLength(2);
    expect(GHL_ENTRY_POINTS.after.inbound).toHaveLength(1);
    expect(GHL_ENTRY_POINTS.after.inbound[0]).toBe('receive-ghl-webhook');
  });

  it('outbound entry point unchanged (still process-outbound-events)', () => {
    expect(GHL_ENTRY_POINTS.before.outbound).toEqual(GHL_ENTRY_POINTS.after.outbound);
    expect(GHL_ENTRY_POINTS.after.outbound[0]).toBe('process-outbound-events');
  });

  // ─── DROPPED TABLES ──────────────────────────────────────────────
  it('dropped 2 unused tables', () => {
    expect(DROPPED_TABLES).toHaveLength(2);
    const names = DROPPED_TABLES.map(t => t.table);
    expect(names).toContain('attendance_jobs');
    expect(names).toContain('attendance_templates');
  });

  // ─── REMAINING GHL DEPENDENCIES ──────────────────────────────────
  it('5 GHL dependencies remain (all Phase 3)', () => {
    expect(REMAINING_GHL_DEPENDENCIES).toHaveLength(5);
    for (const dep of REMAINING_GHL_DEPENDENCIES) {
      expect(dep.phaseToRemove).toBe(3);
    }
  });

  it('remaining deps include receive-ghl-webhook and process-outbound-events', () => {
    const names = REMAINING_GHL_DEPENDENCIES.map(d => d.name);
    expect(names).toContain('receive-ghl-webhook');
    expect(names).toContain('process-outbound-events');
  });

  // ─── AUDIT HELPER ────────────────────────────────────────────────
  it('auditPhase2 returns correct summary', () => {
    const audit = auditPhase2();
    expect(audit.removed).toBe(5);
    expect(audit.rerouted).toBe(2);
    expect(audit.droppedTables).toBe(2);
    expect(audit.remainingGhlDeps).toBe(5);
    expect(audit.inboundEntryPoints.before).toBe(2);
    expect(audit.inboundEntryPoints.after).toBe(1);
    expect(audit.decommissionedCrons).toBeGreaterThanOrEqual(1);
    expect(audit.canonicalizedEventSkips).toBe(7);
    expect(audit.allDeliveryTargetsMet).toBe(true);
  });

  // ─── NO REGRESSION: dispatch-appointment-reminders still canonical ─
  it('canonical reminder pipeline was NOT touched in Phase 2', () => {
    const removedNames = REMOVED_FUNCTIONS.map(f => f.name);
    expect(removedNames).not.toContain('dispatch-appointment-reminders');
  });

  // ─── NO REGRESSION: receive-ghl-webhook NOT removed ───────────────
  it('receive-ghl-webhook was NOT removed (still active)', () => {
    const removedNames = REMOVED_FUNCTIONS.map(f => f.name);
    expect(removedNames).not.toContain('receive-ghl-webhook');
  });

  // ─── NO REGRESSION: process-outbound-events NOT removed ───────────
  it('process-outbound-events was NOT removed (CRM mirror still active)', () => {
    const removedNames = REMOVED_FUNCTIONS.map(f => f.name);
    expect(removedNames).not.toContain('process-outbound-events');
  });

  // ─── PHASE 2.1: CRON DECOMMISSIONING ──────────────────────────────
  describe('Phase 2.1 — Legacy Cron Decommissioning', () => {
    it('recalc_user_kpi_snapshot cron (jobid 12) is decommissioned', () => {
      const cron = DECOMMISSIONED_CRONS.find(c => c.jobId === 12);
      expect(cron).toBeDefined();
      expect(cron!.action).toBe('unscheduled');
      expect(cron!.name).toBe('recalc_user_kpi_snapshot');
    });

    it('all decommissioned crons have canonical replacements', () => {
      for (const cron of DECOMMISSIONED_CRONS) {
        expect(cron.canonicalReplacement).toBeTruthy();
      }
    });

    it('7 canonicalized event skip-list entries exist', () => {
      expect(CANONICALIZED_EVENT_SKIPS).toHaveLength(7);
    });

    it('all 3 appointment reminder events are in skip-list', () => {
      const names = CANONICALIZED_EVENT_SKIPS.map(s => s.eventName);
      expect(names).toContain('appointment.reminder_24h');
      expect(names).toContain('appointment.reminder_2h');
      expect(names).toContain('appointment.reminder_10m');
    });

    it('all 4 retargeting events are in skip-list', () => {
      const names = CANONICALIZED_EVENT_SKIPS.map(s => s.eventName);
      expect(names).toContain('retargeting.sms_2h');
      expect(names).toContain('retargeting.email_24h');
      expect(names).toContain('retargeting.sms_48h');
      expect(names).toContain('retargeting.email_72h');
    });

    it('all canonical paths route through dispatch-communication', () => {
      for (const skip of CANONICALIZED_EVENT_SKIPS) {
        expect(skip.canonicalPath).toContain('dispatch-communication');
      }
    });

    it('all previous paths went through process-outbound-events', () => {
      for (const skip of CANONICALIZED_EVENT_SKIPS) {
        expect(skip.previousPath).toContain('process-outbound-events');
      }
    });
  });

  // ─── PHASE 2.1: DELIVERY VERIFICATION ─────────────────────────────
  describe('Phase 2.1 — Delivery Rate Verification', () => {
    it('delivery verification snapshot exists', () => {
      expect(DELIVERY_VERIFICATION_SNAPSHOT.length).toBeGreaterThanOrEqual(2);
    });

    it('all delivery sources meet L2 KPI targets (≥90%)', () => {
      for (const v of DELIVERY_VERIFICATION_SNAPSHOT) {
        expect(v.deliveryRate).toBeGreaterThanOrEqual(v.kpiTarget);
        expect(v.meetsTarget).toBe(true);
      }
    });

    it('outbound_events reminder delivery rate ≥ 95%', () => {
      const reminder = DELIVERY_VERIFICATION_SNAPSHOT.find(v => v.source.includes('appointment.reminder'));
      expect(reminder).toBeDefined();
      expect(reminder!.deliveryRate).toBeGreaterThanOrEqual(0.95);
    });

    it('communication_dedup has zero failures', () => {
      const dedup = DELIVERY_VERIFICATION_SNAPSHOT.find(v => v.source.includes('communication_dedup'));
      expect(dedup).toBeDefined();
      expect(dedup!.failed).toBe(0);
    });
  });

  // ─── MONITORING CHECKS ──────────────────────────────────────────
  describe('Production Monitoring', () => {
    it('defines exactly 7 monitoring checks', () => {
      expect(MONITORING_CHECKS).toHaveLength(7);
    });

    it('covers all 3 monitoring domains', () => {
      const domains = new Set(MONITORING_CHECKS.map(c => c.domain));
      expect(domains).toContain('canonical_dedup');
      expect(domains).toContain('state_machine');
      expect(domains).toContain('kpi_tiers');
    });

    it('dedup checks target correct tables', () => {
      const dedupChecks = MONITORING_CHECKS.filter(c => c.domain === 'canonical_dedup');
      expect(dedupChecks).toHaveLength(2);
      expect(dedupChecks.map(c => c.table)).toContain('communication_dispatch_log');
      expect(dedupChecks.map(c => c.table)).toContain('outbound_events');
    });

    it('state machine checks target correct tables', () => {
      const smChecks = MONITORING_CHECKS.filter(c => c.domain === 'state_machine');
      expect(smChecks).toHaveLength(2);
      expect(smChecks.map(c => c.table)).toContain('lead_state_log');
      expect(smChecks.map(c => c.table)).toContain('raw_webhook_events');
    });

    it('KPI tier checks all reference member_kpis', () => {
      const kpiChecks = MONITORING_CHECKS.filter(c => c.domain === 'kpi_tiers');
      expect(kpiChecks).toHaveLength(3);
      for (const check of kpiChecks) {
        expect(check.table).toBe('member_kpis');
      }
    });

    it('all checks have non-empty descriptions', () => {
      for (const check of MONITORING_CHECKS) {
        expect(check.description.length).toBeGreaterThan(10);
      }
    });

    it('unique check names', () => {
      const names = MONITORING_CHECKS.map(c => c.name);
      expect(new Set(names).size).toBe(names.length);
  });

  // ─── QA REGRESSION ──────────────────────────────────────────────
  describe('QA Regression Tests Registry', () => {
    it('defines exactly 8 regression tests', () => {
      expect(QA_REGRESSION_TESTS).toHaveLength(8);
    });

    it('covers all 4 categories', () => {
      const cats = new Set(QA_REGRESSION_TESTS.map(t => t.category));
      expect(cats).toContain('dedup');
      expect(cats).toContain('canonical_leak');
      expect(cats).toContain('state_machine');
      expect(cats).toContain('kpi_pipeline');
    });

    it('unique test names', () => {
      const names = QA_REGRESSION_TESTS.map(t => t.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('all tests have descriptions and fail conditions', () => {
      for (const test of QA_REGRESSION_TESTS) {
        expect(test.description.length).toBeGreaterThan(10);
        expect(test.failCondition.length).toBeGreaterThan(3);
      }
    });

    it('dedup tests reference correct tables', () => {
      const dedupTests = QA_REGRESSION_TESTS.filter(t => t.category === 'dedup');
      expect(dedupTests).toHaveLength(2);
      const tables = dedupTests.map(t => t.table);
      expect(tables).toContain('communication_dispatch_log');
      expect(tables).toContain('communication_dedup');
    });

    it('state_machine tests reference correct tables', () => {
      const smTests = QA_REGRESSION_TESTS.filter(t => t.category === 'state_machine');
      expect(smTests).toHaveLength(3);
    });
  });
});
});
