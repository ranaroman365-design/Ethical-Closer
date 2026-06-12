/**
 * Operator Profit Center Canon
 * ============================
 * Layer: Revenue Engine · Block: Value · Canon: Closing Machine™ extension
 *
 * Each L6 Operator = independent Profit Center with:
 *   · Funnel ownership
 *   · Budget responsibility
 *   · Team management
 *   · Pipeline control
 *   · Own KPIs + Revenue accountability
 *
 * Status Labels: Scale / Hold / Fix / Kill
 */

// ── Profit Center KPI Definitions ──────────────────────────────────────────
export interface ProfitCenterKPI {
  key: string;
  label: { de: string; en: string };
  formula: string;
  unit: string;
}

export const PROFIT_CENTER_KPIS: readonly ProfitCenterKPI[] = [
  { key: 'unit_revenue', label: { de: 'Unit Revenue', en: 'Unit Revenue' }, formula: 'SUM(paid payments in unit)', unit: '€' },
  { key: 'cpl', label: { de: 'Cost per Lead', en: 'Cost per Lead' }, formula: 'budget / leads_count', unit: '€' },
  { key: 'booking_rate', label: { de: 'Booking Rate', en: 'Booking Rate' }, formula: 'bookings / leads * 100', unit: '%' },
  { key: 'show_rate', label: { de: 'Show Rate', en: 'Show Rate' }, formula: 'shows / bookings * 100', unit: '%' },
  { key: 'close_rate', label: { de: 'Close Rate', en: 'Close Rate' }, formula: 'closes / shows * 100', unit: '%' },
  { key: 'revenue_per_lead', label: { de: 'Revenue per Lead', en: 'Revenue per Lead' }, formula: 'revenue / leads', unit: '€' },
  { key: 'revenue_per_show', label: { de: 'Revenue per Show', en: 'Revenue per Show' }, formula: 'revenue / shows', unit: '€' },
  { key: 'team_cost', label: { de: 'Team Cost / Commission', en: 'Team Cost / Commission' }, formula: 'SUM(commissions in unit)', unit: '€' },
  { key: 'net_contribution', label: { de: 'Nettobeitrag', en: 'Net Contribution' }, formula: 'revenue - commissions - budget', unit: '€' },
  { key: 'sla_compliance', label: { de: 'SLA Compliance', en: 'SLA Compliance' }, formula: 'completed_slas / (completed+breached) * 100', unit: '%' },
] as const;

// ── Status Label Definitions ───────────────────────────────────────────────
export type UnitStatusLabel = 'scale' | 'hold' | 'fix' | 'kill';

export const UNIT_STATUS_CONFIG: Record<UnitStatusLabel, {
  label: { de: string; en: string };
  color: string;
  description: { de: string; en: string };
}> = {
  scale: {
    label: { de: 'Scale', en: 'Scale' },
    color: 'hsl(142 76% 36%)',
    description: { de: 'KPIs über Threshold – Budget erhöhen', en: 'KPIs above threshold – increase budget' },
  },
  hold: {
    label: { de: 'Hold', en: 'Hold' },
    color: 'hsl(48 96% 53%)',
    description: { de: 'Stabil – kein Handlungsbedarf', en: 'Stable – no action needed' },
  },
  fix: {
    label: { de: 'Fix', en: 'Fix' },
    color: 'hsl(25 95% 53%)',
    description: { de: 'Underperformance – Coaching/Optimierung', en: 'Underperformance – coaching/optimization' },
  },
  kill: {
    label: { de: 'Kill', en: 'Kill' },
    color: 'hsl(0 84% 60%)',
    description: { de: '14+ Tage Underperformance – Unit schließen', en: '14+ days underperformance – close unit' },
  },
};

// ── SLA Definitions per Level ──────────────────────────────────────────────
export interface SLARule {
  level: number;
  rule_key: string;
  description: { de: string; en: string };
  max_minutes: number;
  kpi_category: string;
}

