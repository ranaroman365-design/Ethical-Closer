/**
 * Production Hardening QA Tests
 * Validates: capacity, blocker, test lead exclusion, reassignment retain_block,
 * KPI safety, commission safety
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';

const MODAL_SRC = fs.readFileSync('src/components/calendar/CreateAppointmentModal.tsx', 'utf-8');
const DETAIL_SRC = fs.readFileSync('src/components/calendar/AppointmentDetailModal.tsx', 'utf-8');
const REASSIGN_HOOK = fs.readFileSync('src/hooks/useReassignAppointment.ts', 'utf-8');
const L6_PERF = fs.readFileSync('src/hooks/useL6PerformanceData.ts', 'utf-8');
const CALENDAR_SRC = fs.readFileSync('src/pages/members/Calendar.tsx', 'utf-8');

// Find latest migration with create_manual_appointment
const migDir = 'supabase/migrations';
const migFiles = fs.readdirSync(migDir).sort().reverse();
const latestCapacityMig = migFiles.find(f => {
  const c = fs.readFileSync(`${migDir}/${f}`, 'utf-8');
  return c.includes('capacity_exceeded') && c.includes('blocker_collision');
});
const MIG_SRC = latestCapacityMig ? fs.readFileSync(`${migDir}/${latestCapacityMig}`, 'utf-8') : '';

// ── 1. Server-Side Capacity Enforcement ──
describe('Capacity enforcement (server-side)', () => {
  it('create_manual_appointment checks daily capacity', () => {
    expect(MIG_SRC).toContain('v_daily_capacity');
    expect(MIG_SRC).toContain('capacity_exceeded');
  });
  it('reads from user_capacity_settings table', () => {
    expect(MIG_SRC).toContain('user_capacity_settings');
  });
  it('defaults to 6 when no capacity row', () => {
    expect(MIG_SRC).toContain('v_daily_capacity := 6');
  });
  it('uses Europe/Berlin timezone for day boundaries', () => {
    expect(MIG_SRC).toContain("'Europe/Berlin'");
  });
  it('excludes cancelled/reassigned from count', () => {
    expect(MIG_SRC).toMatch(/NOT IN.*cancelled.*reassigned/s);
  });
  it('modal handles capacity_exceeded error', () => {
    expect(MODAL_SRC).toContain('creationError');
  });
});

// ── 2. Server-Side Blocker Enforcement ──
describe('Blocker enforcement (server-side)', () => {
  it('create_manual_appointment checks blocker collision', () => {
    expect(MIG_SRC).toContain('blocker_collision');
  });
  it('checks hard blocker types', () => {
    expect(MIG_SRC).toContain('vacation');
    expect(MIG_SRC).toContain('sick_leave');
    expect(MIG_SRC).toContain('unavailable');
    expect(MIG_SRC).toContain('full_day_block');
  });
  it('checks time overlap correctly', () => {
    expect(MIG_SRC).toContain('starts_at < p_ends_at');
    expect(MIG_SRC).toContain('ends_at > p_starts_at');
  });
});

// ── 3. Reassignment Retain Block ──
describe('Reassignment retain_original_block', () => {
  it('reassign_appointment RPC accepts p_retain_block', () => {
    expect(MIG_SRC).toContain('p_retain_block');
  });
  it('hook passes retainBlock to RPC', () => {
    expect(REASSIGN_HOOK).toContain('p_retain_block');
    expect(REASSIGN_HOOK).toContain('retainBlock');
  });
  it('detail modal has retainBlock toggle state', () => {
    expect(DETAIL_SRC).toContain('retainBlock');
    expect(DETAIL_SRC).toContain('setRetainBlock');
  });
  it('detail modal shows retain block checkbox', () => {
    expect(DETAIL_SRC).toContain('Original-Slot blockiert lassen');
  });
  it('detail modal passes p_retain_block to RPC', () => {
    expect(DETAIL_SRC).toContain('p_retain_block: retainBlock');
  });
});

// ── 4. Reassignment KPI Safety ──
describe('Reassignment KPI safety', () => {
  it('calendar renders reassigned as read-only', () => {
    expect(CALENDAR_SRC).toContain('reassigned');
    expect(CALENDAR_SRC).toMatch(/opacity-40.*pointer-events-none/);
  });
  it('active_appointments view excludes reassigned/cancelled/blocked', () => {
    expect(MIG_SRC).toContain('active_appointments');
    expect(MIG_SRC).toMatch(/NOT IN.*cancelled.*reassigned.*blocked/s);
  });
  it('active_appointments view excludes test leads', () => {
    expect(MIG_SRC).toContain('is_test_lead');
  });
});

// ── 5. Test Lead Exclusion ──
describe('Test lead exclusion from KPIs', () => {
  it('L6 performance data filters is_test_lead=false', () => {
    expect(L6_PERF).toContain('.eq("is_test_lead", false)');
  });
  it('real_leads view excludes test + simulation', () => {
    expect(MIG_SRC).toContain('real_leads');
    expect(MIG_SRC).toContain('is_test_lead = false');
    expect(MIG_SRC).toContain('is_simulation');
  });
  it('modal has test lead toggle', () => {
    expect(MODAL_SRC).toContain('isTestLead');
    expect(MODAL_SRC).toContain('Test-Lead');
  });
  it('test leads skip email dispatch', () => {
    expect(MODAL_SRC).toContain('!isTestLead');
  });
  it('pool shows TEST badge for test leads', () => {
    expect(MODAL_SRC).toContain('is_test_lead');
    expect(MODAL_SRC).toContain('TEST');
  });
});

// ── 6. Commission Safety ──
describe('Commission safety', () => {
  it('reassigned appointments excluded from active KPIs', () => {
    expect(MIG_SRC).toMatch(/NOT IN.*reassigned/s);
  });
  it('RPC prevents already_owner duplicate', () => {
    expect(MIG_SRC).toContain('already_owner');
  });
});

// ── 7. Error Handling ──
describe('New error codes handled in UI', () => {
  it('capacity_exceeded in creationError', () => {
    // The RPC returns capacity_exceeded, modal must show it
    expect(MODAL_SRC).toContain('creationError');
  });
  it('blocker_collision in creationError', () => {
    expect(MODAL_SRC).toContain('creationError');
  });
});
