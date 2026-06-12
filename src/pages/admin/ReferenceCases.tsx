/**
 * Reference Case Generator — admin only.
 *
 * Turns pilot data (from a partner_profile, partner_lead, or fully manual
 * input) into a buyer-ready one-pager with:
 *   - Client outcomes (headline + named/anonymized testimonial)
 *   - Funnel metrics (leads → calls → deals → revenue → close rate)
 *   - A SHA-256 verification hash an auditor can recompute from the
 *     persisted row to confirm the PDF wasn't tampered with.
 *
 * Honesty rails:
 *   - close_rate_pct is derived from held/closed; we never let the user
 *     hand-type a number that doesn't reconcile.
 *   - "Buyer-ready" requires real proof (named testimonial OR anonymized
 *     audit). Internal-only cases stay flagged DRAFT in the PDF.
 *   - When no source row is selected, the PDF is stamped "MANUAL INPUT —
 *     NOT BACKED BY DB SOURCE" so a buyer can challenge it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Hash,
  Loader2,
  Save,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  buyerReadyIssues,
  deriveCloseRate,
  verificationHash,
  type ReferenceCaseInput,
} from "@/lib/reference-case";

interface PartnerProfileRow {
  id: string;
  company_name: string | null;
  partner_type: string | null;
  total_offers: number | null;
  total_closers: number | null;
  total_revenue: number | null;
  status: string | null;
}

interface PartnerLeadRow {
  id: string;
  company_name: string | null;
  industry: string | null;
  monthly_leads: number | null;
  monthly_booked_calls: number | null;
  avg_offer_price: number | null;
  current_close_rate: number | null;
  status: string | null;
}

interface SavedCaseRow {
  id: string;
  client_name: string;
  outcome_headline: string;
  status: string;
  proof_type: string;
  verification_hash: string;
  created_at: string;
  pdf_generated_at: string | null;
}

const EMPTY: ReferenceCaseInput = {
  client_name: "",
  client_industry: "",
  client_company_size: "",
  pilot_window_start: "",
  pilot_window_end: "",
  outcome_headline: "",
  metric_leads_in: 0,
  metric_calls_booked: 0,
  metric_calls_held: 0,
  metric_deals_closed: 0,
  metric_revenue_eur: 0,
  metric_close_rate_pct: 0,
  proof_type: "internal_only",
  testimonial_quote: "",
  testimonial_author: "",
  testimonial_role: "",
  testimonial_anonymized: false,
  source_partner_profile_id: null,
  source_partner_lead_id: null,
};

export default function ReferenceCases() {
  const { isAdmin } = useAuth();
  const [input, setInput] = useState<ReferenceCaseInput>(EMPTY);
  const [hash, setHash] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [partnerProfiles, setPartnerProfiles] = useState<PartnerProfileRow[]>([]);
  const [partnerLeads, setPartnerLeads] = useState<PartnerLeadRow[]>([]);
  const [savedCases, setSavedCases] = useState<SavedCaseRow[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);

  // Auto-derive close rate so the metric in the PDF always reconciles.
  useEffect(() => {
    setInput((prev) => ({
      ...prev,
      metric_close_rate_pct: deriveCloseRate(prev.metric_calls_held, prev.metric_deals_closed),
    }));
  }, [input.metric_calls_held, input.metric_deals_closed]);

  // Recompute the verification hash on every change. The buyer sees the
  // exact same hash that gets stored, so there's no "what was signed?" gap.
  useEffect(() => {
    let cancelled = false;
    verificationHash(input).then((h) => {
      if (!cancelled) setHash(h);
    });
    return () => {
      cancelled = true;
    };
  }, [input]);

  const loadSources = useCallback(async () => {
    setLoadingSources(true);
    const [profiles, leads, cases] = await Promise.all([
      supabase
        .from("partner_profiles")
        .select("id, company_name, partner_type, total_offers, total_closers, total_revenue, status")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("partner_leads")
        .select(
          "id, company_name, industry, monthly_leads, monthly_booked_calls, avg_offer_price, current_close_rate, status",
        )
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("reference_cases")
        .select("id, client_name, outcome_headline, status, proof_type, verification_hash, created_at, pdf_generated_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setPartnerProfiles((profiles.data ?? []) as PartnerProfileRow[]);
    setPartnerLeads((leads.data ?? []) as PartnerLeadRow[]);
    setSavedCases((cases.data ?? []) as SavedCaseRow[]);
    setLoadingSources(false);
  }, []);

  useEffect(() => {
    if (isAdmin) loadSources();
  }, [isAdmin, loadSources]);

  const issues = useMemo(() => buyerReadyIssues(input), [input]);
  const isBuyerReady = issues.length === 0;
  const hasDbSource = !!(input.source_partner_profile_id || input.source_partner_lead_id);

  const onPickProfile = (id: string) => {
    if (id === "__none__") {
      setInput((p) => ({ ...p, source_partner_profile_id: null }));
      return;
    }
    const p = partnerProfiles.find((x) => x.id === id);
    if (!p) return;
    setInput((prev) => ({
      ...prev,
      source_partner_profile_id: p.id,
      source_partner_lead_id: null,
      client_name: prev.client_name || p.company_name || "",
      metric_revenue_eur: prev.metric_revenue_eur || Number(p.total_revenue ?? 0),
    }));
    toast.success("Partner-Profil als Quelle übernommen.");
  };

  const onPickLead = (id: string) => {
    if (id === "__none__") {
      setInput((p) => ({ ...p, source_partner_lead_id: null }));
      return;
    }
    const l = partnerLeads.find((x) => x.id === id);
    if (!l) return;
    setInput((prev) => ({
      ...prev,
      source_partner_lead_id: l.id,
      source_partner_profile_id: null,
      client_name: prev.client_name || l.company_name || "",
      client_industry: prev.client_industry || l.industry || "",
      metric_leads_in: prev.metric_leads_in || Number(l.monthly_leads ?? 0),
      metric_calls_booked: prev.metric_calls_booked || Number(l.monthly_booked_calls ?? 0),
    }));
    toast.success("Partner-Lead als Quelle übernommen. Pilot-Metriken trotzdem manuell prüfen.");
  };

  const generatePdf = useCallback(
    (forSaving = false) => {
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 18;
      let y = margin;

      // Header bar
      doc.setFillColor(20, 20, 20);
      doc.rect(0, 0, pageWidth, 12, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("ETHICAL TOP CLOSER · REFERENCE CASE", margin, 8);
      doc.text(new Date().toLocaleDateString("de-DE"), pageWidth - margin, 8, { align: "right" });

      doc.setTextColor(20, 20, 20);
      y = 22;

      // Status stamp
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      const stamp = !isBuyerReady
        ? "DRAFT — NOT BUYER-READY"
        : !hasDbSource
          ? "MANUAL INPUT — NOT BACKED BY DB SOURCE"
          : input.proof_type === "named_testimonial"
            ? "NAMED TESTIMONIAL — PUBLISHABLE"
            : "ANONYMIZED · AUDITOR-VERIFIABLE";
      doc.setTextColor(!isBuyerReady || !hasDbSource ? 180 : 30, !isBuyerReady || !hasDbSource ? 60 : 110, 30);
      doc.text(stamp, margin, y);
      doc.setTextColor(20, 20, 20);
      y += 8;

      // Client + window
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text(input.client_name || "—", margin, y);
      y += 7;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(90, 90, 90);
      const meta = [input.client_industry, input.client_company_size]
        .filter(Boolean)
        .join(" · ");
      if (meta) doc.text(meta, margin, y);
      y += 5;
      doc.text(
        `Pilot-Zeitraum: ${input.pilot_window_start || "—"}  →  ${input.pilot_window_end || "—"}`,
        margin,
        y,
      );
      y += 8;

      // Outcome headline
      doc.setTextColor(20, 20, 20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      const headline = doc.splitTextToSize(input.outcome_headline || "—", pageWidth - 2 * margin);
      doc.text(headline, margin, y);
      y += headline.length * 6 + 4;

      // Metric table
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Funnel-Metrik", "Wert"]],
        body: [
          ["Leads in Pilot", String(input.metric_leads_in)],
          ["Gebuchte Calls", String(input.metric_calls_booked)],
          ["Gehaltene Calls", String(input.metric_calls_held)],
          ["Abgeschlossene Deals", String(input.metric_deals_closed)],
          [
            "Umsatz (EUR)",
            input.metric_revenue_eur.toLocaleString("de-DE", {
              style: "currency",
              currency: "EUR",
              maximumFractionDigits: 0,
            }),
          ],
          [
            "Close-Rate (held → closed)",
            `${input.metric_close_rate_pct.toFixed(2)} %`,
          ],
        ],
        theme: "grid",
        headStyles: { fillColor: [20, 20, 20], textColor: 255 },
        styles: { fontSize: 10 },
      });
      // @ts-expect-error autotable plugin attaches lastAutoTable
      y = (doc.lastAutoTable?.finalY ?? y) + 8;

      // Proof block
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Proof", margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);

      if (input.proof_type === "named_testimonial" && input.testimonial_quote) {
        const quote = doc.splitTextToSize(`„${input.testimonial_quote}"`, pageWidth - 2 * margin);
        doc.text(quote, margin, y);
        y += quote.length * 5 + 3;
        doc.setFont("helvetica", "italic");
        doc.text(
          `— ${input.testimonial_author ?? ""}${input.testimonial_role ? `, ${input.testimonial_role}` : ""}`,
          margin,
          y,
        );
        y += 6;
      } else if (input.proof_type === "anonymized_audit" && input.testimonial_quote) {
        const quote = doc.splitTextToSize(
          `„${input.testimonial_quote}" (Identität anonymisiert; auf Anfrage durch Auditor verifizierbar via Hash unten.)`,
          pageWidth - 2 * margin,
        );
        doc.text(quote, margin, y);
        y += quote.length * 5 + 6;
      } else {
        doc.setTextColor(180, 60, 30);
        doc.text(
          "Kein extern verwertbarer Proof hinterlegt. Diese Seite ist intern.",
          margin,
          y,
        );
        doc.setTextColor(20, 20, 20);
        y += 6;
      }

      // Footer: hash + source
      const footY = doc.internal.pageSize.getHeight() - 20;
      doc.setDrawColor(200);
      doc.line(margin, footY, pageWidth - margin, footY);
      doc.setFontSize(8);
      doc.setTextColor(110, 110, 110);
      doc.text(`Verification SHA-256: ${hash}`, margin, footY + 5);
      doc.text(
        hasDbSource
          ? `DB-Quelle: ${input.source_partner_profile_id ? "partner_profiles" : "partner_leads"}/${input.source_partner_profile_id ?? input.source_partner_lead_id}`
          : "DB-Quelle: keine (manuelle Eingabe)",
        margin,
        footY + 9,
      );
      doc.text(
        "Auditor: jeder mit Zugriff auf die Zeile in `reference_cases` kann den Hash über die kanonisierte Payload reproduzieren.",
        margin,
        footY + 13,
      );

      if (forSaving) return doc;
      doc.save(
        `reference-case_${(input.client_name || "draft").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}_${hash.slice(0, 8)}.pdf`,
      );
      return doc;
    },
    [input, hash, isBuyerReady, hasDbSource],
  );

  const onSave = useCallback(async () => {
    if (issues.length > 0) {
      toast.error("Erst die offenen Punkte fixen, dann speichern.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("reference_cases").insert({
      client_name: input.client_name.trim(),
      client_industry: input.client_industry?.trim() || null,
      client_company_size: input.client_company_size?.trim() || null,
      pilot_window_start: input.pilot_window_start,
      pilot_window_end: input.pilot_window_end,
      outcome_headline: input.outcome_headline.trim(),
      metric_leads_in: Math.trunc(input.metric_leads_in),
      metric_calls_booked: Math.trunc(input.metric_calls_booked),
      metric_calls_held: Math.trunc(input.metric_calls_held),
      metric_deals_closed: Math.trunc(input.metric_deals_closed),
      metric_revenue_eur: Number(input.metric_revenue_eur),
      metric_close_rate_pct: Number(input.metric_close_rate_pct),
      proof_type: input.proof_type,
      testimonial_quote: input.testimonial_quote?.trim() || null,
      testimonial_author: input.testimonial_author?.trim() || null,
      testimonial_role: input.testimonial_role?.trim() || null,
      testimonial_anonymized: input.testimonial_anonymized,
      verification_hash: hash,
      source_partner_profile_id: input.source_partner_profile_id,
      source_partner_lead_id: input.source_partner_lead_id,
      status: "published",
      pdf_generated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      toast.error(`Speichern fehlgeschlagen: ${error.message}`);
      return;
    }
    toast.success("Reference Case gespeichert. Hash auditierbar in DB.");
    generatePdf(false);
    loadSources();
  }, [input, hash, issues, generatePdf, loadSources]);

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Zugriff verweigert</AlertTitle>
          <AlertDescription>Diese Seite ist nur für Administratoren zugänglich.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Reference Case Generator</h1>
        <p className="text-muted-foreground max-w-3xl">
          Verwandelt Pilot-Daten in eine käuferreife One-Pager-PDF mit Funnel-Metriken,
          Outcome-Headline und named/anonymisiertem Proof. Jeder Case wird mit einem
          SHA-256-Hash signiert, den ein Auditor aus der gespeicherten Zeile reproduzieren kann.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEFT: form */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" /> Pilot-Daten
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Source picker */}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Quelle: Partner-Profil</Label>
                <Select
                  value={input.source_partner_profile_id ?? "__none__"}
                  onValueChange={onPickProfile}
                  disabled={loadingSources}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Keine —</SelectItem>
                    {partnerProfiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.company_name ?? p.id.slice(0, 8)} · {p.partner_type ?? "—"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Quelle: Partner-Lead</Label>
                <Select
                  value={input.source_partner_lead_id ?? "__none__"}
                  onValueChange={onPickLead}
                  disabled={loadingSources}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Keine —</SelectItem>
                    {partnerLeads.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.company_name ?? l.id.slice(0, 8)} · {l.industry ?? "—"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!loadingSources && partnerProfiles.length === 0 && partnerLeads.length === 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Keine DB-Quelle vorhanden</AlertTitle>
                <AlertDescription>
                  Aktuell gibt es weder Partner-Profile noch Partner-Leads in der Datenbank.
                  Du kannst trotzdem manuell einen Case erstellen — die generierte PDF wird
                  dann sichtbar als „MANUAL INPUT" gestempelt.
                </AlertDescription>
              </Alert>
            )}

            {/* Client */}
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1 md:col-span-2">
                <Label>Kundenname *</Label>
                <Input
                  value={input.client_name}
                  onChange={(e) => setInput({ ...input, client_name: e.target.value })}
                  placeholder="z. B. ACME GmbH"
                />
              </div>
              <div className="space-y-1">
                <Label>Branche</Label>
                <Input
                  value={input.client_industry ?? ""}
                  onChange={(e) => setInput({ ...input, client_industry: e.target.value })}
                  placeholder="z. B. Coaching"
                />
              </div>
              <div className="space-y-1">
                <Label>Unternehmensgröße</Label>
                <Input
                  value={input.client_company_size ?? ""}
                  onChange={(e) => setInput({ ...input, client_company_size: e.target.value })}
                  placeholder="z. B. 5–20 Mitarbeitende"
                />
              </div>
              <div className="space-y-1">
                <Label>Pilot-Start *</Label>
                <Input
                  type="date"
                  value={input.pilot_window_start}
                  onChange={(e) => setInput({ ...input, pilot_window_start: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Pilot-Ende *</Label>
                <Input
                  type="date"
                  value={input.pilot_window_end}
                  onChange={(e) => setInput({ ...input, pilot_window_end: e.target.value })}
                />
              </div>
            </div>

            {/* Headline */}
            <div className="space-y-1">
              <Label>Outcome Headline (1 Satz, käuferorientiert) *</Label>
              <Textarea
                value={input.outcome_headline}
                onChange={(e) => setInput({ ...input, outcome_headline: e.target.value })}
                placeholder='z. B. „In 6 Wochen 18 % höhere Close-Rate auf bestehenden Calls — ohne neue Werbeausgaben."'
                rows={2}
              />
            </div>

            {/* Metrics */}
            <div className="grid gap-3 md:grid-cols-3">
              <NumField
                label="Leads im Pilot"
                value={input.metric_leads_in}
                onChange={(v) => setInput({ ...input, metric_leads_in: v })}
              />
              <NumField
                label="Calls gebucht"
                value={input.metric_calls_booked}
                onChange={(v) => setInput({ ...input, metric_calls_booked: v })}
              />
              <NumField
                label="Calls gehalten"
                value={input.metric_calls_held}
                onChange={(v) => setInput({ ...input, metric_calls_held: v })}
              />
              <NumField
                label="Deals abgeschlossen"
                value={input.metric_deals_closed}
                onChange={(v) => setInput({ ...input, metric_deals_closed: v })}
              />
              <NumField
                label="Umsatz (EUR)"
                value={input.metric_revenue_eur}
                onChange={(v) => setInput({ ...input, metric_revenue_eur: v })}
                step={0.01}
              />
              <div className="space-y-1">
                <Label>Close-Rate (auto)</Label>
                <Input
                  value={`${input.metric_close_rate_pct.toFixed(2)} %`}
                  readOnly
                  className="bg-muted"
                />
              </div>
            </div>

            {/* Proof */}
            <div className="space-y-3 rounded-md border p-4">
              <div className="flex items-center gap-2">
                <Label className="text-base">Proof-Typ</Label>
              </div>
              <Select
                value={input.proof_type}
                onValueChange={(v: ReferenceCaseInput["proof_type"]) =>
                  setInput({
                    ...input,
                    proof_type: v,
                    testimonial_anonymized: v === "anonymized_audit",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="named_testimonial">Named Testimonial (publishable)</SelectItem>
                  <SelectItem value="anonymized_audit">Anonymized + auditor-verifiable</SelectItem>
                  <SelectItem value="internal_only">Internal only (kein Buyer-Use)</SelectItem>
                </SelectContent>
              </Select>

              {input.proof_type !== "internal_only" && (
                <>
                  <div className="space-y-1">
                    <Label>Zitat *</Label>
                    <Textarea
                      value={input.testimonial_quote ?? ""}
                      onChange={(e) =>
                        setInput({ ...input, testimonial_quote: e.target.value })
                      }
                      rows={3}
                      placeholder={
                        input.proof_type === "anonymized_audit"
                          ? "z. B. „Geprüft durch externen Auditor; Identität auf Anfrage offenlegbar."
                          : "Originalzitat des Kunden"
                      }
                    />
                  </div>
                  {input.proof_type === "named_testimonial" && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label>Autor *</Label>
                        <Input
                          value={input.testimonial_author ?? ""}
                          onChange={(e) =>
                            setInput({ ...input, testimonial_author: e.target.value })
                          }
                          placeholder="Max Mustermann"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Rolle / Firma</Label>
                        <Input
                          value={input.testimonial_role ?? ""}
                          onChange={(e) => setInput({ ...input, testimonial_role: e.target.value })}
                          placeholder="CEO, ACME GmbH"
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="anon"
                      checked={input.testimonial_anonymized}
                      onCheckedChange={(c) =>
                        setInput({ ...input, testimonial_anonymized: c === true })
                      }
                      disabled={input.proof_type === "anonymized_audit"}
                    />
                    <Label htmlFor="anon" className="font-normal">
                      Identität anonymisieren (Pflicht bei „anonymized_audit")
                    </Label>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* RIGHT: status + actions */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Hash className="h-5 w-5" /> Verification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-xs uppercase text-muted-foreground">SHA-256</div>
                <code className="block break-all text-xs bg-muted p-2 rounded">
                  {hash || "—"}
                </code>
              </div>
              <div className="text-xs text-muted-foreground">
                Wird sowohl in die PDF gedruckt als auch in der DB-Spalte{" "}
                <code>verification_hash</code> gespeichert. Ein Auditor kann
                ihn aus der kanonisierten Payload reproduzieren.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {isBuyerReady ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                )}
                Buyer-Ready Check
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {isBuyerReady ? (
                <Badge className="bg-primary text-primary-foreground hover:bg-primary">
                  PUBLISHABLE
                </Badge>
              ) : (
                <>
                  <Badge variant="destructive">DRAFT</Badge>
                  <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                    {issues.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </>
              )}
              {!hasDbSource && isBuyerReady && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Kein Partner-Profil/Lead verknüpft — PDF wird als „MANUAL
                    INPUT" gestempelt.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-2">
              <Button className="w-full" onClick={() => generatePdf(false)}>
                <Download className="mr-2 h-4 w-4" /> PDF generieren (Vorschau)
              </Button>
              <Button
                className="w-full"
                variant="default"
                onClick={onSave}
                disabled={saving || !isBuyerReady}
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Speichern + PDF veröffentlichen
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setInput(EMPTY)}>
                Formular leeren
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Saved cases */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Gespeicherte Reference Cases
          </CardTitle>
        </CardHeader>
        <CardContent>
          {savedCases.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Noch keine Reference Cases gespeichert.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3">Kunde</th>
                    <th className="py-2 pr-3">Headline</th>
                    <th className="py-2 pr-3">Proof</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Hash</th>
                    <th className="py-2 pr-3">Erstellt</th>
                  </tr>
                </thead>
                <tbody>
                  {savedCases.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{c.client_name}</td>
                      <td className="py-2 pr-3 text-muted-foreground max-w-md truncate">
                        {c.outcome_headline}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline">{c.proof_type}</Badge>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant={c.status === "published" ? "default" : "secondary"}>
                          {c.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">
                        <code className="text-xs">{c.verification_hash.slice(0, 12)}…</code>
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground tabular-nums">
                        {new Date(c.created_at).toLocaleDateString("de-DE")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
  );
}
