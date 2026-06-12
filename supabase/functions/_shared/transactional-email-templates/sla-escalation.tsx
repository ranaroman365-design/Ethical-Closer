/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text, Section, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

import { PRODUCT_NAME } from '../product-config.ts'
const SITE_NAME = PRODUCT_NAME

interface SlaEscalationProps {
  setterName?: string
  leadName?: string
  callType?: string
  slaMinutes?: number
  appointmentDate?: string
  appointmentTime?: string
  leadWorkspaceUrl?: string
}

const SlaEscalationEmail = ({
  setterName = 'Setter',
  leadName = 'Lead',
  callType = 'Standard',
  slaMinutes = 60,
  appointmentDate = '',
  appointmentTime = '',
  leadWorkspaceUrl = 'https://ethical-closing.lovable.app/members/admin',
}: SlaEscalationProps) => (
  <Html lang="de" dir="ltr">
    <Head />
    <Preview>Termin nicht bestätigt – bitte sofort prüfen</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brand}>{SITE_NAME}</Text>
        </Section>

        <Text style={urgentIntro}>Termin nicht bestätigt – bitte sofort prüfen.</Text>

        <Text style={text}>
          Der Termin wurde noch nicht bestätigt.
        </Text>

        <Section style={infoBox}>
          <Text style={infoLabel}>Lead</Text>
          <Text style={infoValue}>{leadName}</Text>
          <Text style={infoLabel}>Setter</Text>
          <Text style={infoValue}>{setterName}</Text>
          <Text style={infoLabel}>Termin</Text>
          <Text style={infoValue}>{appointmentDate} um {appointmentTime}</Text>
          <Text style={infoLabel}>SLA</Text>
          <Text style={infoValue}>{slaMinutes} Min. überschritten</Text>
        </Section>

        <Text style={text}>
          Bitte sofort prüfen und bestätigen.
        </Text>

        <Button style={button} href={leadWorkspaceUrl}>
          Jetzt prüfen
        </Button>

        <Hr style={hr} />
        <Text style={footer}>{SITE_NAME} – Automatische Eskalation</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SlaEscalationEmail,
  subject: (data: Record<string, any>) =>
    `Termin nicht bestätigt – sofort prüfen (${data?.setterName || 'Setter'})`,
  displayName: 'SLA-Eskalation',
  previewData: {
    setterName: 'Max Mustermann',
    leadName: 'Anna Müller',
    callType: 'Priority',
    slaMinutes: 15,
    appointmentDate: '15. Januar 2025',
    appointmentTime: '14:30',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '0 25px 40px' }
const header = { padding: '30px 0 20px', textAlign: 'center' as const }
const brand = { fontSize: '14px', fontWeight: 'bold' as const, color: 'hsl(152, 30%, 17.3%)', letterSpacing: '0.05em', textTransform: 'uppercase' as const, margin: '0' }
const urgentIntro = { fontSize: '17px', fontWeight: 'bold' as const, color: 'hsl(4, 60%, 42%)', margin: '0 0 16px' }
const text = { fontSize: '14px', color: 'hsl(0, 0%, 35%)', lineHeight: '1.5', margin: '0 0 20px' }
const infoBox = { backgroundColor: 'hsl(4, 60%, 96%)', borderRadius: '6px', padding: '16px 20px', margin: '0 0 24px', borderLeft: '4px solid hsl(4, 60%, 52%)' }
const infoLabel = { fontSize: '11px', color: 'hsl(0, 0%, 50%)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 2px', fontWeight: 'bold' as const }
const infoValue = { fontSize: '15px', color: 'hsl(0, 0%, 6.7%)', margin: '0 0 12px', fontWeight: 'bold' as const }
const button = { backgroundColor: 'hsl(4, 60%, 52%)', color: '#ffffff', fontSize: '14px', borderRadius: '6px', padding: '12px 24px', textDecoration: 'none', fontWeight: 'bold' as const }
const hr = { borderColor: 'hsl(37, 18%, 81.6%)', margin: '24px 0' }
const footer = { fontSize: '12px', color: 'hsl(0, 0%, 60%)', margin: '0' }
