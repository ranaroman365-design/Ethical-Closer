import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Search, ChevronDown, AlertTriangle } from 'lucide-react';

export type SelectableLead = {
  lead_id: string;
  name: string | null;
  email: string | null;
  appointment_date: string | null;
  closer_id: string | null;
  setter_id: string | null;
};

type Props = {
  onSelect: (lead: SelectableLead) => void;
};

const CACHE_KEY = 'closer:lead-picker:v1';
const CACHE_TTL_MS = 60_000; // 1 minute session cache

function readCache(): SelectableLead[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; rows: SelectableLead[] };
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.rows;
  } catch {
    return null;
  }
}

function writeCache(rows: SelectableLead[]) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), rows }));
  } catch {
    /* ignore */
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function LeadPickerCombobox({ onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<SelectableLead[] | null>(readCache());
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce input (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Click-outside to close
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  async function fetchLeads() {
    setLoading(true);
    setError(null);
    try {
      // Window: -7 days .. +14 days
      const from = new Date(Date.now() - 7 * 86400_000).toISOString();
      const to   = new Date(Date.now() + 14 * 86400_000).toISOString();

      const { data, error } = await supabase
        .from('leads')
        .select('id, name, email, appointment_date, closer_id, setter_id, has_booking, lead_level, booking_status')
        .eq('lead_level', 'L0')
        .eq('has_booking', true)
        .gte('appointment_date', from)
        .lte('appointment_date', to)
        .order('appointment_date', { ascending: true })
        .limit(50);

      if (error) throw error;

      // Defensive: drop cancelled/no-show even if has_booking=true wasn't reset
      const cleaned: SelectableLead[] = (data ?? [])
        .filter((r: any) => {
          const s = (r.booking_status ?? '').toString().toLowerCase();
          return !['cancelled', 'canceled', 'no_show', 'no-show'].includes(s);
        })
        .map((r: any) => ({
          lead_id: r.id,
          name: r.name ?? null,
          email: r.email ?? null,
          appointment_date: r.appointment_date ?? null,
          closer_id: r.closer_id ?? null,
          setter_id: r.setter_id ?? null,
        }));

      setRows(cleaned);
      writeCache(cleaned);
    } catch (e: any) {
      console.error('[LeadPicker] fetch failed', e);
      setError(e?.message || 'Konnte Leads nicht laden');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  function handleFocus() {
    setOpen(true);
    if (!rows || rows.length === 0) void fetchLeads();
  }

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (!debounced) return rows;
    return rows.filter((r) => {
      const n = (r.name ?? '').toLowerCase();
      const e = (r.email ?? '').toLowerCase();
      return n.includes(debounced) || e.includes(debounced);
    });
  }, [rows, debounced]);

  function handlePick(lead: SelectableLead) {
    if (!lead.email) return; // disabled in render too
    onSelect(lead);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
          onFocus={handleFocus}
          placeholder="Lead suchen oder unten manuell eingeben…"
          className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-9 text-sm outline-none focus:border-primary"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => { setOpen((v) => !v); if (!rows) void fetchLeads(); inputRef.current?.focus(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-muted-foreground hover:bg-muted"
          aria-label="Lead-Liste öffnen"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-xl border border-border bg-popover shadow-lg">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Lade Leads…
            </div>
          )}
          {!loading && error && (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> {error}
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              Keine Leads mit Termin gefunden.
            </div>
          )}
          {!loading && !error && filtered.map((lead) => {
            const disabled = !lead.email;
            return (
              <button
                key={lead.lead_id}
                type="button"
                disabled={disabled}
                onClick={() => handlePick(lead)}
                className={`flex w-full flex-col items-start gap-0.5 border-b border-border/50 px-3 py-2 text-left transition-colors last:border-b-0 ${
                  disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted/60'
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground truncate">
                    {lead.name?.trim() || '(ohne Name)'}
                  </span>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {fmtDate(lead.appointment_date)}
                  </span>
                </div>
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground truncate">
                    {lead.email ?? <span className="text-destructive">⚠ keine E-Mail</span>}
                  </span>
                  {(lead.closer_id || lead.setter_id) && (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {lead.closer_id ? 'Closer' : 'Setter'} zugewiesen
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          <div className="border-t border-border/60 bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground">
            Manuelle Eingabe in den Feldern unten bleibt jederzeit möglich.
          </div>
        </div>
      )}
    </div>
  );
}
