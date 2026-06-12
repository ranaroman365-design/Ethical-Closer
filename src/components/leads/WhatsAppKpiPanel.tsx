/**
 * WhatsApp Confirmation KPI Panel — Phase 3
 * Shows confirmed vs unconfirmed split with show-rate comparison.
 * Drop into any dashboard that has access to leads data.
 */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Check, AlertTriangle, Clock } from 'lucide-react';
import { computeWhatsAppKpis, type WhatsAppKpis } from '@/components/leads/WhatsAppStatusBadge';

interface WhatsAppKpiPanelProps {
  leads: Record<string, any>[];
  className?: string;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function WhatsAppKpiPanel({ leads, className = '' }: WhatsAppKpiPanelProps) {
  const kpis = useMemo(() => computeWhatsAppKpis(leads), [leads]);

  if (kpis.totalPinged === 0) return null;

  return (
    <Card className={`border-border/40 ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-emerald-500" />
          WhatsApp Confirmation
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCell
            icon={<MessageCircle className="h-3.5 w-3.5" />}
            label="Gesendet"
            value={kpis.totalPinged}
          />
          <KpiCell
            icon={<Check className="h-3.5 w-3.5 text-emerald-500" />}
            label="Bestätigt"
            value={kpis.totalConfirmed}
            sub={pct(kpis.confirmationRate)}
            subColor="text-emerald-600"
          />
          <KpiCell
            icon={<Clock className="h-3.5 w-3.5 text-amber-500" />}
            label="Ausstehend"
            value={kpis.totalPending}
          />
          <KpiCell
            icon={<AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
            label="Keine Antwort"
            value={kpis.totalUnresponsive}
          />
        </div>

        {/* Show-rate comparison */}
        <div className="mt-4 pt-3 border-t border-border/30 flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
              Bestätigt
            </Badge>
            <span className="font-semibold">{pct(kpis.confirmedShowRate)} Show-Rate</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px]">
              Unbestätigt
            </Badge>
            <span className="font-semibold">{pct(kpis.unconfirmedShowRate)} Show-Rate</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiCell({ icon, label, value, sub, subColor }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  subColor?: string;
}) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 mb-1 text-muted-foreground">
        {icon}
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-lg font-bold">{value}</div>
      {sub && <div className={`text-xs ${subColor ?? 'text-muted-foreground'}`}>{sub}</div>}
    </div>
  );
}

export default WhatsAppKpiPanel;
