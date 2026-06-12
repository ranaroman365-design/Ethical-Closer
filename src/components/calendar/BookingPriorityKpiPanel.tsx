/**
 * Booking Priority KPI Panel
 * Shows booking/show/close metrics split by priority tier.
 */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target, TrendingUp, Flame, ArrowDown } from 'lucide-react';
import { computeBookingPriorityKpis } from '@/lib/booking-priority-engine';

interface BookingPriorityKpiPanelProps {
  appointments: Array<{
    booking_priority?: string;
    appointment_status?: string;
    lead?: { conversion_state?: string } | null;
  }>;
  className?: string;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function BookingPriorityKpiPanel({ appointments, className = '' }: BookingPriorityKpiPanelProps) {
  const kpis = useMemo(() => computeBookingPriorityKpis(appointments), [appointments]);

  if (kpis.total === 0) return null;

  const tiers = [
    {
      label: 'HIGH',
      count: kpis.high,
      showRate: kpis.highShowRate,
      closeRate: kpis.highCloseRate,
      icon: Flame,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
    },
    {
      label: 'MEDIUM',
      count: kpis.medium,
      showRate: kpis.mediumShowRate,
      closeRate: kpis.mediumCloseRate,
      icon: TrendingUp,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
    },
    {
      label: 'LOW',
      count: kpis.low,
      showRate: kpis.lowShowRate,
      closeRate: kpis.lowCloseRate,
      icon: ArrowDown,
      color: 'text-red-600',
      bg: 'bg-red-50',
      border: 'border-red-200',
    },
  ];

  return (
    <Card className={`border-border/40 ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          Booking Priority Split
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          {tiers.map(t => {
            const Icon = t.icon;
            return (
              <div key={t.label} className={`rounded-lg border ${t.border} ${t.bg} p-3`}>
                <div className="flex items-center gap-1.5 mb-2">
                  <Icon className={`h-3.5 w-3.5 ${t.color}`} />
                  <span className={`text-xs font-bold ${t.color}`}>{t.label}</span>
                  <Badge variant="secondary" className="ml-auto text-[9px] px-1.5 py-0">
                    {t.count}
                  </Badge>
                </div>
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Show-Rate</span>
                    <span className="font-semibold">{pct(t.showRate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Close-Rate</span>
                    <span className="font-semibold">{pct(t.closeRate)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default BookingPriorityKpiPanel;
