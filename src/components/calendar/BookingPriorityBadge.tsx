/**
 * Booking Priority Badge — Calendar UI
 * Shows HIGH/MEDIUM/LOW priority on appointments.
 * Uses canonical booking_priority from the appointments table.
 */

import { Badge } from '@/components/ui/badge';
import { Flame, Minus, ArrowDown } from 'lucide-react';
import type { LeadPriority } from '@/lib/canonical-decision-engine';

const CONFIG: Record<string, {
  label: string;
  icon: typeof Flame;
  className: string;
}> = {
  HIGH: {
    label: 'HIGH',
    icon: Flame,
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  MEDIUM: {
    label: 'MED',
    icon: Minus,
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  LOW: {
    label: 'LOW',
    icon: ArrowDown,
    className: 'bg-red-100 text-red-700 border-red-200',
  },
};

interface BookingPriorityBadgeProps {
  priority?: string | null;
  compact?: boolean;
}

export function BookingPriorityBadge({ priority, compact = false }: BookingPriorityBadgeProps) {
  const p = priority ?? 'MEDIUM';
  const config = CONFIG[p] ?? CONFIG.MEDIUM;
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`${config.className} gap-0.5 text-[9px] px-1.5 py-0`}>
      <Icon className="h-2.5 w-2.5" />
      {!compact && <span>{config.label}</span>}
    </Badge>
  );
}

export default BookingPriorityBadge;
