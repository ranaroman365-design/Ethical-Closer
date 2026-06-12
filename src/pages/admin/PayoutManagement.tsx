import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  DollarSign, CheckCircle2, Clock, CreditCard, AlertTriangle, RotateCcw, Lock,
  Users, Receipt, History, RefreshCw, FileSpreadsheet, FileDown,
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import * as XLSX from 'xlsx';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface QueueRow {
  user_id: string;
  full_name: string | null;
  payout_full_name: string | null;
  payment_method: string | null;
  iban: string | null;
  payout_company_name: string | null;
  total_eligible: number;
  eligible_count: number;
  eligible_commissions: Array<{
    commission_id: string;
    amount: number;
    role: string | null;
    created_at: string;
    eligible_at: string | null;
    call_id: string | null;
  }> | null;
}

interface BatchRow {
  id: string;
  user_id: string;
  recipient_name: string | null;
  recipient_email: string | null;
  total_amount: number;
  commission_count: number;
  payment_method: string | null;
  payout_reference: string | null;
  notes: string | null;
  paid_by: string;
  paid_by_name: string | null;
  paid_at: string;
}

interface CommissionAllRow {
  id: string;
  user_id: string;
  amount: number;
  payout_status: string;
  created_at: string;
  eligible_at: string | null;
  paid_at: string | null;
  reversed_at: string | null;
  payout_batch_id: string | null;
  full_name?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const fmtEUR = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n ?? 0);

const fmtDate = (iso: string | null | undefined) =>
  iso ? format(new Date(iso), 'dd. MMM yyyy · HH:mm', { locale: de }) : '—';

const maskIban = (iban: string | null) => {
  if (!iban) return '—';
  const clean = iban.replace(/\s+/g, '');
  if (clean.length < 8) return clean;
  return `${clean.slice(0, 4)} •••• •••• ${clean.slice(-4)}`;
};

