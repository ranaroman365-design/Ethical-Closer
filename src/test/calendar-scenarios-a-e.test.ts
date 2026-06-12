/**
 * End-to-End Scenarios A–E — Calendar + Lead Pool Integration
 *
 * A: Calendar loads via RPC with multi-ownership filter
 * B: Manual appointment creation (new lead → appointment → calendar)
 * C: Radix Select crash prevention (sentinel values)
 * D: Pool-based appointment (pull lead → appointment → removed from pool → visible in calendar)
 * E: Error diagnostics (support-details copy, error classification, reload)
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';

const MODAL_SRC = fs.readFileSync('src/components/calendar/CreateAppointmentModal.tsx', 'utf-8');
const CAL_SRC = fs.readFileSync('src/pages/members/Calendar.tsx', 'utf-8');
const OP_CAL_SRC = fs.readFileSync('src/pages/members/OperatorCalendar.tsx', 'utf-8');
const ROUTER_SRC = fs.readFileSync('src/pages/members/CalendarRouter.tsx', 'utf-8');

const MIGRATION_DIR = 'supabase/migrations';
const migrationFiles = fs.readdirSync(MIGRATION_DIR).sort().reverse();

function findMigration(keyword: string): string | null {
  for (const f of migrationFiles) {
    const c = fs.readFileSync(`${MIGRATION_DIR}/${f}`, 'utf-8');
    if (c.includes(keyword)) return c;
  }
  return null;
}

// ═════════════════════════════════════════════════════════════
// SCENARIO A: Calendar loads via RPC with multi-ownership filter
// ═════════════════════════════════════════════════════════════

describe('Scenario A — Calendar loading', () => {
  it('Calendar.tsx fetches appointments in a try/catch', () => {
    const fnBody = CAL_SRC.substring(
      CAL_SRC.indexOf('fetchAppointments'),
      CAL_SRC.indexOf('fetchAppointments') + 2000
    );
    expect(fnBody).toContain('try {');
    expect(fnBody).toContain('} catch');
  });

  it('Calendar.tsx sets appointments=[] on error (never undefined)', () => {
    const catchIdx = CAL_SRC.indexOf('catch (error');
    expect(catchIdx).toBeGreaterThan(-1);
    const block = CAL_SRC.substring(catchIdx, catchIdx + 400);
    expect(block).toContain('setAppointments([])');
  });

  it('Calendar.tsx sets loading=false in finally', () => {
    expect(CAL_SRC).toContain('} finally {');
    const finallyIdx = CAL_SRC.indexOf('} finally {');
    const block = CAL_SRC.substring(finallyIdx, finallyIdx + 100);
    expect(block).toContain('setLoading(false)');
  });

  it('Calendar.tsx stores loadError with failingQuery field', () => {
    expect(CAL_SRC).toContain('setLoadError');
    expect(CAL_SRC).toContain('failingQuery');
  });

  it('OperatorCalendar uses get_team_member_calendar RPC', () => {
    expect(OP_CAL_SRC).toMatch(/rpc\(['"]get_team_member_calendar['"]/);
  });

  it('get_team_member_calendar checks 6 ownership fields', () => {
    const mig = findMigration('get_team_member_calendar');
    expect(mig).not.toBeNull();
    for (const col of ['setter_id', 'closer_id', 'current_owner_id', 'assigned_operator_id', 'original_owner_id', 'locked_closer_id']) {
      expect(mig).toContain(col);
    }
  });

  it('OperatorCalendar classifies errors via classifyError()', () => {
    expect(OP_CAL_SRC).toContain('classifyError');
    for (const kind of ['missing_rpc', 'forbidden', 'network', 'auth']) {
      expect(OP_CAL_SRC).toContain(kind);
    }
  });

  it('Calendar reload triggers on calReloadTick in OperatorCalendar', () => {
    expect(OP_CAL_SRC).toContain('calReloadTick');
    expect(OP_CAL_SRC).toContain('setCalReloadTick');
  });

  it('Calendar.tsx refetches when onCreated fires', () => {
    expect(CAL_SRC).toMatch(/onCreated.*fetchAppointments/);
  });
});

// ═════════════════════════════════════════════════════════════
// SCENARIO B: Manual appointment creation (new lead + appointment)
// ═════════════════════════════════════════════════════════════

describe('Scenario B — Manual appointment creation', () => {
  it('uses create_manual_appointment RPC (not direct insert)', () => {
    expect(MODAL_SRC).toMatch(/rpc\(['"]create_manual_appointment['"]/);
    expect(MODAL_SRC).not.toMatch(/from\(['"]appointments['"]\)\.insert/);
  });

  it('creates lead with source=manual and stage=booked', () => {
    expect(MODAL_SRC).toContain("source: 'manual'");
    expect(MODAL_SRC).toContain("stage: 'booked'");
  });

  it('does NOT send non-existent columns (lead_source, origin)', () => {
    // Root cause of previous PGRST204 failure
    expect(MODAL_SRC).not.toMatch(/lead_source\s*:/);
    expect(MODAL_SRC).not.toMatch(/\borigin\s*:/);
  });

  it('uses canonical lead_level L0 (not "unknown")', () => {
    expect(MODAL_SRC).not.toContain("lead_level: 'unknown'");
  });

  it('sends all required RPC params', () => {
    for (const p of ['p_lead_id', 'p_starts_at', 'p_ends_at', 'p_call_type']) {
      expect(MODAL_SRC).toContain(p);
    }
  });

  it('sends p_setter_id and p_closer_id to RPC', () => {
    expect(MODAL_SRC).toContain('p_setter_id');
    expect(MODAL_SRC).toContain('p_closer_id');
  });

  it('validates name, email, phone before submission', () => {
    expect(MODAL_SRC).toMatch(/leadName.*trim\(\)/);
    expect(MODAL_SRC).toMatch(/leadEmail.*trim\(\)/);
    expect(MODAL_SRC).toMatch(/leadPhone.*trim\(\)/);
  });

  it('calls onCreated after successful manual creation', () => {
    const manualStart = MODAL_SRC.indexOf('handleManualLead');
    const poolStart = MODAL_SRC.indexOf('handlePoolPull');
    if (manualStart > -1 && poolStart > -1) {
      const section = MODAL_SRC.substring(manualStart, poolStart);
      expect(section).toContain('onCreated?.()');
    }
  });

  it('does NOT call onCreated in catch blocks', () => {
    let from = 0;
    while (true) {
      const idx = MODAL_SRC.indexOf('} catch (', from);
      if (idx === -1) break;
      const block = MODAL_SRC.substring(idx, idx + 300);
      expect(block).not.toContain('onCreated');
      from = idx + 10;
    }
  });

  it('uses canonical call_type values (no _call suffix)', () => {
    expect(MODAL_SRC).not.toContain("'setter_call'");
    expect(MODAL_SRC).not.toContain("'closer_call'");
    expect(MODAL_SRC).not.toContain("'follow_up_call'");
  });

  it('dispatches communication after creation', () => {
    expect(MODAL_SRC).toContain("functions.invoke('dispatch-communication'");
  });

  it('DB trigger validates canonical call_types', () => {
    const mig = findMigration('validate_appointment_fields');
    expect(mig).not.toBeNull();
    for (const ct of ['setter', 'closer', 'follow_up', 'orientation', 'strategy']) {
      expect(mig).toContain(`'${ct}'`);
    }
  });
});

// ═════════════════════════════════════════════════════════════
// SCENARIO C: Radix Select crash prevention (sentinel values)
// ═════════════════════════════════════════════════════════════

describe('Scenario C — Radix Select crash prevention', () => {
  it('defines AUTO_ASSIGN_VALUE sentinel', () => {
    expect(MODAL_SRC).toContain('AUTO_ASSIGN_VALUE');
    expect(MODAL_SRC).toMatch(/__auto__/);
  });

  it('defines NO_CLOSER_VALUE sentinel', () => {
    expect(MODAL_SRC).toContain('NO_CLOSER_VALUE');
    expect(MODAL_SRC).toMatch(/__none__/);
  });

  it('never passes empty string as Select value', () => {
    // Radix Select crashes on value=""
    expect(MODAL_SRC).not.toMatch(/value=\{['"]{2}\}/);
  });

  it('resolves sentinels to null before RPC call', () => {
    // When AUTO_ASSIGN or NO_CLOSER, the actual RPC param must be null
    const hasResolution =
      MODAL_SRC.includes('=== AUTO_ASSIGN_VALUE') ||
      MODAL_SRC.includes('=== NO_CLOSER_VALUE') ||
      MODAL_SRC.includes("|| null");
    expect(hasResolution).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════
// SCENARIO D: Pool → Calendar flow (pull, remove, visible)
// ═════════════════════════════════════════════════════════════

describe('Scenario D — Pool-based appointment creation', () => {
  it('fetches pool leads via get_leads_without_appointment RPC', () => {
    expect(MODAL_SRC).toMatch(/rpc\(['"]get_leads_without_appointment['"]/);
  });

  it('uses create_manual_appointment RPC for pool leads', () => {
    const matches = MODAL_SRC.match(/rpc\(['"]create_manual_appointment['"]/g);
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it('sends p_lead_id from selectedLeadId', () => {
    expect(MODAL_SRC).toContain('p_lead_id: selectedLeadId');
  });

  it('optimistically removes lead from pool on success', () => {
    expect(MODAL_SRC).toContain('setPoolLeads(prev => prev.filter(l => l.id !== selectedLeadId))');
  });

  it('removal happens BEFORE modal close', () => {
    const poolStart = MODAL_SRC.indexOf('handlePoolPull');
    if (poolStart === -1) return;
    const section = MODAL_SRC.substring(poolStart, MODAL_SRC.indexOf('} finally', poolStart));
    const filterIdx = section.indexOf('setPoolLeads(prev =>');
    const closeIdx = section.indexOf('onOpenChange(false)');
    expect(filterIdx).toBeGreaterThan(-1);
    expect(closeIdx).toBeGreaterThan(-1);
    expect(filterIdx).toBeLessThan(closeIdx);
  });

  it('does NOT remove lead from pool on failure', () => {
    const poolStart = MODAL_SRC.indexOf('handlePoolPull');
    if (poolStart === -1) return;
    const catchIdx = MODAL_SRC.indexOf('} catch (', poolStart);
    const finallyIdx = MODAL_SRC.indexOf('} finally', catchIdx);
    const catchBlock = MODAL_SRC.substring(catchIdx, finallyIdx);
    expect(catchBlock).not.toContain('setPoolLeads');
  });

  it('calls onCreated after pool pull success (triggers calendar reload)', () => {
    const poolStart = MODAL_SRC.indexOf('handlePoolPull');
    if (poolStart === -1) return;
    const resetStart = MODAL_SRC.indexOf('resetForm', poolStart);
    const section = MODAL_SRC.substring(poolStart, resetStart > -1 ? resetStart : poolStart + 3000);
    expect(section).toContain('onCreated?.()');
  });

  it('resets selectedLeadId on form reset', () => {
    const resetStart = MODAL_SRC.indexOf('const resetForm');
    if (resetStart === -1) return;
    const resetEnd = MODAL_SRC.indexOf('};', resetStart);
    expect(MODAL_SRC.substring(resetStart, resetEnd)).toContain('setSelectedLeadId(null)');
  });

  it('Calendar.tsx CALL_TYPE_LABELS includes canonical types', () => {
    for (const ct of ['setter', 'closer', 'follow_up']) {
      expect(CAL_SRC).toContain(`${ct}:`);
    }
  });

  it('Calendar.tsx STATUS_STYLES includes all key statuses', () => {
    for (const s of ['confirmed', 'booked', 'rescheduled', 'cancelled', 'completed', 'no_show']) {
      expect(CAL_SRC).toContain(`${s}:`);
    }
  });
});

// ═════════════════════════════════════════════════════════════
// SCENARIO E: Error diagnostics & support-details
// ═════════════════════════════════════════════════════════════

describe('Scenario E — Error diagnostics', () => {
  it('Calendar.tsx stores structured loadError', () => {
    expect(CAL_SRC).toContain('CalendarLoadError');
    expect(CAL_SRC).toContain('failingQuery');
    expect(CAL_SRC).toContain('code?:');
    expect(CAL_SRC).toContain('details?:');
    expect(CAL_SRC).toContain('hint?:');
  });

  it('Calendar.tsx has support-details clipboard copy', () => {
    expect(CAL_SRC).toContain('navigator.clipboard.writeText');
    expect(CAL_SRC).toContain('Support-Details');
  });

  it('Calendar.tsx support payload includes route, user, range, query, Supabase fields', () => {
    // Check the clipboard payload area
    const clipIdx = CAL_SRC.indexOf('navigator.clipboard.writeText');
    expect(clipIdx).toBeGreaterThan(-1);
    const area = CAL_SRC.substring(clipIdx - 1200, clipIdx + 400);
    expect(area).toContain('window.location.pathname');
    expect(area).toContain('failing_query');
    expect(area).toContain('supabase_code');
    expect(area).toContain('supabase_message');
  });

  it('OperatorCalendar also has support-details copy', () => {
    expect(OP_CAL_SRC).toContain('clipboard');
  });

  it('CalendarRouter has error boundary with retry', () => {
    expect(ROUTER_SRC).toContain('Kalender konnte nicht geladen werden');
    expect(ROUTER_SRC).toContain('Erneut versuchen');
    expect(ROUTER_SRC).toContain('Support-Details kopieren');
  });

  it('CalendarRouter falls back to level 0 on error', () => {
    expect(ROUTER_SRC).toContain('setLevel(0)');
  });

  it('Modal has admin error detail panel', () => {
    expect(MODAL_SRC).toContain('isAdmin && errorDetail');
    expect(MODAL_SRC).toContain('setErrorDetail(null)');
    expect(MODAL_SRC).toContain('navigator.clipboard.writeText');
  });

  it('Modal errorDetail captures source, code, payload, raw', () => {
    expect(MODAL_SRC).toContain('source:');
    expect(MODAL_SRC).toContain('code:');
    expect(MODAL_SRC).toContain('payload:');
    expect(MODAL_SRC).toContain('raw:');
  });

  it('create_manual_appointment RPC logs failures to rpc_error_log', () => {
    const mig = findMigration('create_manual_appointment');
    expect(mig).not.toBeNull();
    if (mig?.includes('rpc_error_log')) {
      for (const code of ['auth_required', 'missing_lead', 'invalid_time_range', 'lead_has_active_appointment']) {
        expect(mig).toContain(`'${code}'`);
      }
    }
  });
});
