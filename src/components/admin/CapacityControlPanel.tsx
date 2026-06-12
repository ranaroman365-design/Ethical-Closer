import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  type CapacityRow,
  statusColor,
  statusLabel,
  suggestActions,
} from '@/lib/canonical-capacity';

/**
 * Layer 25 — Operator Capacity Panel.
 * Read-only surface for L6+ operators / admins.
 * Pulls from `capacity_status()` RPC. No execution — only visibility + suggestions.
 */
export default function CapacityControlPanel() {
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);
  const [rows, setRows] = useState<CapacityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.rpc('capacity_status' as any);
    setRows(((data as any) ?? []) as CapacityRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const runScan = async () => {
    setScanning(true);
    await supabase.rpc('detect_capacity_overload' as any);
    await load();
    setScanning(false);
  };

  const closers = rows.filter((r) => r.scope === 'closer');
  const setters = rows.filter((r) => r.scope === 'setter');

  return (
    <Card className="p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {tl('Kapazitäts-Kontrolle', 'Capacity Control')}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {tl(
              'Echtzeit-Auslastung pro Closer und Setter. SAFE / WARNUNG / ÜBERLASTET.',
              'Real-time utilization per closer and setter. SAFE / WARNING / OVERLOADED.',
            )}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={runScan} disabled={scanning}>
          <Activity className="mr-1.5 h-3.5 w-3.5" />
          {scanning ? tl('Prüfe…', 'Scanning…') : tl('Jetzt prüfen', 'Scan now')}
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">{tl('Lade…', 'Loading…')}</p>
      ) : rows.length === 0 ? (
        <p className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
          {tl(
            'Keine Kapazitätskonfiguration. Lege closer_capacity / setter_capacity-Einträge an.',
            'No capacity config. Create closer_capacity / setter_capacity rows.',
          )}
        </p>
      ) : (
        <div className="space-y-4">
          <Section
            title={tl('Closer', 'Closers')}
            rows={closers}
            empty={tl('Keine aktiven Closer', 'No active closers')}
            lang={lang}
          />
          <Section
            title={tl('Setter', 'Setters')}
            rows={setters}
            empty={tl('Keine aktiven Setter', 'No active setters')}
            lang={lang}
          />
        </div>
      )}
    </Card>
  );
}

function Section({
  title,
  rows,
  empty,
  lang,
}: {
  title: string;
  rows: CapacityRow[];
  empty: string;
  lang: 'de' | 'en';
}) {
  if (!rows.length) {
    return (
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        <p className="text-xs text-muted-foreground">{empty}</p>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="space-y-2">
        {rows.map((r) => (
          <Row key={`${r.scope}-${r.subject_id}`} row={r} lang={lang} />
        ))}
      </div>
    </div>
  );
}

function Row({ row, lang }: { row: CapacityRow; lang: 'de' | 'en' }) {
  const Icon =
    row.status === 'overloaded' ? AlertTriangle : row.status === 'warning' ? AlertTriangle : CheckCircle2;
  const suggestions = suggestActions(row, lang);
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${statusColor(row.status)}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <p className="truncate text-sm font-medium">{row.subject_name}</p>
        </div>
        <div className="flex items-center gap-3 text-xs whitespace-nowrap">
          <span>
            {row.booked}/{row.capacity}
          </span>
          <span className="font-semibold">{row.utilization_pct}%</span>
          <span className="text-[10px] uppercase tracking-wider">
            {statusLabel(row.status, lang)}
          </span>
        </div>
      </div>
      {row.backlog > 0 && (
        <p className="mt-1 text-[11px]">
          {lang === 'de' ? 'Backlog' : 'Backlog'}: {row.backlog}
        </p>
      )}
      {suggestions.length > 0 && (
        <ul className="mt-1.5 list-disc pl-4 text-[11px] opacity-80">
          {suggestions.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
