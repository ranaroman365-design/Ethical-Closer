import type { PaymentMethod, SecondaryMethod } from '@/types/payment';

export type { PaymentMethod };

interface ResolveOptions {
  applePayAvailable: boolean;
  secondaryMethod: SecondaryMethod;
  klarnaAvailable: boolean;
  paypalAvailable: boolean;
}

/**
 * REGEL: Immer exakt 2 Optionen. Niemals 1. Niemals 3.
 * Apple Pay, wenn verfügbar, immer als Option 1.
 */
export function resolvePaymentOptions({
  applePayAvailable,
  secondaryMethod,
  klarnaAvailable,
  paypalAvailable,
}: ResolveOptions): [PaymentMethod, PaymentMethod] {
  if (applePayAvailable) {
    if (secondaryMethod === 'klarna' && !klarnaAvailable) return ['apple_pay', 'stripe'];
    if (secondaryMethod === 'paypal' && !paypalAvailable) return ['apple_pay', 'stripe'];
    return ['apple_pay', secondaryMethod];
  }

  // Apple Pay nicht verfügbar → Stripe rückt auf Position 1
  if (secondaryMethod === 'stripe') return ['stripe', 'iban'];
  if (secondaryMethod === 'klarna' && !klarnaAvailable) return ['stripe', 'iban'];
  if (secondaryMethod === 'paypal' && !paypalAvailable) return ['stripe', 'iban'];
  return ['stripe', secondaryMethod];
}
