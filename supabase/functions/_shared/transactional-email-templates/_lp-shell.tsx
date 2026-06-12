/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Section, Hr, Link, Button,
} from 'npm:@react-email/components@0.0.22'

/**
 * Layer 43 — ETC Premium Documentation Email Shell
 * -------------------------------------------------
 * Apple-level clarity meets Loro Piana calm luxury.
 * Used by all `lp-*` templates. Email is the documentation & trust layer.
 *
 * 4-section structure:
 *   1. Header   — ETC wordmark on white
 *   2. Card     — soft off-white panel: title, body, optional details
 *   3. Action   — single calm CTA (button or inline link)
 *   4. Footer   — legal, support contact, quiet
 *
 * Design contract:
 *   - Body background ALWAYS #ffffff (incl. dark-mode clients)
 *   - Generous whitespace, single gold accent
 *   - No emojis, no hype, no urgency, no exaggerated claims
 *   - Mobile-first responsive (single column, fluid container)
 *   - Plain-text fallback handled at send-pipeline level
 */

export interface LpShellProps {
  preview: string
  /** Card title — short, calm, factual. Optional; falls back to preview. */
  title?: string
  greetingName?: string
  /** Body paragraphs — each rendered as its own <Text> inside the card. */
  paragraphs: React.ReactNode[]
  /** Optional structured detail block (e.g. Datum / Uhrzeit). */
  details?: { label: string; value: React.ReactNode }[]
  /** Single primary CTA. Either `cta` (button) OR `inlineLink`, not both. */
  cta?: { label: string; url: string }
  /** Optional inline link (subtle, arrow-prefixed). Used when no button is needed. */
  inlineLink?: { label: string; url: string }
  /** Closing line above signature. Defaults to "Beste Grüße". */
  closing?: string
  signature?: string
  /** Override default support email in footer. */
  supportEmail?: string
  children?: React.ReactNode
}

const DEFAULT_SUPPORT = 'support@ethicalcloser.de'
const COMPANY_LINE = 'Ethical Closer · Hamburg · Deutschland'

