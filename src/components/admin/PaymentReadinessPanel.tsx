import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { CheckCircle2, XCircle, HelpCircle, AlertTriangle } from 'lucide-react';

type ProbeStatus = 'loading' | 'live' | 'missing_secret' | 'unreachable';

function StatusIcon({ status }: { status: ProbeStatus }) {
  if (status === 'loading') return <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />;
  if (status === 'live') return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status === 'missing_secret') return <XCircle className="h-4 w-4 text-red-500" />;
  return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
}

function statusLabel(status: ProbeStatus): string {
  if (status === 'loading') return '...';
  if (status === 'live') return 'LIVE ✓';
  if (status === 'missing_secret') return 'MISSING SECRET ✗';
  return 'UNREACHABLE ?';
}

export default function PaymentReadinessPanel() {
  const { isAdmin } = useAuth();
  const [stripe, setStripe] = useState<ProbeStatus>('loading');
  const [email, setEmail] = useState<ProbeStatus>('loading');

  useEffect(() => {
    if (!isAdmin) return;

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    if (!projectId) {
      setStripe('unreachable');
      setEmail('unreachable');
      return;
    }

    const base = `https://${projectId}.supabase.co/functions/v1`;

    const probeStripe = fetch(`${base}/stripe-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then(res => {
        if (res.status === 503) setStripe('missing_secret');
        else setStripe('live');
      })
      .catch(() => setStripe('unreachable'));

    const probeEmail = fetch(`${base}/send-confirmation-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then(res => {
        if (res.status === 503) setEmail('missing_secret');
        else setEmail('live');
      })
      .catch(() => setEmail('unreachable'));

    Promise.all([probeStripe, probeEmail]);
  }, [isAdmin]);

  if (!isAdmin) return null;

  const hasMissing = stripe === 'missing_secret' || email === 'missing_secret';

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/40 bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Payment & E-Mail Readiness</h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border/30 bg-background px-4 py-3">
            <span className="text-sm font-medium text-foreground">Stripe Webhook</span>
            <div className="flex items-center gap-2">
              <StatusIcon status={stripe} />
              <span className={`text-xs font-semibold ${stripe === 'live' ? 'text-green-500' : stripe === 'missing_secret' ? 'text-red-500' : 'text-muted-foreground'}`}>
                {statusLabel(stripe)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/30 bg-background px-4 py-3">
            <span className="text-sm font-medium text-foreground">Email (Resend)</span>
            <div className="flex items-center gap-2">
              <StatusIcon status={email} />
              <span className={`text-xs font-semibold ${email === 'live' ? 'text-green-500' : email === 'missing_secret' ? 'text-red-500' : 'text-muted-foreground'}`}>
                {statusLabel(email)}
              </span>
            </div>
          </div>
        </div>

        {hasMissing && (
          <div className="flex items-start gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
            <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Fehlende Secrets verhindern Payments / E-Mails.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Konfiguriere sie unter: Edge Functions → Secrets
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
