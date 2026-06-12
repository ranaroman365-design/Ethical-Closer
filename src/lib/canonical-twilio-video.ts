/**
 * Canonical Twilio Video — ETC Platform
 * Layer: Revenue Engine (Call Infrastructure)
 * Block: Conversion
 * Status: POST-LAUNCH — NOT Go-Live Critical
 *
 * This canon defines the architecture for embedded video calls
 * within the ETC platform using Twilio Video.
 */

// ── Status ──────────────────────────────────────────────────
export const TWILIO_VIDEO_STATUS = 'inactive' as const; // 'inactive' | 'test' | 'active'

// ── Room Naming ─────────────────────────────────────────────
export function videoRoomName(appointmentId: string): string {
  return `etc_${appointmentId}`;
}

// ── Participant Types ───────────────────────────────────────
export const VIDEO_PARTICIPANT_TYPES = [
  'lead',
  'setter',
  'closer',
  'operator',
  'admin',
] as const;
export type VideoParticipantType = (typeof VIDEO_PARTICIPANT_TYPES)[number];

// ── Session Status ──────────────────────────────────────────
export const VIDEO_SESSION_STATUSES = [
  'created',
  'live',
  'ended',
  'failed',
] as const;
export type VideoSessionStatus = (typeof VIDEO_SESSION_STATUSES)[number];

// ── Recording Status ────────────────────────────────────────
export const RECORDING_STATUSES = [
  'pending',
  'recording',
  'completed',
  'failed',
] as const;

// ── Rollout Phases ──────────────────────────────────────────
export const ROLLOUT_PHASES = {
  A: { label: 'Admin/Test only', scope: 'admin' },
  B: { label: '1 Operator Unit', scope: 'single_unit' },
  C: { label: 'Alle L6 Units', scope: 'all_units' },
  D: { label: 'Recording + AI Review', scope: 'recording' },
  E: { label: 'Embedded Standard', scope: 'default' },
} as const;

// ── RLS Access Matrix ───────────────────────────────────────
export const VIDEO_ACCESS_MATRIX = {
  L4: 'own_calls',
  L5: 'own_and_coached',
  L6: 'unit_calls',
  L7: 'area_calls',
  L8: 'all',
  admin: 'all',
} as const;

// ── Edge Functions (to be created) ──────────────────────────
export const VIDEO_EDGE_FUNCTIONS = [
  'create-twilio-video-token',
  'twilio-video-webhook',
  'create-twilio-video-room',
] as const;

// ── Fallback ────────────────────────────────────────────────
export function shouldUseFallback(): boolean {
  return TWILIO_VIDEO_STATUS === 'inactive';
}

// ── No-Show Threshold (minutes after start) ─────────────────
export const NO_SHOW_CANDIDATE_MINUTES = 5;

// ── Cost Tracking Fields ────────────────────────────────────
export const COST_METRICS = [
  'room_duration_minutes',
  'participant_minutes',
  'recording_minutes',
  'transcription_cost_eur',
] as const;
