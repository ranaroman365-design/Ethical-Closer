import { useMonetizationOffers } from '@/hooks/useMonetizationOffers';
import MonetizationOfferCard from './MonetizationOfferCard';
import LockedEnvironmentCard from './LockedEnvironmentCard';
import StateIndicator from './StateIndicator';
import AdminMonetizationPanel from './AdminMonetizationPanel';

import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';

/**
 * Contextual monetization section for the Dashboard.
 * Shows state-triggered offers + locked premium environments.
 * No aggressive sales — everything is behavior-driven.
 */
export default function MonetizationSection() {
  const { offers, userState, userLevel, trackImpression, dismiss } = useMonetizationOffers();
  const { isAdmin } = useAuth();
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => lang === 'de' ? de : en;

  const environments = [
    {
      title: 'Advanced Scale Lab',
      description: tl('Fortgeschrittene Strategien für komplexe Deals', 'Advanced strategies for complex deals'),
      unlockHint: tl('Ab Level 5 verfügbar', 'Available from Level 5'),
      to: '/members/advanced-lab',
      requiredLevel: 5,
    },
    {
      title: 'Inner Circle',
      description: tl('Strategisches Mastermind für Top Performer', 'Strategic mastermind for top performers'),
      unlockHint: tl('Auf Einladung ab Level 5', 'By invitation from Level 5'),
      to: '/members/inner-circle',
      requiredLevel: 5,
    },
    {
      title: 'Quarterly Crossing',
      description: tl('Exklusives Netzwerk-Event', 'Exclusive networking event'),
      unlockHint: tl('Ab Level 4 verfügbar', 'Available from Level 4'),
      to: '/members/quarterly-crossing',
      requiredLevel: 4,
    },
  ];

  const hasContent = offers.length > 0 || environments.some(e => userLevel >= e.requiredLevel - 1);

  return (
    <div className="space-y-4">
      {/* State indicator — always show for L1+ */}
      {userLevel >= 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {tl('Dein Status', 'Your Status')}
          </p>
          <StateIndicator state={userState} />
        </div>
      )}


      {/* Contextual offers (max 2, no spam) */}
      {offers.length > 0 && (
        <div className="space-y-3">
          {offers.slice(0, 2).map(offer => (
            <MonetizationOfferCard
              key={offer.id}
              offer={offer}
              onDismiss={dismiss}
              onTrack={trackImpression}
            />
          ))}
        </div>
      )}

      {/* Locked / unlocked premium environments (pull mechanic) */}
      {userLevel >= 2 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mt-2">
            {tl('Premium Räume', 'Premium Spaces')}
          </p>
          {environments.map(env => (
            <LockedEnvironmentCard
              key={env.to}
              {...env}
              level={userLevel}
            />
          ))}
        </div>
      )}

      {/* Admin: monetization intelligence panel */}
      {isAdmin && (
        <div className="mt-4">
          <AdminMonetizationPanel />
        </div>
      )}
    </div>
  );
}
