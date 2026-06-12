import { useId } from "react";
import { Link } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import { useLanguage } from "@/i18n/LanguageContext";
import { PRODUCT } from "@/config/product";

export interface ConsentState {
  acceptedTerms: boolean;
  acceptedRefund: boolean;
  acceptedWaiver: boolean;
  acceptedNoGuarantee: boolean;
  acceptedAccessDuration: boolean;
  /** Optional — only relevant for payment plans */
  acceptedPaymentObligation?: boolean;
}

interface CheckoutLegalConsentProps {
  value: ConsentState;
  onChange: (next: ConsentState) => void;
  /** Visual variant: 'light' for white card, 'dark' for dark backgrounds */
  variant?: "light" | "dark";
  /** When true, renders the optional payment-plan obligation checkbox as MANDATORY */
  isPaymentPlan?: boolean;
}

/**
 * Commitment Agreement Framework — elite-level consent block.
 *
 * 5 checkboxes (Checkbox 5 mandatory only on payment plans):
 *   1. Terms + Refund Policy
 *   2. Commitment + Withdrawal Waiver (psychological + legal hybrid)
 *   3. Results Reality (no-guarantee education disclaimer)
 *   4. Access Limitation (9 weeks)
 *   5. Payment Responsibility (binding regardless of participation)
 *
 * Tone: premium, sovereign, commitment-based — never aggressive.
 * The expectation/refund framing lives OUTSIDE this component on the
 * payment page (Commitment Agreement section + refund-near-pricing block).
 */
