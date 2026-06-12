/**
 * MobileDayOverview — "Mein Tag" view for mobile calendar.
 * Shows today's appointments in a clean list with quick actions.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, User, Clock, Calendar, ArrowRight, Video, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAppointmentLocalDate, getLocalTimeString } from '@/lib/appointment-time-display';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: 'Bestätigt', cls: 'bg-primary/10 text-primary border-primary/20' },
  booked: { label: 'Gebucht', cls: 'bg-primary/10 text-primary border-primary/20' },
  scheduled: { label: 'Geplant', cls: 'bg-primary/10 text-primary border-primary/20' },
  pending_confirmation: { label: 'Offen', cls: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20' },
  rescheduled: { label: 'Verschoben', cls: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20' },
  cancelled: { label: 'Storniert', cls: 'bg-destructive/10 text-destructive border-destructive/20' },
  completed: { label: 'Fertig', cls: 'bg-muted text-muted-foreground border-border' },
  no_show: { label: 'No-Show', cls: 'bg-destructive/10 text-destructive border-destructive/20' },
};

const CALL_TYPE_LABELS: Record<string, string> = {
  standard: 'Standard',
  priority: 'Priority',
  setter: 'Setter Call',
  closer: 'Closer Call',
  orientation: 'Orientierung',
  strategy: 'Strategie',
  follow_up: 'Follow-Up',
  setter_call: 'Setter Call',
  closer_call: 'Closer Call',
  priority_call: 'Priority',
  onboarding: 'Onboarding',
};

interface Props {
  appointments: Record<string, any>[];
  onAppointmentClick: (id: string) => void;
}

export function MobileDayOverview({ appointments, onAppointmentClick }: Props) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const todayAppointments = useMemo(() => {
    return appointments
      .filter(a => {
        try {
          return getAppointmentLocalDate(a) === todayStr;
        } catch {
          return false;
        }
      })
      .filter(a => !['cancelled', 'reassigned', 'blocked'].includes(a.appointment_status))
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  }, [appointments, todayStr]);

  if (todayAppointments.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Mein Tag</h3>
          <span className="text-xs text-muted-foreground">
            {format(new Date(), 'EEEE, d. MMMM', { locale: de })}
          </span>
        </div>
        <div className="text-center py-6">
          <CheckCircle2 className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">Keine Calls heute</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Genieße deinen Tag ✨</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card mb-4">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Mein Tag</h3>
        </div>
        <Badge variant="secondary" className="text-[10px]">
          {todayAppointments.length} Call{todayAppointments.length > 1 ? 's' : ''}
        </Badge>
      </div>

      <div className="divide-y divide-border/50">
        {todayAppointments.map(appt => {
          const leadName = appt.leads?.name || 'Termin';
          const status = STATUS_LABELS[appt.appointment_status] || STATUS_LABELS.booked;
          const callType = CALL_TYPE_LABELS[appt.call_type] || appt.call_type || '—';
          let startTime = '—';
          let endTime = '—';
          try {
            startTime = getLocalTimeString(appt.starts_at, appt.booking_timezone);
            endTime = getLocalTimeString(appt.ends_at, appt.booking_timezone);
          } catch {
            try {
              startTime = format(new Date(appt.starts_at), 'HH:mm');
              endTime = format(new Date(appt.ends_at), 'HH:mm');
            } catch { /* keep defaults */ }
          }
          const hasVideo = !!appt.video_call_link;
          const isNow = new Date() >= new Date(appt.starts_at) && new Date() <= new Date(appt.ends_at);

          return (
            <div
              key={appt.id}
              className={cn(
                'flex items-center gap-3 px-4 py-3 transition-colors active:bg-muted/50',
                isNow && 'bg-primary/[0.03] border-l-2 border-l-primary',
              )}
            >
              {/* Time column */}
              <div className="shrink-0 text-center w-14">
                <p className={cn('text-sm font-semibold tabular-nums', isNow ? 'text-primary' : 'text-foreground')}>
                  {startTime}
                </p>
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  {endTime}
                </p>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0" onClick={() => onAppointmentClick(appt.id)}>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium truncate text-foreground">{leadName}</p>
                  {isNow && <Badge className="bg-primary/20 text-primary text-[9px] px-1">JETZT</Badge>}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-muted-foreground">{callType}</span>
                  <Badge variant="outline" className={cn('text-[9px] px-1 py-0', status.cls)}>
                    {status.label}
                  </Badge>
                </div>
              </div>

              {/* Actions */}
              <div className="shrink-0 flex items-center gap-1">
                {hasVideo && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(appt.video_call_link, '_blank');
                    }}
                  >
                    <Video className="h-4 w-4 text-primary" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (appt.lead_id) {
                      navigate(isAdmin
                        ? `/members/admin-workspace?lead=${appt.lead_id}`
                        : `/members/setter-workspace?lead=${appt.lead_id}`
                      );
                    }
                  }}
                >
                  <User className="h-4 w-4 text-muted-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onAppointmentClick(appt.id)}
                >
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
