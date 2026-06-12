import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getProductName } from "@/config/product";

const Unsubscribe = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "valid" | "used" | "invalid" | "success" | "error">("loading");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!token) { setStatus("invalid"); return; }
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    fetch(`${supabaseUrl}/functions/v1/handle-email-unsubscribe?token=${token}`, {
      headers: { apikey: anonKey },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.valid === false && d.reason === "already_unsubscribed") setStatus("used");
        else if (d.valid) setStatus("valid");
        else setStatus("invalid");
      })
      .catch(() => setStatus("invalid"));
  }, [token]);

  const handleUnsubscribe = async () => {
    setProcessing(true);
    try {
      const { data } = await supabase.functions.invoke("handle-email-unsubscribe", { body: { token } });
      if (data?.success) setStatus("success");
      else if (data?.reason === "already_unsubscribed") setStatus("used");
      else setStatus("error");
    } catch { setStatus("error"); }
    setProcessing(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full bg-card rounded-lg shadow-lg p-8 text-center">
        <h1 className="text-xl font-bold text-foreground mb-2">{getProductName()}</h1>
        {status === "loading" && <p className="text-muted-foreground">Wird geladen…</p>}
        {status === "valid" && (
          <>
            <p className="text-muted-foreground mb-6">Möchtest du dich wirklich von unseren E-Mails abmelden?</p>
            <button
              onClick={handleUnsubscribe}
              disabled={processing}
              className="bg-primary text-primary-foreground px-6 py-3 rounded-md font-medium hover:opacity-90 disabled:opacity-50"
            >
              {processing ? "Wird verarbeitet…" : "Abmelden bestätigen"}
            </button>
          </>
        )}
        {status === "success" && <p className="text-primary font-medium mt-4">Du wurdest erfolgreich abgemeldet.</p>}
        {status === "used" && <p className="text-muted-foreground mt-4">Du bist bereits abgemeldet.</p>}
        {status === "invalid" && <p className="text-destructive mt-4">Ungültiger oder abgelaufener Link.</p>}
        {status === "error" && <p className="text-destructive mt-4">Ein Fehler ist aufgetreten. Bitte versuche es erneut.</p>}
      </div>
    </div>
  );
};

export default Unsubscribe;
