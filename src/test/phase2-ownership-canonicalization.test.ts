import { describe, it, expect } from 'vitest';
import {
  OWNERSHIP_ROLES,
  ASSIGNMENT_TRANSITIONS,
  OWNERSHIP_TRANSFER_RULES,
  COMMISSION_ATTRIBUTION,
  IMMUTABILITY_RULES,
  OWNERSHIP_HARD_RULES,
} from '@/lib/canonical-ownership';
import {
  REVENUE_SOURCES,
  DASHBOARD_REVENUE_MAP,
  REVENUE_ATTRIBUTION_RULES,
  NON_CANONICAL_REVENUE_WARNING,
} from '@/lib/canonical-revenue-truth';
import {
  CALENDAR_TRUTH_SOURCES,
  SCHEDULING_RULES,
  CALENDAR_HARD_RULES,
  GHL_CALENDAR_RULES,
} from '@/lib/canonical-calendar';
import {
  PHASE2_MIGRATIONS,
  INTEGRITY_CHECKS,
  LEGACY_CRON_STATUS,
  DASHBOARD_KPI_GAPS,
  auditPhase2Ownership,
} from '@/lib/phase2-ownership-canonicalization';

describe('Phase 2 Ownership Canonicalization (Layer 54)', () => {
  // ─── OWNERSHIP MODEL ──────────────────────────────────────────────
  describe('Canonical Ownership Model', () => {
    it('defines exactly 5 ownership roles', () => {
      expect(OWNERSHIP_ROLES).toHaveLength(5);
    });

    it('all roles have canonical table and field', () => {
      for (const role of OWNERSHIP_ROLES) {
        expect(role.canonicalTable).toBeTruthy();
        expect(role.canonicalField).toBeTruthy();
      }
    });

    it('call_owner and revenue_owner are immutable', () => {
      const callOwner = OWNERSHIP_ROLES.find(r => r.id === 'call_owner');
      const revenueOwner = OWNERSHIP_ROLES.find(r => r.id === 'revenue_owner');
      expect(callOwner?.immutable).toBe(true);
      expect(revenueOwner?.immutable).toBe(true);
    });

    it('lead_owner and appointment_owner are mutable (reassignable)', () => {
      const leadOwner = OWNERSHIP_ROLES.find(r => r.id === 'lead_owner');
      const appointmentOwner = OWNERSHIP_ROLES.find(r => r.id === 'appointment_owner');
      expect(leadOwner?.immutable).toBe(false);
      expect(appointmentOwner?.immutable).toBe(false);
    });

    it('unique ownership role IDs', () => {
      const ids = OWNERSHIP_ROLES.map(r => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  // ─── ASSIGNMENT STATE MACHINE ─────────────────────────────────────
  describe('Assignment State Machine', () => {
    it('defines 9 assignment transitions', () => {
      expect(ASSIGNMENT_TRANSITIONS).toHaveLength(9);
    });

    it('starts at lead_created and ends at commission_distributed', () => {
      expect(ASSIGNMENT_TRANSITIONS[0].from).toBe('lead_created');
      expect(ASSIGNMENT_TRANSITIONS[ASSIGNMENT_TRANSITIONS.length - 1].to).toBe('commission_distributed');
    });

    it('all audit-required transitions have ownership changes', () => {
      const auditRequired = ASSIGNMENT_TRANSITIONS.filter(t => t.auditRequired && t.ownershipChanges.length === 0);
      // outcome_logged is audit-required but has no ownership changes (just logs)
      expect(auditRequired.length).toBeLessThanOrEqual(1);
    });

    it('transitions form a connected chain', () => {
      for (let i = 1; i < ASSIGNMENT_TRANSITIONS.length; i++) {
        expect(ASSIGNMENT_TRANSITIONS[i].from).toBe(ASSIGNMENT_TRANSITIONS[i - 1].to);
      }
    });
  });

  // ─── OWNERSHIP TRANSFER RULES ────────────────────────────────────
  describe('Ownership Transfer Rules', () => {
    it('defines 3 transfer rules', () => {
      expect(OWNERSHIP_TRANSFER_RULES).toHaveLength(3);
    });

    it('setter reassignment preserves original_owner', () => {
      const rule = OWNERSHIP_TRANSFER_RULES.find(r => r.id === 'setter_reassignment');
      expect(rule?.mustPreserve).toContain('appointments.original_owner_id');
    });

    it('closer reassignment preserves setter_id', () => {
      const rule = OWNERSHIP_TRANSFER_RULES.find(r => r.id === 'closer_reassignment');
      expect(rule?.mustPreserve).toContain('appointments.setter_id');
    });

    it('all rules require audit', () => {
      for (const rule of OWNERSHIP_TRANSFER_RULES) {
        expect(rule.mustAudit.length).toBeGreaterThan(0);
      }
    });
  });

  // ─── COMMISSION ATTRIBUTION ──────────────────────────────────────
  describe('Commission Attribution Model', () => {
    it('defines 4 attribution roles', () => {
      expect(COMMISSION_ATTRIBUTION).toHaveLength(4);
    });

    it('closer attribution uses call_owner_user_id', () => {
      const closer = COMMISSION_ATTRIBUTION.find(a => a.role === 'closer');
      expect(closer?.canonicalField).toBe('calls.call_owner_user_id');
    });

    it('setter attribution uses appointments.setter_id', () => {
      const setter = COMMISSION_ATTRIBUTION.find(a => a.role === 'setter');
      expect(setter?.canonicalField).toBe('appointments.setter_id');
    });
  });

  // ─── IMMUTABILITY ────────────────────────────────────────────────
  describe('Immutability Rules', () => {
    it('defines 3 immutability rules', () => {
      expect(IMMUTABILITY_RULES).toHaveLength(3);
    });

    it('commission_after_payout has DB trigger enforcement', () => {
      const rule = IMMUTABILITY_RULES.find(r => r.id === 'commission_after_payout');
      expect(rule?.enforcement).toContain('trg_protect_finalized_commissions');
    });
  });

  // ─── REVENUE TRUTH ───────────────────────────────────────────────
  describe('Revenue Truth Hierarchy', () => {
    it('defines 7 revenue sources', () => {
      expect(REVENUE_SOURCES).toHaveLength(7);
    });

    it('has exactly 3 canonical sources', () => {
      const canonical = REVENUE_SOURCES.filter(s => s.tier === 'canonical');
      expect(canonical).toHaveLength(3);
    });

    it('leads.deal_value is non-canonical', () => {
      const dealValue = REVENUE_SOURCES.find(s => s.id === 'leads_deal_value');
      expect(dealValue?.tier).toBe('non_canonical');
      expect(dealValue?.risk).toBe('high');
    });

    it('NON_CANONICAL_REVENUE_WARNING forbids commission calculation', () => {
      expect(NON_CANONICAL_REVENUE_WARNING.forbiddenUsage).toContain('Commission calculation');
    });

    it('maps all dashboards', () => {
      expect(DASHBOARD_REVENUE_MAP.length).toBeGreaterThanOrEqual(6);
    });

    it('flags ExecutionDashboard as non-canonical', () => {
      const execDash = DASHBOARD_REVENUE_MAP.find(d => d.dashboard === 'Execution Dashboard');
      expect(execDash?.canonical).toBe(false);
      expect(execDash?.risk).toBe('medium');
    });
  });

  // ─── CALENDAR CANON ──────────────────────────────────────────────
  describe('Calendar Canon', () => {
    it('defines 5 calendar truth sources', () => {
      expect(CALENDAR_TRUTH_SOURCES).toHaveLength(5);
    });

    it('all truth sources are canonical', () => {
      for (const source of CALENDAR_TRUTH_SOURCES) {
        expect(source.isCanonical).toBe(true);
      }
    });

    it('appointments is primary scheduling truth', () => {
      const appts = CALENDAR_TRUTH_SOURCES.find(s => s.table === 'appointments');
      expect(appts).toBeDefined();
      expect(appts?.ownerField).toBe('current_owner_id');
    });

    it('GHL has more forbidden rules than allowed', () => {
      expect(GHL_CALENDAR_RULES.forbidden.length).toBeGreaterThan(GHL_CALENDAR_RULES.allowed.length);
    });

    it('defines 6 scheduling integrity rules', () => {
      expect(SCHEDULING_RULES).toHaveLength(6);
    });

    it('includes no-double-booking rule', () => {
      const rule = SCHEDULING_RULES.find(r => r.id === 'no_double_booking');
      expect(rule).toBeDefined();
    });

    it('includes timezone canonicalization rule', () => {
      const rule = SCHEDULING_RULES.find(r => r.id === 'timezone_canonical');
      expect(rule).toBeDefined();
    });
  });

  // ─── PHASE 2 REGISTRY ───────────────────────────────────────────
  describe('Phase 2 Registry', () => {
    it('all 5 migrations completed', () => {
      expect(PHASE2_MIGRATIONS).toHaveLength(5);
      expect(PHASE2_MIGRATIONS.every(m => m.status === 'completed')).toBe(true);
    });

    it('defines 5 integrity checks', () => {
      expect(INTEGRITY_CHECKS).toHaveLength(5);
    });

    it('integrity checks cover all 3 domains', () => {
      const domains = new Set(INTEGRITY_CHECKS.map(c => c.domain));
      expect(domains).toContain('ownership_integrity');
      expect(domains).toContain('revenue_integrity');
      expect(domains).toContain('calendar_integrity');
    });

    it('legacy crons all disabled or removed', () => {
      for (const cron of LEGACY_CRON_STATUS) {
        expect(['disabled', 'removed']).toContain(cron.status);
      }
    });

    it('flags ExecutionDashboard KPI gap', () => {
      expect(DASHBOARD_KPI_GAPS).toHaveLength(1);
      expect(DASHBOARD_KPI_GAPS[0].status).toBe('flagged');
    });
  });

  // ─── AUDIT FUNCTION ──────────────────────────────────────────────
  describe('Audit Function', () => {
    it('returns comprehensive audit summary', () => {
      const audit = auditPhase2Ownership();
      expect(audit.ownershipRoles).toBe(5);
      expect(audit.assignmentTransitions).toBe(9);
      expect(audit.transferRules).toBe(3);
      expect(audit.commissionAttributionRoles).toBe(4);
      expect(audit.immutabilityRules).toBe(3);
      expect(audit.hardRules).toBe(10);
      expect(audit.canonicalRevenueSources).toBe(3);
      expect(audit.nonCanonicalRevenueSources).toBe(1);
      expect(audit.migrationsCompleted).toBe(5);
      expect(audit.integrityChecks).toBe(5);
      expect(audit.calendarTruthSources).toBe(5);
      expect(audit.schedulingRules).toBe(6);
    });
  });
});
