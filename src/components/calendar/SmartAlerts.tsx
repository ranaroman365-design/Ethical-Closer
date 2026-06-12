/**
 * Smart Alerts — Calendar Command Center
 * Actionable alerts: unowned appointments, pending confirmations,
 * no-show risks, blocked slots, missing setter/closer, recovery gaps.
 */
import { useEffect, useState } from 'react';
import { getRiskSeverity, deriveAttendanceRisk } from '@/lib/canonical-decision-engine';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle, Clock, UserX, Flame, CalendarX, Users,
  ChevronRight, ShieldAlert, Ban, UserMinus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

/** Resolve target maps to a data-resolve-id section in AppointmentDetailModal */
export type ResolveTarget =
  | 'reassignment'   // no_owner, no_setter, no_closer
  | 'quick-actions'  // pending_confirmation, upcoming_unconfirmed
  | 'no-show-recovery' // no_show_no_recovery
  | 'call-readiness' // no_show_risk
  | 'qualification'  // ready_to_close
  | 'reschedule';    // rescheduling scenarios

export interface SmartAlert {
  id: string;
  type:
    | 'no_owner'
    | 'no_setter'
    | 'no_closer'
    | 'pending_confirmation'
    | 'upcoming_unconfirmed'
    | 'no_show_no_recovery'
    | 'no_show_risk'
    | 'blocker_no_lead'
    | 'ready_to_close'
    | 'high_value_no_appt';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  appointmentId?: string;
  leadId?: string;
  resolveTarget?: ResolveTarget;
}

/** Maps alert type to the resolve section in AppointmentDetailModal */
export const ALERT_RESOLVE_MAP: Record<SmartAlert['type'], ResolveTarget | null> = {
  no_owner: 'reassignment',
  no_setter: 'reassignment',
  no_closer: 'reassignment',
  pending_confirmation: 'quick-actions',
  upcoming_unconfirmed: 'quick-actions',
  no_show_no_recovery: 'no-show-recovery',
  no_show_risk: 'call-readiness',
  ready_to_close: 'qualification',
  blocker_no_lead: null,
  high_value_no_appt: null,
};

interface Props {
  userIds: string[];
  isOperator: boolean;
  onAlertClick?: (alert: SmartAlert) => void;
}

const SEVERITY_ICON: Record<string, React.ReactNode> = {
  critical: <AlertTriangle className="h-3.5 w-3.5 text-destructive" />,
  warning: <Clock className="h-3.5 w-3.5 text-amber-600" />,
  info: <CalendarX className="h-3.5 w-3.5 text-muted-foreground" />,
};

