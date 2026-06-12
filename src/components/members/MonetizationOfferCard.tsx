import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, ArrowRight, Zap, Sparkles, Rocket, Crown, Calendar } from 'lucide-react';
import type { MonetizationOffer } from '@/hooks/useMonetizationOffers';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Zap, Sparkles, Rocket, Crown, Calendar,
};

interface Props {
  offer: MonetizationOffer;
  onDismiss: (key: string) => void;
  onTrack: (id: string, action: 'shown' | 'clicked' | 'dismissed', ctx?: string) => void;
}

export default function MonetizationOfferCard({ offer, onDismiss, onTrack }: Props) {
  const Icon = ICON_MAP[offer.icon] || Sparkles;

  useEffect(() => {
    onTrack(offer.id, 'shown', 'dashboard');
  }, [offer.id]);

  return (
    <div className="relative rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.03] to-transparent p-5 transition-all hover:border-primary/25">
      <button
        onClick={() => {
          onTrack(offer.id, 'dismissed', 'dashboard');
          onDismiss(offer.offer_key);
        }}
        className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground/30 hover:text-muted-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/8">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          {offer.price_label && (
            <span className="inline-block rounded-md bg-primary/8 px-2 py-0.5 text-[10px] font-semibold text-primary mb-2">
              {offer.price_label}
            </span>
          )}
          <p className="text-sm font-semibold text-foreground leading-snug">{offer.title}</p>
          {offer.subtitle && (
            <p className="text-[12px] text-muted-foreground mt-0.5 italic">{offer.subtitle}</p>
          )}
          {offer.description && (
            <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed line-clamp-2">{offer.description}</p>
          )}
          <Link
            to={offer.cta_link}
            onClick={() => onTrack(offer.id, 'clicked', 'dashboard')}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-[11px] font-medium text-primary-foreground transition-all hover:bg-primary/90"
          >
            {offer.cta_label}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
