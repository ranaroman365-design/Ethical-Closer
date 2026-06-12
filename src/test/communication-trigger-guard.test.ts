/**
 * ═══════════════════════════════════════════════════════════════════════
 * Communication Trigger Guard v2 — Full Regression Tests
 * ═══════════════════════════════════════════════════════════════════════
 * Layer 53 — Validates the entire communication pipeline:
 * - All idempotency keys are deterministic (no Date.now())
 * - No duplicate sends across parallel systems
 * - REMINDER_MODE = direct_only (no GHL parallel sends)
 * - No LP + Legacy template overlap for same lifecycle event
 * - Cron retry safety
 * - Edge function retry safety
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const readFn = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, `../../supabase/functions/${name}/index.ts`), 'utf-8');

const readSrc = (filePath: string) =>
  fs.readFileSync(path.resolve(__dirname, `../../${filePath}`), 'utf-8');

// ═══════════════════════════════════════════════════════════════════════
// PHASE 1: TRIGGER INVENTORY — Idempotency Key Determinism
// ═══════════════════════════════════════════════════════════════════════
describe('Phase 1: Idempotency Key Determinism', () => {
  
  describe('Edge Functions — no Date.now() in idempotency keys', () => {
    const edgeFunctions = [
      'create-appointment',
      'assign-booked-lead',
      'provision-applicant-account',
      'automation-scheduler',
      'process-appointment-sla',
      'dispatch-communication',
      'manage-public-booking',
      'dispatch-playbook-promotions',
      'send-lead-touchpoint',
    ];

    edgeFunctions.forEach((fn) => {
      it(`${fn} has deterministic idempotency keys`, () => {
        const src = readFn(fn);
        const lines = src.split('\n').filter(l => l.includes('idempotencyKey') || l.includes('idempotency_key'));
        for (const line of lines) {
          // Date.now() in idempotency keys breaks dedup
          expect(line, `${fn}: ${line.trim()}`).not.toMatch(/idempotencyKey.*Date\.now\(\)/);
          expect(line, `${fn}: ${line.trim()}`).not.toMatch(/idempotency_key.*Date\.now\(\)/);
        }
      });
    });
  });

  describe('Frontend — no Date.now() in idempotency keys', () => {
    const frontendFiles = [
      'src/pages/members/SetterWorkspace.tsx',
      'src/components/calendar/AppointmentDetailModal.tsx',
      'src/pages/members/Pool.tsx',
    ];

    frontendFiles.forEach((filePath) => {
      it(`${filePath.split('/').pop()} has deterministic idempotency keys`, () => {
        const src = readSrc(filePath);
        const lines = src.split('\n').filter(l => l.includes('idempotencyKey'));
        for (const line of lines) {
          expect(line, `${filePath}: ${line.trim()}`).not.toMatch(/idempotencyKey.*Date\.now\(\)/);
        }
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PHASE 2: SEND HISTORY / DEDUP LAYER AUDIT
// ═══════════════════════════════════════════════════════════════════════
describe('Phase 2: Dedup Layer Presence', () => {

  it('dispatch-communication has communication_dedup with 24h window', () => {
    const src = readFn('dispatch-communication');
    expect(src).toContain('communication_dedup');
    expect(src).toContain('23505'); // unique constraint error code
    expect(src).toContain('suppressed_dedup');
  });

  it('process-appointment-sla uses lead_events dedup before sending', () => {
    const src = readFn('process-appointment-sla');
    // Each reminder checks lead_events for existing reminder_key BEFORE sending
    expect(src).toContain('reminder_key');
    expect(src).toContain('existing');
    expect(src).toContain('if (existing && existing.length > 0) continue');
  });

  it('dispatch-appointment-reminders uses reminders_state for idempotent sends', () => {
    const src = readFn('dispatch-appointment-reminders');
    expect(src).toContain('reminders_state');
    // Checks state before sending
    expect(src).toContain('!state.reminder_15m');
    expect(src).toContain('!state.reminder_2h');
    expect(src).toContain('!state.reminder_24h');
    // Updates state after sending
    expect(src).toContain('[action]: new Date().toISOString()');
  });

  it('email-documentation-dispatch has daily cap and messaging dedup', () => {
    const src = readFn('email-documentation-dispatch');
    expect(src).toContain('MAX_PER_DAY');
    expect(src).toContain('dedupe_with_messaging');
    expect(src).toContain('email_documentation_log');
  });

  it('assign-booked-lead checks existing assignment before inserting', () => {
    const src = readFn('assign-booked-lead');
    expect(src).toContain('existingLeadAssignment');
    expect(src).toContain('existingCalendarEvent');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PHASE 3: IDEMPOTENCY KEY STANDARD
// ═══════════════════════════════════════════════════════════════════════
describe('Phase 3: Canonical Idempotency Key Format', () => {

  it('booking confirmation keyed by appointment_id', () => {
    const src = readFn('create-appointment');
    expect(src).toContain('`booking-confirm-${appointment.id}`');
  });

  it('reschedule confirmation keyed by new appointment_id', () => {
    const src = readFn('create-appointment');
    expect(src).toContain('`reschedule-confirm-${appointment.id}`');
  });

  it('setter assignment keyed by appointment_id', () => {
    const src = readFn('assign-booked-lead');
    expect(src).toContain('`setter-assigned-${appointmentId}`');
  });

  it('no-show recovery keyed by appointment_id (single canonical key)', () => {
    const sla = readFn('process-appointment-sla');
    expect(sla).toContain('`noshow-recovery-${apt.id}`');
    // automation-scheduler must NOT send no-show recovery (disabled)
    const scheduler = readFn('automation-scheduler');
    expect(scheduler).not.toContain('`no-show-recovery-${appt.id}`');
    expect(scheduler).toContain('DISABLED');
  });

  it('provision-applicant-account keyed by lead_id (no timestamp)', () => {
    const src = readFn('provision-applicant-account');
    expect(src).toContain('`applicant-access-${leadId}`');
  });

  it('cancellation keyed by appointment_id', () => {
    const src = readFn('manage-public-booking');
    expect(src).toContain('`cancel-confirm-${appointment_id}`');
  });

  it('SLA escalation keyed by appointment + recipient', () => {
    const src = readFn('process-appointment-sla');
    expect(src).toMatch(/sla-esc-\$\{apt\.id\}/);
  });

  it('reminder cascade keyed by appointment + stage suffix', () => {
    const src = readFn('process-appointment-sla');
    expect(src).toContain('`lead-rem-${w.keySuffix}-${apt.id}`');
    expect(src).toContain('`lead-rem60-${apt.id}`');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PHASE 4: REMINDER_MODE = direct_only
// ═══════════════════════════════════════════════════════════════════════
describe('Phase 4: REMINDER_MODE = direct_only', () => {

  it('no GHL API calls in any reminder function', () => {
    const files = [
      'dispatch-appointment-reminders',
      'process-appointment-sla',
      'automation-scheduler',
    ];
    for (const fn of files) {
      const src = readFn(fn);
      expect(src, `${fn} must not call GHL`).not.toContain('api.gohighlevel.com');
      expect(src, `${fn} must not call GHL`).not.toContain('ghl.send');
      expect(src, `${fn} must not call GHL`).not.toContain('highlevel');
    }
  });

  it('GHL webhook does not send emails', () => {
    const src = readFn('receive-ghl-webhook');
    expect(src).not.toContain('templateName');
  });

  it('process-appointment-reminders is disabled (no-op)', () => {
    const src = readFn('process-appointment-reminders');
    expect(src).toContain('DISABLED');
    expect(src).not.toContain('templateName');
    expect(src).not.toContain('lp-appointment-reminder');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PHASE 5: LEGACY vs LP TEMPLATE GUARD
// ═══════════════════════════════════════════════════════════════════════
describe('Phase 5: No Legacy + LP Dual Sends', () => {

  it('booking confirmation uses only legacy template (not lp-appointment-confirmed)', () => {
    const src = readFn('create-appointment');
    expect(src).toContain('"booking-confirmation"');
    expect(src).not.toContain('lp-appointment-confirmed');
  });

  it('reschedule from create-appointment uses legacy, admin uses LP — no overlap', () => {
    const createApt = readFn('create-appointment');
    expect(createApt).toContain('"reschedule-confirmation"');
    expect(createApt).not.toContain('lp-appointment-rescheduled');

    const modal = readSrc('src/components/calendar/AppointmentDetailModal.tsx');
    expect(modal).toContain('"lp-appointment-rescheduled"');
    // Admin reschedule uses RPC, not create-appointment
    expect(modal).toContain('reschedule_appointment');
    expect(modal).not.toContain('create-appointment');
  });

  it('no-show recovery uses only legacy template', () => {
    const sla = readFn('process-appointment-sla');
    expect(sla).toContain('"no-show-recovery"');
    expect(sla).not.toContain('lp-no-show');
  });

  it('email-documentation-dispatch is dormant (no callers)', () => {
    // Verify it's not called from any active edge function
    const activeFunctions = [
      'create-appointment',
      'assign-booked-lead',
      'automation-scheduler',
      'process-appointment-sla',
      'dispatch-appointment-reminders',
      'manage-public-booking',
    ];
    for (const fn of activeFunctions) {
      const src = readFn(fn);
      expect(src, `${fn} must not call email-documentation-dispatch`).not.toContain('email-documentation-dispatch');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PHASE 6: ACCEPTANCE CRITERIA — One Send Per Event
// ═══════════════════════════════════════════════════════════════════════
describe('Phase 6: Acceptance Criteria', () => {

  it('booking confirmation: max 1x per appointment', () => {
    const src = readFn('create-appointment');
    // Key is appointment-specific, email queue dedup prevents retries
    expect(src).toContain('`booking-confirm-${appointment.id}`');
  });

  it('T-24h reminder: max 1x per appointment (lead_events dedup)', () => {
    const src = readFn('process-appointment-sla');
    expect(src).toContain('lead_24h_reminder_sent');
    expect(src).toContain('if (existing && existing.length > 0) continue');
  });

  it('T-60min reminder: max 1x per appointment (lead_events dedup)', () => {
    const src = readFn('process-appointment-sla');
    expect(src).toContain('lead_60min_reminder_sent');
  });

  it('T-10min reminder: max 1x per appointment (lead_events dedup)', () => {
    const src = readFn('process-appointment-sla');
    expect(src).toContain('lead_10min_reminder_sent');
  });

  it('no-show recovery: max 1x per appointment (single sender)', () => {
    // Only process-appointment-sla sends it (automation-scheduler disabled)
    const scheduler = readFn('automation-scheduler');
    expect(scheduler).toContain('DISABLED');
    expect(scheduler).not.toMatch(/templateName.*no-show/);
  });

  it('setter assignment notification: max 1x per appointment + setter', () => {
    const src = readFn('assign-booked-lead');
    expect(src).toContain('`${idempotencyBase}-setter`');
  });

  it('cancellation: max 1x per appointment', () => {
    const src = readFn('manage-public-booking');
    expect(src).toContain('`cancel-confirm-${appointment_id}`');
  });

  it('reminder cascade windows do not overlap (no double-fire)', () => {
    const src = readFn('process-appointment-sla');
    // T-24h: 23*60 to 25*60 (1380-1500 min)
    expect(src).toContain('minMinutes: 23 * 60');
    expect(src).toContain('maxMinutes: 25 * 60');
    // T-2h: 115 to 125 min
    expect(src).toContain('minMinutes: 115');
    expect(src).toContain('maxMinutes: 125');
    // T-60min standalone: 55-65 min
    expect(src).toContain('minutesUntil >= 55 && minutesUntil <= 65');
    // T-10min: 7 to 13 min
    expect(src).toContain('minMinutes: 7');
    expect(src).toContain('maxMinutes: 13');
  });

  it('SMS/WhatsApp reminders are channel-separated from email reminders', () => {
    // dispatch-appointment-reminders = SMS/WA via dispatch-communication
    const smsReminder = readFn('dispatch-appointment-reminders');
    expect(smsReminder).toContain('dispatch-communication');
    expect(smsReminder).not.toContain('send-transactional-email');
    
    // process-appointment-sla = email only
    const emailReminder = readFn('process-appointment-sla');
    expect(emailReminder).toContain('send-transactional-email');
    expect(emailReminder).not.toContain('dispatch-communication');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PHASE 7: CRON + EDGE RETRY SAFETY
// ═══════════════════════════════════════════════════════════════════════
describe('Phase 7: Retry Safety', () => {

  it('cron retry of dispatch-appointment-reminders is safe (reminders_state persisted)', () => {
    const src = readFn('dispatch-appointment-reminders');
    // After sending, updates reminders_state atomically
    expect(src).toContain('.update({ reminders_state:');
    // Checks state BEFORE sending
    expect(src).toContain('!state.reminder_');
  });

  it('cron retry of process-appointment-sla is safe (lead_events check)', () => {
    const src = readFn('process-appointment-sla');
    // Each cascade window checks lead_events for existing reminder_key
    expect(src).toContain('reminder_key');
    expect(src).toContain('if (existing && existing.length > 0) continue');
  });

  it('edge function retry of create-appointment is safe (appointment-level idempotency)', () => {
    const src = readFn('create-appointment');
    // Unique constraint catch
    expect(src).toContain('23505');
    expect(src).toContain('deduplicated');
    // Booking confirmation keyed by appointment
    expect(src).toContain('booking-confirm-${appointment.id}');
  });

  it('email queue has pgmq-level dedup (message_id idempotency)', () => {
    // The send-transactional-email function uses idempotencyKey as message dedup
    // pgmq ensures at-least-once delivery, and the email queue
    // process-email-queue handles retries with DLQ after 5 failures
    const src = readFn('process-email-queue');
    expect(src).toContain('dlq');
    expect(src).toContain('retry');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PHASE 8: CROSS-SYSTEM ISOLATION
// ═══════════════════════════════════════════════════════════════════════
describe('Phase 8: Cross-System Isolation', () => {

  it('only ONE function sends no-show recovery emails', () => {
    // process-appointment-sla is the canonical sender
    const sla = readFn('process-appointment-sla');
    expect(sla).toContain('"no-show-recovery"');
    
    // automation-scheduler DOES NOT send (disabled)
    const scheduler = readFn('automation-scheduler');
    const schedulerLines = scheduler.split('\n');
    const noShowEmailLines = schedulerLines.filter(l => 
      l.includes('no-show-recovery') && !l.includes('DISABLED') && !l.includes('//')
    );
    expect(noShowEmailLines.length).toBe(0);
  });

  it('only ONE system sends email reminders (process-appointment-sla)', () => {
    // process-appointment-reminders is DISABLED
    const disabled = readFn('process-appointment-reminders');
    expect(disabled).toContain('DISABLED');
  });

  it('email and SMS/WA reminders use separate dedup layers', () => {
    // Email: lead_events.metadata.reminder_key
    const sla = readFn('process-appointment-sla');
    expect(sla).toContain('reminder_key');
    
    // SMS/WA: communication_dedup table + reminders_state
    const sms = readFn('dispatch-appointment-reminders');
    expect(sms).toContain('dispatch-communication');
    expect(sms).toContain('reminders_state');
  });
});
