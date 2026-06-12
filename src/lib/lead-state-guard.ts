/**
 * ═══════════════════════════════════════════════════════════════════════
 * LEAD STATE GUARD™ — GHL Bypass Protection (Layer 47)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * THE ONLY way to change a lead's conversion_state.
 * Direct .update({ conversion_state }) is blocked by the DB trigger,
 * but this guard validates client-side BEFORE hitting the DB to give
 * clear errors and proper audit logging.
 *
 * USAGE:
 *   import { transitionLeadState } from '@/lib/lead-state-guard';
 *   const result = await transitionLeadState(leadId, 'appointment_booked');
 *
 * HARD RULES:
 *   ❗ No direct .update({ conversion_state }) — use this helper
 *   ❗ No GHL webhook may set conversion_state directly
 *   ❗ Every transition is validated + logged
 * ═══════════════════════════════════════════════════════════════════════
 */

import { supabase } from '@/integrations/supabase/client';
import {
  ConversionState,
  ConversionEvent,
  resolveTransition,
  assertValidEvent,
  CONVERSION_STATES,
  STATE_TRANSITIONS,
} from './conversion-state-machine';

export interface TransitionResult {
  success: boolean;
  fromState: ConversionState;
  toState: ConversionState | null;
  event: ConversionEvent;
  error?: string;
}

/**
 * Transition a lead's conversion_state via canonical event.
 * This is the ONLY approved way to change state.
 *
 * Steps:
 * 1. Fetch current conversion_state
 * 2. Validate event against state machine
 * 3. Update with new state (DB trigger re-validates)
 * 4. Return result
 */
export async function transitionLeadState(
  leadId: string,
  event: ConversionEvent,
  metadata?: Record<string, unknown>,
): Promise<TransitionResult> {
  // Validate event
  try {
    assertValidEvent(event);
  } catch {
    return {
      success: false,
      fromState: '' as ConversionState,
      toState: null,
      event,
      error: `Invalid event: "${event}"`,
    };
  }

  // Fetch current state
  const { data: lead, error: fetchError } = await supabase
    .from('leads')
    .select('id, conversion_state')
    .eq('id', leadId)
    .single();

  if (fetchError || !lead) {
    return {
      success: false,
      fromState: '' as ConversionState,
      toState: null,
      event,
      error: `Lead not found: ${leadId}`,
    };
  }

  const currentState = (lead.conversion_state ?? CONVERSION_STATES.NEW_LEAD) as ConversionState;

  // Validate transition client-side
  const nextState = resolveTransition(currentState, event);

  if (!nextState) {
    return {
      success: false,
      fromState: currentState,
      toState: null,
      event,
      error: `BLOCKED: Event "${event}" not allowed from state "${currentState}"`,
    };
  }

  // Execute (DB trigger re-validates as safety net)
  const { error: updateError } = await supabase
    .from('leads')
    .update({ conversion_state: nextState } as any)
    .eq('id', leadId);

  if (updateError) {
    return {
      success: false,
      fromState: currentState,
      toState: nextState,
      event,
      error: updateError.message.includes('CANONICAL_STATE_VIOLATION')
        ? `DB rejected transition: ${currentState} → ${nextState}. State may have changed concurrently.`
        : updateError.message,
    };
  }

  // Log metadata if provided (trigger auto-logs basic transition)
  if (metadata) {
    await supabase.from('lead_state_log' as any).insert({
      lead_id: leadId,
      from_state: currentState,
      to_state: nextState,
      event,
      triggered_by: 'client',
      metadata,
    } as any);
  }

  return {
    success: true,
    fromState: currentState,
    toState: nextState,
    event,
  };
}

/**
 * Validate whether a transition would be allowed WITHOUT executing it.
 * Use for UI: disable buttons, show warnings, etc.
 */
export function canTransition(
  currentState: ConversionState,
  event: ConversionEvent,
): { allowed: boolean; nextState: ConversionState | null } {
  const nextState = resolveTransition(currentState, event);
  return { allowed: nextState !== null, nextState };
}

/**
 * Get all valid events for a given state.
 * Use for UI: show available actions.
 */
export function getAvailableEvents(currentState: ConversionState): ConversionEvent[] {
  const transitions = STATE_TRANSITIONS[currentState];
  if (!transitions) return [];
  return Object.keys(transitions) as ConversionEvent[];
}

/**
 * GUARD: Wraps any function that might try to update conversion_state directly.
 * Throws immediately if conversion_state is in the update payload.
 * Use as a lint/runtime check.
 */
export function assertNoDirectStateUpdate(
  updatePayload: Record<string, unknown>,
  context: string = 'unknown',
): void {
  if ('conversion_state' in updatePayload) {
    throw new Error(
      `[GHL_BYPASS_BLOCKED] Direct conversion_state update attempted in "${context}". ` +
      `Use transitionLeadState() instead. This is a Layer 47 violation.`
    );
  }
}
