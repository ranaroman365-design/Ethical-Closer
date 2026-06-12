/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text, Section, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

import { PRODUCT_NAME } from '../product-config.ts'
const SITE_NAME = PRODUCT_NAME

interface SetterReminderProps {
  setterName?: string
  leadName?: string
  appointmentTime?: string
  callType?: string
  leadWorkspaceUrl?: string
}

const SetterReminderEmail = ({
  setterName,
  leadName = 'Lead',
  appointmentTime = '',
  callType = 'Strategiegespräch',
  leadWorkspaceUrl = 'https://ethical-closing.lovable.app/members/setter',
}: SetterReminderProps) => (
  <Html lang="de" dir="ltr">
    <Head />
    <Preview>Termin in 30 Minuten – jetzt vorbereiten</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brand}>{SITE_NAME}</Text>
        </Section>

        <Text style={urgentIntro}>Termin in 30 Minuten.</Text>

        <Section style={actionBox}>
          <Text style={actionTitle}>Bitte jetzt:</Text>
          <Text style={actionStep}>Lead öffnen</Text>
          <Text style={actionStep}>Kurz vorbereiten</Text>
        </Section>

        <Button style={button} href={leadWorkspaceUrl}>
          Jetzt öffnen
        </Button>

        <Hr style={hr} />
        <Text style={footer}>{SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SetterReminderEmail,
  subject: (data: Record<string, any>) =>
    `Termin in 30 Min – ${data?.leadName || 'Lead'} – jetzt vorbereiten`,
  displayName: 'Setter-Termin-Reminder (T-30min)',
  previewData: {
    setterName: 'Max',
    leadName: 'Anna Müller',
    appointmentTime: '14:30',
    callType: 'Priority Strategiegespräch',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '0 25px 40px' }
const header = { padding: '30px 0 20px', textAlign: 'center' as const }
const brand = { fontSize: '14px', fontWeight: 'bold' as const, color: 'hsl(152, 30%, 17.3%)', letterSpacing: '0.05em', textTransform: 'uppercase' as const, margin: '0' }
const urgentIntro = { fontSize: '18px', fontWeight: 'bold' as const, color: 'hsl(4, 60%, 42%)', margin: '0 0 20px' }
const actionBox = { margin: '0 0 24px' }
const actionTitle = { fontSize: '14px', fontWeight: 'bold' as const, color: 'hsl(0, 0%, 12%)', margin: '0 0 8px' }
const actionStep = { fontSize: '14px', color: 'hsl(0, 0%, 30%)', margin: '0 0 4px', lineHeight: '1.6' }
const button = { backgroundColor: 'hsl(152, 30%, 17.3%)', color: '#f5f0eb', fontSize: '14px', borderRadius: '6px', padding: '12px 24px', textDecoration: 'none', fontWeight: 'bold' as const }
const hr = { borderColor: 'hsl(37, 18%, 81.6%)', margin: '24px 0' }
const footer = { fontSize: '12px', color: 'hsl(0, 0%, 60%)', margin: '0' }
