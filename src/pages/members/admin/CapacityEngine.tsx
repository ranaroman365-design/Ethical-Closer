// Capacity Engine — Admin UI (Phase 1)
// READ-ONLY heatmap + capacity settings editor + calendar blocks editor.
// Does NOT touch booking flow. L6+/admin self-gated.
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2, Calendar, Settings, Lock, Plus, Trash2 } from "lucide-react";
import { Navigate } from "react-router-dom";

interface OperatorMeta {
  operator_id: string;
  display_name: string | null;
  current_level: number;
  has_explicit_profile: boolean;
  max_per_day: number;
  max_per_hour: number;
  slot_duration_minutes: number;
  buffer_minutes: number;
}
interface DayBucket { date: string; operator_id: string; total: number; free: number; booked: number; blocked: number; utilization: number; }
interface SlotResp { window: { start: string; end: string }; operators: OperatorMeta[]; days: DayBucket[]; meta: any; }

interface CapacitySettings {
  id?: string;
  operator_id: string;
  is_active: boolean;
  timezone: string;
  working_hours: Array<{ weekday: number; start: string; end: string }>;
  max_per_day: number;
  max_per_hour: number;
  buffer_minutes: number;
  slot_duration_minutes: number;
}
interface CalendarBlock {
  id?: string;
  operator_id: string;
  block_type: 'vacation' | 'recurring_weekly' | 'ad_hoc' | 'sick' | 'training';
  starts_at: string;
  ends_at: string;
  recurrence_pattern: any;
  reason: string | null;
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function dayShort(iso: string) {
  const d = new Date(iso + 'T00:00:00Z');
  return `${WEEKDAYS[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()}.${d.getUTCMonth() + 1}`;
}

function utilColor(u: number, total: number): string {
  if (total === 0) return 'bg-muted/30 text-muted-foreground';
  if (u >= 0.95) return 'bg-destructive/80 text-destructive-foreground';
  if (u >= 0.7) return 'bg-amber-500/70 text-white';
  if (u >= 0.4) return 'bg-amber-300/60 text-foreground';
  return 'bg-emerald-500/60 text-white';
}

export default function CapacityEngine() {
  const { user, isLoading: authLoading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [data, setData] = useState<SlotResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(14);

  // Permission gate
  useEffect(() => {
    if (authLoading || !user) return;
    (async () => {
      const [{ data: lvl }, { data: roles }] = await Promise.all([
        supabase.from('user_level_status').select('current_level').eq('user_id', user.id).maybeSingle(),
        supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' as any }),
      ]);
      setAllowed((lvl?.current_level ?? 0) >= 6 || roles === true);
    })();
  }, [user, authLoading]);

  const loadHeatmap = async () => {
    setLoading(true);
    const end = new Date(Date.now() + days * 86400 * 1000).toISOString();
    const start = new Date().toISOString();
    const { data, error } = await supabase.functions.invoke('capacity-generate-slots', {
      body: { window_start: start, window_end: end },
    });
    if (error) {
      toast.error('Slot-Generierung fehlgeschlagen', { description: error.message });
    } else {
      setData(data as SlotResp);
    }
    setLoading(false);
  };

  useEffect(() => { if (allowed) loadHeatmap(); /* eslint-disable-next-line */ }, [allowed, days]);

  if (authLoading || allowed === null) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!allowed) return <Navigate to="/members" replace />;

  return (
    <TooltipProvider>
      <div className="container mx-auto py-8 space-y-6 max-w-[1400px]">
        <header className="space-y-1">
          <h1 className="text-3xl font-serif">Capacity Engine</h1>
          <p className="text-sm text-muted-foreground">
            Phase 1 · Read-only Slot-Generierung. Kein Eingriff in Booking-Logik.
          </p>
        </header>

        <Tabs defaultValue="heatmap">
          <TabsList>
            <TabsTrigger value="heatmap"><Calendar className="h-4 w-4 mr-2" />Heatmap</TabsTrigger>
            <TabsTrigger value="settings"><Settings className="h-4 w-4 mr-2" />Capacity-Profile</TabsTrigger>
            <TabsTrigger value="blocks"><Lock className="h-4 w-4 mr-2" />Calendar Blocks</TabsTrigger>
          </TabsList>

          <TabsContent value="heatmap" className="mt-6">
            <HeatmapView data={data} loading={loading} days={days} setDays={setDays} reload={loadHeatmap} />
          </TabsContent>
          <TabsContent value="settings" className="mt-6">
            <SettingsEditor />
          </TabsContent>
          <TabsContent value="blocks" className="mt-6">
            <BlocksEditor />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}

// ---------------- Heatmap ----------------
function HeatmapView({ data, loading, days, setDays, reload }: {
  data: SlotResp | null; loading: boolean; days: number; setDays: (n: number) => void; reload: () => void;
}) {
  const grid = useMemo(() => {
    if (!data) return null;
    const dateSet = new Set<string>();
    data.days.forEach(d => dateSet.add(d.date));
    const dates = Array.from(dateSet).sort();
    const map = new Map<string, DayBucket>();
    data.days.forEach(d => map.set(`${d.operator_id}|${d.date}`, d));
    return { dates, map };
  }, [data]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Verfügbarkeits-Heatmap</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {data ? `${data.operators.length} Operatoren · ${data.meta?.slot_count ?? 0} Slots` : '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3 Tage</SelectItem>
              <SelectItem value="7">7 Tage</SelectItem>
              <SelectItem value="14">14 Tage</SelectItem>
              <SelectItem value="30">30 Tage</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reload'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading || !data || !grid ? (
          <div className="py-12 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
        ) : data.operators.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Keine eligiblen Operatoren (L4+ aktiv).</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse">
              <thead>
                <tr>
                  <th className="text-left p-2 sticky left-0 bg-background font-medium">Operator</th>
                  {grid.dates.map(d => <th key={d} className="px-2 py-1 font-normal text-muted-foreground">{dayShort(d)}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.operators.map(op => (
                  <tr key={op.operator_id} className="border-t border-border/40">
                    <td className="p-2 sticky left-0 bg-background">
                      <div className="font-medium">{op.display_name ?? op.operator_id.slice(0, 8)}</div>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Badge variant="outline" className="px-1 h-4">L{op.current_level}</Badge>
                        {!op.has_explicit_profile && <span className="italic">default</span>}
                      </div>
                    </td>
                    {grid.dates.map(d => {
                      const b = grid.map.get(`${op.operator_id}|${d}`);
                      const total = b?.total ?? 0;
                      const u = b?.utilization ?? 0;
                      return (
                        <td key={d} className="p-0.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className={`h-9 w-12 rounded flex items-center justify-center text-[10px] font-medium ${utilColor(u, total)}`}>
                                {total === 0 ? '—' : `${b!.free}/${total}`}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs space-y-0.5">
                                <div className="font-semibold">{op.display_name ?? '—'} · {d}</div>
                                <div>Frei: {b?.free ?? 0}</div>
                                <div>Gebucht: {b?.booked ?? 0}</div>
                                <div>Geblockt: {b?.blocked ?? 0}</div>
                                <div>Auslastung: {Math.round(u * 100)}%</div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-4">
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-500/60" />Frei</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-300/60" />Teilweise</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-500/70" />Knapp</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-destructive/80" />Voll</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-muted/40" />Off</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------- Settings Editor ----------------
function SettingsEditor() {
  const [ops, setOps] = useState<Array<{ operator_id: string; display_name: string | null; current_level: number; has_explicit_profile: boolean }>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [s, setS] = useState<CapacitySettings | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('v_capacity_eligible_operators')
        .select('operator_id, display_name, current_level, has_explicit_profile')
        .order('current_level', { ascending: false });
      setOps((data ?? []) as any);
    })();
  }, []);

  useEffect(() => {
    if (!selected) { setS(null); return; }
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('setter_capacity_settings').select('*').eq('operator_id', selected).maybeSingle();
      const { data: meta } = await supabase.from('v_capacity_eligible_operators').select('*').eq('operator_id', selected).maybeSingle();
      setS({
        id: data?.id,
        operator_id: selected,
        is_active: data?.is_active ?? true,
        timezone: data?.timezone ?? 'Europe/Berlin',
        working_hours: (data?.working_hours as any) ?? (meta?.working_hours as any) ?? [],
        max_per_day: data?.max_per_day ?? 10,
        max_per_hour: data?.max_per_hour ?? 2,
        buffer_minutes: data?.buffer_minutes ?? 15,
        slot_duration_minutes: data?.slot_duration_minutes ?? 30,
      });
      setLoading(false);
    })();
  }, [selected]);

  const save = async () => {
    if (!s) return;
    const payload = {
      operator_id: s.operator_id,
      is_active: s.is_active,
      timezone: s.timezone,
      working_hours: s.working_hours,
      max_per_day: s.max_per_day,
      max_per_hour: s.max_per_hour,
      buffer_minutes: s.buffer_minutes,
      slot_duration_minutes: s.slot_duration_minutes,
    };
    const { error } = await supabase.from('setter_capacity_settings').upsert(payload, { onConflict: 'operator_id' });
    if (error) toast.error('Speichern fehlgeschlagen', { description: error.message });
    else { toast.success('Capacity-Profil gespeichert'); setSelected(null); setSelected(s.operator_id); }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="md:col-span-1">
        <CardHeader><CardTitle className="text-base">Operatoren</CardTitle></CardHeader>
        <CardContent className="space-y-1 max-h-[600px] overflow-y-auto">
          {ops.map(o => (
            <button key={o.operator_id} onClick={() => setSelected(o.operator_id)}
              className={`w-full text-left px-3 py-2 rounded text-sm transition ${selected === o.operator_id ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/40'}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium truncate">{o.display_name ?? o.operator_id.slice(0, 8)}</span>
                <Badge variant="outline" className="ml-2 h-5">L{o.current_level}</Badge>
              </div>
              {!o.has_explicit_profile && <div className="text-[10px] text-muted-foreground italic">Default-Profil</div>}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader><CardTitle className="text-base">{s ? 'Profil bearbeiten' : 'Operator wählen'}</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : !s ? (
            <p className="text-sm text-muted-foreground">Wähle links einen Operator.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Switch checked={s.is_active} onCheckedChange={(v) => setS({ ...s, is_active: v })} />
                  Aktiv in Capacity Engine
                </Label>
                <span className="text-xs text-muted-foreground">TZ: {s.timezone}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Max pro Tag</Label>
                  <Input type="number" min={0} max={100} value={s.max_per_day} onChange={(e) => setS({ ...s, max_per_day: Number(e.target.value) })} />
                </div>
                <div>
                  <Label className="text-xs">Max pro Stunde</Label>
                  <Input type="number" min={0} max={20} value={s.max_per_hour} onChange={(e) => setS({ ...s, max_per_hour: Number(e.target.value) })} />
                </div>
                <div>
                  <Label className="text-xs">Buffer (Min.)</Label>
                  <Input type="number" min={0} max={240} value={s.buffer_minutes} onChange={(e) => setS({ ...s, buffer_minutes: Number(e.target.value) })} />
                </div>
                <div>
                  <Label className="text-xs">Slot-Dauer (Min.)</Label>
                  <Select value={String(s.slot_duration_minutes)} onValueChange={(v) => setS({ ...s, slot_duration_minutes: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15</SelectItem>
                      <SelectItem value="30">30</SelectItem>
                      <SelectItem value="45">45</SelectItem>
                      <SelectItem value="60">60</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs mb-2 block">Arbeitszeiten</Label>
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5, 6, 7].map(wd => {
                    const wh = s.working_hours.find(w => w.weekday === wd);
                    return (
                      <div key={wd} className="flex items-center gap-2">
                        <span className="w-8 text-sm">{WEEKDAYS[wd - 1]}</span>
                        <Switch checked={!!wh} onCheckedChange={(on) => {
                          const others = s.working_hours.filter(w => w.weekday !== wd);
                          setS({ ...s, working_hours: on ? [...others, { weekday: wd, start: '09:00', end: '18:00' }].sort((a, b) => a.weekday - b.weekday) : others });
                        }} />
                        {wh && <>
                          <Input type="time" className="w-28" value={wh.start} onChange={(e) => {
                            setS({ ...s, working_hours: s.working_hours.map(w => w.weekday === wd ? { ...w, start: e.target.value } : w) });
                          }} />
                          <span>–</span>
                          <Input type="time" className="w-28" value={wh.end} onChange={(e) => {
                            setS({ ...s, working_hours: s.working_hours.map(w => w.weekday === wd ? { ...w, end: e.target.value } : w) });
                          }} />
                        </>}
                      </div>
                    );
                  })}
                </div>
              </div>

              <Button onClick={save} className="w-full">Speichern</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------- Blocks Editor ----------------
function BlocksEditor() {
  const [ops, setOps] = useState<Array<{ operator_id: string; display_name: string | null }>>([]);
  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);
  const [opFilter, setOpFilter] = useState<string>('all');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<CalendarBlock>({
    operator_id: '',
    block_type: 'vacation',
    starts_at: new Date().toISOString().slice(0, 16),
    ends_at: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    recurrence_pattern: null,
    reason: '',
  });

  const load = async () => {
    const [{ data: o }, { data: b }] = await Promise.all([
      supabase.from('v_capacity_eligible_operators').select('operator_id, display_name'),
      supabase.from('setter_calendar_blocks').select('*').order('starts_at', { ascending: true }),
    ]);
    setOps((o ?? []) as any);
    setBlocks((b ?? []) as any);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!draft.operator_id) { toast.error('Operator wählen'); return; }
    const payload = {
      ...draft,
      starts_at: new Date(draft.starts_at).toISOString(),
      ends_at: new Date(draft.ends_at).toISOString(),
      reason: draft.reason || null,
    };
    const { error } = await supabase.from('setter_calendar_blocks').insert(payload);
    if (error) toast.error('Block-Anlegen fehlgeschlagen', { description: error.message });
    else { toast.success('Block angelegt'); setCreating(false); load(); }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('setter_calendar_blocks').delete().eq('id', id);
    if (error) toast.error('Löschen fehlgeschlagen', { description: error.message });
    else { toast.success('Block gelöscht'); load(); }
  };

  const filtered = opFilter === 'all' ? blocks : blocks.filter(b => b.operator_id === opFilter);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Calendar Blocks ({blocks.length})</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={opFilter} onValueChange={setOpFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Operatoren</SelectItem>
              {ops.map(o => <SelectItem key={o.operator_id} value={o.operator_id}>{o.display_name ?? o.operator_id.slice(0, 8)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" />Neu</Button>
        </div>
      </CardHeader>
      <CardContent>
        {creating && (
          <div className="border rounded-lg p-4 mb-4 space-y-3 bg-muted/20">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Operator</Label>
                <Select value={draft.operator_id} onValueChange={(v) => setDraft({ ...draft, operator_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Wählen..." /></SelectTrigger>
                  <SelectContent>
                    {ops.map(o => <SelectItem key={o.operator_id} value={o.operator_id}>{o.display_name ?? o.operator_id.slice(0, 8)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Typ</Label>
                <Select value={draft.block_type} onValueChange={(v: any) => setDraft({ ...draft, block_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vacation">Urlaub</SelectItem>
                    <SelectItem value="sick">Krank</SelectItem>
                    <SelectItem value="training">Training</SelectItem>
                    <SelectItem value="ad_hoc">Ad-hoc</SelectItem>
                    <SelectItem value="recurring_weekly">Wiederkehrend (wöchentlich)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Start</Label>
                <Input type="datetime-local" value={draft.starts_at} onChange={(e) => setDraft({ ...draft, starts_at: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Ende</Label>
                <Input type="datetime-local" value={draft.ends_at} onChange={(e) => setDraft({ ...draft, ends_at: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Grund (optional)</Label>
              <Textarea value={draft.reason ?? ''} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} rows={2} />
            </div>
            {draft.block_type === 'recurring_weekly' && (
              <p className="text-xs text-muted-foreground">
                Hinweis: Recurrence-Pattern manuell pflegen via SQL. Phase 1 unterstützt nur Standard-Anlage.
              </p>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={save}>Anlegen</Button>
              <Button size="sm" variant="outline" onClick={() => setCreating(false)}>Abbrechen</Button>
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Keine Blocks.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Operator</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>Ende</TableHead>
                <TableHead>Grund</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(b => {
                const op = ops.find(o => o.operator_id === b.operator_id);
                return (
                  <TableRow key={b.id}>
                    <TableCell className="text-xs">{op?.display_name ?? b.operator_id.slice(0, 8)}</TableCell>
                    <TableCell><Badge variant="outline">{b.block_type}</Badge></TableCell>
                    <TableCell className="text-xs">{new Date(b.starts_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}</TableCell>
                    <TableCell className="text-xs">{new Date(b.ends_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{b.reason ?? '—'}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => b.id && remove(b.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
