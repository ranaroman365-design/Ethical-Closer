/**
 * WhatsApp Status Badge — Phase 3
 * Displays WhatsApp confirmation status per lead.
 * Exports helper functions used by dashboards and tests.
 */

import { Badge } from '@/components/ui/badge';
import { MessageCircle, Check, AlertTriangle, Clock, Send } from 'lucide-react';

// ─── STATUS HELPERS ─────────────────────────────────────────────────

export type WhatsAppStatus = 'confirmed' | 'unresponsive' | 'pending' | 'not_sent';

export function getWhatsAppStatus(lead: Record<string, any>): WhatsAppStatus {
  if (lead.whatsapp_confirmed) return 'confirmed';
  if (lead.whatsapp_unresponsive) return 'unresponsive';
  if (lead.whatsapp_ping_sent) return 'pending';
  return 'not_sent';
}

// ─── KPI HELPERS ────────────────────────────────────────────────────

export interface WhatsAppKpis {
  totalPinged: number;
  totalConfirmed: number;
  totalUnresponsive: number;
  totalPending: number;
  confirmationRate: number;
  confirmedShowRate: number;
  unconfirmedShowRate: number;
}

const SHOW_STATES = new Set(['showed', 'closed_won', 'closed_lost']);

export function computeWhatsAppKpis(leads: Record<string, any>[]): WhatsAppKpis {
  let totalPinged = 0;
  let totalConfirmed = 0;
  let totalUnresponsive = 0;
  let totalPending = 0;
  let confirmedShows = 0;
  let unconfirmedShows = 0;
  let unconfirmedPinged = 0;

  for (const lead of leads) {
    if (!lead.whatsapp_ping_sent) continue;
    totalPinged++;

    if (lead.whatsapp_confirmed) {
      totalConfirmed++;
      if (SHOW_STATES.has(lead.conversion_state)) confirmedShows++;
    } else if (lead.whatsapp_unresponsive) {
      totalUnresponsive++;
      unconfirmedPinged++;
      if (SHOW_STATES.has(lead.conversion_state)) unconfirmedShows++;
    } else {
      totalPending++;
      unconfirmedPinged++;
      if (SHOW_STATES.has(lead.conversion_state)) unconfirmedShows++;
    }
  }

  return {
    totalPinged,
    totalConfirmed,
    totalUnresponsive,
    totalPending,
    confirmationRate: totalPinged > 0 ? totalConfirmed / totalPinged : 0,
    confirmedShowRate: totalConfirmed > 0 ? confirmedShows / totalConfirmed : 0,
    unconfirmedShowRate: unconfirmedPinged > 0 ? unconfirmedShows / unconfirmedPinged : 0,
  };
}

// ─── BADGE CONFIG ───────────────────────────────────────────────────

const STATUS_CONFIG: Record<WhatsAppStatus, {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  icon: typeof Check;
  className: string;
}> = {
  confirmed: {
    label: 'WA Bestätigt',
    variant: 'default',
    icon: Check,
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  unresponsive: {
    label: 'WA Keine Antwort',
    variant: 'destructive',
    icon: AlertTriangle,
    className: 'bg-red-100 text-red-800 border-red-200',
  },
  pending: {
    label: 'WA Ausstehend',
    variant: 'outline',
    icon: Clock,
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  not_sent: {
    label: 'WA Nicht gesendet',
    variant: 'secondary',
    icon: Send,
    className: 'bg-muted text-muted-foreground',
  },
};

// ─── COMPONENT ──────────────────────────────────────────────────────

interface WhatsAppStatusBadgeProps {
  lead: Record<string, any>;
  compact?: boolean;
}

export function WhatsAppStatusBadge({ lead, compact = false }: WhatsAppStatusBadgeProps) {
  const status = getWhatsAppStatus(lead);
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={`${config.className} gap-1 text-xs`}>
      <Icon className="h-3 w-3" />
      {!compact && <span>{config.label}</span>}
    </Badge>
  );
}

export default WhatsAppStatusBadge;
