/**
 * CalendarRouter
 * --------------
 * The "Kalender" menu entry resolves here. We then split based on the user's
 * current level:
 *   - Level >= 6  → OperatorCalendar (own calendar + team switcher)
 *   - otherwise   → regular MembersCalendar (own calendar only)
 *
 * Backend RPCs (`get_operator_team`, `get_team_member_calendar`) re-enforce the
 * Level >= 6 + subtree-membership check, so this client-side split is purely a
 * UX choice. Below-L6 users cannot reach another user's calendar even by URL
 * manipulation.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

const OperatorCalendar = lazy(() => import('./OperatorCalendar'));
const MembersCalendar = lazy(() => import('./Calendar'));

function CalendarFallback() {
  return (
    <div className="p-6 space-y-3">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function CalendarError({ error, onRetry }: { error: string; onRetry: () => void }) {
  const copySupport = async () => {
    const details = [
      `Zeitpunkt: ${new Date().toISOString()}`,
      `Route: ${typeof window !== 'undefined' ? window.location.pathname : '—'}`,
      `Fehler: ${error}`,
    ].join('\n');
    try { await navigator.clipboard.writeText(details); } catch { /* noop */ }
  };

  return (
    <div className="mx-auto max-w-md px-5 py-20 text-center space-y-4">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <span className="text-destructive text-xl">⚠</span>
      </div>
      <h2 className="text-lg font-semibold text-foreground">Kalender konnte nicht geladen werden</h2>
      <p className="text-sm text-muted-foreground">{error}</p>
      <div className="flex flex-col items-center gap-2">
        <Button onClick={onRetry} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Erneut versuchen
        </Button>
        <Button variant="ghost" size="sm" onClick={copySupport} className="text-xs text-muted-foreground">
          Support-Details kopieren
        </Button>
      </div>
    </div>
  );
}

export default function CalendarRouter() {
  const { user } = useAuth();
  const [level, setLevel] = useState<number | null>(null);
  const [resolved, setResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    if (!user) {
      setResolved(true);
      return;
    }
    (async () => {
      try {
        const { data, error: queryError } = await supabase
          .from('user_level_status')
          .select('current_level')
          .eq('user_id', user.id)
          .maybeSingle();
        if (cancelled) return;
        if (queryError) {
          console.error('[CalendarRouter] level query error', queryError);
          // Fall back to level 0 rather than blocking
          setLevel(0);
        } else {
          setLevel(typeof data?.current_level === 'number' ? data.current_level : 0);
        }
        setResolved(true);
      } catch (e: any) {
        console.error('[CalendarRouter] exception', e);
        if (!cancelled) {
          setError(e?.message || 'Kalender konnte nicht initialisiert werden.');
          setResolved(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, retryKey]);

  if (error) {
    return (
      <CalendarError
        error={error}
        onRetry={() => {
          setResolved(false);
          setError(null);
          setRetryKey(k => k + 1);
        }}
      />
    );
  }

  if (!resolved) {
    return <CalendarFallback />;
  }

  const Target = (level ?? 0) >= 6 ? OperatorCalendar : MembersCalendar;
  return (
    <Suspense fallback={<CalendarFallback />}>
      <Target />
    </Suspense>
  );
}