export function SmartAlerts({ userIds, isOperator, onAlertClick }: Props) {
  const { user, isAdmin } = useAuth();
  const [alerts, setAlerts] = useState<SmartAlert[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  // Visibility flag — hooks must always run (React rules), so we gate via enabled flag
  const enabled = isOperator || isAdmin;

  useEffect(() => {
    // Smart Alerts are only loaded for L6+ (operators) and admins
    if (!enabled) { setAlerts([]); return; }
    if (!user || userIds.length === 0) return;
    let cancelled = false;

    (async () => {
      const now = new Date();
      const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const endOfWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const result: SmartAlert[] = [];

      try {
        // Fire all queries in parallel for speed
        const [
          noOwnerRes,
          pendingRes,
          noSetterRes,
          noCloserRes,
          noShowRiskRes,
          noShowNoRecoveryRes,
          blockerRes,
          readyLeadsRes,
        ] = await Promise.all([
          // 1. Appointments without owner
          supabase
            .from('appointments')
            .select('id, starts_at, lead_id, leads!appointments_lead_id_fkey(name)')
            .is('current_owner_id', null)
            .in('appointment_status', ['scheduled', 'booked', 'confirmed', 'pending_confirmation'])
            .gte('starts_at', now.toISOString())
            .order('starts_at')
            .limit(5),

          // 2. Pending confirmation within 2h
          supabase
            .from('appointments')
            .select('id, starts_at, lead_id, leads!appointments_lead_id_fkey(name)')
            .eq('appointment_status', 'pending_confirmation')
            .lte('starts_at', twoHoursLater.toISOString())
            .gte('starts_at', now.toISOString())
            .order('starts_at')
            .limit(5),

          // 3. Appointments without setter (upcoming, active)
          supabase
            .from('appointments')
            .select('id, starts_at, lead_id, leads!appointments_lead_id_fkey(name)')
            .is('setter_id', null)
            .in('appointment_status', ['scheduled', 'booked', 'confirmed'])
            .gte('starts_at', now.toISOString())
            .lte('starts_at', endOfWeek.toISOString())
            .order('starts_at')
            .limit(5),

          // 4. Appointments without closer (for closer calls)
          supabase
            .from('appointments')
            .select('id, starts_at, lead_id, call_type, leads!appointments_lead_id_fkey(name)')
            .is('closer_id', null)
            .in('appointment_status', ['scheduled', 'booked', 'confirmed'])
            .in('call_type', ['closer_call', 'priority_call'])
            .gte('starts_at', now.toISOString())
            .lte('starts_at', endOfWeek.toISOString())
            .order('starts_at')
            .limit(5),

          // 5. No-Show risk: upcoming appointments where lead had previous no-shows
          supabase
            .from('appointments')
            .select('id, starts_at, lead_id, leads!appointments_lead_id_fkey(name, total_no_shows)')
            .in('appointment_status', ['scheduled', 'booked', 'confirmed'])
            .gte('starts_at', now.toISOString())
            .lte('starts_at', endOfWeek.toISOString())
            .order('starts_at')
            .limit(50),

          // 6. No-show without recovery (last 7 days)
          supabase
            .from('appointments')
            .select('id, starts_at, lead_id, leads!appointments_lead_id_fkey(name)')
            .eq('appointment_status', 'no_show')
            .is('rescheduled_to_id', null)
            .gte('starts_at', sevenDaysAgo.toISOString())
            .order('starts_at', { ascending: false })
            .limit(5),

          // 7. Blockers this week (blocked time with no lead)
          supabase
            .from('calendar_blockers')
            .select('id, starts_at, ends_at, title, blocker_type, user_id')
            .gte('starts_at', now.toISOString())
            .lte('starts_at', endOfWeek.toISOString())
            .order('starts_at')
            .limit(10),

          // 8. Leads ready_to_close without closer (L6+/admin only)
          (isOperator || isAdmin)
            ? supabase
                .from('leads')
                .select('id, name, qualification_status')
                .eq('qualification_status', 'ready_to_close')
                .is('closer_id', null)
                .eq('is_simulation', false)
                .limit(5)
            : Promise.resolve({ data: null, error: null }),
        ]);

        // ── Process results ──

        // 1. No owner
        if (noOwnerRes.data) {
          for (const a of noOwnerRes.data) {
            result.push({
              id: `no_owner_${a.id}`,
              type: 'no_owner',
              severity: 'critical',
              title: 'Termin ohne Besitzer',
              detail: `${(a as any).leads?.name || 'Lead'} — ${formatDistanceToNow(new Date(a.starts_at), { addSuffix: true, locale: de })}`,
              appointmentId: a.id,
              leadId: a.lead_id ?? undefined,
            });
          }
        }

        // 2. Pending confirmation
        if (pendingRes.data) {
          for (const a of pendingRes.data) {
            result.push({
              id: `pending_${a.id}`,
              type: 'upcoming_unconfirmed',
              severity: 'warning',
              title: 'Unbestätigt in < 2h',
              detail: `${(a as any).leads?.name || 'Lead'} — ${formatDistanceToNow(new Date(a.starts_at), { addSuffix: true, locale: de })}`,
              appointmentId: a.id,
              leadId: a.lead_id ?? undefined,
            });
          }
        }

        // 3. No setter
        if (noSetterRes.data) {
          for (const a of noSetterRes.data) {
            result.push({
              id: `no_setter_${a.id}`,
              type: 'no_setter',
              severity: 'warning',
              title: 'Termin ohne Setter',
              detail: `${(a as any).leads?.name || 'Lead'} — ${formatDistanceToNow(new Date(a.starts_at), { addSuffix: true, locale: de })}`,
              appointmentId: a.id,
              leadId: a.lead_id ?? undefined,
            });
          }
        }

        // 4. Closer calls without closer
        if (noCloserRes.data) {
          for (const a of noCloserRes.data) {
            result.push({
              id: `no_closer_${a.id}`,
              type: 'no_closer',
              severity: 'critical',
              title: 'Closer Call ohne Closer',
              detail: `${(a as any).leads?.name || 'Lead'} — ${formatDistanceToNow(new Date(a.starts_at), { addSuffix: true, locale: de })}`,
              appointmentId: a.id,
              leadId: a.lead_id ?? undefined,
            });
          }
        }

        // 5. No-show risk — canonical attendance risk
        if (noShowRiskRes.data) {
          const risky = noShowRiskRes.data.filter(
            (a: any) => {
              const lead = a.leads ?? {};
              return deriveAttendanceRisk(lead) !== 'low';
            }
          );
          for (const a of risky.slice(0, 5)) {
            const lead = (a as any).leads ?? {};
            const severity = getRiskSeverity(lead);
            result.push({
              id: `noshow_risk_${a.id}`,
              type: 'no_show_risk',
              severity: severity === 'ok' ? 'warning' : severity,
              title: `No-Show-Risiko (${lead.total_no_shows ?? 0}× zuvor)`,
              detail: `${lead.name || 'Lead'} — ${formatDistanceToNow(new Date(a.starts_at), { addSuffix: true, locale: de })}`,
              appointmentId: a.id,
              leadId: a.lead_id ?? undefined,
            });
          }
        }

        // 6. No-show without recovery
        if (noShowNoRecoveryRes.data) {
          for (const a of noShowNoRecoveryRes.data) {
            result.push({
              id: `noshow_${a.id}`,
              type: 'no_show_no_recovery',
              severity: 'info',
              title: 'No-Show ohne Recovery',
              detail: `${(a as any).leads?.name || 'Lead'} — ${formatDistanceToNow(new Date(a.starts_at), { addSuffix: true, locale: de })}`,
              appointmentId: a.id,
              leadId: a.lead_id ?? undefined,
            });
          }
        }

        // 7. Blockers — removed: not actionable, creates noise

        // 8. Ready to close without closer
        if (readyLeadsRes.data) {
          for (const l of readyLeadsRes.data) {
            result.push({
              id: `ready_${l.id}`,
              type: 'ready_to_close',
              severity: 'warning',
              title: 'Ready to Close — kein Closer',
              detail: l.name || 'Lead',
              leadId: l.id,
            });
          }
        }
      } catch (e) {
        console.error('[SmartAlerts] fetch error', e);
      }

      // Attach resolveTarget to each alert
      for (const alert of result) {
        alert.resolveTarget = ALERT_RESOLVE_MAP[alert.type] ?? undefined;
      }

      // Sort: critical first, then warning, then info
      const SEV_ORDER = { critical: 0, warning: 1, info: 2 };
      result.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);

      if (!cancelled) setAlerts(result);
    })();

    return () => { cancelled = true; };
  }, [user, userIds, isOperator, isAdmin, enabled]);

  if (!enabled || alerts.length === 0) return null;

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;
  const infoCount = alerts.filter(a => a.severity === 'info').length;

  return (
    <div className="rounded-xl border border-border bg-card mb-4">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center justify-between w-full px-4 py-2.5 text-left"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Smart Alerts
          {criticalCount > 0 && (
            <Badge variant="destructive" className="text-[10px] px-1.5">{criticalCount}</Badge>
          )}
          {warningCount > 0 && (
            <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 text-[10px] px-1.5">{warningCount}</Badge>
          )}
          {infoCount > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5">{infoCount}</Badge>
          )}
        </div>
        <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", !collapsed && "rotate-90")} />
      </button>

      {!collapsed && (
        <div className="border-t border-border divide-y divide-border/50 max-h-72 overflow-y-auto">
          {alerts.map(alert => (
            <button
              key={alert.id}
              onClick={() => onAlertClick?.(alert)}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 w-full text-left hover:bg-muted/50 transition-colors",
                alert.severity === 'critical' && "bg-destructive/[0.03]",
              )}
            >
              {SEVERITY_ICON[alert.severity]}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{alert.title}</p>
                <p className="text-[11px] text-muted-foreground truncate">{alert.detail}</p>
              </div>
              {(alert.appointmentId || alert.leadId) && (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
