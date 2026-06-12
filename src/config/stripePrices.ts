// RATENAUFSCHLAG: +5% auf Einmalpreis, auf 3 Raten verteilt
// Starter:     1.600 € → 3 × 560 €   (= 1.680 €, +5,0%)
// Closer:      4.400 € → 3 × 1.540 € (= 4.620 €, +5,0%)
// High-Ticket: 7.300 € → 3 × 2.555 € (= 7.665 €, +5,0%)

export const DEAL_CONFIG = {
  starter_one_time:    { label: 'Starter – Einmalzahlung',     amount: 160000, installments: null, installmentAmount: null,   display: '1.600 €' },
  starter_split_3:     { label: 'Starter – 3 Raten',           amount: 168000, installments: 3,    installmentAmount: 56000,  display: '3 × 560 €' },
  closer_one_time:     { label: 'Closer – Einmalzahlung',      amount: 440000, installments: null, installmentAmount: null,   display: '4.400 €' },
  closer_split_3:      { label: 'Closer – 3 Raten',            amount: 462000, installments: 3,    installmentAmount: 154000, display: '3 × 1.540 €' },
  highticket_one_time: { label: 'High-Ticket – Einmalzahlung', amount: 730000, installments: null, installmentAmount: null,   display: '7.300 €' },
  highticket_split_3:  { label: 'High-Ticket – 3 Raten',       amount: 766500, installments: 3,    installmentAmount: 255500, display: '3 × 2.555 €' },
} as const;

export type DealConfigKey = keyof typeof DEAL_CONFIG;

export function formatAmountEur(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(cents / 100);
}

export function totalAmount(key: DealConfigKey): number {
  const c = DEAL_CONFIG[key];
  return c.amount;
}
