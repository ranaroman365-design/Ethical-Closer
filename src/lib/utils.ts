import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number using k-format for values >= 1000.
 * Examples: 1000 → "1k", 4400 → "4,4k" (DE) / "4.4k" (EN), 800 → "800"
 */
export function formatK(value: number, prefix = '', suffix = '', lang: 'de' | 'en' = 'de'): string {
  if (value >= 1000) {
    const k = value / 1000;
    const raw = k % 1 === 0 ? `${k}` : k.toFixed(1);
    const formatted = lang === 'de' ? raw.replace('.', ',') : raw;
    return `${prefix}${formatted}k${suffix}`;
  }
  return `${prefix}${value}${suffix}`;
}

/**
 * Format a number with locale-aware thousand separators.
 * DE: 12.500,00  EN: 12,500.00
 * For currency display without k-abbreviation.
 */
export function formatNumber(value: number, lang: 'de' | 'en' = 'de'): string {
  return value.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US');
}
