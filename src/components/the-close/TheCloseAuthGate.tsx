import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function TheCloseAuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "auth" | "no-auth">("loading");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setState(data.user ? "auth" : "no-auth");
    });
  }, []);

  if (state === "loading") return null;
  if (state === "no-auth") return <Navigate to="/the-close/join" replace />;
  return <>{children}</>;
}
