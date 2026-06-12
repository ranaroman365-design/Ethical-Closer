import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { BookingPriorityBadge } from '@/components/calendar/BookingPriorityBadge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getAccessibleUserIds } from '@/lib/team-scope';
import { useToast } from '@/hooks/use-toast';
import { haptic } from '@/lib/haptic';
import { useCalendarDragDrop, canDragAppointment, type DragData } from '@/hooks/useCalendarDragDrop';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from '@/components/ui/drawer';
import {
  Calendar as CalIcon, ChevronLeft, ChevronRight, Clock,
  Phone, User, Download, ExternalLink, CalendarPlus, Video, ArrowRight, FileSpreadsheet, Users, Plus, GripVertical, AlertTriangle, Copy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import {
  format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks,
  isSameDay, startOfDay, endOfDay, isToday, parseISO,
} from 'date-fns';
import { de } from 'date-fns/locale';
import {
  downloadICS, googleCalendarUrl, outlookCalendarUrl,
} from '@/lib/calendar-utils';
import { AppointmentDetailModal } from '@/components/calendar/AppointmentDetailModal';
import {
  getAppointmentLocalDate, getAppointmentLocalHourMinute, getLocalTimeString,
  formatAppointmentTime,
} from '@/lib/appointment-time-display';
import LeadExportModal from '@/components/calendar/LeadExportModal';
import { SmartAlerts } from '@/components/calendar/SmartAlerts';
import { CreateAppointmentModal } from '@/components/calendar/CreateAppointmentModal';
import { MobileDayOverview } from '@/components/calendar/MobileDayOverview';

type Appointment = Record<string, any>;
type ViewMode = 'week' | 'day';
type CalendarScope = 'my' | 'team' | 'all';
type CalendarLoadError = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
  raw?: unknown;
  failingQuery: string;
};

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  confirmed: { label: 'Bestätigt', cls: 'bg-primary/10 text-primary border-primary/20' },
  booked: { label: 'Gebucht', cls: 'bg-primary/10 text-primary border-primary/20' },
  rescheduled: { label: 'Verschoben', cls: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20' },
  cancelled: { label: 'Storniert', cls: 'bg-destructive/10 text-destructive border-destructive/20' },
  completed: { label: 'Abgeschlossen', cls: 'bg-muted text-muted-foreground border-border' },
  no_show: { label: 'No-Show', cls: 'bg-destructive/10 text-destructive border-destructive/20' },
  reassigned: { label: 'Übergeben', cls: 'bg-muted/50 text-muted-foreground/60 border-border/30' },
  blocked: { label: 'Blockiert', cls: 'bg-muted text-muted-foreground border-border' },
};

const CALL_TYPE_LABELS: Record<string, string> = {
  standard: 'Standard',
  priority: 'Priority Call',
  setter: 'Setter Call',
  closer: 'Closer Call',
  orientation: 'Orientation Call',
  strategy: 'Strategy Call',
  follow_up: 'Follow-Up',
  // legacy values
  setter_call: 'Setter Call',
  closer_call: 'Closer Call',
  priority_call: 'Priority Call',
};

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7:00 – 20:00

