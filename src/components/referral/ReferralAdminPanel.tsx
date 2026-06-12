/**
 * ReferralAdminPanel — Admin actions for referral earnings
 * --------------------------------------------------------
 * Visible only to admins. Allows:
 *   · Mark earnings as "paid"
 *   · Block / Reverse earnings with reason
 *   · Full audit log per earning
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  Ban,
  RotateCcw,
  FileText,
  Loader2,
  Search,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/i18n/LanguageContext";

// ─── Types ──────────────────────────────────────────────
interface ReferralEarning {
  id: string;
  referrer_id: string;
  lead_id: string | null;
  deal_value: number;
  referral_tier: number;
  reward_amount: number;
  status: string;
  sale_date: string | null;
  eligible_at: string | null;
  paid_at: string | null;
  paid_by: string | null;
  payout_reference: string | null;
  payout_note: string | null;
  fraud_review_status: string | null;
  created_at: string;
  referrer_name?: string;
  referrer_email?: string;
}

interface AuditEntry {
  id: string;
  old_status: string;
  new_status: string;
  changed_by: string;
  source: string;
  note: string | null;
  created_at: string;
  changer_name?: string;
}

type ActionType = "pay" | "block" | "reverse" | null;

// ─── Status config ──────────────────────────────────────
const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Ausstehend", variant: "secondary" },
  eligible: { label: "Auszahlbar", variant: "outline" },
  paid: { label: "Ausgezahlt", variant: "default" },
  blocked: { label: "Blockiert", variant: "destructive" },
  reversed: { label: "Storniert", variant: "destructive" },
};

export default function ReferralAdminPanel() {
  const { user, isAdmin } = useAuth();
  const { lang } = useLanguage();
  const t = (de: string, en: string) => (lang === "de" ? de : en);

  const [earnings, setEarnings] = useState<ReferralEarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Action dialog state
  const [actionType, setActionType] = useState<ActionType>(null);
  const [targetEarning, setTargetEarning] = useState<ReferralEarning | null>(null);
  const [reason, setReason] = useState("");
  const [payoutRef, setPayoutRef] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Audit log expansion
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // ─── Load earnings ──────────────────────────────────────
  const loadEarnings = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("referral_earnings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (statusFilter !== "all") {
      q = q.eq("status", statusFilter);
    }

    const { data, error } = await q;
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as any[];
    // Batch-load referrer profiles
    const referrerIds = [...new Set(rows.map((r) => r.referrer_id).filter(Boolean))];
    const { data: profiles } = referrerIds.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", referrerIds)
      : { data: [] };
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    setEarnings(
      rows.map((e) => {
        const prof = profileMap.get(e.referrer_id);
        return {
          ...e,
          referrer_name: prof?.full_name ?? "–",
          referrer_email: prof?.email ?? "–",
        };
      })
    );
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    if (isAdmin) loadEarnings();
  }, [isAdmin, loadEarnings]);

  // ─── Load audit log for a specific earning ──────────────
  async function loadAudit(earningId: string) {
    if (expandedId === earningId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(earningId);
    setAuditLoading(true);

    const earning = earnings.find((e) => e.id === earningId);
    const { data } = await supabase
      .from("referral_status_history")
      .select("*")
      .eq("referrer_id", earning?.referrer_id ?? "")
      .order("created_at", { ascending: false })
      .limit(50);

    setAuditEntries(
      ((data ?? []) as any[]).map((a) => ({
        ...a,
        changer_name: a.changed_by?.slice(0, 8) ?? "–",
      }))
    );
    setAuditLoading(false);
  }

  // ─── Perform action ──────────────────────────────────────
  async function handleAction() {
    if (!targetEarning || !actionType || !user?.id) return;
    if ((actionType === "block" || actionType === "reverse") && !reason.trim()) {
      toast.error(t("Bitte Grund angeben", "Please provide a reason"));
      return;
    }

    setSubmitting(true);

    const newStatus =
      actionType === "pay" ? "paid" : actionType === "block" ? "blocked" : "reversed";
    const oldStatus = targetEarning.status;

    // Update earning
    const updatePayload: {
      status: string;
      paid_at?: string;
      paid_by?: string;
      payout_reference?: string;
      payout_note?: string;
    } = { status: newStatus };
    if (actionType === "pay") {
      updatePayload.paid_at = new Date().toISOString();
      updatePayload.paid_by = user.id;
      if (payoutRef.trim()) updatePayload.payout_reference = payoutRef.trim();
    }
    if (reason.trim()) {
      updatePayload.payout_note = reason.trim();
    }

    const { error: updateErr } = await supabase
      .from("referral_earnings")
      .update(updatePayload)
      .eq("id", targetEarning.id);

    if (updateErr) {
      toast.error(updateErr.message);
      setSubmitting(false);
      return;
    }

    // Write audit log
    await supabase.from("referral_status_history").insert({
      referral_id: targetEarning.id,
      referrer_id: targetEarning.referrer_id,
      old_status: oldStatus,
      new_status: newStatus,
      changed_by: user.id,
      source: "admin_panel",
      note: reason.trim() || null,
    });

    toast.success(
      actionType === "pay"
        ? t("Als ausgezahlt markiert", "Marked as paid")
        : actionType === "block"
        ? t("Earning blockiert", "Earning blocked")
        : t("Earning storniert", "Earning reversed")
    );

    setActionType(null);
    setTargetEarning(null);
    setReason("");
    setPayoutRef("");
    setSubmitting(false);
    loadEarnings();
  }

  function openAction(type: ActionType, earning: ReferralEarning) {
    setActionType(type);
    setTargetEarning(earning);
    setReason("");
    setPayoutRef("");
  }

  // ─── Filter ─────────────────────────────────────────────
  const filtered = earnings.filter((e) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      e.referrer_name?.toLowerCase().includes(s) ||
      e.referrer_email?.toLowerCase().includes(s) ||
      e.id.includes(s)
    );
  });

  if (!isAdmin) return null;

  return (
    <Card className="mt-8">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">
          {t("Referral Admin", "Referral Admin")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("Name oder E-Mail suchen…", "Search name or email…")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
              maxLength={100}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("Alle Status", "All statuses")}</SelectItem>
              <SelectItem value="pending">{t("Ausstehend", "Pending")}</SelectItem>
              <SelectItem value="eligible">{t("Auszahlbar", "Eligible")}</SelectItem>
              <SelectItem value="paid">{t("Ausgezahlt", "Paid")}</SelectItem>
              <SelectItem value="blocked">{t("Blockiert", "Blocked")}</SelectItem>
              <SelectItem value="reversed">{t("Storniert", "Reversed")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {t("Keine Referral-Earnings gefunden.", "No referral earnings found.")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Referrer", "Referrer")}</TableHead>
                  <TableHead className="text-right">{t("Deal", "Deal")}</TableHead>
                  <TableHead className="text-right">{t("Reward", "Reward")}</TableHead>
                  <TableHead>{t("Status", "Status")}</TableHead>
                  <TableHead>{t("Datum", "Date")}</TableHead>
                  <TableHead className="text-right">{t("Aktionen", "Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => {
                  const cfg = STATUS_BADGE[e.status] ?? STATUS_BADGE.pending;
                  const isExpanded = expandedId === e.id;
                  return (
                    <>
                      <TableRow key={e.id}>
                        <TableCell>
                          <div className="text-sm font-medium">{e.referrer_name}</div>
                          <div className="text-xs text-muted-foreground">{e.referrer_email}</div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          €{e.deal_value?.toFixed(0) ?? "0"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          €{e.reward_amount?.toFixed(0) ?? "0"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={cfg.variant}>{cfg.label}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {e.created_at ? new Date(e.created_at).toLocaleDateString("de-DE") : "–"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {(e.status === "pending" || e.status === "eligible") && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={() => openAction("pay", e)}
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                {t("Paid", "Paid")}
                              </Button>
                            )}
                            {e.status !== "blocked" && e.status !== "reversed" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1 text-destructive border-destructive/30"
                                onClick={() => openAction("block", e)}
                              >
                                <Ban className="h-3 w-3" />
                              </Button>
                            )}
                            {e.status === "paid" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1 text-destructive border-destructive/30"
                                onClick={() => openAction("reverse", e)}
                              >
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => loadAudit(e.id)}
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${e.id}-audit`}>
                          <TableCell colSpan={6} className="bg-muted/30 p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Audit Log
                              </span>
                            </div>
                            {auditLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : auditEntries.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                {t("Keine Einträge", "No entries")}
                              </p>
                            ) : (
                              <div className="space-y-1.5">
                                {auditEntries.map((a) => (
                                  <div key={a.id} className="flex items-start gap-2 text-xs">
                                    <span className="text-muted-foreground whitespace-nowrap">
                                      {new Date(a.created_at).toLocaleString("de-DE")}
                                    </span>
                                    <Badge variant="outline" className="text-[10px] h-5">
                                      {a.old_status} → {a.new_status}
                                    </Badge>
                                    <span className="text-muted-foreground">
                                      {a.changer_name}
                                    </span>
                                    {a.note && (
                                      <span className="text-foreground italic">"{a.note}"</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                            {e.payout_reference && (
                              <p className="text-xs text-muted-foreground mt-2">
                                Ref: {e.payout_reference}
                              </p>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* ─── Action Dialog ──────────────────────────────────── */}
      <Dialog
        open={!!actionType}
        onOpenChange={(open) => {
          if (!open) {
            setActionType(null);
            setTargetEarning(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionType === "pay"
                ? t("Als ausgezahlt markieren", "Mark as paid")
                : actionType === "block"
                ? t("Earning blockieren", "Block earning")
                : t("Auszahlung stornieren", "Reverse payout")}
            </DialogTitle>
            <DialogDescription>
              {targetEarning && (
                <span>
                  {targetEarning.referrer_name} — €{targetEarning.reward_amount?.toFixed(0)}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {actionType === "pay" && (
              <div className="space-y-2">
                <Label>{t("Auszahlungs-Referenz (optional)", "Payout reference (optional)")}</Label>
                <Input
                  value={payoutRef}
                  onChange={(e) => setPayoutRef(e.target.value)}
                  placeholder={t("z.B. IBAN-Transfer-ID", "e.g. IBAN transfer ID")}
                  maxLength={200}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>
                {actionType === "pay"
                  ? t("Notiz (optional)", "Note (optional)")
                  : t("Grund (Pflichtfeld)", "Reason (required)")}
              </Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  actionType === "block"
                    ? t("z.B. Verdacht auf Fake-Referral", "e.g. suspected fake referral")
                    : actionType === "reverse"
                    ? t("z.B. Storno des zugrunde liegenden Deals", "e.g. underlying deal refunded")
                    : t("Optionale Notiz…", "Optional note…")
                }
                maxLength={500}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActionType(null)} disabled={submitting}>
              {t("Abbrechen", "Cancel")}
            </Button>
            <Button
              variant={actionType === "pay" ? "default" : "destructive"}
              onClick={handleAction}
              disabled={submitting}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {actionType === "pay"
                ? t("Auszahlung bestätigen", "Confirm payout")
                : actionType === "block"
                ? t("Blockieren", "Block")
                : t("Stornieren", "Reverse")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
