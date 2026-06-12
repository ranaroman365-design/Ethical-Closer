import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { BellRing, Pencil, Plus } from "lucide-react";

type Role = "setter" | "senior_closer" | "admin";
type NotificationType = "whatsapp" | "sms" | "both";

interface Recipient {
  id: string;
  role: Role;
  name: string;
  phone: string;
  notification_type: NotificationType;
  is_active: boolean;
  updated_at: string;
}

const ROLE_LABEL: Record<Role, string> = {
  setter: "Setter",
  senior_closer: "Senior Closer",
  admin: "Admin",
};

const E164 = /^\+[1-9][0-9]{6,14}$/;

interface FormState {
  id?: string;
  role: Role;
  name: string;
  phone: string;
  notification_type: NotificationType;
  is_active: boolean;
}

const EMPTY: FormState = {
  role: "setter",
  name: "",
  phone: "",
  notification_type: "whatsapp",
  is_active: true,
};

export default function InternalNotifications() {
  const { isAdmin, isLoading: permLoading } = useAuth();
  const [items, setItems] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("mos_internal_notification_recipients")
      .select("*")
      .order("role", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      toast({ title: "Laden fehlgeschlagen", description: error.message, variant: "destructive" });
    } else {
      setItems((data ?? []) as Recipient[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin]);

  if (permLoading) return null;
  if (!isAdmin) return <Navigate to="/members" replace />;

  const openCreate = () => { setForm(EMPTY); setOpen(true); };
  const openEdit = (r: Recipient) => {
    setForm({
      id: r.id, role: r.role, name: r.name, phone: r.phone,
      notification_type: r.notification_type, is_active: r.is_active,
    });
    setOpen(true);
  };

  const toggleActive = async (r: Recipient) => {
    const { error } = await supabase
      .from("mos_internal_notification_recipients")
      .update({ is_active: !r.is_active, updated_at: new Date().toISOString() })
      .eq("id", r.id);
    if (error) {
      toast({ title: "Update fehlgeschlagen", description: error.message, variant: "destructive" });
    } else {
      toast({ title: r.is_active ? "Deaktiviert" : "Aktiviert" });
      void load();
    }
  };

  const save = async () => {
    const name = form.name.trim();
    const phone = form.phone.trim();
    if (!name) {
      toast({ title: "Name erforderlich", variant: "destructive" }); return;
    }
    if (!E164.test(phone)) {
      toast({
        title: "Ungültiges Telefonformat",
        description: "Bitte E.164 Format verwenden, z.B. +491701234567",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const payload = {
      role: form.role, name, phone,
      notification_type: form.notification_type,
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    };
    const { error } = form.id
      ? await supabase.from("mos_internal_notification_recipients").update(payload).eq("id", form.id)
      : await supabase.from("mos_internal_notification_recipients").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Speichern fehlgeschlagen", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: form.id ? "Empfänger aktualisiert" : "Empfänger hinzugefügt" });
    setOpen(false);
    void load();
  };

  const grouped: Record<Role, Recipient[]> = { setter: [], senior_closer: [], admin: [] };
  items.forEach(r => grouped[r.role]?.push(r));

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <BellRing className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Interne Booking-Benachrichtigungen</h1>
            <p className="text-sm text-muted-foreground">
              Empfänger für MOS Post-Booking Alerts (WhatsApp / SMS). Leads erhalten nichts.
            </p>
          </div>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Empfänger hinzufügen</Button>
      </div>

      {(["setter", "senior_closer", "admin"] as Role[]).map(role => (
        <Card key={role}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">{ROLE_LABEL[role]}</CardTitle>
            <Badge variant="outline">{grouped[role].length}</Badge>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Lade…</p>
            ) : grouped[role].length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Empfänger konfiguriert.</p>
            ) : (
              <div className="space-y-2">
                {grouped[role].map(r => (
                  <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/50 bg-card/50">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{r.name}</span>
                        <Badge variant="outline" className="text-[10px] uppercase">{r.notification_type}</Badge>
                        {!r.is_active && <Badge variant="secondary" className="text-[10px]">inaktiv</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">{r.phone}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch checked={r.is_active} onCheckedChange={() => toggleActive(r)} aria-label="aktiv" />
                      <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Empfänger bearbeiten" : "Empfänger hinzufügen"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Rolle</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v as Role }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="setter">Setter</SelectItem>
                  <SelectItem value="senior_closer">Senior Closer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label>Telefonnummer (E.164)</Label>
              <Input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value.trim() }))}
                placeholder="+491701234567"
                inputMode="tel"
              />
              <p className="text-[11px] text-muted-foreground">
                Format: führendes „+", Ländercode, keine Leerzeichen. Beispiel: +491701234567
              </p>
            </div>
            <div className="space-y-2">
              <Label>Notification Type</Label>
              <Select
                value={form.notification_type}
                onValueChange={v => setForm(f => ({ ...f, notification_type: v as NotificationType }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="both">Beide parallel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="active">Aktiv</Label>
              <Switch id="active" checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Speichere…" : "Speichern"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
