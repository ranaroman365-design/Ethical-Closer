import { useState, useCallback } from 'react';
import { MessageCircle, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  validatePhoneForWhatsApp,
  getWhatsAppLink,
  getWhatsAppTemplateLink,
  trackWhatsAppClick,
} from '@/lib/whatsapp-utils';
import { useAuth } from '@/hooks/useAuth';

interface WhatsAppButtonProps {
  phone: string | null | undefined;
  leadName?: string | null;
  leadId?: string | null;
  leadSource?: string | null;
  funnelPath?: string | null;
  /** Show template variant too */
  withTemplate?: boolean;
  /** Compact icon-only mode */
  compact?: boolean;
  /** Component name for tracking */
  sourceComponent?: string;
  /** Operator id (defaults to current user) for tracking */
  operatorId?: string | null;
  /** Lead's current funnel stage at click time, for tracking */
  leadStage?: string | null;
  className?: string;
}

export function WhatsAppButton({
  phone,
  leadName,
  leadId,
  leadSource,
  funnelPath,
  withTemplate,
  compact,
  sourceComponent = 'unknown',
  operatorId,
  leadStage,
  className,
}: WhatsAppButtonProps) {
  const { user } = useAuth();
  const [clickState, setClickState] = useState<'idle' | 'clicked'>('idle');
  const validation = validatePhoneForWhatsApp(phone);

  // Don't render for unauthenticated users
  if (!user) return null;

  const handleClick = useCallback(
    (buttonType: 'direct' | 'template') => {
      if (!leadId) return;
      setClickState('clicked');
      setTimeout(() => setClickState('idle'), 2000);

      // Fire-and-forget tracking
      trackWhatsAppClick({
        leadId,
        sourceComponent,
        buttonType,
        leadSource,
        funnelPath,
        operatorId: operatorId ?? user.id,
        leadStage,
      });
    },
    [leadId, sourceComponent, leadSource, funnelPath, operatorId, leadStage, user.id],
  );

  // State A: No phone number
  if (validation.status === 'missing') {
    if (compact) return null;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="sm" disabled className={className}>
            <MessageCircle className="h-4 w-4 opacity-40" />
            {!compact && <span className="ml-1 text-xs">Keine Nr.</span>}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Keine Telefonnummer vorhanden</TooltipContent>
      </Tooltip>
    );
  }

  // State B: Invalid phone number
  if (validation.status === 'invalid') {
    if (compact) return null;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="sm" disabled className={className}>
            <AlertTriangle className="h-4 w-4 opacity-40 text-amber-500" />
            {!compact && <span className="ml-1 text-xs">Ungültig</span>}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Ungültige Telefonnummer</TooltipContent>
      </Tooltip>
    );
  }

  // State C: Valid phone number
  const link = getWhatsAppLink(phone);
  const templateLink = withTemplate
    ? getWhatsAppTemplateLink(phone, leadName, funnelPath ?? leadSource)
    : null;

  const isClicked = clickState === 'clicked';

  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ''}`}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={isClicked}
            className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950 px-2"
            asChild={!isClicked}
          >
            {isClicked ? (
              <span className="inline-flex items-center">
                <Check className="h-4 w-4" />
                {!compact && <span className="ml-1 text-xs">Geöffnet</span>}
              </span>
            ) : (
              <a
                href={link!}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handleClick('direct')}
              >
                <MessageCircle className="h-4 w-4" />
                {!compact && <span className="ml-1 text-xs">WhatsApp</span>}
              </a>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isClicked ? 'WhatsApp wurde geöffnet' : 'WhatsApp öffnen'}
        </TooltipContent>
      </Tooltip>

      {templateLink && !isClicked && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950 px-2"
              asChild
            >
              <a
                href={templateLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handleClick('template')}
              >
                <MessageCircle className="h-4 w-4" />
                {!compact && <span className="ml-1 text-xs">Vorlage</span>}
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>WhatsApp mit Vorlagen-Nachricht öffnen</TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}
