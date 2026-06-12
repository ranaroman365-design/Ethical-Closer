import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Download, ExternalLink, Loader2, ShieldCheck, FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { normalizeBusinessStage } from '@/lib/stage-utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const STAGE_INDEX_ORDER = [
  'prospect', 'opener', 'setter', 'senior_associate',
  'junior_manager', 'manager', 'senior_manager', 'director', 'partner',
];

const PLAYBOOK_KEY = 'auszahlungspolitik';
const REQUIRED_LEVEL = 3;

/**
 * Direct landing page for the L3 "Auszahlungspolitik" playbook.
 * Reachable from the L3 promotion email and from the Playbooks grid.
 * Server-side authoritative permission check via `playbook-download` edge fn.
 */
export default function AuszahlungspolitikPage() {
  const { profile, isAdmin, user } = useAuth();
  const { lang } = useLanguage();
  const [pending, setPending] = useState<'download' | 'open' | null>(null);
  const [version, setVersion] = useState<number | null>(null);

  const stageIndex = isAdmin
    ? 99
    : STAGE_INDEX_ORDER.indexOf(normalizeBusinessStage((profile as any)?.business_stage || 'opener'));
  const unlocked = stageIndex >= REQUIRED_LEVEL;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('playbook_versions')
        .select('version')
        .eq('playbook_key', PLAYBOOK_KEY)
        .eq('is_current', true)
        .maybeSingle();
      if (!cancelled && data) setVersion((data as any).version ?? null);
    })();
    return () => { cancelled = true; };
  }, []);

  async function handle(mode: 'download' | 'open') {
    if (!user) {
      toast({
        title: lang === 'de' ? 'Anmeldung erforderlich' : 'Sign-in required',
        description: lang === 'de'
          ? 'Bitte logge dich ein, um das Dokument zu öffnen.'
          : 'Please sign in to access this document.',
        variant: 'destructive',
      });
      return;
    }
    setPending(mode);
    try {
      const { data, error } = await supabase.functions.invoke('playbook-download', {
        body: { playbook_key: PLAYBOOK_KEY },
      });
      if (error || !data?.url) {
        const status = (error as any)?.context?.status;
        toast({
          title: lang === 'de' ? 'Zugriff verweigert' : 'Access denied',
          description:
            status === 403
              ? (lang === 'de'
                  ? `Dieses Dokument ist erst ab Level ${REQUIRED_LEVEL} verfügbar.`
                  : `This document unlocks at Level ${REQUIRED_LEVEL}.`)
              : (lang === 'de' ? 'Download nicht möglich.' : 'Download failed.'),
          variant: 'destructive',
        });
        return;
      }
      if (mode === 'download') {
        const a = document.createElement('a');
        a.href = data.url;
        a.download = data.file_name ?? '';
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 md:px-8 md:py-14">
      <Link
        to="/members/playbooks"
        className="mb-8 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {lang === 'de' ? 'Zurück zu Playbooks' : 'Back to Playbooks'}
      </Link>

      <div className="mb-6 flex items-center gap-2">
        <Badge variant="outline" className="border-[hsl(39,41%,55%)]/40 font-mono text-[10px] uppercase tracking-wider text-[hsl(39,41%,55%)]">
          L{REQUIRED_LEVEL} · Setter
        </Badge>
        {version != null && (
          <Badge variant="outline" className="font-mono text-[10px]">
            v{version}
          </Badge>
        )}
      </div>

      <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
        {lang === 'de' ? 'Auszahlungspolitik ETC v2' : 'Payout Policy ETC v2'}
      </h1>

      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
        {lang === 'de'
          ? 'Die offizielle Regelung, wann Provisionen freigegeben werden, wie der Eligibility-Zeitraum funktioniert und welche Schritte jede Auszahlung durchläuft. Pflichtlektüre vor der ersten Provision.'
          : 'The official policy on when commissions are released, how the eligibility window works, and the steps each payout goes through. Required reading before your first commission.'}
      </p>

      <Card className="mt-8 border-border/40 p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-md bg-[hsl(39,41%,55%)]/10 p-2.5">
            <FileText className="h-5 w-5 text-[hsl(39,41%,55%)]" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {lang === 'de' ? 'Auszahlungspolitik (PDF)' : 'Payout Policy (PDF)'}
            </p>
            <p className="text-xs text-muted-foreground">
              {lang === 'de'
                ? 'Sicherer, signierter Download (60 Sekunden gültig).'
                : 'Secure, signed download (valid for 60 seconds).'}
            </p>
          </div>
        </div>

        {unlocked ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={() => handle('download')}
              disabled={pending !== null}
              className="bg-[hsl(39,41%,55%)] text-[hsl(220,15%,8%)] hover:bg-[hsl(39,41%,50%)] sm:flex-1"
            >
              {pending === 'download'
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Download className="mr-2 h-4 w-4" />}
              {lang === 'de' ? 'Herunterladen' : 'Download'}
            </Button>
            <Button
              variant="outline"
              onClick={() => handle('open')}
              disabled={pending !== null}
              className="border-border/60"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {lang === 'de' ? 'Im Browser öffnen' : 'Open in browser'}
            </Button>
          </div>
        ) : (
          <div className="rounded-md border border-border/40 bg-muted/30 p-4 text-sm text-muted-foreground">
            {lang === 'de'
              ? `Dieses Dokument ist ab Level ${REQUIRED_LEVEL} (Setter) freigeschaltet.`
              : `This document is available from Level ${REQUIRED_LEVEL} (Setter) onward.`}
          </div>
        )}
      </Card>

      <div className="mt-6 flex items-start gap-2.5 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        <p className="leading-relaxed">
          {lang === 'de'
            ? 'Jeder Zugriff wird protokolliert. Versionsstand und Empfänger sind nachvollziehbar.'
            : 'Every access is logged. Version and recipient are auditable.'}
        </p>
      </div>
    </div>
  );
}
