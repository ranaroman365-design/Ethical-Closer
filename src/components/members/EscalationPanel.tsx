import { AlertTriangle, CheckCircle2, Bell, TrendingDown, Clock, DollarSign } from 'lucide-react';
import { useEscalationAlerts, EscalationAlert } from '@/hooks/useEscalationAlerts';
import { useLanguage } from '@/i18n/LanguageContext';

const ALERT_CONFIG: Record<string, { icon: React.ComponentType<any>; color: string }> = {
  lead_stuck: { icon: Clock, color: 'text-[hsl(39,76%,49%)]' },
  setter_inactive: { icon: AlertTriangle, color: 'text-destructive' },
  pipeline_drop: { icon: TrendingDown, color: 'text-destructive' },
  high_value_deal: { icon: DollarSign, color: 'text-primary' },
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'border-destructive/30 bg-destructive/[0.04]',
  warning: 'border-[hsl(39,76%,49%)]/30 bg-[hsl(39,76%,49%)]/[0.04]',
  info: 'border-primary/20 bg-primary/[0.02]',
};

export default function EscalationPanel() {
  const { alerts, loading, resolve, isDirectorOrAbove } = useEscalationAlerts();
  const { lang } = useLanguage();

  if (!isDirectorOrAbove || loading) return null;
  if (alerts.length === 0) return null;

  const tl = (de: string, en: string) => (lang === 'de' ? de : en);

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            {tl('Eskalations-Alerts', 'Escalation Alerts')}
          </h3>
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
            {alerts.length}
          </span>
        </div>
        {criticalCount > 0 && (
          <span className="text-[10px] font-medium text-destructive">
            {criticalCount} {tl('kritisch', 'critical')}
          </span>
        )}
      </div>

      {/* Alert Cards */}
      <div className="space-y-2">
        {alerts.slice(0, 5).map((alert) => {
          const config = ALERT_CONFIG[alert.alert_type] || { icon: AlertTriangle, color: 'text-muted-foreground' };
          const Icon = config.icon;
          const style = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;

          return (
            <div
              key={alert.id}
              className={`rounded-xl border p-4 transition-all ${style}`}
            >
              <div className="flex items-start gap-3">
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${config.color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-foreground">{alert.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    {alert.description}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[9px] text-muted-foreground/50">
                      {new Date(alert.created_at).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button
                      onClick={() => resolve(alert.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      {tl('Erledigt', 'Resolve')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {alerts.length > 5 && (
        <p className="text-center text-[11px] text-muted-foreground">
          +{alerts.length - 5} {tl('weitere Alerts', 'more alerts')}
        </p>
      )}
    </div>
  );
}
