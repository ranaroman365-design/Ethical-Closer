import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/i18n/LanguageContext";
import { Bot, CalendarClock, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

/** Quick links into the dedicated panels — keeps cockpit fast. */
export function QuickPanels() {
  const { lang } = useLanguage();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-xs font-bold uppercase tracking-[0.14em]">
            {lang === "de" ? "AI Setter" : "AI Setter"}
          </h2>
          <Badge variant="outline" className="ml-auto text-[10px]">Voice</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {lang === "de"
            ? "Queue, Anrufe, Antwortrate, Top-Einwand und Skript-Steuerung."
            : "Queue, calls, answer rate, top objection, and script controls."}
        </p>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/members/dashboard/performance/ai-setter">
              {lang === "de" ? "Öffnen" : "Open"} <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link to="/members/admin/ai-setter-guardrails">
              {lang === "de" ? "Guardrails" : "Guardrails"}
            </Link>
          </Button>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-xs font-bold uppercase tracking-[0.14em]">
            {lang === "de" ? "Smart Attendance" : "Smart Attendance"}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {lang === "de"
            ? "Anstehende Termine, Risiko-Leads, No-Show-Recovery."
            : "Upcoming appointments, at-risk leads, no-show recovery."}
        </p>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/members/dashboard/performance/attendance">
              {lang === "de" ? "Öffnen" : "Open"} <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link to="/members/dashboard/touchpoint-sequences">
              {lang === "de" ? "Touchpoint Editor" : "Touchpoint Editor"}
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
