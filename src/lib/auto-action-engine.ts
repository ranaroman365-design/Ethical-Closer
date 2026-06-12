/**
 * Auto-Action Engine — Layer 50 (Conversion Intelligence)
 *
 * Derives deterministic actions from Lead Scoring output.
 * Pure function — no DB calls, no side effects.
 *
 * Rules:
 *   1. Lead Score <50  → immediate follow-up sequence
 *   2. Show Risk (showTier === "risk") → reminder workflow
 *   3. Close Risk (closeTier === "risk") → objection prep
 *   4. Combined risk → escalation
 *
 * Action types align with Operational Canon (Layer 12):
 *   communicate | coach | allocate | flag | escalate
 */

import type { LeadScoringResult } from "./lead-scoring-engine";

// ── Types ──

export type ActionPriority = "critical" | "high" | "medium" | "low";
export type ActionCategory = "follow_up" | "reminder" | "objection_prep" | "escalation" | "confirmation" | "reactivation";
export type ActionChannel = "whatsapp" | "sms" | "phone" | "in_app";

export interface AutoAction {
  id: string;                    // deterministic key for dedup
  category: ActionCategory;
  priority: ActionPriority;
  channel: ActionChannel;
  title: string;
  description: string;
  triggerReason: string;         // human-readable why
  timelineMinutes: number;       // execute within N minutes (0 = immediate)
  canAutoExecute: boolean;       // true = system can fire without approval
}

export interface AutoActionPlan {
  actions: AutoAction[];
  riskLevel: "critical" | "elevated" | "moderate" | "low";
  summary: string;
}

// ── Engine ──

export function deriveAutoActions(
  scoring: LeadScoringResult,
  context: {
    appointmentId: string;
    leadName?: string;
    hoursUntilCall?: number | null;
    hasNoShowHistory: boolean;
    noResponseToMessages: boolean;
    totalNoShows: number;
  }
): AutoActionPlan {
  const actions: AutoAction[] = [];
  const prefix = context.appointmentId.slice(0, 8);

  // ── Rule 1: Lead Score <50 → Follow-Up Sequence ──
  if (scoring.leadScore < 50) {
    actions.push({
      id: `${prefix}_followup_immediate`,
      category: "follow_up",
      priority: scoring.leadScore < 30 ? "critical" : "high",
      channel: "whatsapp",
      title: "Sofort-Follow-Up senden",
      description: `Lead Score ${scoring.leadScore}/100 — unter Schwellenwert. Personalisierte Nachricht mit Mehrwert senden.`,
      triggerReason: `Lead Score ${scoring.leadScore} < 50`,
      timelineMinutes: 0,
      canAutoExecute: true,
    });

    if (scoring.leadScore < 30) {
      actions.push({
        id: `${prefix}_followup_phone`,
        category: "follow_up",
        priority: "critical",
        channel: "phone",
        title: "Telefonische Nachfassung",
        description: "Sehr niedriger Score — direkter Anruf empfohlen, um Interesse zu qualifizieren.",
        triggerReason: `Lead Score ${scoring.leadScore} < 30 (kritisch)`,
        timelineMinutes: 30,
        canAutoExecute: false,
      });
    }
  }

  // ── Rule 2: Show Risk → Reminder Workflow ──
  if (scoring.showTier === "risk") {
    // Immediate confirmation request
    actions.push({
      id: `${prefix}_show_confirm`,
      category: "confirmation",
      priority: "high",
      channel: "whatsapp",
      title: "Terminbestätigung anfordern",
      description: `Show-Wahrscheinlichkeit ${scoring.showProbability}% — aktive Bestätigung einholen.`,
      triggerReason: `Show Probability ${scoring.showProbability}% (Risiko)`,
      timelineMinutes: 0,
      canAutoExecute: true,
    });

    // Staged reminders based on time until call
    const hoursLeft = context.hoursUntilCall ?? 48;

    if (hoursLeft > 24) {
      actions.push({
        id: `${prefix}_reminder_24h`,
        category: "reminder",
        priority: "high",
        channel: "whatsapp",
        title: "24h-Reminder planen",
        description: "Erinnerung mit Termindetails und Mehrwert-Teaser 24 Stunden vor dem Call.",
        triggerReason: "Show Risk + >24h bis Termin",
        timelineMinutes: Math.max(0, (hoursLeft - 24) * 60),
        canAutoExecute: true,
      });
    }

    if (hoursLeft > 2) {
      actions.push({
        id: `${prefix}_reminder_2h`,
        category: "reminder",
        priority: "high",
        channel: "sms",
        title: "2h-Reminder senden",
        description: "Kurze SMS-Erinnerung 2 Stunden vor dem Call.",
        triggerReason: "Show Risk + >2h bis Termin",
        timelineMinutes: Math.max(0, (hoursLeft - 2) * 60),
        canAutoExecute: true,
      });
    }

    // No-show history escalation
    if (context.hasNoShowHistory) {
      actions.push({
        id: `${prefix}_noshow_escalation`,
        category: "escalation",
        priority: "critical",
        channel: "phone",
        title: "Eskalation: No-Show-Historie",
        description: `${context.totalNoShows}x No-Show — telefonische Bestätigung oder Backup-Lead vorbereiten.`,
        triggerReason: `${context.totalNoShows} vorherige No-Shows + aktuelle Show Risk`,
        timelineMinutes: 15,
        canAutoExecute: false,
      });
    }
  }

  // ── Rule 3: Close Risk → Objection Prep ──
  if (scoring.closeTier === "risk") {
    actions.push({
      id: `${prefix}_objection_prep`,
      category: "objection_prep",
      priority: "medium",
      channel: "in_app",
      title: "Einwand-Vorbereitung aktivieren",
      description: `Close-Wahrscheinlichkeit ${scoring.closeProbability}% — häufigste Einwände für dieses Profil vorbereiten.`,
      triggerReason: `Close Probability ${scoring.closeProbability}% (Risiko)`,
      timelineMinutes: 0,
      canAutoExecute: false,
    });
  }

  // ── Rule 4: No Response + Low Score → Reactivation ──
  if (context.noResponseToMessages && scoring.leadScore < 60) {
    actions.push({
      id: `${prefix}_reactivation`,
      category: "reactivation",
      priority: scoring.leadScore < 35 ? "critical" : "high",
      channel: "whatsapp",
      title: "Reactivation-Sequenz starten",
      description: "Keine Antwort erhalten — alternative Ansprache mit neuem Angle.",
      triggerReason: `Keine Antwort + Lead Score ${scoring.leadScore}`,
      timelineMinutes: 0,
      canAutoExecute: true,
    });
  }

  // ── Rule 5: Combined Critical Risk ──
  if (scoring.showTier === "risk" && scoring.closeTier === "risk" && scoring.leadScore < 40) {
    actions.push({
      id: `${prefix}_combined_escalation`,
      category: "escalation",
      priority: "critical",
      channel: "in_app",
      title: "Vollständige Eskalation",
      description: "Alle Risikoindikatoren kritisch — Lead Review durch Team Lead oder Backup-Zuweisung empfohlen.",
      triggerReason: `Lead ${scoring.leadScore}/100 + Show ${scoring.showProbability}% + Close ${scoring.closeProbability}% — alle im roten Bereich`,
      timelineMinutes: 0,
      canAutoExecute: false,
    });
  }

  // ── Derive risk level ──
  const criticalCount = actions.filter(a => a.priority === "critical").length;
  const highCount = actions.filter(a => a.priority === "high").length;

  const riskLevel: AutoActionPlan["riskLevel"] =
    criticalCount >= 2 ? "critical" :
    criticalCount >= 1 || highCount >= 2 ? "elevated" :
    highCount >= 1 ? "moderate" : "low";

  // ── Summary ──
  const summary = actions.length === 0
    ? "Keine automatischen Aktionen nötig — Lead ist auf Kurs."
    : `${actions.length} Aktion${actions.length > 1 ? "en" : ""} abgeleitet: ${actions.filter(a => a.canAutoExecute).length} automatisch, ${actions.filter(a => !a.canAutoExecute).length} manuell.`;

  // Sort by priority
  const priorityOrder: Record<ActionPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return { actions, riskLevel, summary };
}

