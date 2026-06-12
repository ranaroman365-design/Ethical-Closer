import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { format, subDays } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { generateLeadExport, type ExportFormat } from "@/lib/lead-export";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function LeadExportModal({ open, onOpenChange }: Props) {
  const { user, isAdmin, profile } = useAuth();
  const { toast } = useToast();
  const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [exportFormat, setExportFormat] = useState<ExportFormat>("xlsx");
  const [loading, setLoading] = useState(false);

  const userStage = (profile as any)?.business_stage || (profile as any)?.n || "opener";

  const handleExport = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { blob, filename } = await generateLeadExport({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        format: exportFormat,
        userId: user.id,
        userStage,
        isAdmin: !!isAdmin,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ title: "Export erfolgreich", description: filename });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Export fehlgeschlagen", description: err?.message || "Unbekannter Fehler", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">Lead Export</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Exportiere Lead-Daten mit 4 Tabs: Booked · No Booking · No Show · No Close
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <DatePicker label="Von" date={startDate} onChange={setStartDate} />
            <DatePicker label="Bis" date={endDate} onChange={setEndDate} />
          </div>

          {/* Format */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Format</p>
            <div className="flex gap-2">
              {(["xlsx", "csv"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setExportFormat(f)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                    exportFormat === f
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/30"
                  )}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  {f === "xlsx" ? "Excel (.xlsx)" : "CSV"}
                </button>
              ))}
            </div>
            {exportFormat === "csv" && (
              <p className="text-[11px] text-muted-foreground mt-1.5">
                CSV enthält nur Tab „Booked Leads". Für alle 4 Tabs wähle Excel.
              </p>
            )}
          </div>

          {/* Export button */}
          <Button
            onClick={handleExport}
            disabled={loading || !startDate || !endDate}
            className="w-full gap-2"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Exportiere…</>
            ) : (
              <><Download className="h-4 w-4" /> Export starten</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DatePicker({ label, date, onChange }: { label: string; date: Date; onChange: (d: Date) => void }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{label}</p>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-start text-left text-sm font-normal">
            <CalendarIcon className="mr-2 h-3.5 w-3.5" />
            {format(date, "dd.MM.yyyy", { locale: de })}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => d && onChange(d)}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
