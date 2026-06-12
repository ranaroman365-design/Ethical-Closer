/**
 * ═══════════════════════════════════════════════════════════════════════
 * LAYER 44 — CANONICAL PUSH NOTIFICATION CHANNEL
 *
 * Push is an ADDITIONAL channel — never a replacement for WhatsApp/SMS.
 * Purpose: bring leads back into the applicant platform / dashboard.
 *
 * Channel separation reminder:
 *   • WhatsApp / SMS / Voice  → Conversion (external reach, L38–L41)
 *   • Email                   → Documentation (L43)
 *   • Push (web/mobile/in-app) → Re-engagement (THIS LAYER)
 *   • Dashboard               → Control
 *
 * Hard rules:
 *   - Push requires an account/session AND explicit consent (browser permission)
 *   - Push respects quiet hours, do_not_contact, and per-funnel toggles
 *   - Push must be logged for delivery + click attribution
 *   - Push must NOT create duplicate communication pressure (dedupe with msg)
 * ═══════════════════════════════════════════════════════════════════════
 */

export type PushChannel = 'in_app' | 'web_push' | 'mobile_push';

export type PushUseCase =
  | 'magic_link_access'
  | 'new_message'
  | 'appointment_reminder'
  | 'reschedule_reminder'
  | 'no_show_recovery'
  | 'level_onboarding'
  | 'promotion_message'
  | 'birthday_message';

export interface PushUseCaseSpec {
  use_case: PushUseCase;
  /** Default copy keys (lookup in message_library, channel='web_push'/'in_app'). */
  default_template_key: string;
  /** If a message in another channel was sent within window, suppress push. */
  dedupe_with_messaging_minutes: number;
  /** Allowed channels for this use case. UI picks one (or fans out to in_app + web_push). */
  allowed_channels: readonly PushChannel[];
  /** Where the click should land. Token replaced server-side. */
  default_click_path: string;
}

export const PUSH_USE_CASES: Readonly<Record<PushUseCase, PushUseCaseSpec>> = Object.freeze({
  magic_link_access: {
    use_case: 'magic_link_access',
    default_template_key: 'push_magic_link_access',
    dedupe_with_messaging_minutes: 0,
    allowed_channels: ['in_app', 'web_push'],
    default_click_path: '/applicant',
  },
  new_message: {
    use_case: 'new_message',
    default_template_key: 'push_new_message',
    dedupe_with_messaging_minutes: 0,
    allowed_channels: ['in_app', 'web_push', 'mobile_push'],
    default_click_path: '/members/messages',
  },
  appointment_reminder: {
    use_case: 'appointment_reminder',
    default_template_key: 'push_appointment_reminder',
    dedupe_with_messaging_minutes: 60,
    allowed_channels: ['in_app', 'web_push', 'mobile_push'],
    default_click_path: '/applicant/appointment',
  },
  reschedule_reminder: {
    use_case: 'reschedule_reminder',
    default_template_key: 'push_reschedule_reminder',
    dedupe_with_messaging_minutes: 60,
    allowed_channels: ['in_app', 'web_push'],
    default_click_path: '/applicant/reschedule',
  },
  no_show_recovery: {
    use_case: 'no_show_recovery',
    default_template_key: 'push_no_show_recovery',
    dedupe_with_messaging_minutes: 120,
    allowed_channels: ['in_app', 'web_push'],
    default_click_path: '/applicant/reschedule',
  },
  level_onboarding: {
    use_case: 'level_onboarding',
    default_template_key: 'push_level_onboarding',
    dedupe_with_messaging_minutes: 0,
    allowed_channels: ['in_app', 'web_push'],
    default_click_path: '/members/dashboard',
  },
  promotion_message: {
    use_case: 'promotion_message',
    default_template_key: 'push_promotion_message',
    dedupe_with_messaging_minutes: 0,
    allowed_channels: ['in_app', 'web_push'],
    default_click_path: '/members/dashboard',
  },
  birthday_message: {
    use_case: 'birthday_message',
    default_template_key: 'push_birthday',
    dedupe_with_messaging_minutes: 0,
    allowed_channels: ['in_app', 'web_push'],
    default_click_path: '/members/dashboard',
  },
});

export const PUSH_USE_CASE_LIST: readonly PushUseCase[] =
  Object.freeze(Object.keys(PUSH_USE_CASES) as PushUseCase[]);

export const PUSH_RULES = Object.freeze({
  /** Quiet hours (local time, 24h). No non-mandatory push within. */
  quiet_hours_start: 22,
  quiet_hours_end: 8,
  /** Anti-spam cap: push notifications per recipient per 24h. */
  max_push_per_recipient_per_day: 8,
  /** When sending push because messaging is silent: only allowed if NO outbound msg in this window. */
  dedupe_default_window_minutes: 30,
});

/** Pure decision — applied by the dispatch edge function. */
export function shouldSendPush(
  use_case: PushUseCase,
  ctx: {
    master_enabled: boolean;
    use_case_enabled: boolean;
    consent: boolean;
    do_not_contact: boolean;
    in_quiet_hours: boolean;
    pushes_today: number;
    messaging_in_window: number;
  },
): { send: boolean; reason: string } {
  const spec = PUSH_USE_CASES[use_case];
  if (!spec) return { send: false, reason: 'unknown_use_case' };
  if (!ctx.master_enabled) return { send: false, reason: 'master_disabled' };
  if (!ctx.use_case_enabled) return { send: false, reason: 'use_case_disabled' };
  if (ctx.do_not_contact) return { send: false, reason: 'do_not_contact' };
  if (!ctx.consent) return { send: false, reason: 'no_consent' };
  if (ctx.in_quiet_hours) return { send: false, reason: 'quiet_hours' };
  if (ctx.pushes_today >= PUSH_RULES.max_push_per_recipient_per_day) {
    return { send: false, reason: 'daily_cap_reached' };
  }
  if (spec.dedupe_with_messaging_minutes > 0 && ctx.messaging_in_window > 0) {
    return { send: false, reason: 'duplicate_with_messaging' };
  }
  return { send: true, reason: 'ok' };
}

export function isInQuietHours(date: Date = new Date()): boolean {
  const h = date.getHours();
  const { quiet_hours_start: s, quiet_hours_end: e } = PUSH_RULES;
  // wraps midnight
  return s > e ? h >= s || h < e : h >= s && h < e;
}
