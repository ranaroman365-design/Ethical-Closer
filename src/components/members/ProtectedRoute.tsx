import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserLevel } from '@/hooks/useUserLevel';
import {
  APPLICANT_PORTAL_PATH,
  captureSessionContextFromUrl,
  isApplicantAllowedPath,
} from '@/lib/session-context';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  /** When true, allow L0 (e.g. onboarding/payment pages). Default false → L0 → /insider */
  allowL0?: boolean;
}

const PROTOTYPE_MODE = false;

// Routes L0 users may still reach while authenticated (payment, onboarding, logout).
const L0_ALLOWED_PREFIXES = [
  '/members/payment-links',
  '/members/payment',
  '/members/checkout',
  '/members/onboarding',
  '/members/welcome',
  '/members/logout',
];

export default function ProtectedRoute({ children, requireAdmin = false, allowL0 = false }: ProtectedRouteProps) {
  const { user, isLoading, isAdmin, role } = useAuth();
  const { isL1Plus, loading: levelLoading } = useUserLevel();
  const location = useLocation();

  if (PROTOTYPE_MODE) {
    return <>{children}</>;
  }

  if (isLoading || levelLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/members/login" replace />;
  }

  // ── Applicant magic-link context lock ──
  // If this render carries `?ctx=applicant`, persist it. Once locked, the user
  // is restricted to the applicant portal regardless of admin/partner roles.
  // Only `clearSessionContext()` (explicit "switch to admin" action) releases it.
  const sessionCtx = captureSessionContextFromUrl(location.search);
  if (sessionCtx === 'applicant' && !isApplicantAllowedPath(location.pathname)) {
    return <Navigate to={APPLICANT_PORTAL_PATH} replace />;
  }

  // Community-only members (€27 buyers) must NOT access /members/* workspaces.
  if (role === 'community_member' && !location.pathname.startsWith('/community')) {
    return <Navigate to="/community/feed" replace />;
  }

  // L1 access gate: L0 users (authenticated but not paid/progressed) → /insider.
  // Admins always pass. Specific allowed-prefixes (payment, onboarding) bypass the gate.
  // L1 access gate: L0 users (authenticated but not paid/progressed) → /insider.
  // Admins always pass. Specific allowed-prefixes (payment, onboarding) bypass the gate.
  // Applicant-context sessions on applicant-allowed paths also bypass — they ARE L0.
  const onAllowedL0Path = L0_ALLOWED_PREFIXES.some((p) => location.pathname.startsWith(p));
  const onApplicantPath = sessionCtx === 'applicant' && isApplicantAllowedPath(location.pathname);
  if (!isL1Plus && !isAdmin && !allowL0 && !onAllowedL0Path && !onApplicantPath) {
    const from = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/insider?from=${from}&reason=level`} replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/members" replace />;
  }

  // Even if isAdmin === true, an active applicant session must NOT enter admin pages.
  if (requireAdmin && sessionCtx === 'applicant') {
    return <Navigate to={APPLICANT_PORTAL_PATH} replace />;
  }

  return <>{children}</>;
}

