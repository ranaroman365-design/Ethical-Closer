/**
 * ═══════════════════════════════════════════════════════════════════════
 * CANONICAL LEARNING FEEDBACK LOOP — Layer 42
 * Block: Intelligence (primary) + Value + Governance
 * Canon-Map: I10
 *
 * Purpose: Real call/WhatsApp/outcome data → curated, ANONYMIZED Learning
 * Data Pool → student apps (Script Library, Roleplay Trainer, Objection
 * Library, Playbooks, Assessments).
 *
 * Hard rules (immutable):
 *   1. NO raw personal data ever reaches students
 *   2. Anonymization is MANDATORY (name/email/phone/address scrubbed)
 *   3. Pool entries default approval_status='pending' — admin must approve
 *   4. Students only see approval_status='published'
 *   5. Level gating enforced (L1 sees L1+ content; L6 sees all)
 *   6. Never modifies source data (read-only ingestion)
 *   7. L6 can PROPOSE; only admin/owner/ops_admin can PUBLISH
 * ═══════════════════════════════════════════════════════════════════════
 */

export const LEARNING_LOOP_VERSION = '1.0.0';

/** Source type of the learning sample. */
export type LearningSourceType =
  | 'call_transcript'
  | 'wa_conversation'
  | 'ai_setter_call'
  | 'attendance_event'
  | 'no_show_recovery'
  | 'message_performance'
  | 'voice_performance'
  | 'sales_brain_post_call'
  | 'operator_note';

/** What KIND of learning the entry represents. */
export type InsightCategory =
  | 'winning_phrase'
  | 'losing_phrase'
  | 'objection'
  | 'objection_handling'
  | 'best_message'
  | 'best_opening'
  | 'best_followup'
  | 'no_show_recovery'
  | 'close_reason'
  | 'lost_reason'
  | 'psychology_pattern'
  | 'personality_pattern'
  | 'state_pattern'
  | 'funnel_insight';

/** Approval lifecycle. Strict — no shortcuts. */
export type ApprovalStatus = 'pending' | 'approved' | 'published' | 'rejected' | 'archived';

/** Where curated content can flow into the student/member app. */
export type TargetApplication =
  | 'script_library'
  | 'roleplay_trainer'
  | 'objection_library'
  | 'call_review'
  | 'assessment'
  | 'playbook';

/** ETC level mapping (1..6). Always inclusive — L1 means L1 and above. */
export type LevelRelevance = 1 | 2 | 3 | 4 | 5 | 6;

/** Level → topic focus (used as advisory tag, not gate). */
export const LEVEL_FOCUS: Record<LevelRelevance, string> = {
  1: 'opener basics, first response, simple objections',
  2: 'qualification, booking push, follow-up handling',
  3: 'advanced setter patterns, objection routing, urgency',
  4: 'closer prep, openings, objection depth',
  5: 'managing closer insights, team coaching, diagnosis',
  6: 'funnel optimization, message + script governance',
};

/* ───────────────────────── Anonymization ───────────────────────── */

/** Patterns we ALWAYS strip. Phone/email/IBAN/address/explicit names. */
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/g;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_RE = /https?:\/\/[^\s)]+/gi;
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g;
const HOUSE_NUM_RE = /\b\d{1,4}\s+[A-ZÄÖÜ][a-zäöüß]+(?:straße|str\.?|gasse|weg|platz|allee|ring)\b/gi;

/**
 * Strip personally-identifiable data. Returns scrubbed text +
 * a list of scrubbed categories (for audit).
 */
export function anonymizeText(
  raw: string,
  knownNames: string[] = [],
): { text: string; scrubbed: string[] } {
  if (!raw) return { text: '', scrubbed: [] };
  const scrubbed: string[] = [];
  let out = String(raw);

  if (PHONE_RE.test(out)) { scrubbed.push('phone'); out = out.replace(PHONE_RE, '[phone]'); }
  if (EMAIL_RE.test(out)) { scrubbed.push('email'); out = out.replace(EMAIL_RE, '[email]'); }
  if (URL_RE.test(out)) { scrubbed.push('url'); out = out.replace(URL_RE, '[url]'); }
  if (IBAN_RE.test(out)) { scrubbed.push('iban'); out = out.replace(IBAN_RE, '[iban]'); }
  if (HOUSE_NUM_RE.test(out)) { scrubbed.push('address'); out = out.replace(HOUSE_NUM_RE, '[address]'); }

  for (const name of knownNames) {
    if (!name || name.length < 2) continue;
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (re.test(out)) { scrubbed.push('name'); out = out.replace(re, '[name]'); }
  }

  return { text: out.trim(), scrubbed: Array.from(new Set(scrubbed)) };
}

/** Quick safety check — true if text still seems to leak personal info. */
export function looksUnsafe(text: string): boolean {
  return PHONE_RE.test(text) || EMAIL_RE.test(text) || IBAN_RE.test(text);
}

/* ───────────────────────── Audit Helpers ───────────────────────── */

/** Default minimum confidence for an entry to be auto-eligible for approval. */
export const MIN_CONFIDENCE_FOR_APPROVAL = 0.6;

/** Hard cap: any pool entry text length (after anonymization). */
export const MAX_POOL_TEXT_LENGTH = 2000;

/** What a student is allowed to see, by definition. */
export const STUDENT_VISIBLE_STATUS: ApprovalStatus = 'published';

/** Forbidden source fields a student NEVER receives. */
export const STUDENT_FORBIDDEN_FIELDS = Object.freeze([
  'raw_reference_id',
  'operator_id',
  'lead_id',
  'phone_e164',
  'name',
  'email',
] as const);

/** Validate that a candidate pool entry is safe to insert. */
export function validateLearningEntry(entry: {
  anonymized_content: string;
  category: InsightCategory;
  level_relevance: LevelRelevance;
  confidence_score?: number | null;
}): { ok: true } | { ok: false; reason: string } {
  if (!entry.anonymized_content || entry.anonymized_content.length < 5) {
    return { ok: false, reason: 'content_too_short' };
  }
  if (entry.anonymized_content.length > MAX_POOL_TEXT_LENGTH) {
    return { ok: false, reason: 'content_too_long' };
  }
  if (looksUnsafe(entry.anonymized_content)) {
    return { ok: false, reason: 'pii_leak_detected' };
  }
  if (![1, 2, 3, 4, 5, 6].includes(entry.level_relevance)) {
    return { ok: false, reason: 'invalid_level' };
  }
  return { ok: true };
}