export const CheckoutLegalConsent = ({
  value,
  onChange,
  variant = "light",
  isPaymentPlan = false,
}: CheckoutLegalConsentProps) => {
  const { tx } = useLanguage();
  const termsId = useId();
  const waiverId = useId();
  const guaranteeId = useId();
  const durationId = useId();
  const planId = useId();

  const isDark = variant === "dark";
  const textColor = isDark ? "text-white/80" : "text-foreground/80";
  const linkColor = isDark
    ? "text-white underline underline-offset-2 hover:text-white"
    : "text-primary underline underline-offset-2 hover:text-primary/80";
  const borderColor = isDark ? "border-white/10" : "border-border/60";
  const bgColor = isDark ? "bg-white/[0.03]" : "bg-card/30";

  const weeks = PRODUCT.program.durationWeeks;

  return (
    <div
      className={`rounded-xl border ${borderColor} ${bgColor} p-4 space-y-4`}
      data-testid="checkout-legal-consent"
    >
      {/* 1 — Terms + Refund */}
      <label htmlFor={termsId} className="flex gap-3 cursor-pointer">
        <Checkbox
          id={termsId}
          checked={value.acceptedTerms && value.acceptedRefund}
          onCheckedChange={(checked) => {
            const v = checked === true;
            onChange({ ...value, acceptedTerms: v, acceptedRefund: v });
          }}
          className="mt-0.5"
          required
        />
        <span className={`text-[13px] leading-relaxed ${textColor}`}>
          {tx("Ich habe die ", "I have read and agree to the ")}
          <Link to="/terms" target="_blank" className={linkColor}>
            {tx("Allgemeinen Geschäftsbedingungen", "Terms of Service")}
          </Link>
          {tx(" und die ", " and the ")}
          <Link to="/refund-policy" target="_blank" className={linkColor}>
            {tx("Widerrufs- & Erstattungsrichtlinie", "Refund Policy")}
          </Link>
          {tx(" gelesen und stimme ihnen zu.", ".")}
        </span>
      </label>

      {/* 2 — Commitment + Waiver hybrid (psychological + legal) */}
      <label htmlFor={waiverId} className="flex gap-3 cursor-pointer">
        <Checkbox
          id={waiverId}
          checked={value.acceptedWaiver}
          onCheckedChange={(checked) =>
            onChange({ ...value, acceptedWaiver: checked === true })
          }
          className="mt-0.5"
          required
        />
        <span className={`text-[13px] leading-relaxed ${textColor}`}>
          {tx(
            `Ich verstehe, dass ich einem strukturierten ${weeks}-Wochen-Programm beitrete, und ich verpflichte mich, vollständig daran teilzunehmen. Ich stimme ausdrücklich zu, dass das Programm wie vereinbart beginnt, und verzichte mit Programmstart auf mein Widerrufsrecht.`,
            `I understand that I am joining a structured ${weeks}-week program and I commit to participating fully. I expressly agree that the program begins as scheduled and I waive my right of withdrawal once the program has started.`
          )}
        </span>
      </label>

      {/* 3 — Results Reality */}
      <label htmlFor={guaranteeId} className="flex gap-3 cursor-pointer">
        <Checkbox
          id={guaranteeId}
          checked={value.acceptedNoGuarantee}
          onCheckedChange={(checked) =>
            onChange({ ...value, acceptedNoGuarantee: checked === true })
          }
          className="mt-0.5"
          required
        />
        <span className={`text-[13px] leading-relaxed ${textColor}`}>
          {tx(
            "Ich verstehe, dass dieses Programm ausschließlich Bildung und Training bereitstellt und keine bestimmten finanziellen oder beruflichen Ergebnisse garantiert.",
            "I understand that this program provides education and training only and does not guarantee specific financial or professional results."
          )}
        </span>
      </label>

      {/* 4 — Access Limitation */}
      <label htmlFor={durationId} className="flex gap-3 cursor-pointer">
        <Checkbox
          id={durationId}
          checked={value.acceptedAccessDuration}
          onCheckedChange={(checked) =>
            onChange({ ...value, acceptedAccessDuration: checked === true })
          }
          className="mt-0.5"
          required
        />
        <span className={`text-[13px] leading-relaxed ${textColor}`}>
          {tx(
            `Ich verstehe, dass der Zugang zum Programm auf ${weeks} Wochen begrenzt ist und nach Programmende automatisch endet.`,
            `I understand that access to the program is limited to ${weeks} weeks and will expire automatically after the program ends.`
          )}
        </span>
      </label>

      {/* 5 — Payment Responsibility (mandatory on payment plans) */}
      {isPaymentPlan && (
        <label htmlFor={planId} className="flex gap-3 cursor-pointer">
          <Checkbox
            id={planId}
            checked={value.acceptedPaymentObligation === true}
            onCheckedChange={(checked) =>
              onChange({ ...value, acceptedPaymentObligation: checked === true })
            }
            className="mt-0.5"
            required
          />
          <span className={`text-[13px] leading-relaxed ${textColor}`}>
            {tx(
              "Ich verstehe, dass ich bei Wahl eines Ratenplans verpflichtet bin, alle Zahlungen unabhängig vom Umfang meiner Teilnahme vollständig zu leisten.",
              "I understand that if I choose a payment plan, I am responsible for completing all payments regardless of my level of participation."
            )}
          </span>
        </label>
      )}

      {/* Footnote */}
      <p
        className={`text-[10px] uppercase tracking-[0.18em] ${
          isDark ? "text-white/40" : "text-muted-foreground/70"
        }`}
      >
        {PRODUCT.legal.company} · v{PRODUCT.legal.version} · {PRODUCT.legal.lastUpdated}
      </p>
    </div>
  );
};

export const isConsentComplete = (
  c: ConsentState,
  opts: { isPaymentPlan?: boolean } = {}
): boolean => {
  const base =
    c.acceptedTerms &&
    c.acceptedRefund &&
    c.acceptedWaiver &&
    c.acceptedNoGuarantee &&
    c.acceptedAccessDuration;
  if (opts.isPaymentPlan) {
    return base && c.acceptedPaymentObligation === true;
  }
  return base;
};

export default CheckoutLegalConsent;
