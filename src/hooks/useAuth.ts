import { useContext } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';

/**
 * Shared auth hook — reads from AuthProvider context.
 * Profile + roles are fetched ONCE at provider level, not per-component.
 */
export function useAuth() {
  return useAuthContext();
}
