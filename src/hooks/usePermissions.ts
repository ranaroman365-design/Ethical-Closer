import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { AppRole } from '@/types/members';

export interface Permission {
  resource_key: string;
  can_view: boolean;
  can_edit: boolean;
  can_export: boolean;
  can_delete: boolean;
  owner_only: boolean;
}

interface PermissionsState {
  permissions: Permission[];
  loading: boolean;
  can: (resource: string, action?: 'view' | 'edit' | 'export' | 'delete') => boolean;
  hasRole: (...roles: AppRole[]) => boolean;
  isOwner: boolean;
  isSecurityPrivileged: boolean;
  isAdministrator: boolean;
}

export function usePermissions(): PermissionsState {
  const { user, role, isAdmin } = useAuth();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  const currentRole = role as AppRole | null;

  useEffect(() => {
    if (!user || !currentRole) {
      setPermissions([]);
      setLoading(false);
      return;
    }

    supabase
      .from('admin_permissions')
      .select('resource_key, can_view, can_edit, can_export, can_delete, owner_only')
      .eq('role', currentRole)
      .then(({ data }) => {
        setPermissions((data as Permission[]) ?? []);
        setLoading(false);
      });
  }, [user, currentRole]);

  const can = useCallback(
    (resource: string, action: 'view' | 'edit' | 'export' | 'delete' = 'view') => {
      const perm = permissions.find(p => p.resource_key === resource);
      if (!perm) return false;
      switch (action) {
        case 'view': return perm.can_view;
        case 'edit': return perm.can_edit;
        case 'export': return perm.can_export;
        case 'delete': return perm.can_delete;
        default: return false;
      }
    },
    [permissions]
  );

  const hasRole = useCallback(
    (...roles: AppRole[]) => {
      if (!currentRole) return false;
      return roles.includes(currentRole);
    },
    [currentRole]
  );

  const isOwner = currentRole === 'owner';
  const isSecurityPrivileged = currentRole === 'owner' || currentRole === 'security_admin';
  const isAdministrator = currentRole === 'administrator';

  return { permissions, loading, can, hasRole, isOwner, isSecurityPrivileged, isAdministrator };
}
