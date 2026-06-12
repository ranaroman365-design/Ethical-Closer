/**
 * ═══════════════════════════════════════════════════════════════
 * OFFER DECK CONFIGURATION — SINGLE SOURCE OF TRUTH
 * ═══════════════════════════════════════════════════════════════
 *
 * Unified visibility matrix for the Offer Deck section.
 * Controls what each level sees across all content blocks.
 * 
 * Block keys:
 *   B1 = Frontend Overview
 *   B2 = Frontend Details (Sales Logic)
 *   B3 = Pricing
 *   B4 = Backend Overview
 *   B5 = Backend Detail (Previous Stage Only)
 *   B6 = Offer Progression Logic
 *   B7 = Strategic Monetization View
 *
 * Visibility values:
 *   true       = fully visible
 *   false      = hidden
 *   'minimal'  = high-level only
 *   'reduced'  = partial
 *   'frontend' = frontend pricing only
 *   'partial'  = partially visible
 *   'previous' = show only previous stage backend
 *   'multi_previous' = show multiple previous stages
 * ═══════════════════════════════════════════════════════════════
 */

export type BlockVisibility = boolean | 'minimal' | 'reduced' | 'frontend' | 'partial' | 'previous' | 'multi_previous';

export interface LevelVisibility {
  B1: BlockVisibility;
  B2: BlockVisibility;
  B3: BlockVisibility;
  B4: BlockVisibility;
  B5: BlockVisibility;
  B6: BlockVisibility;
  B7: BlockVisibility;
}

/** Visibility matrix: level → block visibility */
export const OFFER_VISIBILITY: Record<number, LevelVisibility> = {
  0: { B1: false, B2: false, B3: false, B4: false, B5: false, B6: false, B7: false },
  1: { B1: 'minimal', B2: false, B3: false, B4: false, B5: false, B6: false, B7: false },
  2: { B1: true, B2: true, B3: false, B4: false, B5: false, B6: 'minimal', B7: false },
  3: { B1: true, B2: true, B3: false, B4: false, B5: false, B6: 'minimal', B7: false },
  4: { B1: true, B2: true, B3: 'frontend', B4: false, B5: false, B6: 'reduced', B7: false },
  5: { B1: true, B2: true, B3: true, B4: true, B5: 'previous', B6: true, B7: false },
  6: { B1: true, B2: true, B3: true, B4: true, B5: 'previous', B6: true, B7: 'partial' },
  7: { B1: true, B2: true, B3: true, B4: true, B5: 'multi_previous', B6: true, B7: true },
  8: { B1: true, B2: true, B3: true, B4: true, B5: true, B6: true, B7: true },
  // L9 = Admin
  9: { B1: true, B2: true, B3: true, B4: true, B5: true, B6: true, B7: true },
};

/** Backend offers mapped to the level they belong to */
export const BACKEND_OFFERS = [
  { key: 'booster', level: 3, title: { de: 'Booster', en: 'Booster' }, description: { de: 'Wenn du mehr Zeit brauchst, um dein Level zu erreichen.', en: 'When you need more time to reach your next level.' }, icon: '🚀' },
  { key: 'radiant', level: 4, title: { de: 'Radiant', en: 'Radiant' }, description: { de: 'Wenn deine Leistung noch nicht konstant abrufbar ist.', en: 'When your performance is not yet consistently available.' }, icon: '🧠' },
  { key: 'scale_lab', level: 5, title: { de: 'Scale Lab', en: 'Scale Lab' }, description: { de: 'Fortgeschrittene Strategien für komplexe Deals und Skalierung.', en: 'Advanced strategies for complex deals and scaling.' }, icon: '🔬' },
  { key: 'quarterly', level: 6, title: { de: 'Quarterly Crossing', en: 'Quarterly Crossing' }, description: { de: 'Exklusives Netzwerk-Event für Top Performer.', en: 'Exclusive networking event for top performers.' }, icon: '🏔️' },
  { key: 'inner_circle', level: 7, title: { de: 'Inner Circle', en: 'Inner Circle' }, description: { de: 'Strategisches Mastermind für das höchste Level.', en: 'Strategic mastermind for the highest level.' }, icon: '👑' },
] as const;

