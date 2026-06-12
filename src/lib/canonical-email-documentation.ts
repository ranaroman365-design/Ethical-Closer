/**
 * ═══════════════════════════════════════════════════════════════════════
 * LAYER 43 — CANONICAL EMAIL DOCUMENTATION LAYER
 *
 * Email = Documentation & Trust Layer (NOT a conversion channel).
 *
 * Channel separation (hard rule):
 *   • WhatsApp / SMS / Voice  → Conversion Engine (L38–L41)
 *   • Push Notifications      → Re-Engagement Engine
 *   • Email                   → Documentation, Confirmation, Trust
 *   • Dashboard               → Control Center
 *
 * Email is sent ONLY on real lifecycle state-changes — never as
 * marketing, never as a chat reply, never as a duplicate of an
 * outbound WhatsApp/SMS message.
 *
 * Source of truth for: which events trigger emails, which template
 * each event uses, and which guardrails apply.
 * ═══════════════════════════════════════════════════════════════════════
 */

/** The 12 canonical email-worthy lifecycle events. */
export type EmailLifecycleEvent =
  | 'account_created'
  | 'magic_link_access'
  | 'appointment_booked'
  | 'appointment_rescheduled'
  | 'appointment_cancelled'
  | 'appointment_confirmed'
  | 'no_show_notification'
  | 'application_progress_update'
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'level_upgraded'
  | 'successful_close';

export interface EmailTriggerSpec {
  event: EmailLifecycleEvent;
  /** Template key in transactional-email-templates registry. */
  template_name: string;
  /** Why this email exists. Documentation purpose only. */
  purpose: string;
  /** If true, this event MUST send (legal/access). Cannot be disabled per-funnel. */
  mandatory: boolean;
  /**
   * If true, suppress this email when an outbound WhatsApp/SMS for the
   * same logical event was already sent in the last N minutes.
   * Email always serves as documentation, but for "live" events
   * (e.g. appointment_confirmed) we de-dupe within the dedupe window.
   */
  dedupe_with_messaging: boolean;
  dedupe_window_minutes: number;
}

/**
 * Canonical mapping. Each event maps to exactly ONE template.
 * If a new lifecycle event is needed, add it here AND in the
 * email_documentation_settings.per_event JSON, AND in canon-map.
 */
export const EMAIL_LIFECYCLE_TRIGGERS: Readonly<Record<EmailLifecycleEvent, EmailTriggerSpec>> = Object.freeze({
  account_created: {
    event: 'account_created',
    template_name: 'applicant-access',
    purpose: 'Confirm account creation and provide system access.',
    mandatory: true,
    dedupe_with_messaging: false,
    dedupe_window_minutes: 0,
  },
  magic_link_access: {
    event: 'magic_link_access',
    template_name: 'applicant-access',
    purpose: 'Deliver one-time access link for applicant area.',
    mandatory: true,
    dedupe_with_messaging: false,
    dedupe_window_minutes: 0,
  },
  appointment_booked: {
    event: 'appointment_booked',
    template_name: 'booking-confirmation',
    purpose: 'Official appointment confirmation with calendar details.',
    mandatory: true,
    dedupe_with_messaging: false,
    dedupe_window_minutes: 0,
  },
  appointment_rescheduled: {
    event: 'appointment_rescheduled',
    template_name: 'reschedule-confirmation',
    purpose: 'Document the new appointment time after reschedule.',
    mandatory: true,
    dedupe_with_messaging: false,
    dedupe_window_minutes: 0,
  },
  appointment_cancelled: {
    event: 'appointment_cancelled',
    template_name: 'appointment-cancelled',
    purpose: 'Document appointment cancellation.',
    mandatory: true,
    dedupe_with_messaging: false,
    dedupe_window_minutes: 0,
  },
  appointment_confirmed: {
    event: 'appointment_confirmed',
    template_name: 'appointment-reminder',
    purpose: 'Re-confirm an upcoming appointment (formal record).',
    mandatory: false,
    dedupe_with_messaging: true,
    dedupe_window_minutes: 30,
  },
  no_show_notification: {
    event: 'no_show_notification',
    template_name: 'no-show-recovery',
    purpose: 'Documented no-show notice with reschedule path.',
    mandatory: false,
    dedupe_with_messaging: true,
    dedupe_window_minutes: 60,
  },
  application_progress_update: {
    event: 'application_progress_update',
    template_name: 'status-change',
    purpose: 'Notify applicant of a meaningful status change.',
    mandatory: false,
    dedupe_with_messaging: true,
    dedupe_window_minutes: 60,
  },
  onboarding_started: {
    event: 'onboarding_started',
    template_name: 'community-access-ready',
    purpose: 'Welcome + access to onboarding materials.',
    mandatory: true,
    dedupe_with_messaging: false,
    dedupe_window_minutes: 0,
  },
  onboarding_completed: {
    event: 'onboarding_completed',
    template_name: 'status-change',
    purpose: 'Confirm completion of onboarding phase.',
    mandatory: false,
    dedupe_with_messaging: false,
    dedupe_window_minutes: 0,
  },
  level_upgraded: {
    event: 'level_upgraded',
    template_name: 'status-change',
    purpose: 'Document level promotion (L1→L2 etc.).',
    mandatory: false,
    dedupe_with_messaging: false,
    dedupe_window_minutes: 0,
  },
  successful_close: {
    event: 'successful_close',
    template_name: 'status-change',
    purpose: 'Document successful interview / closed deal.',
    mandatory: true,
    dedupe_with_messaging: false,
    dedupe_window_minutes: 0,
  },
});

