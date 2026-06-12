/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text, Section, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

import { PRODUCT_NAME } from '../product-config.ts'
const SITE_NAME = PRODUCT_NAME

interface SetterRescheduleProps {
  leadName?: string
  oldDate?: string
  oldTime?: string
  newDate?: string
  newTime?: string
  callType?: string
  leadId?: string
}

const SetterRescheduleNotification = ({
  leadName = 'Lead',
  oldDate,
  oldTime,
  newDate = '',
  newTime = '',
  callType = 'Strategiegespräch',
  leadId,
}: SetterRescheduleProps) => (
  <Html lang="de" dir="ltr">
    <Head />
    <Preview>Termin verschoben: {leadName} hat einen neuen Termin</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brand}>{SITE_NAME}</Text>
        </Section>

        <Heading style={h1}>Termin verschoben</Heading>

        <Text style={text}>
          <strong>{leadName}</strong> hat seinen Termin verschoben. Der alte Termin ist nicht mehr aktiv.
        </Text>

        {oldDate && oldTime && (
          <Section style={infoBoxMuted}>
            <Text style={infoLabel}>Alter Termin (storniert)</Text>
            <Text style={infoValueMuted}>{oldDate} um {oldTime} Uhr</Text>
          </Section>
        )}

        <Section style={infoBox}>
          <Text style={infoLabel}>Neuer Termin</Text>
          <Text style={infoValue}>{newDate} um {newTime} Uhr</Text>
          <Text style={{ ...infoLabel, marginTop: '8px' }}>Typ</Text>
          <Text style={infoValue}>{callType}</Text>
        </Section>

        <Text style={text}>
          Bitte bereite dich entsprechend auf den neuen Termin vor.
        </Text>

        <Section style={buttonContainer}>
          <Button style={button} href="https://ethical-closing.lovable.app/members/setter">
            Zum Setter Workspace
          </Button>
        </Section>

        <Hr style={divider} />

        <Text style={footer}>{SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SetterRescheduleNotification,
  subject: (data: Record<string, any>) => `Termin verschoben: ${data.leadName || 'Lead'} hat einen neuen Termin`,
  displayName: 'Setter reschedule notification',
  previewData: {
    leadName: 'Max Mustermann',
    oldDate: '15. April 2026',
    oldTime: '14:00',
    newDate: '17. April 2026',
    newTime: '10:00',
    callType: 'Strategiegespräch',
    leadId: '00000000-0000-0000-0000-000000000001',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '0 25px 40px' }
const header = { padding: '30px 0 20px', textAlign: 'center' as const }
const brand = { fontSize: '14px', fontWeight: 'bold' as const, color: 'hsl(152, 30%, 17.3%)', letterSpacing: '0.05em', textTransform: 'uppercase' as const, margin: '0' }
const h1 = { fontSize: '20px', fontWeight: 'bold' as const, color: 'hsl(0, 0%, 12%)', margin: '0 0 16px', lineHeight: '1.3' }
const text = { fontSize: '14px', color: 'hsl(0, 0%, 35%)', lineHeight: '1.6', margin: '0 0 16px' }
const infoBox = { backgroundColor: '#f0fdf4', borderRadius: '6px', padding: '16px 20px', margin: '0 0 20px', border: '1px solid #bbf7d0' }
const infoBoxMuted = { backgroundColor: 'hsl(36, 33%, 95.3%)', borderRadius: '6px', padding: '16px 20px', margin: '0 0 12px', opacity: 0.7 }
const infoLabel = { fontSize: '11px', color: 'hsl(0, 0%, 50%)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 2px', fontWeight: 'bold' as const }
const infoValue = { fontSize: '15px', color: 'hsl(0, 0%, 6.7%)', margin: '0 0 12px', fontWeight: 'bold' as const }
const infoValueMuted = { fontSize: '14px', color: 'hsl(0, 0%, 50%)', fontWeight: '500' as const, margin: '0', textDecoration: 'line-through' as const }
const buttonContainer = { textAlign: 'center' as const, margin: '24px 0' }
const button = { backgroundColor: 'hsl(152, 30%, 17.3%)', color: '#f5f0eb', fontSize: '14px', borderRadius: '6px', padding: '12px 24px', textDecoration: 'none', fontWeight: 'bold' as const }
const divider = { borderColor: 'hsl(37, 18%, 81.6%)', margin: '24px 0' }
const footer = { fontSize: '12px', color: 'hsl(0, 0%, 60%)', margin: '0' }
