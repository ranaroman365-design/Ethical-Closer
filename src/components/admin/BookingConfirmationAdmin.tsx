import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, AlertTriangle, RefreshCw } from "lucide-react";

interface ClaimedLead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  booking_status: string | null;
  lead_status: string | null;
  created_at: string;
  updated_at: string;
}

export default function BookingConfirmationAdmin() {
  const { toast } = useToast();
  const [leads, setLeads] = useState<ClaimedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);

  const fetchLeads = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("leads")
      .select("id, name, email, phone, booking_status, lead_status, created_at, updated_at")
      .in("booking_status", ["booking_claimed", "booking_verified"])
      .order("updated_at", { ascending: false })
      .limit(50);
    if (!error && data) setLeads(data as ClaimedLead[]);
    setLoading(false);
  };

  useEffect(() => { fetchLeads(); }, []);

  const confirmBooking = async (leadId: string) => {
    setConfirming(leadId);
    const { data, error } = await supabase.rpc("confirm_booking_admin" as any, { p_lead_id: leadId });
    setConfirming(null);
    const result = data as { success?: boolean; error?: string } | null;
    if (error || result?.error) {
      toast({ title: "Fehler", description: (error?.message || result?.error) ?? "Unbekannter Fehler", variant: "destructive" });
      return;
    }
    toast({ title: "Buchung bestätigt ✓", description: "Lead wurde zu Bewerber konvertiert." });
    fetchLeads();
  };

  const statusBadge = (status: string | null) => {
    if (status === "booking_verified") return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30"><CheckCircle2 className="mr-1 h-3 w-3" /> Verifiziert</Badge>;
    if (status === "booking_claimed") return <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30"><Clock className="mr-1 h-3 w-3" /> Beansprucht</Badge>;
    return <Badge variant="outline">{status || "none"}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Buchungs-Bestätigungen</h3>
          <p className="text-sm text-muted-foreground">
            Leads mit beanspruchten Buchungen prüfen und manuell bestätigen.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLeads} disabled={loading}>
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Aktualisieren
        </Button>
      </div>

      {leads.length === 0 && !loading && (
        <div className="rounded-md border border-border/40 bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Keine Buchungen zur Bestätigung vorhanden.
        </div>
      )}

      <div className="space-y-2">
        {leads.map((lead) => (
          <div key={lead.id} className="flex items-center justify-between rounded-md border border-border/40 bg-card p-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{lead.name}</span>
                {statusBadge(lead.booking_status)}
              </div>
              <p className="text-xs text-muted-foreground">{lead.email} · {lead.phone}</p>
              <p className="text-xs text-muted-foreground">
                Aktualisiert: {new Date(lead.updated_at).toLocaleString("de-DE")}
              </p>
            </div>
            {lead.booking_status === "booking_claimed" && (
              <Button
                size="sm"
                onClick={() => confirmBooking(lead.id)}
                disabled={confirming === lead.id}
              >
                {confirming === lead.id ? "Wird bestätigt…" : "Buchung bestätigen"}
              </Button>
            )}
            {lead.booking_status === "booking_verified" && (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            )}
          </div>
        ))}
      </div>

      <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
          <p className="text-xs text-muted-foreground">
            <strong>Hinweis:</strong> Nur bestätigte Buchungen konvertieren Leads von „Interessent" zu „Bewerber".
            Prüfe vor der Bestätigung, ob der Termin tatsächlich im Kalender existiert.
          </p>
        </div>
      </div>
    </div>
  );
}
