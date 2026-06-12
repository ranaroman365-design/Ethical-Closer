import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface EmployerAccess {
  isEmployer: boolean;
  companyId: string | null;
  companyName: string | null;
  companyVerified: boolean;
  dashboardEnabled: boolean;
  loading: boolean;
}

export function useEmployerAccess(): EmployerAccess {
  const { user } = useAuth();
  const [state, setState] = useState<EmployerAccess>({
    isEmployer: false,
    companyId: null,
    companyName: null,
    companyVerified: false,
    dashboardEnabled: false,
    loading: true,
  });

  useEffect(() => {
    if (!user) {
      setState(prev => ({ ...prev, loading: false }));
      return;
    }

    async function check() {
      const [settingRes, companyLinkRes] = await Promise.all([
        supabase.from('system_settings').select('setting_value').eq('setting_key', 'employer_dashboard_enabled').maybeSingle(),
        supabase.from('company_users').select('company_id, companies(id, name, verified, active)').eq('user_id', user!.id).maybeSingle(),
      ]);

      const dashboardEnabled = settingRes.data?.setting_value === true;
      const company = (companyLinkRes.data as any)?.companies;

      setState({
        isEmployer: !!company && company.verified && company.active,
        companyId: company?.id ?? null,
        companyName: company?.name ?? null,
        companyVerified: company?.verified ?? false,
        dashboardEnabled,
        loading: false,
      });
    }

    check();
  }, [user]);

  return state;
}

export function useSystemSetting(key: string) {
  const [value, setValue] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', key)
      .maybeSingle()
      .then(({ data }) => {
        setValue(data?.setting_value ?? null);
        setLoading(false);
      });
  }, [key]);

  const update = async (newValue: any) => {
    await supabase
      .from('system_settings')
      .update({ setting_value: newValue, updated_at: new Date().toISOString() })
      .eq('setting_key', key);
    setValue(newValue);
  };

  return { value, loading, update };
}