export const CANONICAL_SLA_RULES: readonly SLARule[] = [
  // L1 Opener
  { level: 1, rule_key: 'first_touch', description: { de: 'Erstkontakt innerhalb 15 Min', en: 'First touch within 15 min' }, max_minutes: 15, kpi_category: 'time_to_first_touch' },
  { level: 1, rule_key: 'contact_attempts_24h', description: { de: 'Mind. 3 Kontaktversuche in 24h', en: 'Min. 3 contact attempts in 24h' }, max_minutes: 1440, kpi_category: 'contact_rate' },
  { level: 1, rule_key: 'status_update', description: { de: 'Status-Update nach Touchpoint', en: 'Status update after touchpoint' }, max_minutes: 30, kpi_category: 'response_rate' },
  { level: 1, rule_key: 'no_stale_lead', description: { de: 'Kein Lead >24h ohne Status', en: 'No lead >24h without status' }, max_minutes: 1440, kpi_category: 'booking_handoff_rate' },
  // L2 Associate Setter
  { level: 2, rule_key: 'qualified_lead_response', description: { de: 'Quali-Lead in 2h bearbeiten', en: 'Process qualified lead in 2h' }, max_minutes: 120, kpi_category: 'booking_rate' },
  { level: 2, rule_key: 'booking_confirmation', description: { de: 'Terminbestätigung sofort', en: 'Booking confirmation immediately' }, max_minutes: 10, kpi_category: 'qualified_booking_rate' },
  { level: 2, rule_key: 'quali_note', description: { de: 'Quali-Notiz vor Handoff', en: 'Qualification note before handoff' }, max_minutes: 30, kpi_category: 'handoff_completeness' },
  // L3 Senior Setter
  { level: 3, rule_key: 'high_intent_response', description: { de: 'High-Intent in 30 Min', en: 'High-intent within 30 min' }, max_minutes: 30, kpi_category: 'show_rate' },
  { level: 3, rule_key: 'no_booking_recovery', description: { de: 'No-Booking Recovery in 24h', en: 'No-booking recovery in 24h' }, max_minutes: 1440, kpi_category: 'rebooking_rate' },
  // L4 Junior Closer
  { level: 4, rule_key: 'call_outcome_doc', description: { de: 'Call Outcome in 30 Min', en: 'Call outcome within 30 min' }, max_minutes: 30, kpi_category: 'close_rate' },
  { level: 4, rule_key: 'payment_link_speed', description: { de: 'Payment Link in 10 Min', en: 'Payment link within 10 min' }, max_minutes: 10, kpi_category: 'payment_link_sent_time' },
  // L5 Managing Closer
  { level: 5, rule_key: 'call_reviews_weekly', description: { de: '3 Call Reviews/Woche', en: '3 call reviews/week' }, max_minutes: 10080, kpi_category: 'call_review_completion' },
  // L6 Operator
  { level: 6, rule_key: 'daily_kpi_check', description: { de: 'Täglicher KPI Check', en: 'Daily KPI check' }, max_minutes: 1440, kpi_category: 'unit_revenue' },
  { level: 6, rule_key: 'noshow_recovery_24h', description: { de: 'No-Show Recovery in 24h', en: 'No-show recovery in 24h' }, max_minutes: 1440, kpi_category: 'show_rate' },
  { level: 6, rule_key: 'weekly_team_review', description: { de: 'Wöchentl. Team Review', en: 'Weekly team review' }, max_minutes: 10080, kpi_category: 'team_sla_compliance' },
  // L7 Director
  { level: 7, rule_key: 'weekly_operator_review', description: { de: 'Wöchentl. Operator Review', en: 'Weekly operator review' }, max_minutes: 10080, kpi_category: 'portfolio_revenue' },
  { level: 7, rule_key: 'fix_kill_decision', description: { de: 'Fix/Kill bei 14d Underperf.', en: 'Fix/Kill after 14d underperf.' }, max_minutes: 20160, kpi_category: 'units_fix_kill' },
] as const;

// ── Video Strategy ─────────────────────────────────────────────────────────
export const VIDEO_STRATEGY = {
  phase1: {
    description: 'Deep Link — meeting_url pro Appointment, "Call starten" öffnet externen Link',
    providers: ['zoom', 'google_meet', 'whereby', 'teams'] as const,
    status: 'active',
  },
  phase2: {
    description: 'Zoom OAuth — automatische Meeting-Erstellung',
    status: 'planned',
  },
  phase3: {
    description: 'Embedded Video — nur wenn stabil & sinnvoll',
    status: 'not_recommended',
    reason: 'Mobile Safari Instabilität, Datenschutz-Risiken, keine Go-Live-Priorität',
  },
} as const;
