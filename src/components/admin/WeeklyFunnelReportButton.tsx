import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * Triggers server-side weekly funnel report.
 * Downloads CSV + PDF as files. No client-side data crunching — all aggregation
 * happens in the edge function `weekly-funnel-report`.
 */
export default function WeeklyFunnelReportButton() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const download = (b64: string, mime: string, name: string) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  const run = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("weekly-funnel-report", { body: {} });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error ?? "Report failed");
      const stamp = new Date().toISOString().slice(0, 10);
      download(data.pdf_base64, "application/pdf", `funnel-report-${stamp}.pdf`);
      download(data.csv_base64, "text/csv", `funnel-report-${stamp}.csv`);
      toast({
        title: "Report generiert",
        description: `${data.summary.ladders} Ladders · ${data.summary.totalLeads} Leads · ${data.summary.underperformers} Underperformer`,
      });
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={run} disabled={loading} variant="outline" size="sm">
      {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
      Wochenreport (PDF + CSV)
    </Button>
  );
}
