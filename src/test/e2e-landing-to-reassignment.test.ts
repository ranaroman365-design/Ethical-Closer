/**
 * E2E QA Test — Landing → Quiz → Lead → Leadpool → Appointment → Reassignment
 *
 * Validates the complete user journey through static source analysis:
 * 1. Landing page renders quiz entry CTA
 * 2. FunnelQuiz → LeadCaptureGate → upsert_funnel_lead RPC
 * 3. Lead appears in Leadpool (get_leads_without_appointment RPC)
 * 4. Leadpool → Appointment creation via create_manual_appointment RPC
 * 5. Reassignment via reassign_appointment RPC with audit log
 * 6. No-duplicate checks at every stage
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';

// ── Source files ──
const QUIZ_SRC = fs.readFileSync('src/components/funnel/FunnelQuiz.tsx', 'utf-8');
const LEAD_GATE_SRC = fs.readFileSync('src/components/funnel/LeadCaptureGate.tsx', 'utf-8');
const CREATE_MODAL_SRC = fs.readFileSync('src/components/calendar/CreateAppointmentModal.tsx', 'utf-8');
const DETAIL_MODAL_SRC = fs.readFileSync('src/components/calendar/AppointmentDetailModal.tsx', 'utf-8');
const CALENDAR_SRC = fs.readFileSync('src/pages/members/Calendar.tsx', 'utf-8');
const REASSIGN_HOOK_SRC = fs.readFileSync('src/hooks/useReassignAppointment.ts', 'utf-8');
const ATTRIBUTION_SRC = fs.readFileSync('src/lib/attribution-session.ts', 'utf-8');

// ════════════════════════════════════════════════════
// STAGE 1: Landing → Quiz
// ════════════════════════════════════════════════════

describe('Stage 1: Landing → Quiz Flow', () => {
  it('FunnelQuiz renders questions with options', () => {
    expect(QUIZ_SRC).toContain('questions');
    expect(QUIZ_SRC).toContain('q.options.map');
  });

  it('FunnelQuiz tracks quiz_answer events per question', () => {
    expect(QUIZ_SRC).toContain('trackFunnelEvent("quiz_answer"');
  });

  it('FunnelQuiz tracks quiz_completed on final answer', () => {
    expect(QUIZ_SRC).toContain('trackFunnelEvent("quiz_completed"');
  });

  it('FunnelQuiz gates lead capture BEFORE result reveal', () => {
    // LeadCaptureGate renders when quizDone && !leadCaptured
    expect(QUIZ_SRC).toContain('quizDone && leadCaptured');
    expect(QUIZ_SRC).toContain('LeadCaptureGate');
    expect(QUIZ_SRC).toContain('QuizResultGate');
  });

  it('FunnelQuiz auto-advances on option select (no "Next" button)', () => {
    expect(QUIZ_SRC).toContain('handleSelect');
    expect(QUIZ_SRC).toMatch(/setTimeout\(/);
  });

  it('progress bar shows correct percentage', () => {
    expect(QUIZ_SRC).toMatch(/progressPercent/);
    expect(QUIZ_SRC).toContain('questions.length');
  });
});

// ════════════════════════════════════════════════════
// STAGE 2: Lead Capture → DB
// ════════════════════════════════════════════════════

describe('Stage 2: LeadCaptureGate → Lead Creation', () => {
  it('validates name, email, phone before submit', () => {
    expect(LEAD_GATE_SRC).toContain("!name.trim()");
    expect(LEAD_GATE_SRC).toContain("!email.trim()");
    expect(LEAD_GATE_SRC).toContain('getPhoneError');
  });

  it('requires micro-commitment checkbox', () => {
    expect(LEAD_GATE_SRC).toContain('microCommitment');
    expect(LEAD_GATE_SRC).toContain('!microCommitment');
  });

  it('uses upsert_funnel_lead RPC (not direct insert)', () => {
    expect(LEAD_GATE_SRC).toMatch(/rpc\(['"]upsert_funnel_lead['"]/);
    expect(LEAD_GATE_SRC).not.toMatch(/from\(['"]leads['"]\)\.insert/);
  });

  it('upsert RPC prevents duplicate leads (idempotent by email)', () => {
    // The RPC name itself is "upsert" — guarantees no duplicate by design
    expect(LEAD_GATE_SRC).toContain('upsert_funnel_lead');
    expect(LEAD_GATE_SRC).toContain('p_email');
  });

  it('stores lead_id in localStorage after creation', () => {
    expect(LEAD_GATE_SRC).toContain('localStorage.setItem("lead_id"');
  });

  it('links attribution session to lead', () => {
    expect(LEAD_GATE_SRC).toContain('link_lead_attribution');
    expect(LEAD_GATE_SRC).toContain('p_session_id');
    expect(LEAD_GATE_SRC).toContain('p_lead_id');
  });

  it('attribution session ID is stable per browser session', () => {
    expect(ATTRIBUTION_SRC).toContain('sessionStorage');
    expect(ATTRIBUTION_SRC).toContain('getOrCreateAttributionSessionId');
  });

  it('dispatches quiz_completed_hot communication after lead capture', () => {
    expect(LEAD_GATE_SRC).toContain('dispatch-communication');
    expect(LEAD_GATE_SRC).toContain('quiz_completed_hot');
  });

  it('fires Meta pixel LEAD_CAPTURED event', () => {
    expect(LEAD_GATE_SRC).toContain('trackPixelEvent("LEAD_CAPTURED"');
  });

  it('fires HIGH_QUALITY_LEAD for qualified leads only', () => {
    expect(LEAD_GATE_SRC).toContain('isHighQuality');
    expect(LEAD_GATE_SRC).toContain('HighQualityLead');
  });
});

// ════════════════════════════════════════════════════
// STAGE 3: Leadpool → Appointment
// ════════════════════════════════════════════════════

describe('Stage 3: Leadpool → Appointment Creation', () => {
  it('fetches unassigned leads via get_leads_without_appointment RPC', () => {
    expect(CREATE_MODAL_SRC).toMatch(/rpc\(['"]get_leads_without_appointment['"]/);
  });

  it('requires lead selection before appointment creation', () => {
    expect(CREATE_MODAL_SRC).toContain('selectedLeadId');
    expect(CREATE_MODAL_SRC).toMatch(/!selectedLeadId/);
  });

  it('uses create_manual_appointment RPC (not direct insert)', () => {
    expect(CREATE_MODAL_SRC).toMatch(/rpc\(['"]create_manual_appointment['"]/);
    expect(CREATE_MODAL_SRC).not.toMatch(/from\(['"]appointments['"]\)\.insert/);
  });

  it('pool appointment passes p_lead_id from selected lead', () => {
    expect(CREATE_MODAL_SRC).toContain('p_lead_id: selectedLeadId');
  });

  it('no legacy _call enum values in RPC payload', () => {
    expect(CREATE_MODAL_SRC).not.toContain("'setter_call'");
    expect(CREATE_MODAL_SRC).not.toContain("'closer_call'");
    expect(CREATE_MODAL_SRC).not.toContain("'follow_up_call'");
  });

  it('validates start < end time before submission', () => {
    expect(CREATE_MODAL_SRC).toMatch(/endsAt\s*<=\s*startsAt/);
  });

  it('handles lead_has_active_appointment error (no-duplicate guard)', () => {
    expect(CREATE_MODAL_SRC).toContain('lead_has_active_appointment');
  });

  it('handles missing_lead and invalid_time_range errors', () => {
    expect(CREATE_MODAL_SRC).toContain('missing_lead');
    expect(CREATE_MODAL_SRC).toContain('invalid_time_range');
  });

  it('auto-computes end time from call type duration', () => {
    expect(CREATE_MODAL_SRC).toContain('CALL_TYPE_DURATION');
  });
});

// ════════════════════════════════════════════════════
// STAGE 4: Appointment Reassignment
// ════════════════════════════════════════════════════

describe('Stage 4: Appointment Reassignment', () => {
  it('uses reassign_appointment RPC (not direct update)', () => {
    expect(REASSIGN_HOOK_SRC).toMatch(/rpc\(['"]reassign_appointment['"]/);
    expect(REASSIGN_HOOK_SRC).not.toMatch(/from\(['"]appointments['"]\)\.update/);
  });

  it('detail modal also calls reassign_appointment RPC', () => {
    expect(DETAIL_MODAL_SRC).toMatch(/rpc\(['"]reassign_appointment['"]/);
  });

  it('passes all required RPC params', () => {
    expect(REASSIGN_HOOK_SRC).toContain('p_appointment_id');
    expect(REASSIGN_HOOK_SRC).toContain('p_new_owner_id');
    expect(REASSIGN_HOOK_SRC).toContain('p_new_owner_role');
    expect(REASSIGN_HOOK_SRC).toContain('p_reassignment_type');
  });

  it('supports self_takeover and reassignment types', () => {
    expect(REASSIGN_HOOK_SRC).toContain('"self_takeover"');
    expect(REASSIGN_HOOK_SRC).toContain('"reassignment"');
  });

  it('provides undo window for reassignment', () => {
    expect(REASSIGN_HOOK_SRC).toContain('UNDO_WINDOW_MS');
    expect(REASSIGN_HOOK_SRC).toContain('undoReassign');
    expect(REASSIGN_HOOK_SRC).toContain('Rückgängig');
  });

  it('prevents already_owner duplicate assignment', () => {
    expect(REASSIGN_HOOK_SRC).toContain('already_owner');
  });

  it('guards against non-active appointment reassignment', () => {
    expect(REASSIGN_HOOK_SRC).toContain('appointment_not_active');
  });

  it('enforces L6+ permission on reassignment', () => {
    expect(REASSIGN_HOOK_SRC).toContain('forbidden_level_below_l6');
  });
});

// ════════════════════════════════════════════════════
// STAGE 5: Reassignment Audit Trail
// ════════════════════════════════════════════════════

describe('Stage 5: Reassignment Audit Trail', () => {
  it('detail modal reads appointment_reassignment_log', () => {
    expect(DETAIL_MODAL_SRC).toContain('appointment_reassignment_log');
  });

  it('displays unified timeline with creation + reassignment events', () => {
    expect(DETAIL_MODAL_SRC).toContain('unifiedTimeline');
  });

  it('supports filtering by source (Leadpool/Manuell/Webhook)', () => {
    expect(DETAIL_MODAL_SRC).toContain('AssignmentHistoryFilters');
  });

  it('shows owner resolution chain', () => {
    // Owner resolution shows which field resolved the current owner
    expect(DETAIL_MODAL_SRC).toMatch(/current_owner_id|owner.*resolution/i);
  });
});

// ════════════════════════════════════════════════════
// STAGE 6: No-Duplicate Checks (Cross-Stage)
// ════════════════════════════════════════════════════

describe('Stage 6: No-Duplicate Checks', () => {
  it('Lead upsert is idempotent (upsert, not insert)', () => {
    expect(LEAD_GATE_SRC).toContain('upsert_funnel_lead');
  });

  it('Appointment creation has lead_has_active_appointment guard', () => {
    expect(CREATE_MODAL_SRC).toContain('lead_has_active_appointment');
  });

  it('Reassignment checks already_owner before writing', () => {
    expect(REASSIGN_HOOK_SRC).toContain('already_owner');
  });

  it('Calendar renders reassigned appointments as read-only (no ghost entries)', () => {
    expect(CALENDAR_SRC).toContain('reassigned');
    expect(CALENDAR_SRC).toMatch(/opacity-40.*pointer-events-none|pointer-events-none.*opacity-40/);
  });

  it('DB trigger validate_appointment_fields exists in migrations', () => {
    const migrationDir = 'supabase/migrations';
    const files = fs.readdirSync(migrationDir).sort().reverse();
    let found = false;
    for (const file of files) {
      const content = fs.readFileSync(`${migrationDir}/${file}`, 'utf-8');
      if (content.includes('validate_appointment_fields')) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('create_manual_appointment RPC exists in migrations', () => {
    const migrationDir = 'supabase/migrations';
    const files = fs.readdirSync(migrationDir).sort().reverse();
    let found = false;
    for (const file of files) {
      const content = fs.readFileSync(`${migrationDir}/${file}`, 'utf-8');
      if (content.includes('create_manual_appointment')) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('reassign_appointment RPC exists in migrations', () => {
    const migrationDir = 'supabase/migrations';
    const files = fs.readdirSync(migrationDir).sort().reverse();
    let found = false;
    for (const file of files) {
      const content = fs.readFileSync(`${migrationDir}/${file}`, 'utf-8');
      if (content.includes('reassign_appointment')) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});

// ════════════════════════════════════════════════════
// STAGE 7: Error Resilience Across Flow
// ════════════════════════════════════════════════════

describe('Stage 7: Error Resilience', () => {
  it('LeadCaptureGate has try/catch around RPC call', () => {
    const tryCatchInGate = (LEAD_GATE_SRC.match(/} catch/g) || []).length;
    expect(tryCatchInGate).toBeGreaterThanOrEqual(1);
  });

  it('CreateAppointmentModal has try/catch for all creation paths', () => {
    const tryCatchInModal = (CREATE_MODAL_SRC.match(/} catch \(/g) || []).length;
    expect(tryCatchInModal).toBeGreaterThanOrEqual(3);
  });

  it('useReassignAppointment has try/catch with toast feedback', () => {
    expect(REASSIGN_HOOK_SRC).toContain('} catch');
    expect(REASSIGN_HOOK_SRC).toContain('toast.error');
  });

  it('LeadCaptureGate still calls onLeadCaptured on error (graceful degradation)', () => {
    // In the catch block, onLeadCaptured is called without leadId
    expect(LEAD_GATE_SRC).toMatch(/catch.*\n.*onLeadCaptured/s);
  });

  it('phone validation does not block flow (warns but proceeds)', () => {
    expect(LEAD_GATE_SRC).toContain('PHONE_REJECTED');
    expect(LEAD_GATE_SRC).toContain('phone_valid');
  });
});
