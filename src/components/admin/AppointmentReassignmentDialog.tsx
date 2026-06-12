/**
 * AppointmentReassignmentDialog
 *
 * L6+/admin-only UI to take over an appointment or reassign it to another
 * Setter (L4+) or Closer (L6+).
 *
 * This component is purely presentational + thin RPC client. All authority
 * checks happen server-side in `reassign_appointment`. UI hiding is a
 * convenience, never a security boundary.
 *
 * Mount-anywhere: pass an appointment object + open/close state.
 * Triggers `onReassigned` callback so parents can refetch their calendar.
 *
 * Canon: Operational Canon (Layer 12) — ownership is auditable, never silent.
 * Aesthetic: Apple × Loro Piana, semantic tokens only.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useReassignAppointment, type OwnerRole } from "@/hooks/useReassignAppointment";
import { Loader2, ShieldCheck, UserCog } from "lucide-react";

export interface ReassignableAppointment {
  id: string;
  starts_at: string;
  appointment_status: string;
  setter_id?: string | null;
  closer_id?: string | null;
  current_owner_id?: string | null;
  current_owner_role?: OwnerRole | null;
  original_owner_id?: string | null;
  original_owner_role?: OwnerRole | null;
  lead_name?: string | null;
}

interface EligibleOperator {
  user_id: string;
  full_name: string | null;
  email: string | null;
  level: number;
}

interface Props {
  appointment: ReassignableAppointment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReassigned?: () => void;
}

export function AppointmentReassignmentDialog({
  appointment,
  open,
  onOpenChange,
  onReassigned,
}: Props) {
  const { user } = useAuth();
  const { reassign, loading: submitting } = useReassignAppointment();

  const [tab, setTab] = useState<"takeover" | "reassign">("takeover");
  const [targetRole, setTargetRole] = useState<OwnerRole>("closer");
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [operators, setOperators] = useState<EligibleOperator[]>([]);
  const [loadingOps, setLoadingOps] = useState(false);

  // Reset form on open
  useEffect(() => {
    if (open) {
      setTab("takeover");
      setTargetRole("closer");
      setTargetUserId("");
      setReason("");
    }
  }, [open, appointment?.id]);

  // Load eligible operators when reassign tab opens or role changes
  useEffect(() => {
    if (!open || tab !== "reassign") return;
    let cancelled = false;
    setLoadingOps(true);
    setTargetUserId("");
    supabase
      .rpc("list_eligible_reassignment_operators", { p_role: targetRole })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setOperators([]);
        } else {
          setOperators((data ?? []) as EligibleOperator[]);
        }
        setLoadingOps(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tab, targetRole]);

  const currentOwnerLabel = useMemo(() => {
    if (!appointment) return "—";
    const id = appointment.current_owner_id ?? appointment.setter_id;
    return id ? id.slice(0, 8) + "…" : "Niemand";
  }, [appointment]);

  const originalOwnerLabel = useMemo(() => {
    if (!appointment) return "—";
    const id = appointment.original_owner_id ?? appointment.setter_id;
    return id ? id.slice(0, 8) + "…" : "—";
  }, [appointment]);

  if (!appointment) return null;

  async function handleTakeover() {
    if (!user || !appointment) return;
    const result = await reassign({
      appointmentId: appointment.id,
      newOwnerId: user.id,
      newOwnerRole: "closer",
      reassignmentType: "self_takeover",
      reason: reason || undefined,
    });
    if (result.success) {
      onReassigned?.();
      onOpenChange(false);
    }
  }

  async function handleReassign() {
    if (!appointment || !targetUserId) return;
    const result = await reassign({
      appointmentId: appointment.id,
      newOwnerId: targetUserId,
      newOwnerRole: targetRole,
      reassignmentType: "reassignment",
      reason: reason || undefined,
    });
    if (result.success) {
      onReassigned?.();
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif">
            <UserCog className="h-5 w-5 text-primary" />
            Termin-Eigentum
          </DialogTitle>
          <DialogDescription>
            Eigentum eines Termins übernehmen oder neu zuweisen. Historische
            Zuordnung bleibt erhalten.
          </DialogDescription>
        </DialogHeader>

        {/* Appointment summary */}
        <div className="rounded-2xl border bg-muted/30 p-4 space-y-2 text-sm">
          {appointment.lead_name && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lead</span>
              <span className="font-medium">{appointment.lead_name}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Zeitpunkt</span>
            <span className="font-medium">
              {new Date(appointment.starts_at).toLocaleString("de-DE", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Europe/Berlin",
              })}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <Badge variant="outline">{appointment.appointment_status}</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Aktueller Eigentümer</span>
            <span className="font-mono text-xs">
              {currentOwnerLabel}
              {appointment.current_owner_role && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {appointment.current_owner_role}
                </Badge>
              )}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Ursprünglicher Eigentümer
            </span>
            <span className="font-mono text-xs">{originalOwnerLabel}</span>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "takeover" | "reassign")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="takeover">Übernehmen</TabsTrigger>
            <TabsTrigger value="reassign">Neu zuweisen</TabsTrigger>
          </TabsList>

          <TabsContent value="takeover" className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Du übernimmst den Termin als{" "}
              <span className="font-medium text-foreground">Senior Closer</span>.
              Der ursprüngliche Eigentümer bleibt für Attribution erhalten.
            </p>
            <div className="space-y-2">
              <Label htmlFor="takeover-reason">Notiz (optional)</Label>
              <Textarea
                id="takeover-reason"
                placeholder="z.B. High-Value Lead, Setter nicht verfügbar"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
              />
            </div>
          </TabsContent>

          <TabsContent value="reassign" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Rolle</Label>
              <Select
                value={targetRole}
                onValueChange={(v) => setTargetRole(v as OwnerRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="setter">Setter (L4+)</SelectItem>
                  <SelectItem value="closer">Closer (L6+)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Neuer Eigentümer</Label>
              {loadingOps ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select value={targetUserId} onValueChange={setTargetUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Operator auswählen…" />
                  </SelectTrigger>
                  <SelectContent>
                    {operators.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        Keine berechtigten Operatoren
                      </div>
                    )}
                    {operators.map((op) => (
                      <SelectItem key={op.user_id} value={op.user_id}>
                        <span className="flex items-center gap-2">
                          <span>{op.full_name ?? op.email ?? op.user_id}</span>
                          <Badge variant="outline" className="text-xs">
                            L{op.level}
                          </Badge>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="reassign-reason">Begründung (optional)</Label>
              <Textarea
                id="reassign-reason"
                placeholder="Warum wird umverteilt?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex items-start gap-2 rounded-xl bg-primary/5 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          <span>
            Diese Aktion wird unveränderlich protokolliert. Attribution,
            Zahlungen und Termin-Zeitpunkt bleiben unangetastet.
          </span>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Abbrechen
          </Button>
          {tab === "takeover" ? (
            <Button onClick={handleTakeover} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Termin übernehmen
            </Button>
          ) : (
            <Button
              onClick={handleReassign}
              disabled={submitting || !targetUserId}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Neu zuweisen
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