export const LpShell = ({
  preview,
  title,
  greetingName,
  paragraphs,
  details,
  cta,
  inlineLink,
  closing = 'Beste Grüße',
  signature = 'Team ETC',
  supportEmail = DEFAULT_SUPPORT,
  children,
}: LpShellProps) => (
  <Html lang="de" dir="ltr">
    <Head>
      <meta name="color-scheme" content="light only" />
      <meta name="supported-color-schemes" content="light" />
    </Head>
    <Preview>{preview}</Preview>
    <Body style={lpBody}>
      <Container style={lpOuter}>
        {/* 1. HEADER */}
        <Section style={lpHeader}>
          <Text style={lpBrand}>ETC</Text>
        </Section>

        {/* 2. MAIN CARD */}
        <Section style={lpCard}>
          <Heading as="h1" style={lpTitle}>{title ?? preview}</Heading>

          <Text style={lpGreeting}>
            {greetingName ? `Hallo ${greetingName},` : 'Hallo,'}
          </Text>

          {paragraphs.map((p, i) => (
            <Text key={i} style={lpParagraph}>{p}</Text>
          ))}

          {details && details.length > 0 ? (
            <Section style={lpDetails}>
              {details.map((d, i) => (
                <Text key={i} style={lpDetailRow}>
                  <span style={lpDetailLabel}>{d.label}</span>
                  <br />
                  <span style={lpDetailValue}>{d.value}</span>
                </Text>
              ))}
            </Section>
          ) : null}

          {/* 3. ACTION — single CTA */}
          {cta ? (
            <Section style={lpCtaWrap}>
              <Button href={cta.url} style={lpCtaButton}>
                {cta.label}
              </Button>
            </Section>
          ) : null}

          {!cta && inlineLink ? (
            <Text style={lpLinkLine}>
              →{' '}
              <Link href={inlineLink.url} style={lpLink}>
                {inlineLink.label}
              </Link>
            </Text>
          ) : null}

          {children}

          <Text style={lpClosing}>{closing}</Text>
          <Text style={lpSignature}>{signature}</Text>
        </Section>

        {/* 4. FOOTER */}
        <Section style={lpFooter}>
          <Text style={lpFooterLine}>{COMPANY_LINE}</Text>
          <Text style={lpFooterLine}>
            Fragen? <Link href={`mailto:${supportEmail}`} style={lpFooterLink}>{supportEmail}</Link>
          </Text>
          <Text style={lpFooterMeta}>
            Diese Nachricht wurde im Rahmen deiner aktiven Beziehung mit ETC versendet.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

/* ---------- Tokens (Loro Piana — quiet, ivory-warm, gold accent) ---------- */

const INK = '#1A1A1A'
const INK_SOFT = '#4A4A4A'
const MUTED = '#8C8C8C'
const RULE = '#ECE8E0'
const CARD_BG = '#FBFAF7'
const GOLD = '#C9A84C'
const GOLD_DEEP = '#A88A35'

const SERIF = "'Cormorant Garamond', 'Times New Roman', Georgia, serif"
const SANS = "'Inter', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"

/* ---------- Layout ---------- */

export const lpBody = {
  backgroundColor: '#ffffff',
  fontFamily: SANS,
  margin: 0,
  padding: '32px 16px',
  WebkitFontSmoothing: 'antialiased' as const,
}
export const lpOuter = {
  maxWidth: '560px',
  margin: '0 auto',
  padding: 0,
}

/* Header */
export const lpHeader = {
  padding: '8px 8px 24px',
  textAlign: 'center' as const,
}
export const lpBrand = {
  fontFamily: SERIF,
  fontSize: '22px',
  letterSpacing: '0.36em',
  color: INK,
  margin: 0,
  fontWeight: 400 as const,
}

/* Card */
export const lpCard = {
  backgroundColor: CARD_BG,
  border: `1px solid ${RULE}`,
  borderRadius: '4px',
  padding: '40px 36px',
}
export const lpTitle = {
  fontFamily: SERIF,
  fontSize: '26px',
  fontWeight: 400 as const,
  color: INK,
  lineHeight: '1.3',
  letterSpacing: '0.01em',
  margin: '0 0 28px',
}
export const lpGreeting = {
  fontSize: '15px',
  color: INK,
  lineHeight: '1.7',
  margin: '0 0 16px',
}
export const lpParagraph = {
  fontSize: '15px',
  color: INK_SOFT,
  lineHeight: '1.75',
  margin: '0 0 16px',
}
export const lpDetails = {
  margin: '24px 0 28px',
  padding: '20px 22px',
  backgroundColor: '#ffffff',
  border: `1px solid ${RULE}`,
  borderRadius: '3px',
}
export const lpDetailRow = {
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0 0 14px',
}
export const lpDetailLabel = {
  color: MUTED,
  fontSize: '11px',
  letterSpacing: '0.14em',
  textTransform: 'uppercase' as const,
}
export const lpDetailValue = {
  color: INK,
  fontSize: '15px',
  fontWeight: 500 as const,
}

/* Action */
export const lpCtaWrap = {
  margin: '8px 0 24px',
  textAlign: 'left' as const,
}
export const lpCtaButton = {
  display: 'inline-block',
  backgroundColor: INK,
  color: '#ffffff',
  fontFamily: SANS,
  fontSize: '14px',
  fontWeight: 500 as const,
  letterSpacing: '0.04em',
  padding: '14px 28px',
  borderRadius: '2px',
  textDecoration: 'none' as const,
}
export const lpLinkLine = {
  fontSize: '15px',
  color: INK,
  lineHeight: '1.7',
  margin: '8px 0 24px',
}
export const lpLink = {
  color: GOLD_DEEP,
  textDecoration: 'none' as const,
  borderBottom: `1px solid ${GOLD}`,
  paddingBottom: '1px',
}

/* Closing / signature */
export const lpClosing = {
  fontSize: '15px',
  color: INK_SOFT,
  lineHeight: '1.7',
  margin: '32px 0 4px',
}
export const lpSignature = {
  fontSize: '15px',
  color: INK,
  margin: '0',
  fontWeight: 500 as const,
}

/* Footer */
export const lpFooter = {
  padding: '32px 8px 8px',
  textAlign: 'center' as const,
}
export const lpFooterLine = {
  fontSize: '12px',
  color: MUTED,
  lineHeight: '1.7',
  margin: '0 0 4px',
}
export const lpFooterLink = {
  color: MUTED,
  textDecoration: 'underline' as const,
}
export const lpFooterMeta = {
  fontSize: '11px',
  color: MUTED,
  lineHeight: '1.6',
  margin: '12px 0 0',
  fontStyle: 'italic' as const,
}
