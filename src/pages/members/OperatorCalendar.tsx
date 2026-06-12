/**
 * Operator Calendar Oversight (L6+)
 *
 * Team calendar with drag-and-drop reassignment support.
 * Drag an appointment card onto a team member in the sidebar to reassign.
 * All mutations go through security-definer RPCs.
 */
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getAppointmentLocalDate } from '@/lib/appointment-time-display';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';
import { haptic } from '@/lib/haptic';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Search, Users, Clock, ChevronLeft, ChevronRight, Download, FileText, CalendarClock, AlertTriangle, RefreshCw, Loader2, PlugZap, HelpCircle, Eye, MapPin, UserCheck, AlertCircle, Link as LinkIcon, Copy, ExternalLink, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SmartAlerts } from '@/components/calendar/SmartAlerts';
import { CreateAppointmentModal } from '@/components/calendar/CreateAppointmentModal';
import { MobileDayOverview } from '@/components/calendar/MobileDayOverview';
import {
  exportAppointmentsCSV,
  exportAppointmentsPDF,
  exportAppointmentsICS,
  exportAppointmentsGoogle,
  exportAppointmentsOutlook,
  getLocalTimeZone,
  getEventPreviews,
  buildGoogleExportPreview,
} from '@/lib/calendar-export';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { AppointmentTrigger } from '@/components/calendar/AppointmentTrigger';
import { ExportLeadsModal } from '@/components/calendar/ExportLeadsModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const TZ_STORAGE_KEY = 'operator-calendar:timezone';

// Curated short list — covers the operator base. Users can paste any IANA TZ
// via the "Detected" entry which always reflects their browser's resolved zone.
const TZ_OPTIONS: { value: string; label: string }[] = [
  { value: 'Europe/Berlin', label: 'Berlin / Wien / Zürich (CET/CEST)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Lisbon', label: 'Lisbon (WET/WEST)' },
  { value: 'Europe/Athens', label: 'Athens / Istanbul (EET/EEST)' },
  { value: 'America/New_York', label: 'New York (ET)' },
  { value: 'America/Chicago', label: 'Chicago (CT)' },
  { value: 'America/Denver', label: 'Denver (MT)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PT)' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (BRT)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
  { value: 'UTC', label: 'UTC' },
];

type TeamMember = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  level: number | null;
  role_label: string | null;
  member_role: string | null;
  appts_this_week: number;
  show_rate: number | null;
  close_rate: number | null;
  bookings_total: number | null;
  shows_total: number | null;
  deals_total: number | null;
  is_self: boolean | null;
};

type Appointment = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  call_type: string | null;
  appointment_status: string | null;
  call_status: string | null;
  outcome: string | null;
  pricing_tier: string | null;
  attendance_flag: boolean | null;
  lead_id: string | null;
};

type Slot = {
  date: string;
  max_bookings: number | null;
  current_bookings: number | null;
  is_active: boolean | null;
};

type CalendarPayload = { appointments: Appointment[]; slots: Slot[] };

type CalErrorKind = 'forbidden' | 'missing_rpc' | 'network' | 'auth' | 'unknown';
type CalError = { kind: CalErrorKind; message: string; raw?: string; op?: string; code?: string; details?: string; hint?: string };

function classifyError(e: any, scope: 'team' | 'calendar', op?: string): CalError {
  const raw = String(e?.message ?? e ?? '');
  const code = String(e?.code ?? '');
  const base = { raw, op, code: e?.code, details: e?.details, hint: e?.hint };
  if (/forbidden|permission denied|not authorized/i.test(raw)) {
    return { ...base, kind: 'forbidden', message: scope === 'team'
      ? 'Du hast keinen Zugriff auf das Team.'
      : 'Du hast keinen Zugriff auf diesen Kalender.' };
  }
  if (/jwt|auth|expired|invalid token/i.test(raw)) {
    return { ...base, kind: 'auth', message: 'Sitzung abgelaufen. Bitte neu anmelden.' };
  }
  if (/function .* does not exist|PGRST202|42883/i.test(raw) || code === '42883') {
    return { ...base, kind: 'missing_rpc', message:
      'Backend-Funktion nicht verfügbar. Eine Migration scheint zu fehlen.' };
  }
  if (/Failed to fetch|NetworkError|TypeError: fetch|ECONN/i.test(raw)) {
    return { ...base, kind: 'network', message: 'Verbindungsfehler. Bitte Internet prüfen.' };
  }
  return { ...base, kind: 'unknown', message: raw || 'Unbekannter Fehler beim Laden.' };
}

// Short, actionable next step per error kind.
function nextStepFor(kind: CalErrorKind, lang: 'de' | 'en'): string {
  const map: Record<CalErrorKind, [string, string]> = {
    forbidden:   ['Wende dich an deinen Director, um Zugriff zu erhalten.',
                  'Contact your director to request access.'],
    missing_rpc: ['Bitte den Admin, die ausstehende Datenbank-Migration auszuführen.',
                  'Ask the admin to run the pending database migration.'],
    network:     ['Prüfe deine Internetverbindung und klicke auf „Aktualisieren".',
                  'Check your internet connection and click “Refresh”.'],
    auth:        ['Logge dich neu ein, um die Sitzung zu erneuern.',
                  'Sign out and back in to refresh the session.'],
    unknown:     ['Klicke auf „Aktualisieren". Bleibt der Fehler, kontaktiere den Admin.',
                  'Click “Refresh”. If it persists, contact your admin.'],
  };
  return map[kind][lang === 'de' ? 0 : 1];
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay() || 7;
  if (day !== 1) x.setDate(x.getDate() - (day - 1));
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function fmtDate(d: Date): string {
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
}

function statusTone(s: string | null): string {
  switch ((s || '').toLowerCase()) {
    case 'completed':
    case 'showed':
      return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30';
    case 'no_show':
    case 'cancelled':
      return 'bg-rose-500/15 text-rose-700 border-rose-500/30';
    case 'scheduled':
    case 'confirmed':
      return 'bg-blue-500/15 text-blue-700 border-blue-500/30';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

// ── SWR sessionStorage helpers ──
const TEAM_CACHE_KEY = 'etc:cal:team:v1';
const OVERVIEW_CACHE_KEY = 'etc:cal:overview:v1';
const CAL_CACHE_PREFIX = 'etc:cal:member:v1:';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

interface CacheEntry<T> { ts: number; data: T }

function readCache<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL_MS) { sessionStorage.removeItem(key); return null; }
    return entry.data;
  } catch { return null; }
}

function writeCache<T>(key: string, data: T) {
  try { sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data } as CacheEntry<T>)); } catch { /* quota */ }
}

