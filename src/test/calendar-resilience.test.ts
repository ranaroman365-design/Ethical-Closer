/**
 * Calendar Resilience Tests
 *
 * Validates that the calendar NEVER hard-crashes after appointment creation
 * (success or failure). Checks:
 * 1. Calendar.tsx has try/catch around fetchAppointments
 * 2. Calendar.tsx sets appointments to [] on error (no undefined crash)
 * 3. Calendar.tsx filters null/invalid appointments (defensive guard)
 * 4. CreateAppointmentModal calls onCreated (triggers reload) on success
 * 5. CreateAppointmentModal does NOT call onCreated on failure
 * 6. CalendarRouter has error boundary UI (no blank crash)
 * 7. RPC error logging table exists in latest migration
 * 8. Admin error detail panel exists in modal
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';

const CALENDAR_SRC = fs.readFileSync('src/pages/members/Calendar.tsx', 'utf-8');
const MODAL_SRC = fs.readFileSync('src/components/calendar/CreateAppointmentModal.tsx', 'utf-8');
const ROUTER_SRC = fs.readFileSync('src/pages/members/CalendarRouter.tsx', 'utf-8');

// ── 1. Calendar fetch resilience ──

describe('Calendar — fetch resilience', () => {
  it('fetchAppointments is wrapped in try/catch', () => {
    // Extract the fetchAppointments function body
    const fnStart = CALENDAR_SRC.indexOf('fetchAppointments');
    const afterFn = CALENDAR_SRC.substring(fnStart, fnStart + 2000);
    expect(afterFn).toContain('try {');
    expect(afterFn).toContain('} catch');
  });

  it('sets appointments to empty array on error (never undefined)', () => {
    // In the catch block, setAppointments([]) must exist
    const catchIdx = CALENDAR_SRC.indexOf("catch (error");
    const catchBlock = CALENDAR_SRC.substring(catchIdx, catchIdx + 300);
    expect(catchBlock).toContain('setAppointments([])');
  });

  it('filters out null/invalid appointments before rendering', () => {
    // Defensive: filter entries without id/starts_at/ends_at
    expect(CALENDAR_SRC).toMatch(/!a\?\.id\s*\|\|\s*!a\?\.starts_at\s*\|\|\s*!a\?\.ends_at/);
  });

  it('shows user-friendly error toast instead of crashing', () => {
    expect(CALENDAR_SRC).toContain('Kalender konnte nicht geladen werden');
  });

  it('sets loading=false in finally block', () => {
    // Ensure loading state is always cleared
    const finallyIdx = CALENDAR_SRC.indexOf('} finally {');
    expect(finallyIdx).toBeGreaterThan(-1);
    const finallyBlock = CALENDAR_SRC.substring(finallyIdx, finallyIdx + 100);
    expect(finallyBlock).toContain('setLoading(false)');
  });
});

// ── 2. Modal → Calendar reload contract ──

describe('CreateAppointmentModal — reload contract', () => {
  it('calls onCreated on successful creation (blocker)', () => {
    // After blocker success, onCreated?.() must be called
    const blockerSection = MODAL_SRC.substring(
      MODAL_SRC.indexOf('handleBlocker'),
      MODAL_SRC.indexOf('handleManualLead')
    );
    expect(blockerSection).toContain('onCreated?.()');
  });

  it('calls onCreated on successful creation (manual)', () => {
    const manualSection = MODAL_SRC.substring(
      MODAL_SRC.indexOf('handleManualLead'),
      MODAL_SRC.indexOf('handlePoolPull')
    );
    expect(manualSection).toContain('onCreated?.()');
  });

  it('calls onCreated on successful creation (pool)', () => {
    const poolSection = MODAL_SRC.substring(
      MODAL_SRC.indexOf('handlePoolPull'),
      MODAL_SRC.indexOf('resetForm')
    );
    expect(poolSection).toContain('onCreated?.()');
  });

  it('does NOT call onCreated in catch blocks', () => {
    // Find all catch blocks and verify none contain onCreated
    const catchBlocks: string[] = [];
    let searchFrom = 0;
    while (true) {
      const idx = MODAL_SRC.indexOf('} catch (', searchFrom);
      if (idx === -1) break;
      catchBlocks.push(MODAL_SRC.substring(idx, idx + 300));
      searchFrom = idx + 10;
    }
    expect(catchBlocks.length).toBeGreaterThanOrEqual(3);
    for (const block of catchBlocks) {
      expect(block).not.toContain('onCreated');
    }
  });

  it('closes modal on success (onOpenChange(false))', () => {
    expect(MODAL_SRC).toContain('onOpenChange(false)');
  });
});

// ── 3. CalendarRouter error boundary ──

describe('CalendarRouter — error boundary', () => {
  it('has CalendarError component for error display', () => {
    expect(ROUTER_SRC).toContain('CalendarError');
  });

  it('displays user-friendly error message', () => {
    expect(ROUTER_SRC).toContain('Kalender konnte nicht geladen werden');
  });

  it('provides retry button', () => {
    expect(ROUTER_SRC).toContain('Erneut versuchen');
  });

  it('provides support details copy', () => {
    expect(ROUTER_SRC).toContain('Support-Details kopieren');
  });

  it('catches exceptions during level resolution', () => {
    expect(ROUTER_SRC).toContain('catch (e');
  });

  it('falls back to level 0 on query error (not crash)', () => {
    expect(ROUTER_SRC).toContain('setLevel(0)');
  });
});

// ── 4. Server-side error logging ──

describe('RPC error logging — rpc_error_log', () => {
  it('create_manual_appointment logs failures to rpc_error_log', () => {
    const migrationDir = 'supabase/migrations';
    const files = fs.readdirSync(migrationDir).sort().reverse();

    let found = false;
    for (const file of files) {
      const content = fs.readFileSync(`${migrationDir}/${file}`, 'utf-8');
      if (content.includes('create_manual_appointment') && content.includes('rpc_error_log')) {
        // Must log at least auth_required, missing_lead, invalid_time_range, lead_has_active_appointment
        expect(content).toContain("'auth_required'");
        expect(content).toContain("'missing_lead'");
        expect(content).toContain("'invalid_time_range'");
        expect(content).toContain("'lead_has_active_appointment'");
        expect(content).toContain("'capacity_exceeded'");
        expect(content).toContain("'blocker_collision'");
        expect(content).toContain("'insert_failed'");
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('rpc_error_log table has RLS enabled', () => {
    const migrationDir = 'supabase/migrations';
    const files = fs.readdirSync(migrationDir).sort().reverse();

    for (const file of files) {
      const content = fs.readFileSync(`${migrationDir}/${file}`, 'utf-8');
      if (content.includes('rpc_error_log') && content.includes('CREATE TABLE')) {
        expect(content).toContain('ENABLE ROW LEVEL SECURITY');
        expect(content).toContain('CREATE POLICY');
        break;
      }
    }
  });
});

// ── 5. Admin error detail panel ──

describe('Admin error detail panel', () => {
  it('modal has errorDetail state', () => {
    expect(MODAL_SRC).toContain('errorDetail');
  });

  it('captures error source, code, payload, raw', () => {
    expect(MODAL_SRC).toContain('source:');
    expect(MODAL_SRC).toContain('code:');
    expect(MODAL_SRC).toContain('payload:');
    expect(MODAL_SRC).toContain('raw:');
  });

  it('only shows error panel for admin users', () => {
    expect(MODAL_SRC).toContain('isAdmin && errorDetail');
  });

  it('has copy-to-clipboard for support', () => {
    expect(MODAL_SRC).toContain('navigator.clipboard.writeText');
  });

  it('has close/dismiss button', () => {
    expect(MODAL_SRC).toContain('setErrorDetail(null)');
  });
});
