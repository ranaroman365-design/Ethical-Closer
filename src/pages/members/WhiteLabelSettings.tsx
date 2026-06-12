import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useBrandConfig } from '@/hooks/useBrandConfig';
import type { BrandConfig, KpiToggle, CommissionEntry } from '@/hooks/useBrandConfig';
import BrandSettings from '@/components/admin/BrandSettings';
import KpiSettings from '@/components/admin/KpiSettings';
import CommissionSettings from '@/components/admin/CommissionSettings';
import LevelSettings from '@/components/admin/LevelSettings';
import LeadTypeSettings from '@/components/admin/LeadTypeSettings';
import type { LeadType } from '@/components/admin/LeadTypeSettings';
import { Palette, BarChart3, Coins, Layers, Tags } from 'lucide-react';

const PRODUCT_KEY = 'etc';

export default function WhiteLabelSettings() {
  const { branding, kpiToggles, commissions, levels, leadTypes, isLoading, refetch } = useBrandConfig(PRODUCT_KEY);
  const [saving, setSaving] = useState(false);

  const updateConfigField = async (field: string, value: unknown) => {
    setSaving(true);
    try {
      const { data: current } = await supabase
        .from('product_config')
        .select('config')
        .eq('product_key', PRODUCT_KEY)
        .single();

      if (!current?.config) throw new Error('Config not found');

      const updatedConfig = { ...(current.config as Record<string, unknown>), [field]: value } as Record<string, unknown>;

      const { error } = await supabase
        .from('product_config')
        .update({ config: updatedConfig as unknown as import('@/integrations/supabase/types').Json })
        .eq('product_key', PRODUCT_KEY);

      if (error) throw error;
      await refetch();
      toast.success('Einstellungen gespeichert');
    } catch (err: unknown) {
      toast.error('Fehler beim Speichern: ' + (err instanceof Error ? err.message : 'Unbekannt'));
    } finally {
      setSaving(false);
    }
  };

  const handleBrandSave = (b: BrandConfig) => updateConfigField('branding', b);
  const handleKpiSave = (t: KpiToggle) => updateConfigField('kpi_toggles', t);
  const handleCommissionSave = (c: Record<string, CommissionEntry>) => updateConfigField('commission_rates', c);
  const handleLevelSave = (l: Array<{ level: number; key: string; de: string; en: string; role: string | null }>) =>
    updateConfigField('levels', l);
  const handleLeadTypeSave = (types: LeadType[]) => updateConfigField('lead_types', types);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-foreground">White-Label Konfiguration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Branding, KPIs, Provisionen, Level und Lead-Typen zentral verwalten. Änderungen werden sofort wirksam.
        </p>
      </div>

      <Tabs defaultValue="brand" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="brand" className="gap-1 text-xs sm:text-sm">
            <Palette className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Branding</span>
          </TabsTrigger>
          <TabsTrigger value="kpi" className="gap-1 text-xs sm:text-sm">
            <BarChart3 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">KPIs</span>
          </TabsTrigger>
          <TabsTrigger value="commission" className="gap-1 text-xs sm:text-sm">
            <Coins className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Provisionen</span>
          </TabsTrigger>
          <TabsTrigger value="levels" className="gap-1 text-xs sm:text-sm">
            <Layers className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Level</span>
          </TabsTrigger>
          <TabsTrigger value="leads" className="gap-1 text-xs sm:text-sm">
            <Tags className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Leads</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="brand" className="mt-6">
          <BrandSettings branding={branding} onSave={handleBrandSave} saving={saving} />
        </TabsContent>

        <TabsContent value="kpi" className="mt-6">
          <KpiSettings toggles={kpiToggles} onSave={handleKpiSave} saving={saving} />
        </TabsContent>

        <TabsContent value="commission" className="mt-6">
          <CommissionSettings
            commissions={commissions}
            levels={levels}
            onSave={handleCommissionSave}
            saving={saving}
          />
        </TabsContent>

        <TabsContent value="levels" className="mt-6">
          <LevelSettings levels={levels} onSave={handleLevelSave} saving={saving} />
        </TabsContent>

        <TabsContent value="leads" className="mt-6">
          <LeadTypeSettings leadTypes={leadTypes} onSave={handleLeadTypeSave} saving={saving} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
