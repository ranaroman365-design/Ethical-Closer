import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface PaymentDetails {
  offer_title: string | null;
  first_name: string | null;
  amount: number;
  deal_type: string;
  email: string | null;
}

export default function CheckoutSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [details, setDetails] = useState<PaymentDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) { setLoading(false); return; }
    (async () => {
      const { data } = await supabase
        .from("payment_links")
        .select("offer_title, first_name, amount, deal_type, email")
        .eq("session_id", sessionId)
        .maybeSingle();
      setDetails(data as PaymentDetails | null);
      setLoading(false);
    })();
  }, [sessionId]);

  const fmtEur = (cents: number) => `€${(cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 0 })}`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-4">
          {loading ? (
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground mx-auto" />
          ) : (
            <>
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
              <h1 className="text-2xl font-bold">Zahlung erfolgreich!</h1>
              {details && (
                <div className="space-y-2 text-sm text-muted-foreground text-left rounded-lg bg-muted/50 p-4">
                  {details.first_name && (
                    <div className="flex justify-between">
                      <span>Name</span>
                      <span className="font-medium text-foreground">{details.first_name}</span>
                    </div>
                  )}
                  {details.offer_title && (
                    <div className="flex justify-between">
                      <span>Produkt</span>
                      <span className="font-medium text-foreground">{details.offer_title}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Betrag</span>
                    <span className="font-medium text-foreground">{fmtEur(details.amount)}</span>
                  </div>
                </div>
              )}
              <p className="text-muted-foreground text-sm">
                Du erhältst in Kürze eine Bestätigung per E-Mail.
                Dein Closer wird sich mit den nächsten Schritten bei dir melden.
              </p>
              <div className="pt-4">
                <Link to="/">
                  <Button className="w-full">Zurück zur Startseite</Button>
                </Link>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