export default function Calendar() {
  const { user, isAdmin, profile } = useAuth();
  const { toast } = useToast();
  const routerNavigate = useNavigate();
  const firstName = (profile as any)?.full_name?.split(' ')[0] || '';
  const callerLevel = (profile as any)?.current_phase ?? 0;

  const isMobile = useIsMobile();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<CalendarLoadError | null>(null);
  const [view, setView] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [deepLinkApptId, setDeepLinkApptId] = useState<string | null>(null);
  const [deepLinkResolveTarget, setDeepLinkResolveTarget] = useState<import('@/components/calendar/SmartAlerts').ResolveTarget | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // Long-press + swipe for mobile reschedule
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [longPressAppt, setLongPressAppt] = useState<Appointment | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const swipeApptRef = useRef<Appointment | null>(null);
  const [swipeOffsetMap, setSwipeOffsetMap] = useState<Record<string, number>>({});

  // Drag-and-drop for rescheduling (L4+ or admin)
  const canDrag = callerLevel >= 4 || isAdmin;
  const fetchRef = useRef<() => void>();
  const {
    dragging, dropTarget, processing: dndProcessing, pendingDrop,
    handleDragStart, handleDragEnd, handleDragOver, handleDragLeave, handleDrop,
    confirmDrop, cancelDrop,
  } = useCalendarDragDrop(useCallback(() => { fetchRef.current?.(); }, []));

  // Priority filter
  type PriorityFilter = 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW';
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('ALL');

  // Calendar scope: My | Team (L6+) | All (L7+/Admin)
  const [scope, setScope] = useState<CalendarScope>('my');
  const [teamIds, setTeamIds] = useState<string[]>([]);

  // Determine available scopes based on level
  const availableScopes = useMemo(() => {
    const scopes: { key: CalendarScope; label: string; icon: React.ReactNode }[] = [
      { key: 'my', label: 'Mein Kalender', icon: <CalIcon className="h-3 w-3" /> },
    ];
    if (callerLevel >= 4) {
      scopes.push({ key: 'team', label: 'Team', icon: <Users className="h-3 w-3" /> });
    }
    if (isAdmin || callerLevel >= 7) {
      scopes.push({ key: 'all', label: 'Alle', icon: <Users className="h-3 w-3" /> });
    }
    return scopes;
  }, [callerLevel, isAdmin]);

  // Load team IDs via canonical team-scope (replaces get_assignable_operators)
  useEffect(() => {
    if (!user) { setTeamIds([user?.id ?? '']); return; }
    if (callerLevel < 4) { setTeamIds([user.id]); return; }
    getAccessibleUserIds(user.id, { isAdmin, level: callerLevel }).then((result) => {
      setTeamIds(result.userIds.length > 0 ? result.userIds : [user.id]);
    });
  }, [user, callerLevel, isAdmin]);

  // Compute date range
  const dateRange = useMemo(() => {
    if (view === 'day') {
      return { start: startOfDay(currentDate), end: endOfDay(currentDate) };
    }
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = endOfWeek(currentDate, { weekStartsOn: 1 });
    return { start, end };
  }, [currentDate, view]);

  const weekDays = useMemo(() => {
    if (view === 'day') return [currentDate];
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [currentDate, view]);

  // Fetch appointments based on scope
  const fetchAppointments = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    try {
      let query = supabase
        .from('appointments')
        // Default relationship embedding is left-join behavior; do not use !inner here.
        .select('*, leads!appointments_lead_id_fkey(name, email, closer_id, stage, setter_lead_uniqueness, setter_notes)')
        .gte('starts_at', dateRange.start.toISOString())
        .lte('starts_at', dateRange.end.toISOString())
        .order('starts_at');

      if (scope === 'all' && (isAdmin || callerLevel >= 7)) {
        // No filter — see everything
      } else if (scope === 'team' && callerLevel >= 4) {
        // Show appointments for all team members
        const ids = teamIds.length > 0 ? teamIds : [user.id];
        const orParts = ids.flatMap(id => [
          `assigned_operator_id.eq.${id}`,
          `setter_id.eq.${id}`,
          `closer_id.eq.${id}`,
          `current_owner_id.eq.${id}`,
        ]);
        query = query.or(orParts.join(','));
      } else {
        // My Calendar: only own appointments
        query = query.or(
          `assigned_operator_id.eq.${user.id},setter_id.eq.${user.id},closer_id.eq.${user.id},current_owner_id.eq.${user.id}`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      // Deduplicate: OR across multiple ID columns can return the same row via different matches
      const seen = new Set<string>();
      const deduped = (data || []).filter(a => {
        if (!a?.id || !a?.starts_at || !a?.ends_at) return false;
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        return true;
      });
      setAppointments(deduped);
    } catch (error: any) {
      console.error('Calendar fetch error:', error);
      setAppointments([]);
      setLoadError({
        message: error?.message || 'Kalender konnte nicht geladen werden',
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
        raw: error,
        failingQuery: 'appointments.select.with_leads',
      });
      toast({ title: 'Kalender konnte nicht geladen werden', description: error?.message || 'Bitte erneut versuchen.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin, dateRange, scope, callerLevel, teamIds, toast]);

  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);
  useEffect(() => { fetchRef.current = fetchAppointments; }, [fetchAppointments]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('calendar-appointments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        fetchAppointments();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchAppointments]);

  // Navigation
  const navigate = (dir: number) => {
    setCurrentDate(prev => view === 'week' ? (dir > 0 ? addWeeks(prev, 1) : subWeeks(prev, 1)) : addDays(prev, dir));
  };

  const goToday = () => setCurrentDate(new Date());

  // Position helper — uses booking_timezone for correct placement
  const getPosition = (appt: Appointment) => {
    const { hour: h, minute: m } = getAppointmentLocalHourMinute({
      starts_at: appt.starts_at,
      booking_timezone: appt.booking_timezone,
      original_local_time: appt.original_local_time,
    });
    const top = ((h - 7) * 60 + m) * (64 / 60); // 64px per hour
    return top;
  };

  const getDuration = (startsAt: string, endsAt: string) => {
    const diff = (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000;
    return Math.max(diff * (64 / 60), 24); // min 24px
  };

  // Build event for export
  const buildEvent = (appt: Appointment) => {
    const leadName = appt.leads?.name || 'Termin';
    return {
      title: `Strategiegespräch – ${leadName}`,
      start: new Date(appt.starts_at),
      end: new Date(appt.ends_at),
      description: [
        `Lead: ${leadName}`,
        `Typ: ${CALL_TYPE_LABELS[appt.call_type] || appt.call_type}`,
        appt.setter_notes ? `Notizen: ${appt.setter_notes}` : '',
      ].filter(Boolean).join('\n'),
    };
  };

  // Apply priority filter
  const filteredAppointments = useMemo(() => {
    if (priorityFilter === 'ALL') return appointments;
    return appointments.filter(a => (a.booking_priority ?? 'MEDIUM') === priorityFilter);
  }, [appointments, priorityFilter]);

  // KPIs — use booking-local date for correct day assignment
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const callsToday = filteredAppointments.filter(a => getAppointmentLocalDate(a) === todayStr).length;
  const callsThisWeek = filteredAppointments.length;

  // Determine if an appointment belongs to current user (for visual distinction in team view)
  const isOwnAppointment = (appt: Appointment) =>
    appt.assigned_operator_id === user?.id ||
    appt.setter_id === user?.id ||
    appt.closer_id === user?.id ||
    appt.current_owner_id === user?.id;

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-10">
      {/* Header — responsive */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="font-serif text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            {firstName ? `Kalender, ${firstName}` : 'Kalender'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {callsToday > 0 ? `${callsToday} Call${callsToday > 1 ? 's' : ''} heute` : 'Keine Calls heute'}
            {' · '}
            {callsThisWeek} diese Woche
            {scope === 'team' && ' (Team)'}
            {scope === 'all' && ' (Alle)'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="text-xs gap-1.5"
          >
            <Plus className="h-3 w-3" />
            Neu
          </Button>
          {!isMobile && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExportOpen(true)}
                className="text-xs gap-1.5"
              >
                <FileSpreadsheet className="h-3 w-3" />
                Export
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchAppointments()}
                className="text-xs gap-1.5"
              >
                <ChevronRight className="h-3 w-3 rotate-[270deg]" />
                Aktualisieren
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={goToday} className="text-xs">
            Heute
          </Button>
          <div className="flex border border-border rounded-md overflow-hidden">
            <button
              onClick={() => setView('day')}
              className={cn('px-3 py-1.5 text-xs transition-colors', view === 'day' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted')}
            >
              Tag
            </button>
            <button
              onClick={() => setView('week')}
              className={cn('px-3 py-1.5 text-xs transition-colors', view === 'week' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted')}
            >
              Woche
            </button>
          </div>
        </div>
      </div>

      {/* Scope Tabs — only show if more than 1 scope */}
      {availableScopes.length > 1 && (
        <div className="flex gap-1 mb-4 border border-border rounded-lg p-1 w-fit bg-muted/30">
          {availableScopes.map(s => (
            <button
              key={s.key}
              onClick={() => setScope(s.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-all',
                scope === s.key
                  ? 'bg-background text-foreground shadow-sm font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              {s.icon}
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Priority Filter */}
      <div className="flex gap-1 mb-4 border border-border rounded-lg p-1 w-fit bg-muted/30">
        {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(p => (
          <button
            key={p}
            onClick={() => setPriorityFilter(p)}
            className={cn(
              'px-3 py-1.5 text-xs rounded-md transition-all',
              priorityFilter === p
                ? 'bg-background text-foreground shadow-sm font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            {p === 'ALL' ? 'Alle Prioritäten' : p}
          </button>
        ))}
      </div>

      {loadError && (
        <div role="alert" className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-medium">Kalender konnte nicht geladen werden</p>
              <p className="text-destructive/90">{loadError.message}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-xs"
              onClick={async () => {
                const details = [
                  `timestamp: ${new Date().toISOString()}`,
                  `route: ${window.location.pathname}`,
                  `user_id: ${user?.id ?? '—'}`,
                  `user_level: ${callerLevel ?? '—'}`,
                  `selected_range: ${dateRange.start.toISOString()} → ${dateRange.end.toISOString()}`,
                  `failing_query: ${loadError.failingQuery}`,
                  `supabase_code: ${loadError.code ?? '—'}`,
                  `supabase_message: ${loadError.message}`,
                  `supabase_details: ${loadError.details ?? '—'}`,
                  `supabase_hint: ${loadError.hint ?? '—'}`,
                  `browser: ${navigator.userAgent}`,
                  loadError.raw ? `raw: ${JSON.stringify(loadError.raw, null, 2)}` : '',
                ].filter(Boolean).join('\n');
                try {
                  await navigator.clipboard.writeText(details);
                  toast({ title: 'Support-Details kopiert' });
                } catch {
                  toast({ title: 'Kopieren fehlgeschlagen', variant: 'destructive' });
                }
              }}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Support-Details kopieren
            </Button>
          </div>
        </div>
      )}

      {/* Smart Alerts */}
      <SmartAlerts
        userIds={teamIds.length > 0 ? teamIds : [user?.id ?? '']}
        isOperator={callerLevel >= 6}
        onAlertClick={(alert) => {
          if (alert.appointmentId) {
            setDeepLinkApptId(alert.appointmentId);
            setDeepLinkResolveTarget(alert.resolveTarget ?? null);
          }
        }}
      />

      {/* Mobile: "Mein Tag" overview */}
      {isMobile && (
        <MobileDayOverview
          appointments={filteredAppointments}
          onAppointmentClick={(id) => setDeepLinkApptId(id)}
        />
      )}

      {/* Drag hint */}
      {dragging && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-xs text-primary animate-in fade-in slide-in-from-top-1">
          <GripVertical className="h-3.5 w-3.5" />
          <span>Termin auf eine neue Uhrzeit ziehen, um zu verschieben. Loslassen zum Bestätigen.</span>
        </div>
      )}

      {/* Navigation bar */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-sm font-medium text-foreground">
          {view === 'week'
            ? `${format(weekDays[0], 'd. MMM', { locale: de })} – ${format(weekDays[weekDays.length - 1], 'd. MMM yyyy', { locale: de })}`
            : format(currentDate, 'EEEE, d. MMMM yyyy', { locale: de })}
        </h2>
        <Button variant="ghost" size="icon" onClick={() => navigate(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* DnD processing overlay */}
      {dndProcessing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-6 py-4 shadow-lg">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm font-medium text-foreground">Termin wird verschoben…</span>
          </div>
        </div>
      )}

      {/* Calendar Grid */}
      <div className={cn('rounded-lg border border-border bg-card overflow-hidden', dragging && 'ring-2 ring-primary/20')}>
        {/* Day headers */}
        <div className={cn('grid border-b border-border bg-muted/30', view === 'week' ? 'grid-cols-[60px_repeat(7,1fr)]' : 'grid-cols-[60px_1fr]')}>
          <div className="px-2 py-2" />
          {weekDays.map(day => (
            <div
              key={day.toISOString()}
              className={cn(
                'px-2 py-2 text-center border-l border-border',
                isToday(day) && 'bg-primary/5'
              )}
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {format(day, 'EEE', { locale: de })}
              </p>
              <p className={cn(
                'text-sm font-medium',
                isToday(day) ? 'text-primary font-bold' : 'text-foreground'
              )}>
                {format(day, 'd')}
              </p>
            </div>
          ))}
        </div>

        {/* Time grid */}
        <div className={cn('grid relative', view === 'week' ? 'grid-cols-[60px_repeat(7,1fr)]' : 'grid-cols-[60px_1fr]')} style={{ minHeight: HOURS.length * 64 }}>
          {/* Time labels */}
          <div className="relative">
            {HOURS.map(h => (
              <div key={h} className="h-16 border-b border-border/50 flex items-start px-2 pt-1">
                <span className="text-[10px] text-muted-foreground">{`${h}:00`}</span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map(day => {
            const dayStr = format(day, 'yyyy-MM-dd');
            const dayAppts = filteredAppointments.filter(a => getAppointmentLocalDate(a) === dayStr);
            return (
              <div key={day.toISOString()} className={cn('relative border-l border-border', isToday(day) && 'bg-primary/[0.02]')}>
                {/* Hour drop zones */}
                {HOURS.map(h => (
                  <div
                    key={h}
                    className={cn(
                      'h-16 border-b border-border/30 relative',
                      dragging && 'cursor-copy',
                    )}
                  >
                    {/* Two 30-min drop zones per hour */}
                    {canDrag && dragging && (
                      <>
                        <div
                          className={cn(
                            'absolute inset-x-0 top-0 h-1/2 transition-colors z-10',
                            dropTarget?.date === dayStr && dropTarget?.hour === h && dropTarget?.minute === 0
                              ? 'bg-primary/20 ring-1 ring-primary/40 ring-inset'
                              : 'hover:bg-primary/10',
                          )}
                          onDragOver={(e) => handleDragOver(e, { date: dayStr, hour: h, minute: 0 })}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, { date: dayStr, hour: h, minute: 0 })}
                        />
                        <div
                          className={cn(
                            'absolute inset-x-0 bottom-0 h-1/2 transition-colors z-10',
                            dropTarget?.date === dayStr && dropTarget?.hour === h && dropTarget?.minute === 30
                              ? 'bg-primary/20 ring-1 ring-primary/40 ring-inset'
                              : 'hover:bg-primary/10',
                          )}
                          onDragOver={(e) => handleDragOver(e, { date: dayStr, hour: h, minute: 30 })}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, { date: dayStr, hour: h, minute: 30 })}
                        />
                      </>
                    )}
                  </div>
                ))}

                {/* Appointment blocks */}
                {dayAppts.map(appt => {
                  const top = getPosition(appt);
                  const height = getDuration(appt.starts_at, appt.ends_at);
                  const status = STATUS_STYLES[appt.appointment_status] || STATUS_STYLES.booked;
                  const isPriority = appt.call_type === 'priority_call';
                  const localStart = getLocalTimeString(appt.starts_at, appt.booking_timezone);
                  const localEnd = getLocalTimeString(appt.ends_at, appt.booking_timezone);
                  const isOwn = isOwnAppointment(appt);
                  const isDraggable = canDrag && canDragAppointment(appt.appointment_status);
                  const isDragged = dragging?.appointmentId === appt.id;

                  return (
                    <div
                      key={appt.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => !isDragged && setDeepLinkApptId(appt.id)}
                      draggable={!isMobile && isDraggable}
                      onDragStart={!isMobile && isDraggable ? (e) => handleDragStart(e, {
                        appointmentId: appt.id,
                        startsAt: appt.starts_at,
                        endsAt: appt.ends_at,
                        leadId: appt.lead_id,
                        leadName: appt.leads?.name || null,
                        currentOwnerId: appt.current_owner_id,
                        appointmentStatus: appt.appointment_status,
                      }) : undefined}
                      onDragEnd={!isMobile && isDraggable ? handleDragEnd : undefined}
                      onTouchStart={isMobile && isDraggable ? (e: React.TouchEvent) => {
                        const t = e.touches[0];
                        swipeStart.current = { x: t.clientX, y: t.clientY };
                        swipeApptRef.current = appt;
                        longPressTimer.current = setTimeout(() => {
                          haptic.heavy();
                          swipeStart.current = null; // cancel swipe if long-press fires
                          setLongPressAppt(appt);
                        }, 500);
                      } : undefined}
                      onTouchMove={isMobile ? (e: React.TouchEvent) => {
                        // Cancel long-press on any movement
                        if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
                        // Track horizontal swipe
                        if (swipeStart.current && isDraggable) {
                          const t = e.touches[0];
                          const dx = t.clientX - swipeStart.current.x;
                          const dy = Math.abs(t.clientY - swipeStart.current.y);
                          if (dy > 30) { swipeStart.current = null; setSwipeOffsetMap(p => { const n = { ...p }; delete n[appt.id]; return n; }); return; }
                          if (dx < 0) setSwipeOffsetMap(p => ({ ...p, [appt.id]: Math.max(dx, -120) }));
                        }
                      } : undefined}
                      onTouchEnd={isMobile ? () => {
                        if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
                        const offset = swipeOffsetMap[appt.id] ?? 0;
                        if (offset <= -60 && isDraggable && swipeApptRef.current?.id === appt.id) {
                          haptic.medium();
                          setLongPressAppt(appt);
                        }
                        swipeStart.current = null;
                        swipeApptRef.current = null;
                        setSwipeOffsetMap(p => { const n = { ...p }; delete n[appt.id]; return n; });
                      } : undefined}
                      onTouchCancel={isMobile ? () => {
                        if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
                        swipeStart.current = null;
                        swipeApptRef.current = null;
                        setSwipeOffsetMap(p => { const n = { ...p }; delete n[appt.id]; return n; });
                      } : undefined}
                      className={cn(
                        'absolute left-1 right-1 rounded-md border px-2 py-1.5 text-left cursor-pointer overflow-hidden z-20 group',
                        'min-h-[44px] touch-manipulation',
                        'hover:shadow-md',
                        status?.cls || 'bg-primary/10 text-primary border-primary/20',
                        appt.appointment_status === 'reassigned' && 'opacity-40 pointer-events-none line-through',
                        isPriority && 'border-l-4 border-l-primary',
                        scope !== 'my' && !isOwn && 'opacity-70',
                        isDraggable && 'hover:ring-2 hover:ring-primary/30',
                        isDragged && 'opacity-40 ring-2 ring-primary/50',
                        longPressAppt?.id === appt.id && 'ring-2 ring-primary scale-[1.02] shadow-lg',
                        (swipeOffsetMap[appt.id] ?? 0) !== 0 ? '' : 'transition-all',
                      )}
                      style={{
                        top,
                        height: Math.max(height, isMobile ? 44 : 28),
                        transform: (swipeOffsetMap[appt.id] ?? 0) !== 0
                          ? `translateX(${swipeOffsetMap[appt.id]}px)`
                          : undefined,
                        transition: (swipeOffsetMap[appt.id] ?? 0) !== 0
                          ? 'none'
                          : 'transform 0.2s ease-out, box-shadow 0.2s, opacity 0.2s',
                      }}
                    >
                      {/* Swipe hint visible behind the card */}
                      {isMobile && isDraggable && (swipeOffsetMap[appt.id] ?? 0) < -20 && (
                        <div
                          className="absolute -right-1 top-0 bottom-0 flex items-center justify-center rounded-r-md bg-primary/15 text-primary text-[10px] font-semibold px-2 pointer-events-none"
                          style={{ width: Math.abs(swipeOffsetMap[appt.id] ?? 0), right: swipeOffsetMap[appt.id] ?? 0 }}
                        >
                          {Math.abs(swipeOffsetMap[appt.id] ?? 0) >= 60 ? (
                            <span className="flex items-center gap-1">
                              <CalIcon className="h-3 w-3" /> Verschieben
                            </span>
                          ) : '← '}
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        {isDraggable && (
                          <GripVertical className={cn(
                            "h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-opacity cursor-grab",
                            isMobile ? "opacity-60" : "opacity-0 group-hover:opacity-100"
                          )} />
                        )}
                        <p className={cn("font-semibold truncate flex-1", isMobile ? "text-xs" : "text-[10px]")}>
                          {appt.leads?.name || 'Termin'}
                        </p>
                        <BookingPriorityBadge priority={appt.booking_priority} compact />
                      </div>
                      <p className={cn("text-muted-foreground truncate", isMobile ? "text-[11px]" : "text-[9px]")}>
                        {localStart} – {localEnd}
                      </p>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Empty state */}
      {filteredAppointments.length === 0 && !loading && (
        <div className="rounded-lg border border-border bg-card py-16 text-center mt-4">
          <CalIcon className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground">Keine Termine geplant</p>
          <p className="text-xs text-muted-foreground mt-1">
            {scope === 'my' ? 'Du hast keine Termine in diesem Zeitraum.' : 'Keine Teamtermine in diesem Zeitraum.'}
          </p>
        </div>
      )}

      {/* ── Detail Dialog ── */}
      <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              {selected?.leads?.name || 'Termin'}
              <BookingPriorityBadge priority={selected?.booking_priority} />
            </DialogTitle>
          </DialogHeader>
          {selected && (() => {
            const disp = formatAppointmentTime({
              starts_at: selected.starts_at,
              ends_at: selected.ends_at,
              booking_timezone: selected.booking_timezone,
              original_local_date: selected.original_local_date,
              original_local_time: selected.original_local_time,
            });
            return (
            <div className="space-y-4 py-2">
              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Datum</p>
                  <p className="text-sm text-foreground">{disp.date}</p>
                </div>
                <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Uhrzeit</p>
                  <p className="text-sm text-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {disp.startTime} – {disp.endTime || '—'}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Typ</p>
                  <p className="text-sm text-foreground">{CALL_TYPE_LABELS[selected.call_type] || selected.call_type}</p>
                </div>
                <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Status</p>
                  <Badge variant="outline" className={cn('text-[10px]', STATUS_STYLES[selected.appointment_status]?.cls)}>
                    {STATUS_STYLES[selected.appointment_status]?.label || selected.appointment_status}
                  </Badge>
                </div>
              </div>

              {/* Video Call Link */}
              <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Videocall</p>
                {selected.video_call_link ? (
                  <a
                    href={selected.video_call_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1.5"
                  >
                    <Video className="h-3.5 w-3.5" />
                    Call beitreten
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Noch kein Videolink hinterlegt</p>
                )}
              </div>

              {/* Lead email */}
              {selected.leads?.email && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                  {selected.leads.email}
                </div>
              )}

              {/* Notes */}
              {selected.setter_notes && (
                <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Notizen</p>
                  <p className="text-sm text-foreground/80 whitespace-pre-line">{selected.setter_notes}</p>
                </div>
              )}

              {/* Navigate to Workspace / Lead Details */}
              {selected.lead_id && (
                <Button
                  variant="default"
                  size="sm"
                  className="w-full text-xs gap-1.5"
                  onClick={() => {
                    setSelected(null);
                    if (isAdmin) {
                      routerNavigate(`/members/admin-workspace?lead=${selected.lead_id}`);
                    } else {
                      routerNavigate(`/members/setter-workspace?lead=${selected.lead_id}`);
                    }
                  }}
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  Lead-Details im Workspace öffnen
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs gap-1.5"
                onClick={() => {
                  const id = selected.id;
                  setSelected(null);
                  setDeepLinkApptId(id);
                }}
              >
                Vollständiger Lead-Kontext
              </Button>


              {/* Export Actions */}
              <div className="border-t border-border pt-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Kalender-Export
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5"
                    onClick={() => {
                      const event = buildEvent(selected);
                      window.open(googleCalendarUrl(event), '_blank');
                    }}
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                    Google Calendar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5"
                    onClick={() => {
                      const event = buildEvent(selected);
                      window.open(outlookCalendarUrl(event), '_blank');
                    }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Outlook
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5"
                    onClick={() => {
                      downloadICS(buildEvent(selected));
                      toast({ title: 'ICS heruntergeladen' });
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                    .ics Download
                  </Button>
                </div>
              </div>
            </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <AppointmentDetailModal
        appointmentId={deepLinkApptId}
        open={!!deepLinkApptId}
        onOpenChange={(o) => {
          if (!o) {
            setDeepLinkApptId(null);
            setDeepLinkResolveTarget(null);
          }
        }}
        resolveTarget={deepLinkResolveTarget}
      />

      <LeadExportModal open={exportOpen} onOpenChange={setExportOpen} />

      <CreateAppointmentModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => fetchAppointments()}
        defaultDate={currentDate}
      />

      {/* DnD Confirmation — Drawer on mobile, Dialog on desktop */}
      {(() => {
        const confirmContent = pendingDrop && (
          <div className="space-y-3 py-2 px-1 animate-fade-in">
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Lead</p>
              <p className="text-sm font-medium text-foreground">{pendingDrop.data.leadName || 'Termin'}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Vorher</p>
                <p className="text-sm text-foreground">
                  {new Date(pendingDrop.data.startsAt).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(pendingDrop.data.startsAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })}
                </p>
              </div>
              <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-primary font-semibold">Nachher</p>
                <p className="text-sm text-foreground">
                  {pendingDrop.newStart.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' })}
                </p>
                <p className="text-xs text-primary">
                  {pendingDrop.newStart.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })}
                </p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Der alte Termin wird auf „verschoben" gesetzt. Ein neuer Termin wird erstellt.
            </p>
            <div className={cn("flex gap-2 pt-1", isMobile && "flex-col")}>
              <Button variant="outline" className={cn("flex-1", isMobile && "h-12 text-base")} onClick={cancelDrop}>
                Abbrechen
              </Button>
              <Button className={cn("flex-1", isMobile && "h-12 text-base")} onClick={() => {
                haptic.medium();
                confirmDrop();
              }} disabled={dndProcessing}>
                {dndProcessing ? (
                  <>
                    <Clock className="mr-1.5 h-4 w-4 animate-spin" />
                    Verschiebe…
                  </>
                ) : (
                  'Verschieben'
                )}
              </Button>
            </div>
          </div>
        );

        const isOpen = !!pendingDrop || !!longPressAppt;
        const onClose = () => { cancelDrop(); setLongPressAppt(null); };

        if (isMobile) {
          return (
            <Drawer open={isOpen} onOpenChange={(o) => {
              if (!o) { haptic.light(); onClose(); }
            }}>
              <DrawerContent className="px-4 pb-8 pt-2 animate-fade-in">
                <DrawerHeader className="px-0 pb-2">
                  <DrawerTitle className="flex items-center gap-2 text-base animate-fade-in">
                    <CalIcon className="h-5 w-5 text-primary" />
                    Termin verschieben?
                  </DrawerTitle>
                </DrawerHeader>
                {longPressAppt && !pendingDrop && (
                  <div className="space-y-3 py-2 px-1 animate-fade-in">
                    <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Lead</p>
                      <p className="text-sm font-medium text-foreground">{longPressAppt.leads?.name || 'Termin'}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Nutze das Termin-Detail, um diesen Termin auf einem neuen Zeitslot zu verschieben.
                    </p>
                    <div className="flex flex-col gap-2 pt-1">
                      <Button className="h-12 text-base" onClick={() => {
                        haptic.light();
                        setLongPressAppt(null);
                        setSelected(longPressAppt);
                      }}>
                        Termin öffnen
                      </Button>
                      <Button variant="outline" className="h-12 text-base" onClick={() => {
                        haptic.light();
                        setLongPressAppt(null);
                      }}>
                        Abbrechen
                      </Button>
                    </div>
                  </div>
                )}
                {confirmContent}
              </DrawerContent>
            </Drawer>
          );
        }

        return (
          <Dialog open={!!pendingDrop} onOpenChange={(open) => !open && cancelDrop()}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CalIcon className="h-4 w-4 text-primary" />
                  Termin verschieben?
                </DialogTitle>
              </DialogHeader>
              {confirmContent}
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