/** Frontend offer tracks */
export const FRONTEND_TRACKS = [
  {
    key: 'starter',
    title: { de: 'Starter Track', en: 'Starter Track' },
    subtitle: { de: 'Earn While You Learn', en: 'Earn While You Learn' },
    description: {
      de: 'Erste Einnahmen im Opener- und Setter-Bereich.',
      en: 'First income in the opener and setter area.',
    },
    fit: {
      de: 'Wenn Einstieg + erste Einnahmen.',
      en: 'If you are entering and want to start earning.',
    },
    price: '1.600 €',
    color: 'hsl(142, 71%, 45%)',
  },
  {
    key: 'closer',
    title: { de: 'Closer Track', en: 'Closer Track' },
    subtitle: { de: 'Become a Closer', en: 'Become a Closer' },
    description: {
      de: 'Strukturierter Aufbau inkl. KPI-basierter Entwicklung.',
      en: 'Structured skill development with KPI-based progression.',
    },
    fit: {
      de: 'Wenn strukturierter Skill-Aufbau.',
      en: 'If you want structured skill development.',
    },
    price: '4.400 €',
    color: 'hsl(0, 72%, 51%)',
  },
  {
    key: 'placement',
    title: { de: 'Placement Track', en: 'Placement Track' },
    subtitle: { de: 'Get Placed as a High-Ticket Closer', en: 'Get Placed as a High-Ticket Closer' },
    description: {
      de: 'Direkter Fokus auf Placement inkl. Performance-Struktur.',
      en: 'Direct focus on placement including performance structure.',
    },
    fit: {
      de: 'Wenn klarer Fokus auf Placement.',
      en: 'If your focus is on placement.',
    },
    price: '4.400 € + 2.900 €',
    color: 'hsl(25, 95%, 53%)',
  },
] as const;

/** Product access layer — which products exist and which are unlocked */
export interface ProductAccess {
  key: string;
  name: string;
  unlocked: boolean;
  description: { de: string; en: string };
  lockedMessage: { de: string; en: string };
}

export const PRODUCTS: ProductAccess[] = [
  {
    key: 'ethical_top_closer',
    name: 'Ethical Top Closer',
    unlocked: true,
    description: {
      de: 'Die ethische Closing-Ausbildung mit Zertifizierung und Karrieresystem.',
      en: 'The ethical closing education with certification and career system.',
    },
    lockedMessage: { de: '', en: '' },
  },
  {
    key: 'radiant_platform',
    name: 'Radiant',
    unlocked: false,
    description: {
      de: 'Ganzheitliche Performance- und Mindset-Plattform.',
      en: 'Holistic performance and mindset platform.',
    },
    lockedMessage: {
      de: 'Dieses Produkt ist aktuell nicht Teil deines Arbeitsbereichs.',
      en: 'This product is not part of your current scope.',
    },
  },
  {
    key: 'future_product',
    name: 'Coming Soon',
    unlocked: false,
    description: {
      de: 'Weitere Produkte sind in Entwicklung.',
      en: 'More products are in development.',
    },
    lockedMessage: {
      de: 'Aktuell nicht relevant für deine Rolle.',
      en: 'Not relevant for your role at this time.',
    },
  },
];

/** Get visible backend offers for a given level */
export function getVisibleBackendOffers(level: number): typeof BACKEND_OFFERS[number][] {
  if (level >= 8) return [...BACKEND_OFFERS]; // Partner/Admin: all
  if (level === 7) return BACKEND_OFFERS.filter(o => o.level <= 6); // Director: multi previous
  if (level === 6) return BACKEND_OFFERS.filter(o => o.level <= 5); // Senior Closer: previous
  if (level === 5) return BACKEND_OFFERS.filter(o => o.level <= 4); // Manager: previous
  return []; // L4 and below: none
}

/** Check if a block is visible (truthy in any form) */
export function isBlockVisible(visibility: BlockVisibility): boolean {
  return visibility !== false;
}

/** Get the effective visibility for a level, with admin override */
export function getVisibility(level: number, isAdmin: boolean): LevelVisibility {
  if (isAdmin) return OFFER_VISIBILITY[9];
  return OFFER_VISIBILITY[Math.min(level, 8)] ?? OFFER_VISIBILITY[0];
}
