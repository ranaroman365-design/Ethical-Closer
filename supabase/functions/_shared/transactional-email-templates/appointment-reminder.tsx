/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text, Section, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

import { PRODUCT_NAME } from '../product-config.ts'
const SITE_NAME = PRODUCT_NAME

interface AppointmentReminderProps {
  name?: string
  date?: string
  time?: string
  callType?: string
  reminderType?: string
  loginUrl?: string
}

const AppointmentReminderEmail = ({
  name,
  date = '',
  time,
  callType = 'Strategiegespräch',
  reminderType = '24h',
  loginUrl = 'https://ethical-closing.lovable.app/members/interview',
}: AppointmentReminderProps) => {
  const urgencyText = reminderType === '15min'
    ? 'In 15 Minuten'
    : reminderType === '3h'
      ? 'In 3 Stunden'
      : 'Morgen';

  return (
    <Html lang="de" dir="ltr">
      <Head />
      <Preview>{urgencyText}: Dein {callType}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={brand}>{SITE_NAME}</Text>
          </Section>

          <Heading style={h1}>
            {name ? `${name}, dein Termin steht bevor.` : 'Dein Termin steht bevor.'}
          </Heading>

          <Section style={urgencyBox}>
            <Text style={urgencyLabel}>{urgencyText}</Text>
          </Section>

          <Section style={infoBox}>
            <Text style={infoLabel}>Termin</Text>
            <Text style={infoValue}>{callType}</Text>
            <Text style={infoLabel}>Datum & Uhrzeit</Text>
            <Text style={infoValue}>{date}{time ? ` · ${time}` : ''}</Text>
          </Section>

          <Text style={text}>
            Bitte stelle sicher, dass du rechtzeitig bereit bist. Eine ruhige Umgebung
            und eine stabile Internetverbindung sind ideal.
          </Text>

          <Button style={button} href={loginUrl}>
            Zur Vorbereitung
          </Button>

          <Hr style={hr} />
          <Text style={footer}>{SITE_NAME}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: AppointmentReminderEmail,
  subject: (data: Record<string, any>) =>
    `Erinnerung: ${data?.callType || 'Strategiegespräch'} am ${data?.date || ''}`.trim(),
  displayName: 'Termin-Erinnerung',
  previewData: {
    name: 'Anna',
    date: '15. Januar 2026',
    time: '14:00',
    callType: 'Strategiegespräch',
    reminderType: '24h',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '0 25px 40px' }
const header = { padding: '30px 0 20px', textAlign: 'center' as const }
const brand = { fontSize: '14px', fontWeight: 'bold' as const, color: 'hsl(152, 30%, 17.3%)', letterSpacing: '0.05em', textTransform: 'uppercase' as const, margin: '0' }
const h1 = { fontSize: '20px', fontWeight: 'bold' as const, color: 'hsl(0, 0%, 12%)', margin: '0 0 16px', lineHeight: '1.3' }
const text = { fontSize: '14px', color: 'hsl(0, 0%, 35%)', lineHeight: '1.6', margin: '0 0 20px' }
const urgencyBox = { backgroundColor: 'hsl(36, 33%, 95.3%)', borderRadius: '6px', padding: '12px 20px', margin: '0 0 16px', borderLeft: '3px solid hsl(36, 50%, 55%)' }
const urgencyLabel = { fontSize: '15px', fontWeight: 'bold' as const, color: 'hsl(36, 40%, 35%)', margin: '0' }
const infoBox = { backgroundColor: 'hsl(36, 33%, 95.3%)', borderRadius: '6px', padding: '16px 20px', margin: '0 0 24px' }
const infoLabel = { fontSize: '11px', color: 'hsl(0, 0%, 50%)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 2px', fontWeight: 'bold' as const }
const infoValue = { fontSize: '15px', color: 'hsl(0, 0%, 6.7%)', margin: '0 0 12px', fontWeight: 'bold' as const }
const button = { backgroundColor: 'hsl(152, 30%, 17.3%)', color: '#f5f0eb', fontSize: '14px', borderRadius: '6px', padding: '12px 24px', textDecoration: 'none', fontWeight: 'bold' as const }
const hr = { borderColor: 'hsl(37, 18%, 81.6%)', margin: '30px 0' }
const footer = { fontSize: '12px', color: 'hsl(0, 0%, 60%)', margin: '0' }
