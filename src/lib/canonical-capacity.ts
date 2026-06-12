/**
 * Layer 25 — Capacity Control & Lead Protection (Canon)
 *
 * Hard rules (non-negotiable):
 *   1. No booking without an available slot — enforced by `try_reserve_slot()`.
 *   2. No hidden overflow — when slots are full, leads enter `booking_waitlist`.
 *   3. No ignored leads — overload triggers `capacity_incidents` for L6+ operators.
 *   4. No manual override that breaks capacity — capacity is computed server-side.
 *
 * Single source of truth: SQL function `public.capacity_status()`.
 * Block: Foundation (primary) + Conversion + Governance.
 */

export type CapacityScope = 'closer' | 'setter' | 'funnel';
export type CapacityStatus = 'safe' | 'warning' | 'overloaded';

export interface CapacityRow {
  scope: CapacityScope;
  subject_id: string | null;
  subject_name: string;
  booked: number;
  capacity: number;
  utilization_pct: number;
  backlog: number;
  status: CapacityStatus;
}

export const CAPACITY_DEFAULTS = {
  closer: { max_daily_calls: 5, max_weekly_calls: 25, warn_threshold_pct: 90 },
  setter: { max_daily_leads: 20, response_sla_minutes: 30, warn_threshold_pct: 90 },
} as const;

export function statusColor(status: CapacityStatus): string {
  switch (status) {
    case 'safe':
      return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    case 'warning':
      return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'overloaded':
      return 'text-rose-700 bg-rose-50 border-rose-200';
  }
}

export function statusLabel(status: CapacityStatus, lang: 'de' | 'en'): string {
  const map = {
    de: { safe: 'Sicher', warning: 'Warnung', overloaded: 'Überlastet' },
    en: { safe: 'Safe', warning: 'Warning', overloaded: 'Overloaded' },
  };
  return map[lang][status];
}

/**
 * Decision-support: derived from capacity status, never auto-executed.
 * Operator must approve manually (canon Autonomous System Mode rule).
 */
export function suggestActions(row: CapacityRow, lang: 'de' | 'en'): string[] {
  const out: string[] = [];
  if (row.status === 'overloaded') {
    out.push(lang === 'de' ? 'Buchungs-Slots schließen' : 'Close booking slots');
    out.push(lang === 'de' ? 'Ad-Spend reduzieren' : 'Reduce ad spend');
  }
  if (row.scope === 'setter' && row.backlog > 0) {
    out.push(lang === 'de' ? 'Bestehende Leads priorisieren' : 'Prioritize existing leads');
  }
  if (row.status === 'warning') {
    out.push(lang === 'de' ? 'Follow-ups vor neuen Leads' : 'Follow-ups before new leads');
  }
  return out;
}
