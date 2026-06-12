/**
 * Echte Transformation-Stories — /apply Cold Traffic.
 *
 * Zwei Audience-Sets (Frauen-Default + Männer-Ambition).
 * BEFÜLLEN mit echten Stories sobald Fotos + Zitate + Zustimmungen vorliegen.
 * Bis dahin bleibt die `<TransformationStories />` Section sichtbar mit
 * dezenten Skeleton-Karten + dem Hinweis "folgt in Kürze". Kein Fake.
 *
 * Reihenfolge im UI = Reihenfolge im jeweiligen Array.
 *
 * Datenkontrakt pro Story:
 *  - id:         stable slug (für Tracking)
 *  - photoSrc:   importiertes Bild (src/assets/...) — oder null für Skeleton
 *  - firstName:  nur Vorname (Datenschutz)
 *  - before:     1 Zeile, Alltag/Ausgangspunkt
 *  - now:        1 Zeile, heute (kein Ergebnisversprechen)
 *  - quote:      kurzes O-Ton-Zitat
 *  - consent:    true erst nach schriftlicher Einwilligung
 */

export interface TransformationStory {
  id: string;
  photoSrc: string | null;
  firstName: string;
  before: string;
  now: string;
  quote: string;
  consent: boolean;
}

export const TRANSFORMATION_STORIES_FEMALE: TransformationStory[] = [
  // Hier kommen echte Frauen-Stories rein, sobald Assets + Zustimmung vorliegen.
];

export const TRANSFORMATION_STORIES_MALE: TransformationStory[] = [
  // Hier kommen echte Männer-Stories rein, sobald Assets + Zustimmung vorliegen.
];

/**
 * Backward-compat: bestehende Imports auf TRANSFORMATION_STORIES funktionieren weiter
 * und liefern die Frauen-Variante (default cohort).
 */
export const TRANSFORMATION_STORIES = TRANSFORMATION_STORIES_FEMALE;
