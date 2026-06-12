import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalendarIcon, Download, Loader2, Users, User } from 'lucide-react';

interface ExportLeadsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userLevel: number;
}

type ExportFormat = 'csv' | 'xlsx';
type ExportType = 'my_leads' | 'team_leads';

function downloadCSV(data: Record<string, any[]>, filename: string) {
  const sheets = Object.entries(data);
  let csvContent = '';
  for (const [tabName, rows] of sheets) {
    csvContent += `\n=== ${tabName.toUpperCase()} ===\n`;
    if (rows.length === 0) {
      csvContent += '(Keine Daten)\n';
      continue;
    }
    const headers = Object.keys(rows[0]);
    csvContent += headers.join(';') + '\n';
    for (const row of rows) {
      csvContent += headers.map((h) => {
        const v = row[h];
        if (v == null) return '';
        const s = String(v);
        return s.includes(';') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(';') + '\n';
    }
  }
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadXLSX(data: Record<string, any[]>, filename: string) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const [tabName, rows] of Object.entries(data)) {
    const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{}]);
    if (rows.length > 0) {
      const headers = Object.keys(rows[0]);
      ws['!cols'] = headers.map((h) => ({
        wch: Math.max(h.length, ...rows.map((r) => String(r[h] ?? '').length).slice(0, 50)) + 2,
      }));
    }
    XLSX.utils.book_append_sheet(wb, ws, tabName.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

export function ExportLeadsModal({ open, onOpenChange, userLevel }: ExportLeadsModalProps) {
  const { tx } = useLanguage();
  const [exportType, setExportType] = useState<ExportType>('my_leads');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
  const [dateFrom, setDateFrom] = useState<Date | undefined>(
    () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d; }
  );
  const [dateTo, setDateTo] = useState<Date | undefined>(() => new Date());
  const [loading, setLoading] = useState(false);

  const canTeamExport = userLevel >= 6;

  const handleExport = async () => {
    if (!dateFrom || !dateTo) {
      toast.error(tx('Bitte Zeitraum wählen', 'Please select date range'));
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('export-leads', {
        body: {
          export_type: exportType,
          date_from: dateFrom.toISOString(),
          date_to: dateTo.toISOString(),
        },
      });

      if (error) {
        console.error('[ExportLeadsModal] invoke error:', error);
        throw new Error(error.message || 'Edge Function Fehler');
      }
      if (data?.error) {
        throw new Error(data.error);
      }

      const tabs = data.tabs as Record<string, any[]>;
      const total = data.total ?? 0;

      // Check if there are any leads
      if (total === 0) {
        toast.info(tx(
          'Keine Leads im gewählten Zeitraum gefunden',
          'No leads found in selected date range'
        ));
        // Still generate empty file with headers
      }

      const tabLabels: Record<string, string> = {
        booked: 'Booked Leads',
        no_booking: 'No Booking',
        no_show: 'No Show',
        no_close: 'No Close',
      };

      const namedTabs: Record<string, any[]> = {};
      for (const [key, label] of Object.entries(tabLabels)) {
        namedTabs[label] = tabs[key] || [];
      }

      const dateStr = format(new Date(), 'yyyy-MM-dd');
      const filename = `lead-export_${exportType}_${dateStr}.${exportFormat}`;

      if (exportFormat === 'xlsx') {
        await downloadXLSX(namedTabs, filename);
      } else {
        downloadCSV(namedTabs, filename);
      }

      if (total > 0) {
        toast.success(tx(
          `${total} Leads exportiert`,
          `${total} leads exported`
        ));
      }
      onOpenChange(false);
    } catch (e: any) {
      console.error('[ExportLeadsModal]', e);
      toast.error(tx('Export fehlgeschlagen', 'Export failed'), {
        description: e?.message || String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            {tx('Lead Export', 'Lead Export')}
          </DialogTitle>
          <DialogDescription>
            {tx(
              'Exportiere Leads als CSV oder Excel mit 4 Tabs (Booked, No Booking, No Show, No Close).',
              'Export leads as CSV or Excel with 4 tabs (Booked, No Booking, No Show, No Close).'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Export Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {tx('Export-Typ', 'Export Type')}
            </label>
            <div className="flex gap-2">
              <Button
                variant={exportType === 'my_leads' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setExportType('my_leads')}
                className="flex-1"
              >
                <User className="mr-1.5 h-4 w-4" />
                {tx('Meine Leads', 'My Leads')}
              </Button>
              {canTeamExport && (
                <Button
                  variant={exportType === 'team_leads' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setExportType('team_leads')}
                  className="flex-1"
                >
                  <Users className="mr-1.5 h-4 w-4" />
                  {tx('Team Leads', 'Team Leads')}
                </Button>
              )}
            </div>
          </div>

          {/* Date Range */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {tx('Zeitraum', 'Date Range')}
            </label>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("flex-1 justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-1.5 h-4 w-4" />
                    {dateFrom ? format(dateFrom, 'dd.MM.yyyy') : tx('Von', 'From')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("flex-1 justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                    <CalendarIcon className="mr-1.5 h-4 w-4" />
                    {dateTo ? format(dateTo, 'dd.MM.yyyy') : tx('Bis', 'To')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Format */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {tx('Format', 'Format')}
            </label>
            <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as ExportFormat)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {tx('Abbrechen', 'Cancel')}
          </Button>
          <Button onClick={handleExport} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                {tx('Exportiere...', 'Exporting...')}
              </>
            ) : (
              <>
                <Download className="mr-1.5 h-4 w-4" />
                {tx('Exportieren', 'Export')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
