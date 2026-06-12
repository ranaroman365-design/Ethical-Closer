/**
 * Phase 10.3 — Salesbook WhatsApp offer constants.
 *
 * Central source of truth for the WhatsApp number used in the
 * /salesbook offer flow. Replace the default placeholder with the
 * real production number when ready (no other files need to change).
 */
export const SALESBOOK_WHATSAPP_NUMBER = "491234567890";
export const SALESBOOK_WHATSAPP_MESSAGE =
  "Hi, ich möchte das kostenlose Salesbook erhalten.";

export function buildSalesbookWhatsAppLink(
  number: string = SALESBOOK_WHATSAPP_NUMBER,
  message: string = SALESBOOK_WHATSAPP_MESSAGE,
): string {
  const digits = number.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
