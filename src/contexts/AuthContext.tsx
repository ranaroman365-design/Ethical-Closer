import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import type { Profile, AppRole } from '@/types/members';

/** Roles that grant admin-level platform access */
const ADMIN_ROLES: AppRole[] = [
  'admin', 'administrator', 'owner', 'security_admin', 'ops_admin',
  'content_admin', 'finance_admin', 'support_admin',
];

const ROLE_PRIORITY: AppRole[] = [
  'owner', 'administrator', 'admin', 'security_admin', 'ops_admin',
  'content_admin', 'finance_admin', 'support_admin', 'community_member', 'member',
];

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  isLoading: boolean;
  isAdmin: boolean;
  isOwner: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: any; session: Session | null; user: User | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null, session: null, profile: null, role: null,
    isLoading: true, isAdmin: false, isOwner: false,
  });

  const initialSessionResolved = useRef(false);

  const clearAuthState = useCallback(() => {
    setState(prev => ({
      ...prev, user: null, session: null, profile: null, role: null,
      isAdmin: false, isOwner: false, isLoading: false,
    }));
  }, []);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const [profileRes, roleRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', userId),
      ]);

      const profile = (profileRes.data as Profile | null) ?? null;
      const roles = (roleRes.data ?? []).map((r: any) => r.role as AppRole);
      const role = ROLE_PRIORITY.find(candidate => roles.includes(candidate)) ?? roles[0] ?? 'member';

      setState(prev => ({
        ...prev, profile, role,
        isAdmin: ADMIN_ROLES.includes(role),
        isOwner: role === 'owner',
        isLoading: false,
      }));
    } catch (error) {
      console.error('[AuthProvider] Failed to load profile:', error);
      setState(prev => ({
        ...prev, profile: null, role: 'member',
        isAdmin: false, isOwner: false, isLoading: false,
      }));
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      if (session?.user) {
        // Set isLoading=true immediately so route guards wait for profile
        setState(prev => ({ ...prev, user: session.user, session, isLoading: true }));
        setTimeout(() => { if (isMounted) fetchProfile(session.user.id); }, 0);
        return;
      }
      if (initialSessionResolved.current) clearAuthState();
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      initialSessionResolved.current = true;
      setState(prev => ({ ...prev, user: session?.user ?? null, session }));
      if (session?.user) fetchProfile(session.user.id);
      else clearAuthState();
    });

    return () => { isMounted = false; subscription.unsubscribe(); };
  }, [fetchProfile, clearAuthState]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { error, session: data.session ?? null, user: data.user ?? null };
  };

  const signOut = async () => {
    try {
      sessionStorage.removeItem('entryflow_seen_this_session');
      sessionStorage.removeItem('etc_entry_seen');
    } catch { /* ignore */ }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}