export const EMAIL_LIFECYCLE_EVENT_LIST: readonly EmailLifecycleEvent[] =
  Object.freeze(Object.keys(EMAIL_LIFECYCLE_TRIGGERS) as EmailLifecycleEvent[]);

/** Hard rules — auditable. */
export const EMAIL_DOCUMENTATION_RULES = Object.freeze({
  // Conversion channels (NEVER email-driven)
  conversion_channels: ['whatsapp', 'sms', 'voice'] as const,
  // Re-engagement (NEVER email-driven)
  reengagement_channels: ['push'] as const,
  // Email purpose
  email_purpose: 'documentation' as const,
  // Forbidden in email copy (this is not a marketing surface)
  forbidden_copy_patterns: [
    /limited.{0,10}time/i,
    /act\s+now/i,
    /buy\s+now/i,
    /discount/i,
    /promo/i,
    /sale/i,
  ],
  // Max emails per recipient per 24h across all events (anti-spam guard)
  max_emails_per_recipient_per_day: 6,
});

/**
 * Returns true if a given event is allowed to send right now,
 * given a count of outbound WhatsApp/SMS for the same lead within
 * the dedupe window. Pure function — no IO. The edge function
 * applies this with real DB counts.
 */
export function shouldSendEmail(
  event: EmailLifecycleEvent,
  ctx: {
    messaging_sent_in_window: number;
    emails_sent_today: number;
    event_enabled: boolean;
    master_enabled: boolean;
  },
): { send: boolean; reason: string } {
  const spec = EMAIL_LIFECYCLE_TRIGGERS[event];
  if (!spec) return { send: false, reason: 'unknown_event' };

  if (!ctx.master_enabled && !spec.mandatory) {
    return { send: false, reason: 'master_disabled' };
  }
  if (!ctx.event_enabled && !spec.mandatory) {
    return { send: false, reason: 'event_disabled' };
  }
  if (
    ctx.emails_sent_today >= EMAIL_DOCUMENTATION_RULES.max_emails_per_recipient_per_day &&
    !spec.mandatory
  ) {
    return { send: false, reason: 'daily_cap_reached' };
  }
  if (spec.dedupe_with_messaging && ctx.messaging_sent_in_window > 0 && !spec.mandatory) {
    return { send: false, reason: 'duplicate_with_messaging' };
  }
  return { send: true, reason: 'ok' };
}

/** Audit gate — ensures every event has a registered template. */
export function auditEmailDocumentationCanon(
  knownTemplateKeys: ReadonlySet<string>,
): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  for (const ev of EMAIL_LIFECYCLE_EVENT_LIST) {
    const spec = EMAIL_LIFECYCLE_TRIGGERS[ev];
    if (!knownTemplateKeys.has(spec.template_name)) {
      issues.push(`Event ${ev} → template "${spec.template_name}" not registered.`);
    }
  }
  return { ok: issues.length === 0, issues };
}
