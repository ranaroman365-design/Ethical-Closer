import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/i18n/LanguageContext";
import PaymentLinkGenerator from "@/components/closer/PaymentLinkGenerator";
import PaymentLinksDashboard from "@/components/closer/PaymentLinksDashboard";
import LeadPickerCombobox, { type SelectableLead } from "@/components/closer/LeadPickerCombobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wallet, BarChart3, Plus, CheckCircle2, X } from "lucide-react";

export default function PaymentLinksPage() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const t = (de: string, en: string) => (lang === "de" ? de : en);

  const [tab, setTab] = useState("dashboard");
  const [leadId, setLeadId] = useState("");
  const [leadName, setLeadName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [pickedLead, setPickedLead] = useState<SelectableLead | null>(null);
  const [started, setStarted] = useState(false);

  if (!user) return null;

  function handlePick(lead: SelectableLead) {
    setLeadId(lead.lead_id);
    setLeadName(lead.name?.trim() ?? "");
    setLeadEmail(lead.email ?? "");
    setPickedLead(lead);
  }

  function clearPicked() {
    setPickedLead(null);
  }

  function handleLinkGenerated() {
    // After a link is generated, switch to dashboard to show it
    setStarted(false);
    setLeadId("");
    setLeadName("");
    setLeadEmail("");
    setPickedLead(null);
    setTab("dashboard");
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Wallet className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="font-serif text-xl font-semibold text-foreground">
            {t("Zahlungslinks", "Payment Links")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t("Revenue-System für Closer", "Revenue system for closers")}
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="dashboard" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            {t("Übersicht", "Overview")}
          </TabsTrigger>
          <TabsTrigger value="create" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            {t("Neuer Link", "New Link")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <PaymentLinksDashboard />
        </TabsContent>

        <TabsContent value="create">
          {!started ? (
            <div className="mx-auto max-w-md">
              <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {t("Lead auswählen", "Select lead")}
                  </Label>
                  <LeadPickerCombobox onSelect={handlePick} />
                  {pickedLead && (
                    <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
                      <div className="flex items-center gap-2 text-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        <span>
                          {t("Übernommen:", "Selected:")}{" "}
                          <span className="font-medium">{pickedLead.name || "(ohne Name)"}</span>
                        </span>
                      </div>
                      <button type="button" onClick={clearPicked} className="rounded p-0.5 text-muted-foreground hover:bg-muted">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
                  <div className="relative mx-auto inline-block bg-card px-2 text-[10px] uppercase tracking-wider text-muted-foreground left-1/2 -translate-x-1/2">
                    {t("oder manuell", "or manually")}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t("Name des Leads", "Lead name")}</Label>
                  <Input
                    placeholder="Max Mustermann"
                    value={leadName}
                    onChange={(e) => { setLeadName(e.target.value); setPickedLead(null); }}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t("E-Mail des Leads", "Lead email")}</Label>
                  <Input
                    type="email"
                    placeholder="max@example.com"
                    value={leadEmail}
                    onChange={(e) => { setLeadEmail(e.target.value); setPickedLead(null); }}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Lead-ID</Label>
                  <Input
                    placeholder={t("Wird bei Lead-Auswahl automatisch gesetzt", "Auto-set when picking a lead")}
                    value={leadId}
                    onChange={(e) => { setLeadId(e.target.value); setPickedLead(null); }}
                  />
                </div>
                <Button
                  onClick={() => setStarted(true)}
                  disabled={!leadName || !leadEmail}
                  className="w-full"
                >
                  {t("Weiter zur Deal-Auswahl →", "Continue to deal selection →")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-md">
              <PaymentLinkGenerator
                leadId={leadId}
                leadName={leadName}
                leadEmail={leadEmail}
                closerId={user.id}
                onLinkGenerated={(_token, _url) => handleLinkGenerated()}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
