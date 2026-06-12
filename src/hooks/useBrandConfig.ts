import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { getThemePreset } from '@/lib/theme-presets';

export interface BrandConfig {
  product_name: string;
  logo_url: string | null;
  theme_key: string;
}

export interface KpiToggle {
  show_rate: boolean;
  close_rate: boolean;
  calls: boolean;
  revenue: boolean;
  earnings_per_call: boolean;
  lead_to_booking_rate: boolean;
  contact_rate: boolean;
  speed_to_lead: boolean;
  follow_up_rate: boolean;
  qualification_accuracy: boolean;
}

export interface CommissionEntry {
  role: string;
  rate: number;
  label: string;
}

export interface LeadTypeEntry {
  key: string;
  label: string;
  description: string;
  active: boolean;
}

export interface WhiteLabelConfig {
  branding: BrandConfig;
  kpi_toggles: KpiToggle;
  commission_rates: Record<string, CommissionEntry>;
  levels: Array<{ level: number; key: string; de: string; en: string; role: string | null }>;
  lead_types: LeadTypeEntry[];
}

const DEFAULT_BRANDING: BrandConfig = {
  product_name: 'Ethical Top Closer',
  logo_url: null,
  theme_key: 'default',
};

const DEFAULT_KPI_TOGGLES: KpiToggle = {
  show_rate: true,
  close_rate: true,
  calls: true,
  revenue: true,
  earnings_per_call: true,
  lead_to_booking_rate: false,
  contact_rate: false,
  speed_to_lead: true,
  follow_up_rate: true,
  qualification_accuracy: false,
};

export function useBrandConfig(productKey = 'etc') {
  const query = useQuery({
    queryKey: ['white-label-config', productKey],
    queryFn: async (): Promise<WhiteLabelConfig> => {
      const { data, error } = await supabase
        .from('product_config')
        .select('config')
        .eq('product_key', productKey)
        .single();

      if (error || !data?.config) {
        return {
          branding: DEFAULT_BRANDING,
          kpi_toggles: DEFAULT_KPI_TOGGLES,
          commission_rates: {},
          levels: [],
          lead_types: [],
        };
      }

      const config = data.config as Record<string, unknown>;
      return {
        branding: (config.branding as BrandConfig) || DEFAULT_BRANDING,
        kpi_toggles: (config.kpi_toggles as KpiToggle) || DEFAULT_KPI_TOGGLES,
        commission_rates: (config.commission_rates as Record<string, CommissionEntry>) || {},
        levels: (config.levels as WhiteLabelConfig['levels']) || [],
        lead_types: (config.lead_types as LeadTypeEntry[]) || [],
      };
    },
    staleTime: 30_000,
  });

  // Apply theme CSS variables
  useEffect(() => {
    const themeKey = query.data?.branding?.theme_key || 'default';
    const preset = getThemePreset(themeKey);
    const root = document.documentElement;

    const vars = document.documentElement.classList.contains('dark')
      ? { ...preset.variables, ...preset.darkVariables }
      : preset.variables;

    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }

    return () => {
      // Clean up on unmount — reset to defaults
      for (const key of Object.keys(vars)) {
        root.style.removeProperty(key);
      }
    };
  }, [query.data?.branding?.theme_key]);

  return {
    config: query.data,
    branding: query.data?.branding || DEFAULT_BRANDING,
    kpiToggles: query.data?.kpi_toggles || DEFAULT_KPI_TOGGLES,
    commissions: query.data?.commission_rates || {},
    levels: query.data?.levels || [],
    leadTypes: query.data?.lead_types || [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