export default function OperatorCalendar() {
  const { user } = useAuth();
  const { tx, lang } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamMember[] | null>(() => readCache<TeamMember[]>(TEAM_CACHE_KEY));
  const [loadingTeam, setLoadingTeam] = useState(() => !readCache<TeamMember[]>(TEAM_CACHE_KEY));
  const [overview, setOverview] = useState<{ team_size: number; appts_today: number } | null>(
    () => readCache<{ team_size: number; appts_today: number }>(OVERVIEW_CACHE_KEY)
  );
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const cached = readCache<TeamMember[]>(TEAM_CACHE_KEY);
    if (!cached) return null;
    const self = cached.find(m => m.is_self) ?? cached[0];
    return self?.user_id ?? null;
  });
  const [view, setView] = useState<'week' | 'day'>('week');
  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date());
  const [scope, setScope] = useState<'all' | 'today' | 'week'>('all');

  const applyScope = (next: 'all' | 'today' | 'week') => {
    setScope(next);
    if (next === 'today') {
      setView('day');
      setAnchorDate(new Date());
    } else if (next === 'week') {
      setView('week');
      setAnchorDate(new Date());
    }
  };
  const [calendar, setCalendar] = useState<CalendarPayload | null>(null);
  const [loadingCal, setLoadingCal] = useState(false);
  const [calError, setCalError] = useState<CalError | null>(null);
  const [teamError, setTeamError] = useState<CalError | null>(null);
  const [teamReloadTick, setTeamReloadTick] = useState(0);
  const [calReloadTick, setCalReloadTick] = useState(0);
  const [exportTz, setExportTz] = useState<string>(() => {
    if (typeof window === 'undefined') return getLocalTimeZone();
    try {
      return window.localStorage.getItem(TZ_STORAGE_KEY) || getLocalTimeZone();
    } catch {
      return getLocalTimeZone();
    }
  });
  useEffect(() => {
    try { window.localStorage.setItem(TZ_STORAGE_KEY, exportTz); } catch { /* ignore */ }
  }, [exportTz]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const detectedTz = useMemo(() => getLocalTimeZone(), []);
  const tzOptions = useMemo(() => {
    const has = TZ_OPTIONS.some(o => o.value === detectedTz);
    return has ? TZ_OPTIONS : [{ value: detectedTz, label: `${detectedTz} (detected)` }, ...TZ_OPTIONS];
  }, [detectedTz]);
  const reloadAll = () => {
    setTeamReloadTick(t => t + 1);
    setCalReloadTick(t => t + 1);
  };
  const [reconnecting, setReconnecting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // ── Drag-and-drop reassignment state ──
  const APPT_DRAG_MIME = 'application/x-etc-appt-reassign';
  const [dragAppt, setDragAppt] = useState<{ id: string; leadId: string | null; currentOwnerId: string | null } | null>(null);
  const [dropMemberId, setDropMemberId] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState(false);
  const [pendingReassign, setPendingReassign] = useState<{ apptId: string; memberId: string; memberName: string } | null>(null);

  const handleApptDragStart = useCallback((e: React.DragEvent, appt: Appointment) => {
    const data = { id: appt.id, leadId: appt.lead_id, currentOwnerId: (appt as any).current_owner_id };
    setDragAppt(data);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(APPT_DRAG_MIME, JSON.stringify(data));
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.opacity = '0.4';
  }, []);

  const handleApptDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.opacity = '1';
    setDragAppt(null);
    setDropMemberId(null);
  }, []);

  const handleMemberDragOver = useCallback((e: React.DragEvent, memberId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropMemberId(memberId);
  }, []);

  const handleMemberDragLeave = useCallback(() => {
    setDropMemberId(null);
  }, []);

  const handleMemberDrop = useCallback((e: React.DragEvent, memberId: string) => {
    e.preventDefault();
    setDropMemberId(null);
    const raw = e.dataTransfer.getData(APPT_DRAG_MIME);
    if (!raw) return;
    let data: { id: string; leadId: string | null; currentOwnerId: string | null };
    try { data = JSON.parse(raw); } catch { return; }
    setDragAppt(null);

    if (data.currentOwnerId === memberId) {
      toast({ title: tx('Bereits zugewiesen', 'Already assigned'), description: tx('Dieses Teammitglied besitzt den Termin bereits.', 'This team member already owns the appointment.') });
      return;
    }

    const memberName = team?.find(m => m.user_id === memberId)?.full_name || tx('Teammitglied', 'Team member');
    setPendingReassign({ apptId: data.id, memberId, memberName });
  }, [team, toast, tx]);

  const confirmReassign = useCallback(async () => {
    if (!pendingReassign) return;
    const { apptId, memberId, memberName } = pendingReassign;
    setPendingReassign(null);
    setReassigning(true);
    try {
      const { data: result, error } = await supabase.rpc('reassign_appointment', {
        p_appointment_id: apptId,
        p_new_owner_id: memberId,
        p_new_owner_role: 'closer',
        p_reassignment_type: 'reassignment',
        p_reason: 'drag_and_drop_operator_calendar',
        _action_source: 'drag_and_drop',
      });
      if (error) {
        toast({ title: tx('Zuweisung fehlgeschlagen', 'Reassignment failed'), description: error.message, variant: 'destructive' });
        return;
      }
      const res = result as any;
      if (res && res.success === false) {
        toast({ title: tx('Zuweisung abgelehnt', 'Reassignment denied'), description: res.error || 'Unbekannter Fehler', variant: 'destructive' });
        return;
      }

      // Undo toast via sonner — revert to previous owner within 6 seconds
      const prevOwnerId = res?.previous_owner_id;
      const prevOwnerRole = res?.previous_owner_role;
      if (prevOwnerId && prevOwnerRole) {
        sonnerToast.success(tx('✓ Termin zugewiesen', '✓ Appointment reassigned'), {
          description: tx(`Übertragen an ${memberName}`, `Transferred to ${memberName}`),
          duration: 6000,
          action: {
            label: tx('Rückgängig', 'Undo'),
            onClick: async () => {
              try {
                const { data: undoRes, error: undoErr } = await supabase.rpc('reassign_appointment', {
                  p_appointment_id: res?.appointment_id ?? apptId,
                  p_new_owner_id: prevOwnerId,
                  p_new_owner_role: prevOwnerRole,
                  p_reassignment_type: 'reassignment',
                  p_reason: 'undo_reassignment',
                  _action_source: 'drag_and_drop',
                });
                if (undoErr || !(undoRes as any)?.success) {
                  sonnerToast.error(tx('Rückgängig fehlgeschlagen', 'Undo failed'));
                  return;
                }
                sonnerToast.success(tx('Zuweisung rückgängig gemacht', 'Reassignment undone'));
                reloadAll();
              } catch {
                sonnerToast.error(tx('Rückgängig fehlgeschlagen', 'Undo failed'));
              }
            },
          },
        });
      } else {
        sonnerToast.success(tx('✓ Termin zugewiesen', '✓ Appointment reassigned'), {
          description: tx(`Übertragen an ${memberName}`, `Transferred to ${memberName}`),
        });
      }
      reloadAll();
    } catch (err: any) {
      toast({ title: tx('Fehler', 'Error'), description: err?.message || String(err), variant: 'destructive' });
    } finally {
      setReassigning(false);
    }
  }, [pendingReassign, toast, tx]);

  const cancelReassign = useCallback(() => { setPendingReassign(null); }, []);

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      setTeam(null);
      setOverview(null);
      setCalendar(null);
      setTeamError(null);
      setCalError(null);
      // Clear SWR caches
      try { sessionStorage.removeItem(TEAM_CACHE_KEY); sessionStorage.removeItem(OVERVIEW_CACHE_KEY); } catch { /* */ }
      try {
        await supabase.auth.refreshSession();
      } catch (refreshErr) {
        if (import.meta.env.DEV) {
          console.warn('[OperatorCalendar] session refresh failed', refreshErr);
        }
      }
      toast({
        title: tx('Verbindung erneuert', 'Connection refreshed'),
        description: tx(
          'Cache geleert und Sitzung neu initialisiert.',
          'Cache cleared and session re-initialized.'
        ),
      });
      reloadAll();
    } finally {
      setReconnecting(false);
    }
  };

  // Load team + today overview — SWR pattern: show cached, refresh in background
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const hasCached = !!team && team.length > 0;
    // Only show full loading if no cached data
    if (!hasCached) setLoadingTeam(true);
    setTeamError(null);
    (async () => {
      let failedOp: string | undefined;
      try {
        // Fire mat-view refresh in background (fire-and-forget)
        Promise.resolve(supabase.rpc('refresh_team_performance_cache' as never)).then(() => {
          if (import.meta.env.DEV) console.debug('[OperatorCalendar] mat view refreshed');
        }).catch(() => { /* non-critical */ });

        const [teamRes, ovRes] = await Promise.all([
          supabase.rpc('get_operator_team', { _director: null }),
          supabase.rpc('get_team_today_overview', { _director: null }),
        ]);
        const { data: teamData, error: teamErr } = teamRes;
        const { data: ov, error: ovErr } = ovRes;
        if (cancelled) return;
        if (teamErr) { failedOp = 'get_operator_team'; throw teamErr; }
        if (ovErr) { failedOp = 'get_team_today_overview'; throw ovErr; }
        const list = (teamData as TeamMember[]) ?? [];
        setTeam(list);
        writeCache(TEAM_CACHE_KEY, list);
        if (!selectedId) {
          const self = list.find(m => m.is_self) ?? list[0];
          if (self) setSelectedId(self.user_id);
        }
        if (ov && typeof ov === 'object') {
          setOverview(ov as any);
          writeCache(OVERVIEW_CACHE_KEY, ov);
        }

        if (import.meta.env.DEV) {
          const self = list.find(m => m.is_self);
          console.debug('[OperatorCalendar] team loaded', {
            caller: { id: user?.id, email: user?.email, level: self?.level ?? null },
            team_size: list.length,
            others: list.filter(m => !m.is_self).length,
            reason_if_empty: list.length === 0
              ? 'no subtree members and no workspace fallback (check product_key + L2-L5 users)'
              : null,
          });
        }
      } catch (e: any) {
        if (!cancelled) {
          setTeamError(classifyError(e, 'team', failedOp));
          console.error('[OperatorCalendar] TEAM RPC failed', {
            scope: 'team',
            rpcs: ['get_operator_team', 'get_team_today_overview'],
            caller: { id: user?.id, email: user?.email },
            tick: teamReloadTick,
            code: e?.code,
            message: e?.message,
            details: e?.details,
            hint: e?.hint,
            error: e,
          });
        }
      } finally {
        if (!cancelled) setLoadingTeam(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, teamReloadTick]);

  // Range for selected view.
  const range = useMemo(() => {
    if (view === 'day') {
      const from = new Date(anchorDate);
      from.setHours(0, 0, 0, 0);
      return { from, to: addDays(from, 1) };
    }
    const from = startOfWeek(anchorDate);
    return { from, to: addDays(from, 7) };
  }, [view, anchorDate]);

  // Load calendar when selection or range changes — SWR pattern
  useEffect(() => {
    if (!selectedId) {
      setCalendar(null);
      return;
    }
    let cancelled = false;
    const cacheKey = CAL_CACHE_PREFIX + selectedId + ':' + range.from.toISOString().slice(0, 10) + ':' + range.to.toISOString().slice(0, 10);
    const cached = readCache<CalendarPayload>(cacheKey);
    if (cached) {
      setCalendar(cached);
      setLoadingCal(false); // instant render
    } else {
      setLoadingCal(true);
    }
    setCalError(null);
    (async () => {
      try {
        const { data, error: rpcErr } = await supabase.rpc('get_team_member_calendar', {
          _member: selectedId,
          _from: range.from.toISOString(),
          _to: range.to.toISOString(),
        });
        if (cancelled) return;
        if (rpcErr) throw rpcErr;
        const payload = (data as CalendarPayload) ?? { appointments: [], slots: [] };
        setCalendar(payload);
        writeCache(cacheKey, payload);
      } catch (e: any) {
        if (!cancelled) {
          setCalError(classifyError(e, 'calendar', 'get_team_member_calendar'));
          console.error('[OperatorCalendar] CALENDAR RPC failed', {
            scope: 'calendar',
            rpc: 'get_team_member_calendar',
            args: {
              _member: selectedId,
              _from: range.from.toISOString(),
              _to: range.to.toISOString(),
            },
            tick: calReloadTick,
            code: e?.code,
            message: e?.message,
            details: e?.details,
            hint: e?.hint,
            error: e,
          });
        }
      } finally {
        if (!cancelled) setLoadingCal(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId, range.from, range.to, calReloadTick]);

  const filteredTeam = useMemo(() => {
    if (!team) return null;
    const q = search.trim().toLowerCase();
    if (!q) return team;
    return team.filter(m =>
      (m.full_name || '').toLowerCase().includes(q) ||
      (m.email || '').toLowerCase().includes(q)
    );
  }, [team, search]);

  const selected = team?.find(m => m.user_id === selectedId) ?? null;

  // Group appointments by day for week view.
  const apptsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    if (!calendar) return map;
    for (const a of calendar.appointments) {
      // Use timezone-aware local date to avoid +1 day offset (UTC vs Europe/Berlin)
      const key = getAppointmentLocalDate({
        starts_at: a.starts_at,
        booking_timezone: (a as any).booking_timezone ?? undefined,
        original_local_date: (a as any).original_local_date ?? undefined,
      });
      if (!key) continue;

      // ── Structured diagnostic: detect UTC vs local date mismatch ──
      if (import.meta.env.DEV && a.starts_at) {
        const utcDate = (a.starts_at as string).slice(0, 10);
        if (utcDate !== key) {
          console.info(
            `[Calendar·Grouping] TZ shift detected — apt=${a.id} utcDate=${utcDate} localDate=${key} tz=${(a as any).booking_timezone ?? "browser"} owner=${(a as any).current_owner_id ?? "—"}`
          );
        }
      }

      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [calendar]);

  const days = useMemo(() => {
    const n = view === 'day' ? 1 : 7;
    return Array.from({ length: n }, (_, i) => addDays(range.from, i));
  }, [range.from, view]);


  // Resolve the lead's email for an appointment, then route into the
  // existing /booking reschedule flow (no new backend logic).
  const handleReschedule = async (appt: Appointment) => {
    if (!appt.lead_id) {
      toast({
        title: tx('Kein Lead verknüpft', 'No lead linked'),
        description: tx(
          'Dieser Termin hat keinen verknüpften Lead und kann nicht verschoben werden.',
          'This appointment has no linked lead and cannot be rescheduled.'
        ),
        variant: 'destructive',
      });
      return;
    }
    setReschedulingId(appt.id);
    try {
      const { data, error: leadErr } = await supabase
        .from('leads')
        .select('email')
        .eq('id', appt.lead_id)
        .maybeSingle();
      if (leadErr) throw leadErr;
      const email = data?.email?.trim().toLowerCase();
      if (!email) {
        toast({
          title: tx('E-Mail nicht gefunden', 'Email not found'),
          description: tx(
            'Für diesen Lead konnte keine E-Mail ermittelt werden.',
            'No email could be resolved for this lead.'
          ),
          variant: 'destructive',
        });
        return;
      }
      navigate(`/booking?reschedule=true&email=${encodeURIComponent(email)}`);
    } catch (e: any) {
      toast({
        title: tx('Fehler', 'Error'),
        description: e?.message ?? String(e),
        variant: 'destructive',
      });
    } finally {
      setReschedulingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground md:text-3xl">
            {tx('Kalender', 'Calendar')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tx(
              'Wechsle zwischen deinem eigenen Kalender und den Kalendern deiner Team-Mitglieder.',
              'Switch between your own calendar and the calendars of your team members.'
            )}
          </p>
        </div>
        <div className="flex items-end gap-3">
          {overview && (
            <>
              <div className="rounded-lg border border-border bg-card px-4 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {tx('Team', 'Team')}
                </p>
                <p className="font-display text-xl font-semibold">{overview.team_size}</p>
              </div>
              <div className="rounded-lg border border-border bg-card px-4 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {tx('Heute', 'Today')}
                </p>
                <p className="font-display text-xl font-semibold">{overview.appts_today}</p>
              </div>
            </>
          )}
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            {tx('Neu', 'New')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
            <Download className="mr-1.5 h-4 w-4" />
            Export
          </Button>
        </div>
      </header>

      {(teamError || calError) && (() => {
        const err = teamError ?? calError!;
        const hint = (() => {
          switch (err.kind) {
            case 'forbidden':
              return tx(
                'Dieser Kalender ist nicht für deine Rolle freigegeben. Wende dich an deinen Director.',
                'This calendar is not available for your role. Please contact your director.'
              );
            case 'missing_rpc':
              return tx(
                'Die Backend-Funktionen für den Team-Kalender fehlen. Bitte führe die ausstehende Datenbank-Migration aus oder informiere den Admin.',
                'The team calendar backend functions are missing. Please run the pending database migration or contact your admin.'
              );
            case 'network':
              return tx(
                'Wir konnten den Server nicht erreichen. Prüfe deine Verbindung und versuche es erneut.',
                'We could not reach the server. Check your connection and try again.'
              );
            case 'auth':
              return tx(
                'Deine Sitzung ist abgelaufen. Bitte logge dich neu ein.',
                'Your session has expired. Please log in again.'
              );
            default:
              return tx(
                'Etwas ist schiefgelaufen. Versuche es erneut — falls das Problem bleibt, kontaktiere den Admin.',
                'Something went wrong. Try again — if the issue persists, contact your admin.'
              );
          }
        })();
        const title = teamError
          ? tx('Team konnte nicht geladen werden', 'Could not load team')
          : tx('Kalender konnte nicht geladen werden', 'Could not load calendar');
        return (
          <div
            role="alert"
            className="mb-4 flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium text-destructive">{title}</p>
                <p className="text-destructive/90">{tx(err.message, err.message)}</p>
                <p className="text-xs text-destructive/70">{hint}</p>
                {((teamError && team && team.length > 0) || (calError && calendar)) && (
                  <p className="text-[11px] italic text-destructive/70">
                    {tx(
                      'Es werden weiterhin die zuletzt erfolgreich geladenen Daten angezeigt.',
                      'Showing the last successfully loaded data.'
                    )}
                  </p>
                )}
                {err.raw && err.raw !== err.message && (
                  <details className="mt-1 text-[11px] text-destructive/60">
                    <summary className="cursor-pointer">{tx('Technische Details', 'Technical details')}</summary>
                    <pre className="mt-1 whitespace-pre-wrap break-all">{err.raw}</pre>
                  </details>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
              {(() => {
                // A retry is in flight if the section we'd re-fire is still loading.
                const teamRetrying = !!teamError && loadingTeam;
                const calRetrying = !!calError && loadingCal;
                const isRetrying = teamRetrying || calRetrying;
                return (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isRetrying || (!teamError && !calError)}
                    aria-busy={isRetrying}
                    title={
                      isRetrying
                        ? tx('Wiederholung läuft…', 'Retry in progress…')
                        : tx('Nur fehlgeschlagenen Bereich neu laden', 'Reload only the failing section')
                    }
                    onClick={() => {
                      if (isRetrying) return;
                      // Per-section retry: only re-fire the failing RPC.
                      const scopes: string[] = [];
                      if (teamError) scopes.push('team');
                      if (calError) scopes.push('calendar');
                      // eslint-disable-next-line no-console
                      console.info('[OperatorCalendar] retry clicked', {
                        scope: scopes.length === 2 ? 'both' : (scopes[0] ?? 'none'),
                        will_retry: scopes,
                        rpcs_to_retry: [
                          ...(teamError ? ['get_operator_team', 'get_team_today_overview'] : []),
                          ...(calError ? ['get_team_member_calendar'] : []),
                        ],
                        team_error: teamError ? { kind: teamError.kind, message: teamError.message } : null,
                        cal_error: calError ? { kind: calError.kind, message: calError.message } : null,
                      });
                      if (teamError) setTeamReloadTick(t => t + 1);
                      if (calError) setCalReloadTick(t => t + 1);
                    }}
                  >
                    {isRetrying
                      ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                    {isRetrying
                      ? tx(
                          teamRetrying && calRetrying
                            ? 'Lade Team & Kalender…'
                            : teamRetrying
                              ? 'Lade Team…'
                              : 'Lade Kalender…',
                          teamRetrying && calRetrying
                            ? 'Reloading team & calendar…'
                            : teamRetrying
                              ? 'Reloading team…'
                              : 'Reloading calendar…'
                        )
                      : tx('Erneut versuchen', 'Try again')}
                  </Button>
                );
              })()}
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={async () => {
                  const details = [
                    `timestamp: ${new Date().toISOString()}`,
                    `route: ${window.location.pathname}`,
                    `user_id: ${user?.id ?? '—'}`,
                    `user_level: ${selected?.level ?? '—'}`,
                    `selected_range: ${range.from.toISOString()} → ${range.to.toISOString()}`,
                    `failing_query: ${err.op ?? '—'}`,
                    `supabase_code: ${err.code ?? '—'}`,
                    `supabase_message: ${err.message}`,
                    `supabase_details: ${err.details ?? '—'}`,
                    `supabase_hint: ${err.hint ?? '—'}`,
                    `browser: ${navigator.userAgent}`,
                    err.raw ? `raw: ${err.raw}` : '',
                  ].filter(Boolean).join('\n');
                  try {
                    await navigator.clipboard.writeText(details);
                    toast({ title: tx('Support-Details kopiert', 'Support details copied') });
                  } catch {
                    toast({ title: tx('Kopieren fehlgeschlagen', 'Copy failed'), variant: 'destructive' });
                  }
                }}
              >
                {tx('Support-Details kopieren', 'Copy support details')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReconnect}
                disabled={reconnecting}
                title={tx(
                  'Cache leeren und Verbindung zum Backend neu aufbauen',
                  'Clear cache and re-initialize backend connection'
                )}
              >
                {reconnecting
                  ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  : <PlugZap className="mr-1.5 h-3.5 w-3.5" />}
                {tx('Neu verbinden', 'Reconnect')}
              </Button>
            </div>
          </div>
        );
      })()}

      {/* Smart Alerts */}
      <SmartAlerts
        userIds={team?.map(m => m.user_id) ?? (user ? [user.id] : [])}
        isOperator={true}
        onAlertClick={(alert) => {
          if (alert.appointmentId) {
            // Use AppointmentTrigger pattern - set state to open modal
            const el = document.querySelector(`[data-appointment-id="${alert.appointmentId}"]`) as HTMLElement;
            if (el) el.click();
          }
        }}
      />

      {/* Mobile: "Mein Tag" overview */}
      {isMobile && (
        <MobileDayOverview
          appointments={calendar?.appointments ?? []}
          onAppointmentClick={(id) => {
            // Trigger AppointmentTrigger click via DOM
            const el = document.querySelector(`[data-appointment-id="${id}"]`) as HTMLElement;
            if (el) el.click();
          }}
        />
      )}

      {/* Drag reassignment hint */}
      {dragAppt && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-xs text-primary animate-in fade-in slide-in-from-top-1">
          <UserCheck className="h-3.5 w-3.5" />
          <span>{tx('Termin auf ein Teammitglied in der Seitenleiste ziehen, um zuzuweisen.', 'Drag appointment onto a team member in the sidebar to reassign.')}</span>
        </div>
      )}

      {/* Reassignment processing overlay */}
      {reassigning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-6 py-4 shadow-lg">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm font-medium text-foreground">{tx('Termin wird zugewiesen…', 'Reassigning appointment…')}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        {/* LEFT — Team list */}
        <aside className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={tx('Suchen…', 'Search…')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {tx('Kalender anzeigen von', 'Show calendar of')}
              {filteredTeam && <span className="ml-auto">{filteredTeam.length}</span>}
              <button
                type="button"
                onClick={() => {
                  if (loadingTeam) return;
                  // eslint-disable-next-line no-console
                  console.info('[OperatorCalendar] team refresh clicked', { scope: 'team' });
                  setTeamError(null);
                  setTeamReloadTick(t => t + 1);
                }}
                disabled={loadingTeam}
                aria-label={tx('Team neu laden', 'Refresh team')}
                title={tx('Team neu laden', 'Refresh team')}
                className={`${filteredTeam ? '' : 'ml-auto'} inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50`}
              >
                {loadingTeam
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />}
              </button>
            </div>
            {teamError && (
              <div role="alert" className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
                <p className="font-medium">
                  {tx('Team konnte nicht geladen werden', 'Could not load team')}
                  {teamError.op && (
                    <span className="ml-1 font-mono text-[10px] font-normal text-destructive/80">
                      ({teamError.op})
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-destructive/90">{tx(teamError.message, teamError.message)}</p>
                <p className="mt-0.5 text-destructive/70">→ {nextStepFor(teamError.kind, lang)}</p>
              </div>
            )}
            <ul className="max-h-[68vh] divide-y divide-border overflow-y-auto">
              {loadingTeam && !team && (
                <>
                  <li className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {tx('Team wird geladen…', 'Loading team…')}
                  </li>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <li key={i} className="p-3"><Skeleton className="h-12 w-full" /></li>
                  ))}
                </>
              )}
              {filteredTeam && filteredTeam.length === 0 && (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  {tx('Keine Team-Mitglieder gefunden.', 'No team members found.')}
                </li>
              )}
              {filteredTeam?.map(m => {
                const closeRatePct = m.close_rate != null ? Math.round(Number(m.close_rate) * 100) : null;
                const showRatePct = m.show_rate != null ? Math.round(Number(m.show_rate) * 100) : null;
                const scoreLabel = closeRatePct != null ? `${tx('Score', 'Score')} ${closeRatePct}` : null;
                const isSelected = selectedId === m.user_id;
                return (
                  <li key={m.user_id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(m.user_id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedId(m.user_id);
                        }
                      }}
                      onDragOver={dragAppt ? (e) => handleMemberDragOver(e, m.user_id) : undefined}
                      onDragLeave={dragAppt ? handleMemberDragLeave : undefined}
                      onDrop={dragAppt ? (e) => handleMemberDrop(e, m.user_id) : undefined}
                      className={cn(
                        'flex w-full cursor-pointer flex-col gap-1 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isSelected && 'bg-muted',
                        dropMemberId === m.user_id && 'bg-primary/10 ring-2 ring-primary/40 ring-inset',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {m.full_name || m.email || tx('Unbenannt', 'Unnamed')}
                          {m.is_self && (
                            <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                              ({tx('du', 'you')})
                            </span>
                          )}
                        </span>
                        {m.level != null && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                onClick={e => e.stopPropagation()}
                                className="shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label={tx(
                                  `Erklärung zu Level ${m.level}`,
                                  `Explanation for Level ${m.level}`
                                )}
                              >
                                <Badge
                                  variant="secondary"
                                  className="cursor-pointer text-[10px] underline-offset-2 hover:underline"
                                >
                                  L{m.level}
                                </Badge>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="end"
                              className="w-72 text-xs"
                              onClick={e => e.stopPropagation()}
                            >
                              <p className="mb-1 font-semibold text-foreground">
                                {tx(`Level ${m.level}`, `Level ${m.level}`)}
                                {m.role_label ? ` · ${m.role_label}` : ''}
                              </p>
                              <p className="mb-2 text-muted-foreground">
                                {tx(
                                  'Das Level beschreibt die Karrierestufe (L0 → L8). Es bestimmt, welche Leads zugewiesen werden, welche Räume sichtbar sind und welche Kalender du einsehen darfst.',
                                  'The level reflects the career stage (L0 → L8). It controls which leads are routed, which rooms are visible and whose calendars you can view.'
                                )}
                              </p>
                              <p className="text-muted-foreground">
                                {tx(
                                  'Höhere Level erhalten priorisierte Leads und Sichtbarkeit auf direkt unterstellte Team-Mitglieder.',
                                  'Higher levels receive priority leads and visibility into their direct reports.'
                                )}
                              </p>
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        {m.role_label && <span>{m.role_label}</span>}
                        {scoreLabel && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                onClick={e => e.stopPropagation()}
                                className="rounded text-[11px] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label={tx('Was bedeutet Score?', 'What does Score mean?')}
                              >
                                · {scoreLabel}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              className="w-80 text-xs"
                              onClick={e => e.stopPropagation()}
                            >
                              <p className="mb-1 font-semibold text-foreground">
                                {tx('Performance-Score', 'Performance score')}
                              </p>
                              <p className="mb-2 text-muted-foreground">
                                {tx(
                                  'Dieser Wert ist die Close-Rate über die letzten 30 Tage — der Anteil gezeigter Calls, die zu einem Abschluss geführt haben.',
                                  'This value is the close rate over the last 30 days — the share of shown calls that converted to a deal.'
                                )}
                              </p>
                              <ul className="mb-2 space-y-0.5 text-muted-foreground">
                                <li>· {tx('Close-Rate', 'Close rate')}: <span className="text-foreground">{closeRatePct}%</span></li>
                                {showRatePct != null && (
                                  <li>· {tx('Show-Rate', 'Show rate')}: <span className="text-foreground">{showRatePct}%</span></li>
                                )}
                                {m.deals_total != null && (
                                  <li>· {tx('Deals', 'Deals')}: <span className="text-foreground">{m.deals_total}</span></li>
                                )}
                              </ul>
                              <p className="text-muted-foreground">
                                {tx(
                                  'Routing nutzt 40% Kapazität · 40% Performance · 20% Fairness. Ein höherer Score erhöht den Performance-Anteil und damit die Wahrscheinlichkeit, neue qualifizierte Leads zu erhalten.',
                                  'Routing uses 40% capacity · 40% performance · 20% fairness. A higher score lifts the performance weight and the chance of receiving new qualified leads.'
                                )}
                              </p>
                            </PopoverContent>
                          </Popover>
                        )}
                        <span>· {m.appts_this_week} {tx('Termine/Woche', 'appts/week')}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        {/* RIGHT — Calendar */}
        <section className="rounded-xl border border-border bg-card">
          {!selected ? (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 p-10 text-center">
              <Calendar className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {tx('Wähle ein Team-Mitglied, um dessen Kalender zu sehen.',
                    'Select a team member to view their calendar.')}
              </p>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="font-display text-lg font-semibold">
                    {tx('Kalender von', 'Calendar of')}{' '}
                    {selected.is_self
                      ? tx('dir', 'you')
                      : (selected.full_name || selected.email || tx('Unbenannt', 'Unnamed'))}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {selected.email} {selected.level != null && <>· Level {selected.level}</>}
                    {selected.role_label ? ` · ${selected.role_label}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => setAnchorDate(addDays(anchorDate, view === 'day' ? -1 : -7))}
                    aria-label="Previous"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-[160px] text-center text-sm font-medium">
                    {view === 'day'
                      ? anchorDate.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })
                      : `${fmtDate(range.from)} – ${fmtDate(addDays(range.to, -1))}`}
                  </span>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => {
                      if (loadingCal) return;
                      // eslint-disable-next-line no-console
                      console.info('[OperatorCalendar] calendar refresh clicked', { scope: 'calendar', member: selectedId });
                      setCalError(null);
                      setCalReloadTick(t => t + 1);
                    }}
                    disabled={loadingCal}
                    aria-label={tx('Kalender neu laden', 'Refresh calendar')}
                    title={tx('Kalender neu laden', 'Refresh calendar')}
                  >
                    {loadingCal
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <RefreshCw className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => setAnchorDate(addDays(anchorDate, view === 'day' ? 1 : 7))}
                    aria-label="Next"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <div className="ml-2 flex rounded-md border border-border" role="group" aria-label={tx('Zeitraum', 'Scope')}>
                    {([
                      ['all', tx('Alle', 'All')],
                      ['today', tx('Heute', 'Today')],
                      ['week', tx('Diese Woche', 'This week')],
                    ] as const).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => applyScope(key)}
                        className={cn('px-3 py-1.5 text-xs', scope === key ? 'bg-muted font-medium' : '')}
                        aria-pressed={scope === key}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="ml-2 flex rounded-md border border-border">
                    <button
                      type="button"
                      onClick={() => setView('week')}
                      className={cn('px-3 py-1.5 text-xs', view === 'week' ? 'bg-muted font-medium' : '')}
                    >
                      {tx('Woche', 'Week')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setView('day')}
                      className={cn('px-3 py-1.5 text-xs', view === 'day' ? 'bg-muted font-medium' : '')}
                    >
                      {tx('Tag', 'Day')}
                    </button>
                  </div>
                  {(() => {
                    const exportMeta = {
                      memberName: selected.is_self
                        ? tx('Mein Kalender', 'My calendar')
                        : (selected.full_name || selected.email || tx('Unbenannt', 'Unnamed')),
                      memberEmail: selected.email,
                      rangeLabel: view === 'day'
                        ? anchorDate.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
                        : `${fmtDate(range.from)} – ${fmtDate(addDays(range.to, -1))}`,
                    };
                    const appts = calendar?.appointments ?? [];
                    return (
                      <div className="ml-2 flex flex-wrap items-center gap-1.5">
                        <Select value={exportTz} onValueChange={setExportTz}>
                          <SelectTrigger
                            className="h-8 w-[180px] text-xs"
                            title={tx(
                              'Zeitzone für Kalender-Export',
                              'Timezone for calendar export',
                            )}
                          >
                            <Clock className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                            <SelectValue placeholder={detectedTz} />
                          </SelectTrigger>
                          <SelectContent className="max-h-72">
                            {tzOptions.map(opt => (
                              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                {opt.label}
                                {opt.value === detectedTz && (
                                  <span className="ml-1 text-[10px] text-muted-foreground">
                                    · {tx('erkannt', 'detected')}
                                  </span>
                                )}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={loadingCal || appts.length === 0}
                          onClick={() => exportAppointmentsCSV(appts, exportMeta)}
                          title={tx('Als CSV exportieren', 'Export as CSV')}
                        >
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                          CSV
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={loadingCal || appts.length === 0}
                          onClick={() => exportAppointmentsPDF(appts, exportMeta)}
                          title={tx('Als PDF exportieren', 'Export as PDF')}
                        >
                          <FileText className="mr-1.5 h-3.5 w-3.5" />
                          PDF
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={loadingCal || appts.length === 0}
                          onClick={() => setPreviewOpen(true)}
                          title={tx('Vorschau der Kalender-Einträge', 'Preview calendar entries')}
                        >
                          <Eye className="mr-1.5 h-3.5 w-3.5" />
                          {tx('Vorschau', 'Preview')}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={loadingCal || appts.length === 0}
                              title={tx(
                                `Kalender herunterladen (${exportTz})`,
                                `Download calendar (${exportTz})`
                              )}
                            >
                              <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
                              {tx('Kalender', 'Calendar')}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-60">
                            <DropdownMenuLabel className="text-[11px]">
                              {tx('In Kalender öffnen', 'Open in calendar')}
                            </DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => exportAppointmentsGoogle(appts, exportMeta, { timeZone: exportTz })}>
                              <Calendar className="mr-2 h-3.5 w-3.5" />
                              <div className="flex flex-col">
                                <span>Google Calendar</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {appts.length === 1
                                    ? tx('Direkt öffnen', 'Open directly')
                                    : tx('.ics + Import-Seite', '.ics + Import page')}
                                </span>
                              </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => exportAppointmentsICS(appts, exportMeta, { timeZone: exportTz })}>
                              <Download className="mr-2 h-3.5 w-3.5" />
                              <div className="flex flex-col">
                                <span>iCalendar (.ics)</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {tx('Apple Calendar, universal', 'Apple Calendar, universal')}
                                </span>
                              </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => exportAppointmentsOutlook(appts, exportMeta, { timeZone: exportTz })}>
                              <Download className="mr-2 h-3.5 w-3.5" />
                              <div className="flex flex-col">
                                <span>Outlook (.ics)</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {tx('Outlook Desktop & Web', 'Outlook desktop & web')}
                                </span>
                              </div>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <div className="px-2 py-1.5">
                              <details className="group">
                                <summary className="flex cursor-pointer list-none items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground">
                                  <HelpCircle className="h-3 w-3" />
                                  {tx('Import-Anleitung', 'Import steps')}
                                  <ChevronRight className="ml-auto h-3 w-3 transition-transform group-open:rotate-90" />
                                </summary>
                                <div className="mt-2 space-y-2 text-[10px] leading-snug text-muted-foreground">
                                  <div>
                                    <p className="font-semibold text-foreground">Google Calendar</p>
                                    <ol className="ml-3.5 list-decimal space-y-0.5">
                                      <li>{tx('Datei .ics herunterladen', 'Download the .ics file')}</li>
                                      <li>{tx('calendar.google.com → ⚙ → Import & Export', 'calendar.google.com → ⚙ → Import & export')}</li>
                                      <li>{tx('Datei + Zielkalender wählen → Importieren', 'Pick file + target calendar → Import')}</li>
                                    </ol>
                                  </div>
                                  <div>
                                    <p className="font-semibold text-foreground">Apple Calendar</p>
                                    <ol className="ml-3.5 list-decimal space-y-0.5">
                                      <li>{tx('Auf .ics-Datei doppelklicken', 'Double-click the .ics file')}</li>
                                      <li>{tx('Kalender im Dialog auswählen → OK', 'Pick calendar in dialog → OK')}</li>
                                      <li>{tx('iPhone: Datei in Mail öffnen → „Alle hinzufügen“', 'iPhone: open file in Mail → "Add All"')}</li>
                                    </ol>
                                  </div>
                                  <div>
                                    <p className="font-semibold text-foreground">Outlook</p>
                                    <ol className="ml-3.5 list-decimal space-y-0.5">
                                      <li>{tx('Desktop: Datei → Öffnen & Exportieren → Importieren', 'Desktop: File → Open & Export → Import/Export')}</li>
                                      <li>{tx('Web: Kalender → Kalender hinzufügen → Aus Datei', 'Web: Calendar → Add calendar → Upload from file')}</li>
                                      <li>{tx('.ics-Datei wählen → Importieren', 'Select the .ics file → Import')}</li>
                                    </ol>
                                  </div>
                                  <p className="pt-1 text-muted-foreground/80">
                                    {tx(
                                      `Zeiten werden in der Zeitzone „${exportTz}“ importiert.`,
                                      `Times import in timezone "${exportTz}".`,
                                    )}
                                  </p>
                                </div>
                              </details>
                            </div>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="text-[10px] font-normal text-muted-foreground">
                              {tx('Zeitzone', 'Timezone')}: <span className="font-mono">{exportTz}</span>
                              <br />
                              {appts.length}{' '}
                              {appts.length === 1
                                ? tx('Termin', 'event')
                                : tx('Termine', 'events')}
                            </DropdownMenuLabel>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Grid */}
              <div className="p-4">
                {calError && (
                  <div role="alert" className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <p className="font-medium">
                      {tx('Kalender konnte nicht geladen werden', 'Could not load calendar')}
                      {calError.op && (
                        <span className="ml-1 font-mono text-[10px] font-normal text-destructive/80">
                          ({calError.op})
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-destructive/90">{tx(calError.message, calError.message)}</p>
                    <p className="mt-0.5 text-destructive/70">→ {nextStepFor(calError.kind, lang)}</p>
                  </div>
                )}
                {loadingCal && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {tx('Kalender wird geladen…', 'Loading calendar…')}
                    </div>
                    <Skeleton className="h-64 w-full" />
                  </div>
                )}
                {!loadingCal && (
                  <div className={cn(
                    'grid gap-3',
                    view === 'day' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-7'
                  )}>
                    {days.map(d => {
                      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                      const dayAppts = apptsByDay.get(key) ?? [];
                      const slot = calendar?.slots.find(s => s.date === key);
                      const todayNow = new Date();
                      const isToday = key === `${todayNow.getFullYear()}-${String(todayNow.getMonth() + 1).padStart(2, '0')}-${String(todayNow.getDate()).padStart(2, '0')}`;
                      return (
                        <div
                          key={key}
                          className={cn(
                            'rounded-lg border border-border bg-background/40 p-2.5',
                            isToday && 'ring-1 ring-accent/60'
                          )}
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
                              {fmtDate(d)}
                            </span>
                            {slot && (
                              <span className="text-[10px] text-muted-foreground">
                                {slot.current_bookings ?? 0}/{slot.max_bookings ?? 0}
                              </span>
                            )}
                          </div>
                          {dayAppts.length === 0 ? (
                            <p className="py-2 text-center text-[11px] text-muted-foreground/60">
                              {tx('frei', 'free')}
                            </p>
                          ) : (
                            <ul className="space-y-1.5">
                              {dayAppts.map(a => {
                                const canDragAppt = a.lead_id && !['cancelled', 'no_show', 'completed', 'rescheduled'].includes((a.appointment_status || '').toLowerCase());
                                return (
                                <li
                                  key={a.id}
                                  draggable={!isMobile && !!canDragAppt}
                                  onDragStart={!isMobile && canDragAppt ? (e) => handleApptDragStart(e, a) : undefined}
                                  onDragEnd={!isMobile && canDragAppt ? handleApptDragEnd : undefined}
                                  className={cn(
                                    'touch-manipulation',
                                    canDragAppt && !isMobile && 'cursor-grab active:cursor-grabbing',
                                    dragAppt?.id === a.id && 'opacity-40'
                                  )}
                                >
                                  <AppointmentTrigger
                                    appointmentId={a.id}
                                    asChild
                                    className={cn(
                                      'block cursor-pointer rounded-md border px-2.5 transition hover:opacity-90',
                                      isMobile ? 'py-2.5 text-xs min-h-[44px]' : 'py-1.5 text-[11px]',
                                      statusTone(a.appointment_status)
                                    )}
                                  >
                                    <div className="flex items-center gap-1.5 font-medium">
                                      <Clock className={cn(isMobile ? "h-3.5 w-3.5" : "h-3 w-3")} />
                                      {fmtTime(a.starts_at)}
                                    </div>
                                    <div className="mt-0.5 truncate opacity-80">
                                      {a.call_type || tx('Call', 'Call')}
                                      {a.pricing_tier && ` · ${a.pricing_tier}`}
                                    </div>
                                    {a.lead_id && !['cancelled', 'no_show', 'completed'].includes((a.appointment_status || '').toLowerCase()) && (
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleReschedule(a); }}
                                        disabled={reschedulingId === a.id}
                                        className={cn(
                                          "mt-1.5 inline-flex w-full items-center justify-center gap-1 rounded border border-current/30 bg-background/60 font-medium opacity-90 transition hover:opacity-100 disabled:opacity-50",
                                          isMobile ? "px-2 py-2 text-xs min-h-[40px]" : "px-1.5 py-1 text-[10px]"
                                        )}
                                        title={tx('Termin verschieben', 'Reschedule appointment')}
                                      >
                                        <CalendarClock className={cn(isMobile ? "h-3.5 w-3.5" : "h-3 w-3")} />
                                        {reschedulingId === a.id
                                          ? tx('Lade…', 'Loading…')
                                          : tx('Verschieben', 'Reschedule')}
                                      </button>
                                    )}
                                  </AppointmentTrigger>
                                </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* Calendar export preview modal */}
      {selected && (() => {
        const appts = calendar?.appointments ?? [];
        const exportMeta = {
          memberName: selected.is_self
            ? tx('Mein Kalender', 'My calendar')
            : (selected.full_name || selected.email || tx('Unbenannt', 'Unnamed')),
          memberEmail: selected.email,
          rangeLabel: view === 'day'
            ? anchorDate.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
            : `${fmtDate(range.from)} – ${fmtDate(addDays(range.to, -1))}`,
        };
        const { previews, skipped, skippedDetails } = getEventPreviews(appts, { timeZone: exportTz, memberName: exportMeta.memberName });
        const repairLabel = (r: import('@/lib/calendar-export').RepairReason | null): { de: string; en: string } => {
          switch (r) {
            case 'ends_at_missing': return { de: 'Endzeit fehlte → 30 Min', en: 'end time missing → 30 min' };
            case 'ends_at_invalid': return { de: 'Endzeit ungültig → 30 Min', en: 'end time invalid → 30 min' };
            case 'ends_at_before_start': return { de: 'Ende vor Start → 30 Min', en: 'end before start → 30 min' };
            case 'duration_too_long': return { de: 'Dauer >24h → gekürzt', en: 'duration >24h → capped' };
            default: return { de: 'korrigiert', en: 'repaired' };
          }
        };
        const skipLabel = (r: import('@/lib/calendar-export').SkipReason): { de: string; en: string } => {
          switch (r) {
            case 'starts_at_missing': return { de: 'Startzeit fehlt', en: 'start time missing' };
            case 'starts_at_invalid': return { de: 'Startzeit ungültig', en: 'start time invalid' };
          }
        };
        const close = () => setPreviewOpen(false);
        return (
          <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  {tx('Kalender-Vorschau', 'Calendar preview')}
                </DialogTitle>
                <DialogDescription>
                  {tx(
                    `${previews.length} Termine · Zeitzone „${exportTz}“ · ${exportMeta.rangeLabel}`,
                    `${previews.length} events · timezone "${exportTz}" · ${exportMeta.rangeLabel}`,
                  )}
                  {skipped > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 text-amber-600">
                      <AlertCircle className="h-3 w-3" />
                      {tx(
                        `${skipped} ungültig — übersprungen`,
                        `${skipped} invalid — skipped`,
                      )}
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 p-2">
                <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <label className="text-xs text-muted-foreground shrink-0">
                  {tx('Vorschau-Zeitzone', 'Preview timezone')}
                </label>
                <Select value={exportTz} onValueChange={setExportTz}>
                  <SelectTrigger className="h-8 flex-1 text-xs">
                    <SelectValue placeholder={detectedTz} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {tzOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                        {opt.label}
                        {opt.value === detectedTz && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            · {tx('erkannt', 'detected')}
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {exportTz !== detectedTz && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setExportTz(detectedTz)}
                  >
                    {tx('Zurücksetzen', 'Reset')}
                  </Button>
                )}
              </div>

              <div className="max-h-[55vh] overflow-y-auto rounded-md border border-border">
                {previews.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    {tx('Keine exportierbaren Termine.', 'No exportable events.')}
                  </div>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {previews.map((p, i) => (
                      <li key={p.id} className="flex items-start gap-3 p-3">
                        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="font-medium text-foreground">{p.title}</span>
                            {p.repaired && (() => {
                              const r = repairLabel(p.repairReason);
                              return (
                                <span
                                  className="inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700"
                                  title={tx(`Repariert: ${r.de}`, `Repaired: ${r.en}`)}
                                >
                                  <AlertCircle className="h-2.5 w-2.5" />
                                  {tx(r.de, r.en)}
                                </span>
                              );
                            })()}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {p.startLabel} → {p.endLabel}
                              <span className="text-muted-foreground/70">({p.durationMin} min)</span>
                            </span>
                            {p.location && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                <span className="truncate max-w-[18rem]">{p.location}</span>
                              </span>
                            )}
                            {p.attendeeCount > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <UserCheck className="h-3 w-3" />
                                {p.attendeeCount}
                              </span>
                            )}
                          </div>
                          {p.descriptionLines.length > 0 && (
                            <details className="mt-1.5 text-xs">
                              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                {tx('Beschreibung anzeigen', 'Show description')}
                                <span className="ml-1 text-muted-foreground/60">({p.descriptionLines.length})</span>
                              </summary>
                              <pre className="mt-1 whitespace-pre-wrap rounded bg-muted/40 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
{p.descriptionLines.join('\n')}
                              </pre>
                            </details>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {skippedDetails.length > 0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                  <div className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {tx(
                      `${skippedDetails.length} übersprungen — kein Export möglich`,
                      `${skippedDetails.length} skipped — cannot be exported`,
                    )}
                  </div>
                  <ul className="space-y-1 text-xs">
                    {skippedDetails.map(s => {
                      const r = skipLabel(s.reason);
                      return (
                        <li key={s.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-medium text-foreground">{s.title}</span>
                          <span className="inline-flex items-center gap-0.5 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                            {tx(r.de, r.en)}
                          </span>
                          {s.rawStartsAt != null && s.rawStartsAt !== '' && (
                            <span className="font-mono text-[10px] text-muted-foreground/80">
                              starts_at = {String(s.rawStartsAt)}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {previews.length > 0 && (() => {
                const gp = buildGoogleExportPreview(appts, exportMeta, { timeZone: exportTz });
                const isSingle = gp.kind === 'single';
                const displayUrl = isSingle ? gp.url : gp.importPageUrl;
                const copyUrl = async () => {
                  try {
                    await navigator.clipboard.writeText(displayUrl);
                    toast({ title: tx('URL kopiert', 'URL copied') });
                  } catch {
                    toast({ title: tx('Kopieren fehlgeschlagen', 'Copy failed'), variant: 'destructive' });
                  }
                };
                return (
                  <div className="mt-3 rounded-md border border-border bg-muted/30 p-3 text-xs">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                        <LinkIcon className="h-3.5 w-3.5" />
                        {tx('Google Calendar Import-URL', 'Google Calendar import URL')}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {isSingle
                          ? tx('Einzelner Termin → Render-URL', 'Single event → render URL')
                          : gp.reason === 'multiple'
                            ? tx(`${gp.eventCount} Termine → .ics Upload-Seite`, `${gp.eventCount} events → .ics upload page`)
                            : tx('Ungültiger Start → .ics Upload-Seite', 'Invalid start → .ics upload page')}
                      </span>
                    </div>
                    <div className="break-all rounded bg-background px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                      {displayUrl}
                    </div>
                    {isSingle && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          {tx('Query-Parameter anzeigen', 'Show query parameters')}
                        </summary>
                        <table className="mt-1.5 w-full table-fixed text-[11px]">
                          <tbody>
                            {Object.entries(gp.params).map(([k, v]) => (
                              <tr key={k} className="border-t border-border/50">
                                <td className="w-20 py-1 pr-2 font-mono text-foreground align-top">{k}</td>
                                <td className="py-1 break-all font-mono text-muted-foreground">{v}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </details>
                    )}
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={copyUrl}>
                        <Copy className="mr-1 h-3 w-3" />
                        {tx('URL kopieren', 'Copy URL')}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" asChild>
                        <a href={displayUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="mr-1 h-3 w-3" />
                          {tx('In neuem Tab öffnen', 'Open in new tab')}
                        </a>
                      </Button>
                    </div>
                  </div>
                );
              })()}

              <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
                <Button variant="ghost" size="sm" onClick={close}>
                  {tx('Schließen', 'Close')}
                </Button>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={previews.length === 0}
                    onClick={() => { exportAppointmentsGoogle(appts, exportMeta, { timeZone: exportTz }); close(); }}
                  >
                    <Calendar className="mr-1.5 h-3.5 w-3.5" />
                    Google
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={previews.length === 0}
                    onClick={() => { exportAppointmentsOutlook(appts, exportMeta, { timeZone: exportTz }); close(); }}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Outlook
                  </Button>
                  <Button
                    size="sm"
                    disabled={previews.length === 0}
                    onClick={() => { exportAppointmentsICS(appts, exportMeta, { timeZone: exportTz }); close(); }}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    {tx('.ics herunterladen', 'Download .ics')}
                  </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      <ExportLeadsModal
        open={exportOpen}
        onOpenChange={setExportOpen}
        userLevel={team?.find(m => m.is_self)?.level ?? 1}
      />
      <CreateAppointmentModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={reloadAll}
        defaultDate={anchorDate}
        defaultUserId={selectedId ?? undefined}
      />

      {/* DnD Reassignment Confirmation — Drawer on mobile, Dialog on desktop */}
      {(() => {
        const reassignBody = pendingReassign && (
          <div className="space-y-3 py-2 px-1">
            <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-primary font-semibold">{tx('Neuer Eigentümer', 'New owner')}</p>
              <p className={cn("font-medium text-foreground mt-0.5", isMobile ? "text-base" : "text-sm")}>{pendingReassign.memberName}</p>
            </div>
            <p className={cn("text-muted-foreground", isMobile ? "text-xs" : "text-[11px]")}>
              {tx(
                'Der Termin wird diesem Teammitglied zugewiesen. Lead-Ownership (Owner, Setter/Closer) wird automatisch aktualisiert.',
                'The appointment will be assigned to this team member. Lead ownership (owner, setter/closer) is updated automatically.'
              )}
            </p>
            <div className={cn("flex gap-2 pt-1", isMobile && "flex-col")}>
              <Button variant="outline" className={cn("flex-1", isMobile && "h-12 text-base")} onClick={cancelReassign}>
                {tx('Abbrechen', 'Cancel')}
              </Button>
              <Button className={cn("flex-1", isMobile && "h-12 text-base")} onClick={() => {
                haptic.medium();
                confirmReassign();
              }} disabled={reassigning}>
                {reassigning ? (
                  <>
                    <Loader2 className={cn("mr-1.5 animate-spin", isMobile ? "h-4 w-4" : "h-3 w-3")} />
                    {tx('Zuweisen…', 'Assigning…')}
                  </>
                ) : (
                  tx('Zuweisen', 'Assign')
                )}
              </Button>
            </div>
          </div>
        );

        if (isMobile) {
          return (
            <Drawer open={!!pendingReassign} onOpenChange={(o) => {
              if (!o) { haptic.light(); cancelReassign(); }
            }}>
              <DrawerContent className="px-4 pb-8 pt-2 animate-fade-in">
                <DrawerHeader className="px-0 pb-2">
                  <DrawerTitle className="flex items-center gap-2 text-base animate-fade-in">
                    <UserCheck className="h-5 w-5 text-primary" />
                    {tx('Termin zuweisen?', 'Reassign appointment?')}
                  </DrawerTitle>
                </DrawerHeader>
                <div className="animate-fade-in">
                  {reassignBody}
                </div>
              </DrawerContent>
            </Drawer>
          );
        }

        return (
          <Dialog open={!!pendingReassign} onOpenChange={(open) => !open && cancelReassign()}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-primary" />
                  {tx('Termin zuweisen?', 'Reassign appointment?')}
                </DialogTitle>
              </DialogHeader>
              {reassignBody}
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
