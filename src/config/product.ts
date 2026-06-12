/**
 * ═══════════════════════════════════════════════════════════════
 * PRODUCT CONFIGURATION — SINGLE SOURCE OF TRUTH
 * ═══════════════════════════════════════════════════════════════
 *
 * Phase 1: Single-product system.
 * This file is the ONLY place where product identity is defined.
 * All UI, logic, and integrations reference this config.
 *
 * Clone-readiness: To create a new product instance,
 * duplicate this file and adjust values. Nothing else changes.
 * ═══════════════════════════════════════════════════════════════
 */

export const PRODUCT = {
  /** Display name — used in all UI surfaces */
  name: 'Ethical Top Closer',
  /** Trademarked name for partner/external surfaces */
  nameTM: 'Ethical Top Closer™',
  /** Brand line — used in entry screen, footer, meta */
  brandLine: 'Ethical Closing by Radiant',
  /** Short brand */
  brand: 'Radiant',
  /** URL-safe slug for namespacing */
  slug: 'etc',

  /**
   * ═══════════════════════════════════════════════════════════════
   * MASTER SYSTEM ARCHITECTURE — Radiant RevenueOS™
   * ═══════════════════════════════════════════════════════════════
   *
   * Radiant RevenueOS™ = umbrella system consisting of:
   *   • Radiant Growth OS™  → demand generation, content, distribution, AI optimization
   *   • Radiant Sales OS™   → sales training, infrastructure, team building, placement, execution
   *
   * These are independent, modular systems within the same ecosystem.
   * NEVER refer to Sales OS as "RevenueOS". ALWAYS distinguish Growth vs Sales.
   */
  masterSystem: {
    name: 'Radiant RevenueOS™',
    slug: 'radiant-revenue-os',
    subsystems: {
      growthOS: {
        name: 'Radiant Growth OS™',
        slug: 'radiant-growth-os',
        focus: ['demand generation', 'content creation', 'distribution', 'AI optimization', 'lead generation'],
      },
      salesOS: {
        name: 'Radiant Sales OS™',
        slug: 'radiant-sales-os',
        focus: ['sales training', 'sales infrastructure', 'team building', 'closer placement', 'sales execution'],
      },
    },
  },

  /** Meta / SEO */
  meta: {
    titleSuffix: '— Ethical Top Closer',
    description: {
      de: 'Die ethische Closing-Ausbildung mit Zertifizierung, Vermittlung und Karrieresystem.',
      en: 'The ethical closing education with certification, placement and career system.',
    },
  },

  /** GHL Integration config */
  ghl: {
    /** Namespace prefix for all outbound events → prevents collision on clone */
    webhookPrefix: 'etc_v1',
    /** Pipeline stages — maps 1:1 to GHL pipeline */
    /**
     * Canonical 14-stage pipeline (V6.1 compliance).
     * Lifecycle states (no_show, cancelled, recycled, returned_to_pool, converted_to_L1)
     * are tracked on the lead row, NOT as separate pipeline stages.
     */
    pipelineStages: [
      'new_lead',
      'quiz_completed',
      'booked',
      'setter_assigned',
      'setter_contacting',
      'setter_qualified',
      'setter_booked',
      'ready_for_closer',
      'assigned_closer',
      'closer_in_progress',
      'offer_made',
      'follow_up',
      'closed_won',
      'closed_lost',
    ] as const,
    /** Internal lifecycle states — tracked on lead.lead_status, never as pipeline stages. */
    lifecycleStates: [
      'no_show', 'cancelled', 'recycled', 'returned_to_pool', 'converted_to_L1',
    ] as const,
    /** Custom field mapping for GHL contact properties */
    contactFieldMapping: {
      setter_id: 'custom_setter_id',
      closer_id: 'custom_closer_id',
      lead_score: 'custom_lead_score',
      stage: 'custom_pipeline_stage',
      lead_level: 'custom_lead_level',
    },
  },

  /** Career levels — canonical definition */
  career: {
    levels: [
      { level: 0, key: 'prospect', de: 'Bewerber', en: 'Applicant', role: null },
      { level: 1, key: 'opener', de: 'Trainee', en: 'Trainee', role: 'Opener' },
      { level: 2, key: 'setter', de: 'Associate Setter', en: 'Associate Setter', role: 'Mentee' },
      { level: 3, key: 'senior_associate', de: 'Senior Setter', en: 'Senior Setter', role: 'Mentor' },
      { level: 4, key: 'junior_manager', de: 'Closer (Placement Track)', en: 'Closer (Placement Track)', role: 'Closer (Mentee)' },
      { level: 5, key: 'manager', de: 'Managing Closer', en: 'Managing Closer', role: 'Placement Ready / Mentor' },
      { level: 6, key: 'senior_manager', de: 'Senior Closer', en: 'Senior Closer', role: 'Placed' },
      { level: 7, key: 'director', de: 'Director', en: 'Director', role: 'B2B Client' },
      { level: 8, key: 'partner', de: 'Partner', en: 'Partner', role: 'Equity' },
    ] as const,

    /** All valid stage keys (DB values) including aliases */
    validStageKeys: [
      'prospect', 'opener', 'setter', 'associate_setter',
      'senior_associate', 'senior_setter',
      'junior_manager', 'manager', 'senior_manager',
      'director', 'partner',
    ] as const,

    /** Alias normalization: DB may store these → normalize to canonical key */
    aliases: {
      associate_setter: 'setter',
      associate: 'setter',
      senior_setter: 'senior_associate',
      senior_closer: 'senior_manager',
      trainee: 'opener',
      applicant: 'prospect',
    } as Record<string, string>,
  },

  /**
   * Commission rates per stage — UI FALLBACK ONLY.
   *
   * ⚠️ Canonical source of truth = `public.product_config.config.commission_rates` (DB).
   * Edit rates in the White-Label Settings UI (/members/admin/white-label) or directly
   * in product_config. The values here mirror the seeded defaults so the UI can render
   * before product_config is loaded; payout logic NEVER reads from this constant.
   *
   * Override-style stages (director, partner) currently inactive — see
   * product_config.override_active.
   */
  commissions: {
    opener: { role: 'opener', rate: 0.01, label: '1 % Opener-Bonus' },
    setter: { role: 'setter', rate: 0.03, label: '3 % Setter-Provision' },
    associate_setter: { role: 'setter', rate: 0.03, label: '3 % Setter-Provision' },
    senior_associate: { role: 'setter', rate: 0.05, label: '5 % Setter-Provision' },
    senior_setter: { role: 'setter', rate: 0.05, label: '5 % Setter-Provision' },
    junior_manager: { role: 'closer', rate: 0.08, label: '8 % Closer-Provision' },
    manager: { role: 'closer', rate: 0.10, label: '10 % Closer-Provision' },
    senior_manager: { role: 'closer', rate: 0.12, label: '12 % Closer-Provision' },
    director: { role: 'closer', rate: 0.03, label: '3 % Team-Override' },
    partner: { role: 'closer', rate: 0.02, label: '2 % Team-Override' },
  } as Record<string, { role: string; rate: number; label: string }>,

  /** State-to-offer mapping for monetization engine */
  stateOfferMapping: {
    new: 'starter',
    learning: 'closer_track',
    committed: 'income_track',
    stuck: 'booster',
    unstable: 'radiant',
    performing: 'scale_lab',
    scaling: 'quarterly',
    leading: 'inner_circle',
  } as Record<string, string>,

  /**
   * Legal entity — Coherence Labs LLC (Wyoming, USA)
   * Single source of truth for all 5 legal pages:
   *   /legal-notice (Imprint), /privacy, /terms, /refund-policy, /cookie-policy
   * German legacy aliases (/impressum, /datenschutz, /agb, /widerruf) redirect.
   */
  legal: {
    // Entity
    company: 'Coherence Labs LLC',
    legalForm: 'Limited Liability Company (LLC)',
    jurisdictionState: 'Wyoming',
    jurisdictionCountry: 'United States',
    filingId: '2026-001893199',
    formationDate: 'February 12, 2026',
    organizer: 'Company Sage Agents LLC',

    // Address
    street: '1309 Coffeen Ave, Suite 1200',
    zipCity: 'Sheridan, WY 82801',
    country: 'United States',

    // Representation
    representative: 'Dr. Josue Manuel Quintana Diaz',
    representativeRole: 'Managing Member / Authorized Representative',

    // Registered agent
    registeredAgent: {
      name: 'Company Sage Agents LLC',
      street: '1095 Sugarview Dr, Suite 100',
      zipCity: 'Sheridan, WY 82801',
      country: 'United States',
    },

    // Contact
    email: 'contact@radiant.global',
    phone: '—',
    responseTime: '2 business days',

    // Tax
    vatId: 'N/A (Non-EU entity)',

    // Operating brands
    brands: [
      { name: 'Radiant', purpose: 'Personal development and transformation programs' },
      { name: 'Ethical Top Closer', purpose: 'Professional sales training and certification' },
      { name: 'Lunama', purpose: 'Creative, experiential, and artistic initiatives' },
    ],

    // Web
    primaryDomain: 'yourradiantway.com',

    // Governing law
    jurisdiction: 'State of Wyoming, United States',
    governingLaw: 'Laws of the State of Wyoming, USA — without prejudice to mandatory consumer protection provisions of the European Union in the user\'s country of residence.',

    // Versioning
    version: '2026.1',
    lastUpdated: '2026-04-22',
  },

  /**
   * Program metadata — used in checkout consent + confirmation email.
   * Defines structured, time-limited educational program parameters
   * for legally defensible commitment agreements.
   */
  program: {
    key: 'etc',
    name: 'Ethical Top Closer',
    durationWeeks: 9,
    accessExpires: 'automatically after 9 weeks',
    accessExpiresDe: 'automatisch nach 9 Wochen',
    startCondition: 'immediate or scheduled start date',
    startConditionDe: 'sofortiger oder vereinbarter Startzeitpunkt',
  },

  /** Community type mapping per level range */
  communityMapping: {
    trainee: { minLevel: 0, maxLevel: 1 },
    setter: { minLevel: 2, maxLevel: 3 },
    closer: { minLevel: 4, maxLevel: 6 },
    manager: { minLevel: 7, maxLevel: 8 },
  } as Record<string, { minLevel: number; maxLevel: number }>,
} as const;

/** Helper: get product name for display */
export function getProductName(trademarked = false): string {
  return trademarked ? PRODUCT.nameTM : PRODUCT.name;
}

/** Helper: get brand line */
export function getBrandLine(): string {
  return PRODUCT.brandLine;
}
