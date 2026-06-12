import { Check, CheckCheck } from 'lucide-react';

interface Props {
  status: 'sent' | 'delivered' | 'seen';
}

export default function MessageStatusIndicator({ status }: Props) {
  if (status === 'seen') {
    return <CheckCheck className="h-3 w-3 text-primary" />;
  }
  if (status === 'delivered') {
    return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
  }
  return <Check className="h-3 w-3 text-muted-foreground" />;
}
