import { Navigate, useLocation } from "react-router-dom";
import { ReactNode } from "react";
import { useUserLevel } from "@/hooks/useUserLevel";

interface Props {
  children: ReactNode;
  /** Minimum level required. Default 1 (paid member). */
  minLevel?: number;
}

/**
 * L1+ access gate.
 * - Loading → spinner
 * - L0 (anonymous or unpaid) → redirect to /insider with preview message
 * - L1+ → renders children
 */
export default function LevelGate({ children, minLevel = 1 }: Props) {
  const { loading, isL1Plus, level } = useUserLevel();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (level < minLevel || (minLevel >= 1 && !isL1Plus)) {
    const from = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/insider?from=${from}&reason=level`} replace />;
  }

  return <>{children}</>;
}
