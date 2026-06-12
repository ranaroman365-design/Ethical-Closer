import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Calendar, Clock, User, Download, ExternalLink, Video } from 'lucide-react';
import { downloadICS, googleCalendarUrl, outlookCalendarUrl } from '@/lib/calendar-utils';
import { formatAppointmentTime } from '@/lib/appointment-time-display';

interface AppointmentInfo {
  id: string;
  starts_at: string;
  ends_at: string;
  call_type: string;
  appointment_status: string;
  closer_name?: string;
}

export default function ApplicantAppointmentSection() {
  const { user } = useAuth();
  const [appointment, setAppointment] = useState<AppointmentInfo | null>(null);
  const [callLink, setCallLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [leadName, setLeadName] = useState('');
  const [bookingTimezone, setBookingTimezone] = useState<string | null>(null);
  const [originalLocalDate, setOriginalLocalDate] = useState<string | null>(null);
  const [originalLocalTime, setOriginalLocalTime] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchAppointment = async () => {
      const email = user.email ?? '';

      // Strategy 1: Find leads by email
      const { data: leads } = await supabase
        .from('leads')
        .select('id, name, booking_id, closer_id, owner_id')
        .eq('email', email)
        .order('updated_at', { ascending: false })
        .limit(5);

      let foundLead = leads?.[0] || null;
      let foundApt = null;

      if (leads && leads.length > 0) {
        const leadIds = leads.map(l => l.id);
        const { data: apt } = await supabase
          .from('appointments')
          .select('id, starts_at, ends_at, call_type, appointment_status, booking_timezone, original_local_date, original_local_time')
          .in('lead_id', leadIds)
          .not('appointment_status', 'in', '("cancelled","superseded")')
          .order('starts_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        foundApt = apt;
      }

      // Strategy 2: Fallback via owner_id
      if (!foundApt && user.id) {
        const { data: ownerLeads } = await supabase
          .from('leads')
          .select('id, name, booking_id, closer_id')
          .eq('owner_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(3);

        if (ownerLeads && ownerLeads.length > 0) {
          foundLead = foundLead || ownerLeads[0] as any;
          const ids = ownerLeads.map(l => l.id);
          const { data: apt2 } = await supabase
            .from('appointments')
            .select('id, starts_at, ends_at, call_type, appointment_status, booking_timezone, original_local_date, original_local_time')
            .in('lead_id', ids)
            .not('appointment_status', 'in', '("cancelled","superseded")')
            .order('starts_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (apt2) foundApt = apt2;
        }
      }

      if (foundLead) setLeadName(foundLead.name);

      if (foundApt) {
        let closerName: string | undefined;
        const closerId = foundLead?.closer_id;
        if (closerId) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', closerId)
            .maybeSingle();
          closerName = profile?.full_name || undefined;
        }
        setAppointment({ ...foundApt, closer_name: closerName });
        setBookingTimezone((foundApt as any).booking_timezone ?? null);
        setOriginalLocalDate((foundApt as any).original_local_date ?? null);
        setOriginalLocalTime((foundApt as any).original_local_time ?? null);
      }

      setCallLink('');
      setLoading(false);
    };
    fetchAppointment();
  }, [user]);

  if (loading) return null;
  if (!appointment) return null;

  const startDate = new Date(appointment.starts_at);
  const endDate = new Date(appointment.ends_at);
  const isPast = startDate < new Date();

  // Use shared timezone-aware utility (single source of truth)
  const displayResult = formatAppointmentTime({
    starts_at: appointment.starts_at,
    ends_at: appointment.ends_at,
    booking_timezone: bookingTimezone,
    original_local_date: originalLocalDate,
    original_local_time: originalLocalTime,
  });
  const displayDate = displayResult.date;
  const displayTime = displayResult.startTime;
  const displayEndTime = displayResult.endTime ?? format(endDate, 'HH:mm');

  const calEvent = {
    title: 'Strategiegespräch – Ethical Closing',
    start: startDate,
    end: endDate,
    description: `Dein persönliches Strategiegespräch${appointment.closer_name ? ` mit ${appointment.closer_name}` : ''}.`,
    location: callLink || 'Online',
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-serif flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Dein Termin
        </CardTitle>
        {leadName && (
          <p className="text-sm text-muted-foreground">Hallo {leadName.split(' ')[0]}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Appointment details */}
        <div className="rounded-lg border border-border bg-background p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">{displayDate}</p>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {displayTime} – {displayEndTime} Uhr
              </p>
            </div>
          </div>

          {appointment.closer_name && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span>Dein Gesprächspartner: <span className="font-medium text-foreground">{appointment.closer_name}</span></span>
            </div>
          )}

          <Badge variant={isPast ? 'secondary' : 'outline'} className={isPast ? '' : 'border-primary/30 text-primary'}>
            {isPast ? 'Vergangen' : appointment.appointment_status === 'confirmed' ? 'Bestätigt' : 'Geplant'}
          </Badge>
        </div>

        {/* Calendar export buttons — remembers last choice */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Zum Kalender hinzufügen</p>
          <div className="grid grid-cols-3 gap-2">
            {(['google', 'ical', 'outlook'] as const).map((cal) => {
              const preferred = localStorage.getItem('etc:preferred_calendar');
              const isPreferred = preferred === cal;
              const handleClick = () => {
                localStorage.setItem('etc:preferred_calendar', cal);
                if (cal === 'google') window.open(googleCalendarUrl(calEvent), '_blank');
                else if (cal === 'outlook') window.open(outlookCalendarUrl(calEvent), '_blank');
                else downloadICS(calEvent);
              };
              return (
                <Button
                  key={cal}
                  variant={isPreferred ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs"
                  onClick={handleClick}
                >
                  {cal === 'ical' && <Download className="mr-1 h-3 w-3" />}
                  {cal === 'google' ? 'Google' : cal === 'outlook' ? 'Outlook' : 'iCal'}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Call link */}
        {callLink && !isPast && (
          <Button className="w-full" onClick={() => window.open(callLink, '_blank')}>
            <Video className="mr-2 h-4 w-4" />
            Zum Call beitreten
            <ExternalLink className="ml-2 h-3.5 w-3.5" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
