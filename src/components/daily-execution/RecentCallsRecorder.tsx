import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import CallRecordingUpload from '@/components/members/CallRecordingUpload';
import CallTranscriptPaste from '@/components/members/CallTranscriptPaste';
import { Mic } from 'lucide-react';

interface CallRow {
  id: string;
  created_at: string;
  closed_at: string | null;
  result: string | null;
  transcript: string | null;
}

export default function RecentCallsRecorder() {
  const { user } = useAuth();
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    (async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('calls')
        .select('id, created_at, closed_at, result, transcript')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .eq('is_simulation', false)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(8);
      if (mounted) {
        setCalls((data ?? []) as CallRow[]);
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [user]);

  if (loading || calls.length === 0) return null;

  const missingTranscript = calls.filter(c => !c.transcript || c.transcript.length <= 50);
  if (missingTranscript.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-semibold">
          <span className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-muted-foreground" />
            Call-Aufnahmen hochladen
          </span>
          <Badge variant="secondary" className="text-[10px]">
            {missingTranscript.length} ohne Transkript
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Lade Aufnahmen abgeschlossener Calls hoch, damit das System Transkript, Analyse und Skript-Verbesserung automatisch erzeugt.
        </p>
        {missingTranscript.slice(0, 5).map(call => (
          <div key={call.id} className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Call vom {new Date(call.created_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</span>
              {call.result && <Badge variant="outline" className="text-[10px]">{call.result}</Badge>}
            </div>
            <CallRecordingUpload callId={call.id} />
            <CallTranscriptPaste callId={call.id} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
