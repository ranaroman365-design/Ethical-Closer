import { Link, useSearchParams } from "react-router-dom";
import { XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function CheckoutCancelled() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-4">
          <XCircle className="h-16 w-16 text-red-500 mx-auto" />
          <h1 className="text-2xl font-bold">Zahlung abgebrochen</h1>
          <p className="text-muted-foreground text-sm">
            Die Zahlung wurde nicht abgeschlossen. Du kannst den Zahlungslink jederzeit erneut öffnen oder deinen Closer kontaktieren.
          </p>
          <div className="pt-4 space-y-2">
            <Link to="/">
              <Button variant="outline" className="w-full">Zurück zur Startseite</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
