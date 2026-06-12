import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

interface Origin {
  origin_id: string;
  origin_type: "DL" | "TEAM" | "FOUNDER" | "PARTNER";
  label: string;
  funnel_id: string | null;
  active: boolean;
}

interface Props { canEdit: boolean; }

const TYPES: Origin["origin_type"][] = ["DL", "TEAM", "FOUNDER", "PARTNER"];
const TYPE_TONE: Record<Origin["origin_type"], string> = {
  DL:      "bg-muted text-muted-foreground border-border",
  TEAM:    "bg-primary/10 text-primary border-primary/30",
  FOUNDER: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  PARTNER: "bg-secondary text-secondary-foreground border-border",
};

export default function OriginsAdminCard({ canEdit }: Props) {
  const [origins, setOrigins] = useState<Origin[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    origin_id: "",
    origin_type: "TEAM" as Origin["origin_type"],
    label: "",
    funnel_id: "",
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("origins" as never)
      .select("origin_id,origin_type,label,funnel_id,active")
      .order("origin_type", { ascending: true })
      .order("label", { ascending: true });
    if (error) { toast.error(error.message); return; }
    setOrigins((data ?? []) as unknown as Origin[]);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.origin_id.trim() || !form.label.trim()) {
      toast.error("Origin-ID und Label sind Pflicht"); return;
    }
    setSaving(true);
    const { error } = await supabase.from("origins" as never).insert({
      origin_id: form.origin_id.trim(),
      origin_type: form.origin_type,
      label: form.label.trim(),
      funnel_id: form.funnel_id.trim() || null,
    } as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Origin angelegt");
    setForm({ origin_id: "", origin_type: "TEAM", label: "", funnel_id: "" });
    setOpen(false); load();
  };

  const toggleActive = async (o: Origin) => {
    const { error } = await supabase
      .from("origins" as never)
      .update({ active: !o.active } as never)
      .eq("origin_id", o.origin_id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const remove = async (o: Origin) => {
    if (!confirm(`Origin "${o.label}" wirklich löschen?`)) return;
    const { error } = await supabase.from("origins" as never).delete().eq("origin_id", o.origin_id);
    if (error) { toast.error(error.message); return; }
    toast.success("Origin gelöscht"); load();
  };

  return (
    <Card className="p-5 border-border/40">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Origins Registry</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Origin-IDs werden Leads via Quiz-Param (`?origin=team_oleg`) oder UTM zugeordnet.
          </p>
        </div>
        {canEdit && !open && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="h-8">
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Origin
          </Button>
        )}
      </div>

      {open && canEdit && (
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end mb-4 p-3 rounded-lg bg-muted/40">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Origin-ID</Label>
            <Input value={form.origin_id} onChange={(e) => setForm({ ...form, origin_id: e.target.value })} placeholder="team_oleg" className="h-9" />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Type</Label>
            <select
              value={form.origin_type}
              onChange={(e) => setForm({ ...form, origin_type: e.target.value as Origin["origin_type"] })}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Label</Label>
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Team Oleg" className="h-9" />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Funnel-ID</Label>
            <Input value={form.funnel_id} onChange={(e) => setForm({ ...form, funnel_id: e.target.value })} placeholder="oleg_funnel" className="h-9" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving} className="flex-1">{saving ? "…" : "Speichern"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>×</Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
              <th className="text-left py-2 font-medium">ID</th>
              <th className="text-left py-2 font-medium">Type</th>
              <th className="text-left py-2 font-medium">Label</th>
              <th className="text-left py-2 font-medium">Funnel</th>
              <th className="text-left py-2 font-medium">Status</th>
              {canEdit && <th className="text-right py-2 font-medium">Action</th>}
            </tr>
          </thead>
          <tbody>
            {origins.map((o) => (
              <tr key={o.origin_id} className="border-b border-border/20 hover:bg-muted/30">
                <td className="py-2 text-xs text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>{o.origin_id}</td>
                <td className="py-2"><Badge variant="outline" className={`text-[10px] ${TYPE_TONE[o.origin_type]}`}>{o.origin_type}</Badge></td>
                <td className="py-2 text-foreground font-medium">{o.label}</td>
                <td className="py-2 text-xs text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>{o.funnel_id ?? "—"}</td>
                <td className="py-2">
                  {o.active
                    ? <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">aktiv</Badge>
                    : <Badge variant="outline" className="text-[10px]">inaktiv</Badge>}
                </td>
                {canEdit && (
                  <td className="py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(o)} className="h-7 text-[11px]">
                      {o.active ? "deaktivieren" : "aktivieren"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(o)} className="h-7 text-destructive hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
