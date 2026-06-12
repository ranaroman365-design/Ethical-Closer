import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus } from "lucide-react";

interface Props {
  /** L6+ only — gates the inline form */
  canEdit: boolean;
  onSaved?: () => void;
}

const SOURCES = ["Meta", "Google", "TikTok", "YouTube", "Organic", "Other"];

export default function AdSpendForm({ canEdit, onSaved }: Props) {
  const [open, setOpen]         = useState(false);
  const [date, setDate]         = useState(() => new Date().toISOString().slice(0, 10));
  const [source, setSource]     = useState("Meta");
  const [campaign, setCampaign] = useState("");
  const [amount, setAmount]     = useState("");
  const [saving, setSaving]     = useState(false);

  if (!canEdit) return null;

  const save = async () => {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt < 0) { toast.error("Ungültiger Betrag"); return; }
    setSaving(true);
    const { error } = await supabase
      .from("ad_spend_daily" as never)
      .upsert({
        spend_date: date,
        source,
        campaign: campaign.trim() || null,
        amount: amt,
        created_by: (await supabase.auth.getUser()).data.user?.id,
      } as never, { onConflict: "spend_date,source,campaign" } as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Spend gespeichert");
    setAmount(""); setCampaign(""); setOpen(false);
    onSaved?.();
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="h-8">
        <Plus className="h-3.5 w-3.5 mr-1.5" /> Spend eintragen
      </Button>
    );
  }

  return (
    <Card className="p-4 border-border/40">
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Datum</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Source</Label>
          <select
            value={source} onChange={(e) => setSource(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Kampagne (optional)</Label>
          <Input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="z.B. CBO_Lookalike" className="h-9" />
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Betrag (€)</Label>
          <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="120.00" className="h-9" />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={saving} className="flex-1">
            {saving ? "Speichern…" : "Speichern"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Abbrechen</Button>
        </div>
      </div>
    </Card>
  );
}