// Build flat export rows: ONE row per eligible commission, with masked IBAN
const buildExportRows = (queue: QueueRow[]) => {
  const rows: Record<string, string | number>[] = [];
  for (const u of queue) {
    const items = u.eligible_commissions ?? [];
    if (items.length === 0) {
      rows.push({
        recipient_name: u.payout_full_name ?? u.full_name ?? '—',
        company: u.payout_company_name ?? '',
        payment_method: u.payment_method ?? '—',
        iban_masked: maskIban(u.iban),
        total_eligible_eur: Number(u.total_eligible ?? 0).toFixed(2),
        commission_count: u.eligible_count ?? 0,
        commission_id: '',
        commission_amount_eur: '',
        commission_role: '',
        commission_created_at: '',
        commission_eligible_at: '',
        call_id: '',
      });
      continue;
    }
    for (const c of items) {
      rows.push({
        recipient_name: u.payout_full_name ?? u.full_name ?? '—',
        company: u.payout_company_name ?? '',
        payment_method: u.payment_method ?? '—',
        iban_masked: maskIban(u.iban),
        total_eligible_eur: Number(u.total_eligible ?? 0).toFixed(2),
        commission_count: u.eligible_count ?? 0,
        commission_id: c.commission_id,
        commission_amount_eur: Number(c.amount ?? 0).toFixed(2),
        commission_role: c.role ?? '',
        commission_created_at: c.created_at ?? '',
        commission_eligible_at: c.eligible_at ?? '',
        call_id: c.call_id ?? '',
      });
    }
  }
  return rows;
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const toCsv = (rows: Record<string, string | number>[]) => {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(';')];
  for (const r of rows) lines.push(headers.map(h => escape(r[h])).join(';'));
  // BOM for Excel UTF-8 + German locale (use ; as separator)
  return '\uFEFF' + lines.join('\r\n');
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending:  { label: 'Ausstehend', cls: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400' },
  eligible: { label: 'Auszahlbar', cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  paid:     { label: 'Ausgezahlt', cls: 'bg-green-500/15 text-green-700 dark:text-green-400' },
  reversed: { label: 'Storniert',  cls: 'bg-red-500/15 text-red-700 dark:text-red-400' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function PayoutManagement() {
  const { profile } = useAuth();
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [allCommissions, setAllCommissions] = useState<CommissionAllRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'eligible' | 'paid' | 'reversed'>('eligible');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Detail dialog state
  const [detailUser, setDetailUser] = useState<QueueRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('');

  // Refund dialog state
  const [refundTarget, setRefundTarget] = useState<CommissionAllRow | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  // ─── Load data ────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    const [queueRes, batchesRes, allRes] = await Promise.all([
      supabase.from('v_admin_payout_queue').select('*').order('total_eligible', { ascending: false }),
      supabase.from('v_admin_payout_batches').select('*').order('paid_at', { ascending: false }).limit(100),
      supabase
        .from('commissions')
        .select('id, user_id, amount, payout_status, created_at, eligible_at, paid_at, reversed_at, payout_batch_id')
        .eq('is_simulation', false)
        .order('created_at', { ascending: false })
        .limit(500),
    ]);

    setQueue((queueRes.data as QueueRow[] | null) ?? []);
    setBatches((batchesRes.data as BatchRow[] | null) ?? []);

    const rows = (allRes.data as CommissionAllRow[] | null) ?? [];
    // hydrate names
    const ids = [...new Set(rows.map(r => r.user_id))];
    if (ids.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      const nameMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
      rows.forEach(r => { r.full_name = nameMap.get(r.user_id) ?? null; });
    }
    setAllCommissions(rows);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ─── KPIs ─────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => ({
    totalEligible: queue.reduce((s, r) => s + Number(r.total_eligible), 0),
    userCount:     queue.length,
    commissionCount: queue.reduce((s, r) => s + (r.eligible_count ?? 0), 0),
  }), [queue]);

  // ─── Run sweep (pending → eligible) ───────────────────────────────────────
  const runSweep = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('sweep_commissions_eligibility', { _delay_days: 14 } as any);
    setBusy(false);
    if (error) {
      toast.error(`Sweep fehlgeschlagen: ${error.message}`);
      return;
    }
    const promoted = (data as any)?.promoted_count ?? (data as any) ?? 0;
    toast.success(`Eligibility-Sweep: ${promoted} Provisionen freigegeben`);
    loadAll();
  };

  // ─── Export eligible queue ───────────────────────────────────────────────
  const exportFilename = (ext: 'csv' | 'xlsx') =>
    `payout-queue_${format(new Date(), 'yyyy-MM-dd_HHmm')}.${ext}`;

  const exportCsv = () => {
    const rows = buildExportRows(queue);
    if (rows.length === 0) { toast.info('Keine eligible Provisionen zum Export.'); return; }
    downloadBlob(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }), exportFilename('csv'));
    toast.success(`${rows.length} Zeilen als CSV exportiert`);
  };

  const exportXlsx = () => {
    const rows = buildExportRows(queue);
    if (rows.length === 0) { toast.info('Keine eligible Provisionen zum Export.'); return; }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 28 }, { wch: 22 }, { wch: 14 }, { wch: 24 }, { wch: 16 }, { wch: 6 },
      { wch: 38 }, { wch: 16 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 38 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Eligible Payouts');
    XLSX.writeFile(wb, exportFilename('xlsx'));
    toast.success(`${rows.length} Zeilen als Excel exportiert`);
  };
  const openDetails = (row: QueueRow) => {
    setDetailUser(row);
    // pre-select all eligible
    setSelectedIds(new Set((row.eligible_commissions ?? []).map(c => c.commission_id)));
    setPaymentMethod(row.payment_method ?? '');
    setReference('');
    setNotes('');
  };

  // One-click bulk: open details with all selected AND go straight to confirmation
  const openBulkAll = (row: QueueRow) => {
    openDetails(row);
    // open confirmation in next tick so detail-dialog state has settled
    setTimeout(() => setConfirmOpen(true), 0);
  };

  const allSelected = useMemo(() => {
    if (!detailUser) return false;
    const items = detailUser.eligible_commissions ?? [];
    return items.length > 0 && items.every(c => selectedIds.has(c.commission_id));
  }, [detailUser, selectedIds]);

  const someSelected = useMemo(() => {
    if (!detailUser) return false;
    return selectedIds.size > 0 && !allSelected;
  }, [detailUser, selectedIds, allSelected]);

  const toggleAll = () => {
    if (!detailUser) return;
    const items = detailUser.eligible_commissions ?? [];
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(c => c.commission_id)));
    }
  };

  const closeDetails = () => {
    setDetailUser(null);
    setSelectedIds(new Set());
    setConfirmOpen(false);
  };

  const toggleId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedTotal = useMemo(() => {
    if (!detailUser) return 0;
    return (detailUser.eligible_commissions ?? [])
      .filter(c => selectedIds.has(c.commission_id))
      .reduce((s, c) => s + Number(c.amount), 0);
  }, [detailUser, selectedIds]);

  // ─── Mark as paid (batch) ─────────────────────────────────────────────────
  const confirmPaid = async () => {
    if (!detailUser || selectedIds.size === 0) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('mark_commissions_paid_batch', {
      _commission_ids:   [...selectedIds],
      _payment_method:   paymentMethod || null,
      _payout_reference: reference || null,
      _notes:            notes || null,
    } as any);
    setBusy(false);

    if (error) {
      toast.error(`Auszahlung fehlgeschlagen: ${error.message}`);
      return;
    }
    const total = (data as any)?.total_amount ?? selectedTotal;
    toast.success(`${selectedIds.size} Provisionen ausgezahlt · ${fmtEUR(Number(total))}`);
    closeDetails();
    loadAll();
  };

  // ─── Refund / reverse a single commission ─────────────────────────────────
  const confirmRefund = async () => {
    if (!refundTarget) return;
    if (!refundReason.trim() || refundReason.trim().length < 3) {
      toast.error('Bitte Grund angeben (mind. 3 Zeichen).');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('mark_commission_reversed', {
      _commission_id: refundTarget.id,
      _reason: refundReason.trim(),
    } as any);
    setBusy(false);
    if (error) {
      toast.error(`Storno fehlgeschlagen: ${error.message}`);
      return;
    }
    toast.success(`Provision storniert · ${fmtEUR(Number(refundTarget.amount))}`);
    setRefundTarget(null);
    setRefundReason('');
    loadAll();
  };

  // ─── Filtered all-commissions table ───────────────────────────────────────
  const filteredAll = useMemo(() => {
    if (statusFilter === 'all') return allCommissions;
    return allCommissions.filter(r => r.payout_status === statusFilter);
  }, [allCommissions, statusFilter]);

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="container mx-auto p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif font-light tracking-tight">Auszahlungen</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manuelle Provisions-Auszahlung · {profile?.full_name ?? 'Admin'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={busy || queue.length === 0}>
            <FileDown className="w-4 h-4 mr-2" />
            CSV-Export
          </Button>
          <Button variant="outline" size="sm" onClick={exportXlsx} disabled={busy || queue.length === 0}>
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Excel-Export
          </Button>
          <Button variant="outline" size="sm" onClick={runSweep} disabled={busy}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Eligibility-Sweep (14 Tage)
          </Button>
        </div>
      </div>

      {/* ── KPI cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/10">
              <DollarSign className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Gesamt auszahlbar</p>
              <p className="text-2xl font-serif font-medium">{fmtEUR(kpis.totalEligible)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/10">
              <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Empfänger</p>
              <p className="text-2xl font-serif font-medium">{kpis.userCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-500/10">
              <Receipt className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Provisionen</p>
              <p className="text-2xl font-serif font-medium">{kpis.commissionCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="queue" className="w-full">
        <TabsList>
          <TabsTrigger value="queue">
            <Clock className="w-4 h-4 mr-2" />Auszahlbar
          </TabsTrigger>
          <TabsTrigger value="all">
            <Receipt className="w-4 h-4 mr-2" />Alle Provisionen
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="w-4 h-4 mr-2" />Historie
          </TabsTrigger>
        </TabsList>

        {/* ── Queue: grouped by user ─────────────────────────────────── */}
        <TabsContent value="queue" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <p className="text-sm text-muted-foreground p-6">Lade…</p>
              ) : queue.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p>Keine offenen Auszahlungen.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empfänger</TableHead>
                      <TableHead>Zahlungsart</TableHead>
                      <TableHead>IBAN</TableHead>
                      <TableHead className="text-right">Provisionen</TableHead>
                      <TableHead className="text-right">Auszahlbar</TableHead>
                      <TableHead className="text-right w-[260px]">Aktion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queue.map(row => (
                      <TableRow key={row.user_id}>
                        <TableCell>
                          <div className="font-medium">
                            {row.payout_full_name ?? row.full_name ?? row.user_id.slice(0, 8)}
                          </div>
                          {row.payout_company_name && (
                            <div className="text-xs text-muted-foreground">{row.payout_company_name}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            <CreditCard className="w-3 h-3 mr-1" />
                            {row.payment_method ?? 'nicht hinterlegt'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {maskIban(row.iban)}
                          {!row.iban && (
                            <span className="ml-2 inline-flex items-center text-amber-600 text-xs">
                              <AlertTriangle className="w-3 h-3 mr-1" /> fehlt
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{row.eligible_count}</TableCell>
                        <TableCell className="text-right font-medium">
                          {fmtEUR(Number(row.total_eligible))}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => openDetails(row)}>
                              Details
                            </Button>
                            <Button
                              size="sm"
                              disabled={busy || (row.eligible_count ?? 0) === 0}
                              onClick={() => openBulkAll(row)}
                              title={`Alle ${row.eligible_count} Provisionen als bezahlt markieren`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              Alle bezahlen
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── All commissions filterable ─────────────────────────────── */}
        <TabsContent value="all" className="mt-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            {(['all','pending','eligible','paid','reversed'] as const).map(s => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? 'default' : 'outline'}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? 'Alle' : (STATUS_BADGE[s]?.label ?? s)}
              </Button>
            ))}
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empfänger</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Erstellt</TableHead>
                    <TableHead>Eligible am</TableHead>
                    <TableHead>Bezahlt am</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead className="text-right w-[110px]">Aktion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAll.slice(0, 200).map(c => {
                    const b = STATUS_BADGE[c.payout_status] ?? { label: c.payout_status, cls: '' };
                    const locked = c.payout_status === 'paid' || c.payout_status === 'reversed';
                    return (
                      <TableRow key={c.id}>
                        <TableCell>{c.full_name ?? c.user_id.slice(0, 8)}</TableCell>
                        <TableCell><Badge className={b.cls}>{b.label}</Badge></TableCell>
                        <TableCell className="text-xs">{fmtDate(c.created_at)}</TableCell>
                        <TableCell className="text-xs">{fmtDate(c.eligible_at)}</TableCell>
                        <TableCell className="text-xs">{fmtDate(c.paid_at)}</TableCell>
                        <TableCell className={`text-right font-medium ${c.payout_status === 'reversed' ? 'line-through text-muted-foreground' : ''}`}>
                          {fmtEUR(Number(c.amount))}
                        </TableCell>
                        <TableCell className="text-right">
                          {c.payout_status === 'reversed' ? (
                            <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
                              <Lock className="w-3 h-3" /> gesperrt
                            </Badge>
                          ) : c.payout_status === 'paid' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] gap-1 text-red-600 hover:text-red-700 hover:bg-red-500/10"
                              onClick={() => { setRefundTarget(c); setRefundReason(''); }}
                              title="Refund / Storno"
                            >
                              <RotateCcw className="w-3 h-3" /> Storno
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-red-600"
                              onClick={() => { setRefundTarget(c); setRefundReason(''); }}
                            >
                              <RotateCcw className="w-3 h-3" /> Storno
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredAll.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Keine Einträge.
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Payout batch history ───────────────────────────────────── */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empfänger</TableHead>
                    <TableHead>Provisionen</TableHead>
                    <TableHead>Zahlungsart</TableHead>
                    <TableHead>Referenz</TableHead>
                    <TableHead>Bezahlt von</TableHead>
                    <TableHead>Bezahlt am</TableHead>
                    <TableHead className="text-right">Summe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map(b => (
                    <TableRow key={b.id}>
                      <TableCell>{b.recipient_name ?? b.user_id.slice(0,8)}</TableCell>
                      <TableCell>{b.commission_count}</TableCell>
                      <TableCell className="capitalize">{b.payment_method ?? '—'}</TableCell>
                      <TableCell className="text-xs font-mono">{b.payout_reference ?? '—'}</TableCell>
                      <TableCell className="text-xs">{b.paid_by_name ?? '—'}</TableCell>
                      <TableCell className="text-xs">{fmtDate(b.paid_at)}</TableCell>
                      <TableCell className="text-right font-medium">{fmtEUR(Number(b.total_amount))}</TableCell>
                    </TableRow>
                  ))}
                  {batches.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Noch keine Auszahlungen erfasst.
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── User payout details dialog ─────────────────────────────── */}
      <Dialog open={!!detailUser} onOpenChange={(o) => { if (!o) closeDetails(); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {detailUser?.payout_full_name ?? detailUser?.full_name ?? 'Empfänger'}
            </DialogTitle>
            <DialogDescription>
              Wähle die Provisionen aus, die du jetzt manuell überweist und anschließend hier als bezahlt markierst.
            </DialogDescription>
          </DialogHeader>

          {detailUser && (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm pt-2">
                <div>
                  <span className="text-muted-foreground">Zahlungsart:</span>{' '}
                  <span className="capitalize">{detailUser.payment_method ?? '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">IBAN:</span>{' '}
                  <span className="font-mono">{maskIban(detailUser.iban)}</span>
                </div>
              </div>

              <div className="border rounded-md max-h-[40vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                          onCheckedChange={toggleAll}
                          aria-label="Alle auswählen"
                        />
                      </TableHead>
                      <TableHead>Deal</TableHead>
                      <TableHead>Rolle</TableHead>
                      <TableHead>Eligible am</TableHead>
                      <TableHead className="text-right">Betrag</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detailUser.eligible_commissions ?? []).map(c => (
                      <TableRow key={c.commission_id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(c.commission_id)}
                            onCheckedChange={() => toggleId(c.commission_id)}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {c.call_id?.slice(0, 8) ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs">{c.role ?? '—'}</TableCell>
                        <TableCell className="text-xs">{fmtDate(c.eligible_at)}</TableCell>
                        <TableCell className="text-right font-medium">{fmtEUR(Number(c.amount))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-xs text-muted-foreground">Zahlungsart (für Batch)</label>
                  <Input
                    placeholder="z. B. SEPA, Wise, PayPal"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Referenz / Transaktions-ID</label>
                  <Input
                    placeholder="optional"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground">Notiz (intern)</label>
                  <Textarea
                    placeholder="optional"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>

              <DialogFooter className="border-t pt-4">
                <div className="flex-1 text-sm">
                  <span className="text-muted-foreground">Auswahl:</span>{' '}
                  <span className="font-medium">{selectedIds.size}</span>{' · '}
                  <span className="font-medium">{fmtEUR(selectedTotal)}</span>
                </div>
                <Button variant="outline" onClick={closeDetails}>Abbrechen</Button>
                <Button
                  disabled={selectedIds.size === 0 || busy}
                  onClick={() => setConfirmOpen(true)}
                >
                  Als bezahlt markieren
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Confirmation dialog ────────────────────────────────────── */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Auszahlung bestätigen</DialogTitle>
            <DialogDescription>
              Bestätige, dass du <strong>{fmtEUR(selectedTotal)}</strong> für{' '}
              <strong>{selectedIds.size}</strong> Provision(en) extern überwiesen hast.
              Diese Aktion ist endgültig — bezahlte Provisionen können nicht erneut ausgezahlt werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy}>
              Abbrechen
            </Button>
            <Button onClick={confirmPaid} disabled={busy}>
              {busy ? 'Wird gebucht…' : 'Bestätigen & speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Refund / Reverse dialog ────────────────────────────────── */}
      <Dialog open={!!refundTarget} onOpenChange={(o) => { if (!o) { setRefundTarget(null); setRefundReason(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-red-600" />
              Provision stornieren
            </DialogTitle>
            <DialogDescription>
              {refundTarget?.payout_status === 'paid' ? (
                <>Diese Provision wurde bereits ausgezahlt. Eine Stornierung markiert sie als <strong>storniert</strong> — der Betrag muss extern zurückgefordert werden.</>
              ) : (
                <>Diese Provision wird als <strong>storniert</strong> markiert und nicht mehr ausgezahlt.</>
              )}
              <br />
              <span className="text-foreground font-medium mt-2 inline-block">
                Betrag: {refundTarget && fmtEUR(Number(refundTarget.amount))}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 pt-2">
            <label className="text-xs font-medium text-muted-foreground">Grund (Pflicht)</label>
            <Textarea
              placeholder="z. B. Kunde hat Refund erhalten, Zahlung geplatzt, Chargeback…"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              rows={3}
              maxLength={500}
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              Diese Aktion ist endgültig und wird im Audit-Log protokolliert.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setRefundTarget(null); setRefundReason(''); }} disabled={busy}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={confirmRefund}
              disabled={busy || refundReason.trim().length < 3}
            >
              {busy ? 'Wird storniert…' : 'Stornieren'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