// ── UI helpers ──

export function getActionPriorityColor(priority: ActionPriority): string {
  switch (priority) {
    case "critical": return "text-red-600 bg-red-500/15 border-red-500/30";
    case "high": return "text-amber-600 bg-amber-500/15 border-amber-500/30";
    case "medium": return "text-blue-600 bg-blue-500/15 border-blue-500/30";
    case "low": return "text-muted-foreground bg-muted border-border";
  }
}

export function getActionCategoryLabel(category: ActionCategory): string {
  switch (category) {
    case "follow_up": return "Follow-Up";
    case "reminder": return "Reminder";
    case "objection_prep": return "Einwand-Prep";
    case "escalation": return "Eskalation";
    case "confirmation": return "Bestätigung";
    case "reactivation": return "Reactivation";
  }
}

export function getChannelIcon(channel: ActionChannel): string {
  switch (channel) {
    case "whatsapp": return "💬";
    case "sms": return "📱";
    case "phone": return "📞";
    case "in_app": return "🖥️";
  }
}

export function getRiskLevelConfig(level: AutoActionPlan["riskLevel"]) {
  switch (level) {
    case "critical": return { label: "Kritisch", color: "text-red-600", bg: "bg-red-500/15 border-red-500/30", emoji: "🔴" };
    case "elevated": return { label: "Erhöht", color: "text-amber-600", bg: "bg-amber-500/15 border-amber-500/30", emoji: "🟡" };
    case "moderate": return { label: "Moderat", color: "text-blue-600", bg: "bg-blue-500/15 border-blue-500/30", emoji: "🔵" };
    case "low": return { label: "Niedrig", color: "text-emerald-600", bg: "bg-emerald-500/15 border-emerald-500/30", emoji: "🟢" };
  }
}

export function formatTimeline(minutes: number): string {
  if (minutes === 0) return "Sofort";
  if (minutes < 60) return `In ${minutes} Min`;
  const h = Math.round(minutes / 60);
  return `In ${h}h`;
}
