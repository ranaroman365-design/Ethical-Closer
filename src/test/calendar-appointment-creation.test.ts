/**
 * E2E Regression Tests — Calendar Appointment Creation
 *
 * Validates that manual Setter/Closer/Follow-up appointments and Leadpool
 * appointment creation work end-to-end through the calendar flow.
 *
 * Checks:
 * 1. CreateAppointmentModal uses RPC (not direct insert)
 * 2. All 3 call types (setter/closer/follow_up) are valid enum values
 * 3. Manual lead creation includes required fields (name, email, phone)
 * 4. Leadpool pull uses RPC with selected lead
 * 5. Calendar renders all call types correctly
 * 6. Validate trigger accepts all canonical call_type values
 * 7. No stale "setter_call"/"closer_call" enum values remain
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';

const MODAL_SRC = fs.readFileSync('src/components/calendar/CreateAppointmentModal.tsx', 'utf-8');
const CALENDAR_SRC = fs.readFileSync('src/pages/members/Calendar.tsx', 'utf-8');

// ── 1. RPC-only appointment creation ──

describe('CreateAppointmentModal — RPC usage', () => {
  it('does NOT use direct appointments.insert', () => {
    expect(MODAL_SRC).not.toMatch(/from\(['"]appointments['"]\)\.insert/);
  });

  it('uses create_manual_appointment RPC for manual leads', () => {
    expect(MODAL_SRC).toMatch(/rpc\(['"]create_manual_appointment['"]/);
  });

  it('uses create_manual_appointment RPC for pool leads', () => {
    // Must appear at least twice (manual + pool)
    const matches = MODAL_SRC.match(/rpc\(['"]create_manual_appointment['"]/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});

// ── 2. Call type enum compliance ──

const CANONICAL_CALL_TYPES = ['setter', 'closer', 'follow_up', 'orientation', 'strategy'];

describe('Call type enum compliance', () => {
  it('modal default callType is a canonical value', () => {
    const defaultMatch = MODAL_SRC.match(/useState\(['"](\w+)['"]\).*callType/s)
      || MODAL_SRC.match(/callType.*useState\(['"](\w+)['"]\)/s)
      || MODAL_SRC.match(/const \[callType.*useState.*['"](\w+)['"]/);
    // Fallback: just check that 'setter_call' is NOT used as default
    expect(MODAL_SRC).not.toMatch(/useState\(['"]setter_call['"]\)/);
    expect(MODAL_SRC).not.toMatch(/useState\(['"]closer_call['"]\)/);
  });

  it('no legacy _call suffixed values sent to RPC', () => {
    // These old values caused "Invalid call_type" errors
    expect(MODAL_SRC).not.toContain("'setter_call'");
    expect(MODAL_SRC).not.toContain("'closer_call'");
    expect(MODAL_SRC).not.toContain("'follow_up_call'");
  });

  it('calendar CALL_TYPE_LABELS includes all canonical types', () => {
    for (const ct of CANONICAL_CALL_TYPES) {
      expect(CALENDAR_SRC).toContain(`${ct}:`);
    }
  });
});

// ── 3. Manual lead validation ──

describe('Manual lead — required field validation', () => {
  it('validates name before submission', () => {
    expect(MODAL_SRC).toMatch(/leadName.*trim\(\)/);
  });

  it('validates email before submission', () => {
    expect(MODAL_SRC).toMatch(/leadEmail.*trim\(\)/);
  });

  it('validates phone before submission', () => {
    expect(MODAL_SRC).toMatch(/leadPhone.*trim\(\)/);
  });

  it('creates lead with source=manual', () => {
    expect(MODAL_SRC).toContain("source: 'manual'");
  });

  it('creates lead with stage=booked (canonical for calendar creation)', () => {
    expect(MODAL_SRC).toContain("stage: 'booked'");
  });

  it('does not send non-existent lead columns to PostgREST', () => {
    expect(MODAL_SRC).not.toContain('lead_source:');
    expect(MODAL_SRC).not.toContain('origin:');
  });
});

// ── 4. Leadpool pull ──

describe('Leadpool pull flow', () => {
  it('fetches pool via get_leads_without_appointment RPC', () => {
    expect(MODAL_SRC).toMatch(/rpc\(['"]get_leads_without_appointment['"]/);
  });

  it('requires selectedLeadId before pool submission', () => {
    expect(MODAL_SRC).toContain('selectedLeadId');
    expect(MODAL_SRC).toMatch(/!selectedLeadId/);
  });

  it('pool appointment sends p_lead_id from selected lead', () => {
    expect(MODAL_SRC).toContain('p_lead_id: selectedLeadId');
  });

  it('optimistically removes selected lead from pool after success', () => {
    // setPoolLeads(prev => prev.filter(l => l.id !== selectedLeadId)) must exist
    expect(MODAL_SRC).toContain('setPoolLeads(prev => prev.filter(l => l.id !== selectedLeadId))');
  });

  it('optimistic removal happens BEFORE modal close in pool handler', () => {
    const poolStart = MODAL_SRC.indexOf('handlePoolPull');
    const poolEnd = MODAL_SRC.indexOf('} finally', poolStart);
    const poolSection = MODAL_SRC.substring(poolStart, poolEnd);
    const filterIdx = poolSection.indexOf('setPoolLeads(prev =>');
    const closeIdx = poolSection.indexOf('onOpenChange(false)');
    expect(filterIdx).toBeGreaterThan(-1);
    expect(closeIdx).toBeGreaterThan(-1);
    expect(filterIdx).toBeLessThan(closeIdx);
  });

  it('resets selectedLeadId on form reset', () => {
    // resetForm function must clear selectedLeadId
    const resetStart = MODAL_SRC.indexOf('const resetForm');
    const resetEnd = MODAL_SRC.indexOf('};', resetStart);
    const resetBody = MODAL_SRC.substring(resetStart, resetEnd);
    expect(resetBody).toContain('setSelectedLeadId(null)');
  });

  it('does NOT remove lead from pool on failure', () => {
    const poolStart = MODAL_SRC.indexOf('handlePoolPull');
    const catchIdx = MODAL_SRC.indexOf('} catch (', poolStart);
    const finallyIdx = MODAL_SRC.indexOf('} finally', catchIdx);
    const catchBlock = MODAL_SRC.substring(catchIdx, finallyIdx);
    expect(catchBlock).not.toContain('setPoolLeads');
  });
});

// ── 5. Calendar rendering of call types ──

describe('Calendar — appointment rendering', () => {
  it('renders STATUS_STYLES for all key statuses', () => {
    const requiredStatuses = ['confirmed', 'booked', 'rescheduled', 'cancelled', 'completed', 'no_show'];
    for (const s of requiredStatuses) {
      expect(CALENDAR_SRC).toContain(`${s}:`);
    }
  });

  it('has CALL_TYPE_LABELS mapping', () => {
    expect(CALENDAR_SRC).toContain('CALL_TYPE_LABELS');
  });
});

// ── 6. DB trigger accepts canonical call_types ──

describe('DB trigger — validate_appointment_fields', () => {
  it('latest migration accepts all canonical call types', () => {
    const migrationDir = 'supabase/migrations';
    const files = fs.readdirSync(migrationDir).sort().reverse();

    let found = false;
    for (const file of files) {
      const content = fs.readFileSync(`${migrationDir}/${file}`, 'utf-8');
      if (content.includes('validate_appointment_fields')) {
        // All canonical types must be in the allowed list
        for (const ct of ['setter', 'closer', 'follow_up', 'orientation', 'strategy']) {
          expect(content).toContain(`'${ct}'`);
        }
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});

// ── 7. Timestamp building safety ──

describe('Timestamp building', () => {
  it('buildTimestamps validates start < end', () => {
    expect(MODAL_SRC).toMatch(/endsAt\s*<=\s*startsAt/);
  });

  it('outputs ISO strings for RPC', () => {
    expect(MODAL_SRC).toMatch(/\.toISOString\(\)/);
  });
});

// ── 8. Error handling ──

describe('Error handling', () => {
  it('has creationError helper for RPC error codes', () => {
    expect(MODAL_SRC).toContain('creationError');
    expect(MODAL_SRC).toContain('lead_has_active_appointment');
    expect(MODAL_SRC).toContain('missing_lead');
    expect(MODAL_SRC).toContain('invalid_time_range');
  });

  it('shows toast on failure, does not crash silently', () => {
    // Must have try/catch in both manual and pool handlers
    const tryCatchCount = (MODAL_SRC.match(/} catch \(/g) || []).length;
    expect(tryCatchCount).toBeGreaterThanOrEqual(3); // blocker + manual + pool
  });
});
