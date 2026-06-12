/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text, Section, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

import { PRODUCT_NAME } from '../product-config.ts'
const SITE_NAME = PRODUCT_NAME

interface StatusChangeProps {
  recipientName?: string
  leadName?: string
  previousStage?: string
  newStage?: string
  changedBy?: string
  dashboardUrl?: string
}

const STAGE_LABELS: Record<string, string> = {
  new: 'Neu',
  quiz_completed: 'Quiz abgeschlossen',
  booked: 'Termin gebucht',
  in_pool: 'Im Pool',
  assigned_setter: 'Setter zugewiesen',
  setter_contacting: 'Setter kontaktiert',
  setter_qualified: 'Qualifiziert',
  setter_disqualified: 'Disqualifiziert',
  ready_for_closer: 'Bereit für Closer',
  assigned_closer: 'Closer zugewiesen',
  offer_made: 'Angebot gemacht',
  closed_won: 'Abgeschlossen ✓',
  closed_lost: 'Verloren',
  converted_to_l1: 'Zu L1 konvertiert',
}

const StatusChangeEmail = ({
  recipientName,
  leadName = 'Lead',
  previousStage = 'unbekannt',
  newStage = 'unbekannt',
  changedBy = 'System',
  dashboardUrl = 'https://ethical-closing.lovable.app/members/pool',
}: StatusChangeProps) => (
  <Html lang="de" dir="ltr">
    <Head />
    <Preview>Lead-Status geändert: {leadName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brand}>{SITE_NAME}</Text>
        </Section>
        <Heading style={h1}>
          {recipientName ? `Hallo ${recipientName},` : 'Statusänderung'}
        </Heading>
        <Text style={text}>
          Der Status eines Leads hat sich geändert:
        </Text>
        <Section style={infoBox}>
          <Text style={infoLabel}>Lead</Text>
          <Text style={infoValue}>{leadName}</Text>
          <Text style={infoLabel}>Vorheriger Status</Text>
          <Text style={infoValue}>{STAGE_LABELS[previousStage] || previousStage}</Text>
          <Text style={infoLabel}>Neuer Status</Text>
          <Text style={infoValueHighlight}>{STAGE_LABELS[newStage] || newStage}</Text>
          <Text style={infoLabel}>Geändert von</Text>
          <Text style={infoValue}>{changedBy}</Text>
        </Section>
        <Button style={button} href={dashboardUrl}>
          Details ansehen
        </Button>
        <Hr style={hr} />
        <Text style={footer}>
          Diese E-Mail wurde automatisch von {SITE_NAME} versendet.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: StatusChangeEmail,
  subject: (data: Record<string, any>) =>
    `Lead-Status: ${data?.leadName || 'Lead'} → ${data?.newStage || 'geändert'}`,
  displayName: 'Status-Änderung',
  previewData: {
    recipientName: 'Max',
    leadName: 'Anna Müller',
    previousStage: 'assigned_setter',
    newStage: 'setter_qualified',
    changedBy: 'System',
    dashboardUrl: 'https://ethical-closing.lovable.app/members/pool',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '0 25px 40px' }
const header = { padding: '30px 0 20px', textAlign: 'center' as const }
const brand = { fontSize: '14px', fontWeight: 'bold' as const, color: 'hsl(152, 30%, 17.3%)', letterSpacing: '0.05em', textTransform: 'uppercase' as const, margin: '0' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: 'hsl(0, 0%, 6.7%)', margin: '0 0 16px' }
const text = { fontSize: '14px', color: 'hsl(0, 0%, 40%)', lineHeight: '1.6', margin: '0 0 20px' }
const infoBox = { backgroundColor: 'hsl(36, 33%, 95.3%)', borderRadius: '6px', padding: '16px 20px', margin: '0 0 24px' }
const infoLabel = { fontSize: '11px', color: 'hsl(0, 0%, 40%)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 2px', fontWeight: 'bold' as const }
const infoValue = { fontSize: '15px', color: 'hsl(0, 0%, 6.7%)', margin: '0 0 12px' }
const infoValueHighlight = { fontSize: '15px', color: 'hsl(152, 30%, 17.3%)', margin: '0 0 12px', fontWeight: 'bold' as const }
const button = { backgroundColor: 'hsl(152, 30%, 17.3%)', color: 'hsl(36, 33%, 95.3%)', fontSize: '14px', borderRadius: '6px', padding: '12px 24px', textDecoration: 'none', fontWeight: 'bold' as const }
const hr = { borderColor: 'hsl(37, 18%, 81.6%)', margin: '30px 0' }
const footer = { fontSize: '12px', color: 'hsl(0, 0%, 60%)', margin: '0' }
