import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { User, Bot } from 'lucide-react';

interface ChatBubbleProps {
  role: 'user' | 'lead' | 'system';
  content: string;
  leadName?: string;
  channel?: 'whatsapp' | 'instagram' | 'linkedin' | 'phone';
  isTyping?: boolean;
}

export function ChatBubble({ role, content, leadName = 'Lead', channel = 'whatsapp', isTyping }: ChatBubbleProps) {
  const isUser = role === 'user';
  const isSystem = role === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center my-3">
        <span className="text-[11px] text-muted-foreground bg-muted/40 px-3 py-1 rounded-full">{content}</span>
      </div>
    );
  }

  return (
    <div className={cn('flex gap-2 mb-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <Avatar className="h-7 w-7 shrink-0 mt-1">
        <AvatarFallback className={cn('text-[10px] font-semibold', isUser ? 'bg-primary/10 text-primary' : 'bg-accent/20 text-accent-foreground')}>
          {isUser ? <User className="h-3.5 w-3.5" /> : leadName.charAt(0)}
        </AvatarFallback>
      </Avatar>
      <div className={cn(
        'max-w-[75%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed',
        isUser
          ? channel === 'whatsapp' ? 'bg-emerald-600/90 text-white rounded-br-sm'
          : channel === 'instagram' ? 'bg-blue-500/90 text-white rounded-br-sm'
          : channel === 'linkedin' ? 'bg-blue-700/90 text-white rounded-br-sm'
          : 'bg-primary text-primary-foreground rounded-br-sm'
        : 'bg-muted/60 text-foreground rounded-bl-sm border border-border/30',
      )}>
        {isTyping ? (
          <div className="flex items-center gap-1 py-1 px-1">
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40 animate-bounce [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40 animate-bounce [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40 animate-bounce [animation-delay:300ms]" />
          </div>
        ) : (
          <p className="whitespace-pre-wrap">{content}</p>
        )}
      </div>
    </div>
  );
}
