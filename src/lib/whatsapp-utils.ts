/**
 * WhatsApp phone normalization, link generation & click tracking.
 * Canonical source for all WhatsApp contact features.
 * GDPR: Never log or store phone numbers in events.
 */

import { supabase } from '@/integrations/supabase/client';

// ─── Phone Validation (E.164 Gold Standard) ─────────────────────────────────

export type PhoneValidation =
  | { status: 'valid'; normalized: string }
  | { status: 'missing' }
  | { status: 'invalid' };

export function validatePhoneForWhatsApp(phone: string | null | undefined): PhoneValidation {
  if (!phone || !phone.trim()) return { status: 'missing' };
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return { status: 'invalid' };
  return { status: 'valid', normalized };
}

export function normalizePhoneForWhatsApp(
  phone: string | null | undefined,
  defaultCountry: string = 'DE',
): string | null {
  if (!phone) return null;

  // Strip whitespace, parens, dashes, slashes, dots
  let cleaned = phone.trim().replace(/[\s()\-/.]/g, '');
  if (!cleaned) return null;

  // 0049 prefix → 49
  if (cleaned.startsWith('0049')) {
    cleaned = '49' + cleaned.slice(4);
  }
  // +49 etc → remove +
  else if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  }
  // Leading 0 (domestic) → apply default country code
  else if (cleaned.startsWith('0')) {
    const countryCode = defaultCountry === 'AT' ? '43' : defaultCountry === 'CH' ? '41' : '49';
    cleaned = countryCode + cleaned.slice(1);
  }

  // Final: digits only
  const digits = cleaned.replace(/\D/g, '');

  // E.164: 8–15 digits (country code + subscriber)
  if (!/^\d{8,15}$/.test(digits)) return null;

  return digits;
}

// ─── Link Generation ─────────────────────────────────────────────────────────

export function getWhatsAppLink(phone: string | null | undefined): string | null {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}`;
}

export function getWhatsAppTemplateLink(
  phone: string | null | undefined,
  leadName?: string | null,
  funnelSource?: string | null,
): string | null {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) return null;

  const name = leadName?.split(' ')[0] || '';
  const greeting = name ? `Hey ${name}` : 'Hey';

  const sourceText = funnelSource
    ? `über ${funnelSource} `
    : '';

  const message =
    `${greeting}, ich habe gesehen, dass du dich ${sourceText}bei Ethical Top Closer beworben hast. Darf ich kurz fragen, was dich konkret dazu gebracht hat?`;

  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

// ─── Click Tracking (GDPR-safe) ─────────────────────────────────────────────

/** In-memory dedup: prevents double tracking within 30s window. */
const _recentClicks = new Map<string, number>();
const DEDUP_WINDOW_MS = 30_000;

export interface WhatsAppTrackParams {
  leadId: string;
  sourceComponent: string;
  buttonType: 'direct' | 'template';
  leadSource?: string | null;
  funnelPath?: string | null;
  /** Operator/user acting on the lead (e.g. closer or setter id). */
  operatorId?: string | null;
  /** Funnel/Cash-Chain stage for the lead at click time. */
  leadStage?: string | null;
}

/**
 * Tracks a WhatsApp click event. GDPR-safe: no phone numbers stored.
 * Returns false if dedup suppressed the event.
 */
export async function trackWhatsAppClick(params: WhatsAppTrackParams): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Dedup check (same user + lead within 30s)
    const dedupKey = `${user.id}:${params.leadId}:${params.buttonType}`;
    const now = Date.now();
    const last = _recentClicks.get(dedupKey);
    if (last && now - last < DEDUP_WINDOW_MS) {
      return false; // suppressed
    }
    _recentClicks.set(dedupKey, now);

    // Cleanup old entries
    if (_recentClicks.size > 100) {
      for (const [k, v] of _recentClicks) {
        if (now - v > DEDUP_WINDOW_MS) _recentClicks.delete(k);
      }
    }

    await supabase.from('lead_contact_events').insert({
      lead_id: params.leadId,
      user_id: user.id,
      event_type: 'contact_click',
      channel: 'whatsapp',
      source_component: params.sourceComponent,
      button_type: params.buttonType,
      metadata: {
        lead_source: params.leadSource ?? null,
        funnel_path: params.funnelPath ?? null,
        operator_id: params.operatorId ?? user.id,
        lead_stage: params.leadStage ?? null,
        timestamp: new Date().toISOString(),
      },
    });

    return true;
  } catch {
    // Fire-and-forget — never block the user action
    return false;
  }
}
