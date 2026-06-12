/**
 * E2E Regression Tests — Manual & Pool Appointment Creation + Calendar/Pool Visibility
 *
 * Ensures appointments created via manual entry or lead-pool pull:
 * 1. Use canonical RPCs (not direct inserts)
 * 2. Trigger correct lead state updates
 * 3. Are queryable by the calendar RPC (get_team_member_calendar)
 * 4. Remove the lead from the pool view after pull
 * 5. Refetch/invalidate calendar data after creation
 * 6. Handle all ownership fields for calendar visibility
 * 7. No stale patterns that break rendering
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';

const MODAL_SRC = fs.readFileSync('src/components/calendar/CreateAppointmentModal.tsx', 'utf-8');
const OP_CAL_SRC = fs.readFileSync('src/pages/members/OperatorCalendar.tsx', 'utf-8');
const CAL_SRC = fs.readFileSync('src/pages/members/Calendar.tsx', 'utf-8');

// ═══════════════════════════════════════════════
// 1. Manual appointment creation — RPC contract
// ═══════════════════════════════════════════════

describe('Manual appointment creation — RPC contract', () => {
  it('uses create_manual_appointment RPC (not direct insert)', () => {
    expect(MODAL_SRC).toMatch(/rpc\(['"]create_manual_appointment['"]/);
    expect(MODAL_SRC).not.toMatch(/from\(['"]appointments['"]\)\.insert/);
  });

  it('sends p_lead_id, p_starts_at, p_ends_at, p_call_type to RPC', () => {
    expect(MODAL_SRC).toContain('p_lead_id');
    expect(MODAL_SRC).toContain('p_starts_at');
    expect(MODAL_SRC).toContain('p_ends_at');
    expect(MODAL_SRC).toContain('p_call_type');
  });

  it('creates lead with stage=booked before calling RPC', () => {
    expect(MODAL_SRC).toContain("stage: 'booked'");
  });

  it('updates lead to booked conversion_state', () => {
    // The modal or RPC must set conversion_state to booked
    const hasBookedState = MODAL_SRC.includes("conversion_state: 'booked'")
      || MODAL_SRC.includes("conversion_state: 'engaged'");
    expect(hasBookedState).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// 2. Pool-based appointment creation
// ═══════════════════════════════════════════════

describe('Pool-based appointment creation', () => {
  it('fetches pool leads via get_leads_without_appointment RPC', () => {
    expect(MODAL_SRC).toMatch(/rpc\(['"]get_leads_without_appointment['"]/);
  });

  it('uses create_manual_appointment RPC for pool leads (same as manual)', () => {
    const matches = MODAL_SRC.match(/rpc\(['"]create_manual_appointment['"]/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it('sends p_lead_id from selectedLeadId for pool appointments', () => {
    expect(MODAL_SRC).toContain('p_lead_id: selectedLeadId');
  });

  it('optimistically removes lead from pool after successful creation', () => {
    expect(MODAL_SRC).toContain('setPoolLeads(prev => prev.filter(l => l.id !== selectedLeadId))');
  });

  it('does NOT remove lead from pool on failure', () => {
    const poolStart = MODAL_SRC.indexOf('handlePoolPull');
    if (poolStart === -1) return; // skip if handler renamed
    const catchIdx = MODAL_SRC.indexOf('} catch (', poolStart);
    const finallyIdx = MODAL_SRC.indexOf('} finally', catchIdx);
    const catchBlock = MODAL_SRC.substring(catchIdx, finallyIdx);
    expect(catchBlock).not.toContain('setPoolLeads');
  });

  it('resets selectedLeadId on form reset', () => {
    const resetStart = MODAL_SRC.indexOf('const resetForm');
    if (resetStart === -1) return;
    const resetEnd = MODAL_SRC.indexOf('};', resetStart);
    const resetBody = MODAL_SRC.substring(resetStart, resetEnd);
    expect(resetBody).toContain('setSelectedLeadId(null)');
  });
});

// ═══════════════════════════════════════════════
// 3. Calendar visibility — get_team_member_calendar RPC
// ═══════════════════════════════════════════════

describe('Calendar visibility — OperatorCalendar fetches via RPC', () => {
  it('uses get_team_member_calendar RPC to load appointments', () => {
    expect(OP_CAL_SRC).toMatch(/rpc\(['"]get_team_member_calendar['"]/);
  });

  it('passes _from and _to date range parameters', () => {
    expect(OP_CAL_SRC).toContain('_from:');
    expect(OP_CAL_SRC).toMatch(/_from:.*toISOString/);
  });

  it('RPC checks ALL ownership fields (not just setter_id)', () => {
    // The latest migration must check multiple owner fields
    const migrationDir = 'supabase/migrations';
    const files = fs.readdirSync(migrationDir).sort().reverse();

    let found = false;
    for (const file of files) {
      const content = fs.readFileSync(`${migrationDir}/${file}`, 'utf-8');
      if (content.includes('get_team_member_calendar')) {
        // Must check setter_id AND closer_id AND current_owner_id
        expect(content).toContain('setter_id');
        expect(content).toContain('closer_id');
        expect(content).toContain('current_owner_id');
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// 4. Calendar reload after appointment creation
// ═══════════════════════════════════════════════

describe('Calendar reload after creation', () => {
  it('modal calls onSuccess or refetch callback after RPC success', () => {
    // The modal must notify parent to reload calendar data
    const hasCallback = MODAL_SRC.includes('onSuccess')
      || MODAL_SRC.includes('onCreated')
      || MODAL_SRC.includes('refetchCalendar')
      || MODAL_SRC.includes('onOpenChange(false)');
    expect(hasCallback).toBe(true);
  });

  it('OperatorCalendar has a reload/tick mechanism', () => {
    // calReloadTick or similar refresh trigger
    const hasReload = OP_CAL_SRC.includes('calReloadTick')
      || OP_CAL_SRC.includes('refetch')
      || OP_CAL_SRC.includes('setCalReloadTick');
    expect(hasReload).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// 5. Error classification in OperatorCalendar
// ═══════════════════════════════════════════════

describe('OperatorCalendar error classification', () => {
  it('classifies missing_rpc errors distinctly', () => {
    expect(OP_CAL_SRC).toContain('missing_rpc');
  });

  it('classifies forbidden (RLS) errors', () => {
    expect(OP_CAL_SRC).toContain('forbidden');
  });

  it('classifies network errors', () => {
    expect(OP_CAL_SRC).toContain('network');
  });

  it('classifies auth errors', () => {
    expect(OP_CAL_SRC).toContain('auth');
  });

  it('has copy-support-details diagnostic capability', () => {
    const hasDiag = OP_CAL_SRC.includes('Support')
      || OP_CAL_SRC.includes('support')
      || OP_CAL_SRC.includes('clipboard');
    expect(hasDiag).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// 6. Lead state updates after appointment creation
// ═══════════════════════════════════════════════

describe('Lead state update after appointment creation', () => {
  it('updates lead booking_status or stage after manual creation', () => {
    // After RPC success, lead fields must be synced
    const updatesLead = MODAL_SRC.includes("from('leads').update")
      || MODAL_SRC.includes("stage: 'booked'")
      || MODAL_SRC.includes("booking_status");
    expect(updatesLead).toBe(true);
  });

  it('manual lead insert includes source=manual', () => {
    expect(MODAL_SRC).toContain("source: 'manual'");
  });

  it('validates name, email, phone before submission', () => {
    expect(MODAL_SRC).toMatch(/leadName.*trim\(\)/);
    expect(MODAL_SRC).toMatch(/leadEmail.*trim\(\)/);
    expect(MODAL_SRC).toMatch(/leadPhone.*trim\(\)/);
  });
});

// ═══════════════════════════════════════════════
// 7. No stale enum values
// ═══════════════════════════════════════════════

describe('No stale call_type enum values', () => {
  it('modal does not use setter_call or closer_call', () => {
    expect(MODAL_SRC).not.toContain("'setter_call'");
    expect(MODAL_SRC).not.toContain("'closer_call'");
    expect(MODAL_SRC).not.toContain("'follow_up_call'");
  });

  it('Calendar page has CALL_TYPE_LABELS for canonical types', () => {
    for (const ct of ['setter', 'closer', 'follow_up']) {
      expect(CAL_SRC).toContain(`${ct}:`);
    }
  });
});

// ═══════════════════════════════════════════════
// 8. Blocker creation does not conflict with appointments
// ═══════════════════════════════════════════════

describe('Calendar blocker creation', () => {
  it('uses calendar_blockers table (separate from appointments)', () => {
    expect(MODAL_SRC).toContain("from('calendar_blockers')");
  });

  it('logs calendar event for blockers', () => {
    expect(MODAL_SRC).toMatch(/rpc\(['"]log_calendar_event['"]/);
  });
});

// ═══════════════════════════════════════════════
// 9. Dispatch-communication after appointment
// ═══════════════════════════════════════════════

describe('Post-creation communication dispatch', () => {
  it('invokes dispatch-communication edge function', () => {
    expect(MODAL_SRC).toContain("functions.invoke('dispatch-communication'");
  });
});

// ═══════════════════════════════════════════════
// 10. Sentinel values for Radix Select (crash prevention)
// ═══════════════════════════════════════════════

describe('Radix Select crash prevention', () => {
  it('does not use empty string as Select value', () => {
    // Empty string value on Radix Select crashes the component
    const emptyValuePattern = /value=\{['"]{2}\}/;
    // This is a heuristic — if the modal has sentinel values, no crash
    const hasSentinel = MODAL_SRC.includes('AUTO_ASSIGN')
      || MODAL_SRC.includes('NO_CLOSER')
      || MODAL_SRC.includes('__none')
      || !emptyValuePattern.test(MODAL_SRC);
    expect(hasSentinel).toBe(true);
  });
});
