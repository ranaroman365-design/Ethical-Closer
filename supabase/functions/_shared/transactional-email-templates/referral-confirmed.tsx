/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Ethical Top Closer'
const SITE_URL = 'https://ethicalcloser.de'

interface ReferralConfirmedProps {
  referrerName?: string
  referredName?: string
  payoutAmount?: number
  referralIndex?: number
  totalConfirmedEarnings?: number
}

const fmtEur = (n?: number) =>
  typeof n === 'number'
    ? new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(n)
    : '—'

const ReferralConfirmedEmail = ({
  referrerName,
  referredName,
  payoutAmount,
  referralIndex,
  totalConfirmedEarnings,
}: ReferralConfirmedProps) => {
  const greeting = referrerName ? `Hi ${referrerName},` : 'Hi,'
  const indexLabel = referralIndex ? `#${referralIndex}` : ''

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        Deine Empfehlung {indexLabel} wurde bestätigt — {fmtEur(payoutAmount)} freigegeben.
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>
            Empfehlung bestätigt {indexLabel && `(${indexLabel})`}
          </Heading>

          <Text style={text}>{greeting}</Text>

          <Text style={text}>
            {referredName ? <strong>{referredName}</strong> : 'Eine deiner eingeladenen Personen'}{' '}
            hat soeben den Closer-Level erreicht. Damit wird deine Empfehlung
            automatisch <strong>bestätigt</strong> und deine Provision ist freigegeben.
          </Text>

          <Section style={highlight}>
            <Text style={highlightLabel}>Provision freigegeben</Text>
            <Text style={highlightValue}>{fmtEur(payoutAmount)}</Text>
          </Section>

          {typeof totalConfirmedEarnings === 'number' && (
            <Text style={subtleText}>
              Dein gesamter bestätigter Verdienst:{' '}
              <strong>{fmtEur(totalConfirmedEarnings)}</strong>
            </Text>
          )}

          <Section style={{ textAlign: 'center', margin: '32px 0' }}>
            <Button href={`${SITE_URL}/members/dashboard`} style={button}>
              Dashboard öffnen
            </Button>
          </Section>

          <Text style={footer}>
            Auszahlungen werden im nächsten Auszahlungslauf verarbeitet. Den genauen
            Status findest du jederzeit in deinem Empfehlungs-Dashboard.
          </Text>

          <Text style={signature}>— Das {SITE_NAME} Team</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: ReferralConfirmedEmail,
  subject: (data: Record<string, any>) => {
    const idx = data?.referralIndex ? ` #${data.referralIndex}` : ''
    return `Empfehlung${idx} bestätigt — Provision freigegeben`
  },
  displayName: 'Referral confirmed',
  previewData: {
    referrerName: 'Max',
    referredName: 'Lena Schmidt',
    payoutAmount: 400,
    referralIndex: 3,
    totalConfirmedEarnings: 850,
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
}
const container = {
  padding: '32px 28px',
  maxWidth: '560px',
  margin: '0 auto',
}
const h1 = {
  fontSize: '22px',
  fontWeight: 600,
  color: '#0a0a0a',
  letterSpacing: '-0.01em',
  margin: '0 0 24px',
}
const text = {
  fontSize: '15px',
  color: '#374151',
  lineHeight: '1.65',
  margin: '0 0 16px',
}
const subtleText = {
  fontSize: '13px',
  color: '#6b7280',
  lineHeight: '1.6',
  margin: '8px 0 0',
}
const highlight = {
  backgroundColor: '#f8f9fb',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  padding: '20px 22px',
  margin: '20px 0 8px',
}
const highlightLabel = {
  fontSize: '11px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.12em',
  color: '#6b7280',
  margin: '0 0 6px',
}
const highlightValue = {
  fontSize: '28px',
  fontWeight: 600,
  color: '#0a0a0a',
  margin: 0,
  letterSpacing: '-0.02em',
}
const button = {
  backgroundColor: '#0a0a0a',
  color: '#ffffff',
  padding: '12px 28px',
  borderRadius: '999px',
  textDecoration: 'none',
  fontSize: '14px',
  fontWeight: 500,
  display: 'inline-block',
}
const footer = {
  fontSize: '12px',
  color: '#9ca3af',
  lineHeight: '1.6',
  margin: '24px 0 0',
}
const signature = {
  fontSize: '13px',
  color: '#6b7280',
  margin: '32px 0 0',
}
